import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { intervalMs } from '@core/candles/resample'
import { generateDemoCandles } from '@core/candles/demo'
import { validateCandles, dedupeCandles } from '@core/candles/validate'
import { parseCandleCsv } from '@core/csv/parse'
import { IPC } from '@shared/ipc'
import { toCandleBuffer } from '@shared/candleBuffer'
import {
  type AiProviderKind,
  type BacktestSession,
  type Candle,
  type DeskPrefs,
  type Drawing,
  type EaChatAttachedFile,
  type EaScript,
  type SavedStrategy,
  type Timeframe,
  type Trade
} from '@shared/types'
import { stripScriptDirectives } from '@shared/chatDirectives'
import { dbPath, getDb } from './database/db'
import {
  clearDrawings,
  deleteDataset,
  deleteDrawing,
  deleteEaScript,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  getRecentCandles,
  insertDataset,
  listDatasets,
  listDrawings,
  listEaScripts,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveDeskPrefs,
  saveDrawing,
  saveEaScript,
  saveSession,
  saveStrategy
} from './database/repositories'
import { latestWindow } from '@core/market/catalog'
import { csvCandles, deleteCsvTape, isCsvDataset, refreshCsvDatasets } from './data/csvTape'
import { estimateDownload, fetchMarketCandles } from './data/fetchMarket'
import {
  clearProviderApiKey,
  deleteProvider,
  getDecryptedApiKey,
  listProviders,
  saveProvider,
  setProviderApiKey
} from './ai/aiProvidersRepository'
import {
  deleteChatThread,
  ensureChatThread,
  listChatMessages,
  listChatThreads,
  saveChatExchange
} from './ai/chatRepository'
import { listModels, sendChatMessage, testConnection } from './ai/providers'

function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, listener)
}

export function registerIpc(): void {
  getDb()

  handle(IPC.DB_PATH, () => dbPath())

  function mergedDatasets() {
    const csv = refreshCsvDatasets()
    const sql = listDatasets()
    const taken = new Set(csv.map((d) => `${d.symbol}:${d.timeframe}`))
    return [...csv, ...sql.filter((d) => !taken.has(`${d.symbol}:${d.timeframe}`))]
  }

  handle(IPC.DATASETS_LIST, () => mergedDatasets())

  handle(
    IPC.DATASETS_CANDLES,
    (_e, datasetId: number, fromTs?: number, toTs?: number) =>
      toCandleBuffer(
        isCsvDataset(datasetId)
          ? csvCandles(datasetId, fromTs, toTs)
          : getCandles(datasetId, fromTs, toTs)
      )
  )

  function csvCandlesPage(datasetId: number, limit: number, beforeTs?: number): Candle[] {
    const all = csvCandles(datasetId)
    const upToIndex = beforeTs === undefined ? all.length : all.findIndex((c) => c.timestamp >= beforeTs)
    const end = upToIndex === -1 ? all.length : upToIndex
    return all.slice(Math.max(0, end - limit), end)
  }

  handle(
    IPC.DATASETS_CANDLES_PAGE,
    (_e, datasetId: number, limit: number, beforeTs?: number) =>
      toCandleBuffer(
        isCsvDataset(datasetId)
          ? csvCandlesPage(datasetId, limit, beforeTs)
          : getRecentCandles(datasetId, limit, beforeTs)
      )
  )

  handle(IPC.DATASETS_GAPS, (_e, datasetId: number) =>
    isCsvDataset(datasetId) ? [] : getGaps(datasetId)
  )

  handle(IPC.DATASETS_DELETE, (_e, datasetId: number) => {
    if (isCsvDataset(datasetId)) deleteCsvTape(datasetId)
    else deleteDataset(datasetId)
    return mergedDatasets()
  })

  handle(
    IPC.DATASETS_IMPORT,
    (_e, payload: { symbol: string; timeframe: Timeframe; csv: string; source?: string }) => {
      const candles = dedupeCandles(parseCandleCsv(payload.csv))
      if (candles.length === 0) throw new Error('No valid candles found in the CSV.')
      const report = validateCandles(candles, intervalMs(payload.timeframe))
      const dataset = insertDataset({
        symbol: payload.symbol,
        timeframe: payload.timeframe,
        source: payload.source ?? 'csv',
        candles,
        gaps: report.gaps
      })
      return { dataset, report, datasets: mergedDatasets() }
    }
  )

  handle(
    IPC.DATASETS_DEMO,
    (_e, payload: { symbol?: string; days?: number; seed?: number }) => {
      const candles = generateDemoCandles({
        days: payload.days ?? 15,
        seed: payload.seed
      })
      const report = validateCandles(candles, intervalMs('1M'))
      const dataset = insertDataset({
        symbol: payload.symbol ?? 'XAUUSD',
        timeframe: '1M',
        source: 'demo',
        candles,
        gaps: report.gaps
      })
      return { dataset, report, datasets: mergedDatasets() }
    }
  )

  handle(
    IPC.DATASETS_DOWNLOAD_ESTIMATE,
    (
      _e,
      payload: {
        symbol: string
        timeframe: Timeframe
        startTs: number
        endTs: number
      }
    ) => estimateDownload(payload)
  )

  handle(
    IPC.DATASETS_DOWNLOAD,
    async (
      _e,
      payload: {
        symbol: string
        timeframe: Timeframe
        startTs: number
        endTs: number
      }
    ) => {
      const pulled = await fetchMarketCandles(payload)
      const candles = dedupeCandles(pulled.candles)
      if (candles.length === 0) throw new Error('Download produced no candles.')
      const report = validateCandles(candles, intervalMs(payload.timeframe))
      const dataset = replaceTape({
        symbol: payload.symbol,
        timeframe: payload.timeframe,
        source: pulled.source,
        candles,
        gaps: report.gaps
      })
      return { dataset, report, datasets: mergedDatasets() }
    }
  )

  handle(IPC.DATASETS_REFRESH, async (_e, datasetId: number) => {
    const tape = mergedDatasets().find((row) => row.id === datasetId)
    if (!tape) throw new Error('That tape is not on the desk.')
    const existing = isCsvDataset(datasetId) ? csvCandles(datasetId) : getCandles(datasetId)
    if (existing.length === 0) throw new Error('Tape has no candles to extend.')
    const range = latestWindow(existing[existing.length - 1].timestamp)
    const pulled = await fetchMarketCandles({
      symbol: tape.symbol,
      timeframe: tape.timeframe,
      startTs: range.startTs,
      endTs: range.endTs
    })
    const candles = dedupeCandles([...existing, ...pulled.candles])
    const report = validateCandles(candles, intervalMs(tape.timeframe))
    replaceTape({
      symbol: tape.symbol,
      timeframe: tape.timeframe,
      source: pulled.source,
      candles,
      gaps: report.gaps
    })
    const datasets = mergedDatasets()
    const dataset = datasets.find((row) => row.symbol === tape.symbol && row.timeframe === tape.timeframe) ?? tape
    return {
      dataset,
      added: Math.max(0, candles.length - existing.length),
      datasets
    }
  })

  handle(
    IPC.SESSIONS_SAVE,
    (_e, session: BacktestSession, trades: Trade[]) => saveSession(session, trades)
  )

  handle(IPC.SESSIONS_LOAD, (_e, id: string) => loadSession(id))

  handle(IPC.SESSIONS_DELETE, (_e, id: string) => {
    deleteSession(id)
  })

  handle(IPC.STRATEGIES_LIST, () => listStrategies())

  handle(IPC.STRATEGIES_SAVE, (_e, strategy: SavedStrategy) => {
    saveStrategy(strategy)
    return listStrategies()
  })

  handle(IPC.STRATEGIES_DELETE, (_e, id: string) => {
    deleteStrategy(id)
    return listStrategies()
  })

  handle(IPC.EA_SCRIPTS_LIST, () => listEaScripts())

  handle(IPC.EA_SCRIPTS_SAVE, (_e, script: EaScript) => {
    saveEaScript(script)
    return listEaScripts()
  })

  handle(IPC.EA_SCRIPTS_DELETE, (_e, id: string) => {
    deleteEaScript(id)
    return listEaScripts()
  })

  handle(IPC.AI_LIST_PROVIDERS, () => listProviders())

  handle(
    IPC.AI_SAVE_PROVIDER,
    (
      _e,
      profile: {
        id: string
        name: string
        provider: AiProviderKind
        model: string
        baseUrl: string | null
      }
    ) => saveProvider(profile)
  )

  handle(IPC.AI_SET_PROVIDER_API_KEY, (_e, id: string, key: string) => setProviderApiKey(id, key))

  handle(IPC.AI_CLEAR_PROVIDER_API_KEY, (_e, id: string) => {
    clearProviderApiKey(id)
  })

  handle(IPC.AI_DELETE_PROVIDER, (_e, id: string) => deleteProvider(id))

  handle(IPC.AI_TEST_CONNECTION, async (_e, id: string) => {
    const profile = listProviders().find((p) => p.id === id)
    if (!profile) return { ok: false, message: 'Profile not found' }
    const apiKey = getDecryptedApiKey(id)
    return testConnection(profile, apiKey)
  })

  handle(IPC.AI_LIST_MODELS, async (_e, id: string) => {
    const profile = listProviders().find((p) => p.id === id)
    if (!profile) return { ok: false, models: [] as string[], message: 'Profile not found' }
    const apiKey = getDecryptedApiKey(id)
    return listModels(profile, apiKey)
  })

  handle(IPC.AI_LIST_CHAT_THREADS, () => listChatThreads())

  handle(IPC.AI_LIST_CHAT_MESSAGES, (_e, threadId: string) => listChatMessages(threadId))

  handle(
    IPC.AI_SEND_CHAT_MESSAGE,
    async (
      event,
      payload: {
        scriptId: string
        threadId?: string | null
        providerId: string
        currentCode?: string
        files?: EaChatAttachedFile[]
        message: string
        requestId: string
      }
    ) => {
      const profile = listProviders().find((p) => p.id === payload.providerId)
      if (!profile) {
        return {
          ok: false,
          message: 'Profile not found',
          messages: payload.threadId ? listChatMessages(payload.threadId) : [],
          threads: listChatThreads()
        }
      }
      const apiKey = getDecryptedApiKey(payload.providerId)
      let thread
      try {
        thread = ensureChatThread(payload.threadId, payload.scriptId, payload.message)
      } catch {
        return {
          ok: false,
          message: 'This script no longer exists — the reply could not be saved.',
          messages: payload.threadId ? listChatMessages(payload.threadId) : [],
          threads: listChatThreads()
        }
      }
      // The user's message is only persisted once the AI has actually replied
      // (further down, alongside the assistant's message) — not here — so a
      // failed send followed by a retry with the same text can't insert two
      // copies of the same question into the saved history.
      const history = [
        ...listChatMessages(thread.id).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: payload.message }
      ]
      const fence = '```'
      const attached =
        payload.files && payload.files.length > 0
          ? payload.files
          : payload.currentCode != null
            ? [{ name: 'current script', code: payload.currentCode, current: true }]
            : []
      const fileBlocks = attached.flatMap((file) => {
        const label = file.current ? `${file.name} (currently editing)` : file.name
        return [`### ${label}`, fence, file.code, fence, '']
      })
      const systemPrompt = [
        'You are helping the user write an MQL5 Expert Advisor script for MetaTrader.',
        '',
        attached.length > 0
          ? 'The user attached these files. Edit the one marked currently editing unless they ask otherwise.'
          : 'No file is attached. Ask which script to work on if you need one.',
        '',
        ...fileBlocks,
        'The open editor applies your fenced code live as you generate it.',
        'When you change a script, output the complete file in one fence.',
        'Put the script name in the fence header, for example: ```mql5 Grid Martingale',
        'Also output this on its own line before the fence: <!--ql-file: Grid Martingale-->',
        'Rename when the open file is still Untitled EA, the user asks, or a clearer name is obvious.',
        'Use a short Title Case name with no path or extension.',
        'Put a short explanation before that fence. Do not ask the user to copy or apply.',
        'If several files are attached, edit the one marked currently editing.',
        '',
        'Format every reply in Markdown so it is easy to scan:',
        '- Start with a short heading for the main point.',
        '- Use bullet or numbered lists for steps, options, and findings.',
        '- Use **bold** for key terms and `inline code` for identifiers.',
        '- Keep prose concise. Do not wrap the whole reply in a code fence.',
        'Never use emoji, emoticons, or decorative unicode symbols in replies or code comments.'
      ].join('\n')
      const result = await sendChatMessage(
        profile,
        apiKey,
        systemPrompt,
        history,
        (chunk) => {
          try {
            event.sender.send(IPC.AI_CHAT_CHUNK, { requestId: payload.requestId, ...chunk })
          } catch {
            /* renderer window closed */
          }
        }
      )
      if (!result.ok || !result.reply) {
        return {
          ok: false,
          message: result.message ?? 'No reply from the AI',
          thread,
          messages: listChatMessages(thread.id),
          threads: listChatThreads()
        }
      }
      try {
        saveChatExchange(
          { scriptId: payload.scriptId, threadId: thread.id, content: payload.message },
          {
            scriptId: payload.scriptId,
            threadId: thread.id,
            // The rename directive is only useful to the client while it's
            // live-streaming; strip it before persisting so history — and
            // what gets resent to the model as context — stays clean prose.
            content: stripScriptDirectives(result.reply),
            providerId: payload.providerId,
            thinkingOnly: Boolean(result.thinkingOnly)
          }
        )
      } catch {
        return {
          ok: false,
          message: 'This script no longer exists — the reply could not be saved.',
          thread,
          messages: listChatMessages(thread.id),
          threads: listChatThreads()
        }
      }
      return {
        ok: true,
        thread,
        messages: listChatMessages(thread.id),
        threads: listChatThreads()
      }
    }
  )

  handle(IPC.AI_DELETE_CHAT_THREAD, (_e, threadId: string) => {
    deleteChatThread(threadId)
    return listChatThreads()
  })

  handle(IPC.PREFS_LOAD, () => loadDeskPrefs())

  handle(IPC.PREFS_SAVE, (_e, prefs: DeskPrefs) => saveDeskPrefs(prefs))

  handle(IPC.DRAWINGS_LIST, (_e, symbol: string) => listDrawings(symbol))

  handle(IPC.DRAWINGS_SAVE, (_e, drawing: Drawing) => saveDrawing(drawing))

  handle(IPC.DRAWINGS_DELETE, (_e, id: string) => deleteDrawing(id))

  handle(IPC.DRAWINGS_CLEAR, (_e, symbol: string) => clearDrawings(symbol))
}
