import { generateDemoCandles } from '@core/candles/demo'
import { intervalMs } from '@core/candles/resample'
import { dedupeCandles, validateCandles } from '@core/candles/validate'
import { parseCandleCsv } from '@core/csv/parse'
import { DEFAULT_DESK_PREFS } from '@core/desk/prefs'
import { FUNDAMENTALS_BUNDLE } from '@core/fundamentals/bundle'
import type { FundamentalBundle, FundamentalEvent, FundamentalPoint } from '@core/fundamentals/types'
import { toCandleBuffer } from '@shared/candleBuffer'
import type {
  AiProviderProfile,
  BacktestSession,
  Candle,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  EaChatAttachedFile,
  EaChatMessage,
  EaChatThread,
  EaScript,
  SavedStrategy,
  ScriptKind,
  Timeframe,
  Trade,
  ValidationReport
} from '@shared/types'
import {
  loadLocalStrategies,
  removeLocalStrategy,
  upsertLocalStrategy
} from '../store/strategyVault'

const DB_NAME = 'kairos_web_db'
const DB_VERSION = 1

interface StoredCandles {
  datasetId: number
  candles: Candle[]
  gaps: DataGap[]
}

interface StoredSession {
  id: string
  session: BacktestSession
  trades: Trade[]
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains('datasets')) {
        db.createObjectStore('datasets', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('candles')) {
        db.createObjectStore('candles', { keyPath: 'datasetId' })
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('ea_scripts')) {
        const store = db.createObjectStore('ea_scripts', { keyPath: 'id' })
        store.createIndex('kind', 'kind', { unique: false })
      }
      if (!db.objectStoreNames.contains('drawings')) {
        const store = db.createObjectStore('drawings', { keyPath: 'id' })
        store.createIndex('symbol', 'symbol', { unique: false })
      }
      if (!db.objectStoreNames.contains('chat_threads')) {
        const store = db.createObjectStore('chat_threads', { keyPath: 'id' })
        store.createIndex('kind', 'kind', { unique: false })
      }
      if (!db.objectStoreNames.contains('chat_messages')) {
        const store = db.createObjectStore('chat_messages', { keyPath: 'id' })
        store.createIndex('threadId', 'threadId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

async function idbPut<T>(storeName: string, value: T): Promise<IDBValidKey> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(value)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const DEFAULT_AI_PROFILES: AiProviderProfile[] = [
  {
    id: 'openai-gpt4o',
    name: 'OpenAI (GPT-4o)',
    provider: 'openai',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    hasApiKey: false
  },
  {
    id: 'anthropic-claude',
    name: 'Anthropic (Claude 3.7)',
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    baseUrl: 'https://api.anthropic.com/v1',
    hasApiKey: false
  },
  {
    id: 'gemini-flash',
    name: 'Google Gemini (Flash)',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
    hasApiKey: false
  },
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    provider: 'custom',
    model: 'deepseek-r1:8b',
    baseUrl: 'http://localhost:11434',
    hasApiKey: true
  }
]

let chatChunkSubscribers: Array<(payload: { requestId: string; text?: string; thinking?: string }) => void> = []

export function createBrowserApi() {
  async function ensureDemoData(): Promise<void> {
    const datasets = await idbGetAll<DatasetInfo>('datasets')
    if (datasets.length > 0) return

    const candles = generateDemoCandles({ days: 15, seed: 20250906 })
    const report = validateCandles(candles, intervalMs('1M'))
    const now = Date.now()

    const dataset: DatasetInfo = {
      id: 1,
      symbol: 'XAUUSD',
      timeframe: '1M',
      source: 'demo',
      startTs: candles[0]?.timestamp ?? now,
      endTs: candles.at(-1)?.timestamp ?? now,
      candleCount: candles.length,
      createdAt: now,
      version: 1,
      gapCount: report.gaps.length
    }

    await idbPut('datasets', dataset)
    await idbPut('candles', { datasetId: 1, candles, gaps: report.gaps } satisfies StoredCandles)
  }

  // Pre-seed demo data in the background
  void ensureDemoData().catch(() => undefined)

  const api = {
    dbPath: async (): Promise<string> => 'Browser (IndexedDB)',

    datasets: {
      list: async (): Promise<DatasetInfo[]> => {
        await ensureDemoData()
        return idbGetAll<DatasetInfo>('datasets')
      },

      candles: async (datasetId: number, fromTs?: number, toTs?: number) => {
        const stored = await idbGet<StoredCandles>('candles', datasetId)
        const all = stored?.candles ?? []
        const filtered = all.filter(
          (c) =>
            (fromTs === undefined || c.timestamp >= fromTs) &&
            (toTs === undefined || c.timestamp <= toTs)
        )
        return toCandleBuffer(filtered)
      },

      candlesPage: async (datasetId: number, limit: number, beforeTs?: number) => {
        const stored = await idbGet<StoredCandles>('candles', datasetId)
        const all = stored?.candles ?? []
        let slice: Candle[]
        if (beforeTs !== undefined) {
          const matched = all.filter((c) => c.timestamp < beforeTs)
          slice = matched.slice(-limit)
        } else {
          slice = all.slice(-limit)
        }
        return toCandleBuffer(slice)
      },

      gaps: async (datasetId: number): Promise<DataGap[]> => {
        const stored = await idbGet<StoredCandles>('candles', datasetId)
        return stored?.gaps ?? []
      },

      delete: async (datasetId: number): Promise<DatasetInfo[]> => {
        await idbDelete('datasets', datasetId)
        await idbDelete('candles', datasetId)
        return idbGetAll<DatasetInfo>('datasets')
      },

      importCsv: async (payload: {
        symbol: string
        timeframe: Timeframe
        csv: string
        source?: string
      }): Promise<{ dataset: DatasetInfo; report: ValidationReport; datasets: DatasetInfo[] }> => {
        const candles = dedupeCandles(parseCandleCsv(payload.csv))
        if (candles.length === 0) throw new Error('No valid candles found in the CSV.')

        const report = validateCandles(candles, intervalMs(payload.timeframe))
        const existing = await idbGetAll<DatasetInfo>('datasets')
        const maxId = existing.reduce((max, d) => Math.max(max, d.id), 0)
        const id = maxId + 1
        const now = Date.now()

        const dataset: DatasetInfo = {
          id,
          symbol: payload.symbol.toUpperCase(),
          timeframe: payload.timeframe,
          source: payload.source ?? 'csv',
          startTs: candles[0]?.timestamp ?? now,
          endTs: candles.at(-1)?.timestamp ?? now,
          candleCount: candles.length,
          createdAt: now,
          version: 1,
          gapCount: report.gaps.length
        }

        await idbPut('datasets', dataset)
        await idbPut('candles', { datasetId: id, candles, gaps: report.gaps } satisfies StoredCandles)
        const updatedList = await idbGetAll<DatasetInfo>('datasets')
        return { dataset, report, datasets: updatedList }
      },

      generateDemo: async (payload: {
        symbol?: string
        days?: number
        seed?: number
      }): Promise<{ dataset: DatasetInfo; report: ValidationReport; datasets: DatasetInfo[] }> => {
        const candles = generateDemoCandles({
          days: payload.days ?? 15,
          seed: payload.seed
        })
        const report = validateCandles(candles, intervalMs('1M'))
        const existing = await idbGetAll<DatasetInfo>('datasets')
        const maxId = existing.reduce((max, d) => Math.max(max, d.id), 0)
        const id = maxId + 1
        const now = Date.now()

        const dataset: DatasetInfo = {
          id,
          symbol: (payload.symbol ?? 'XAUUSD').toUpperCase(),
          timeframe: '1M',
          source: 'demo',
          startTs: candles[0]?.timestamp ?? now,
          endTs: candles.at(-1)?.timestamp ?? now,
          candleCount: candles.length,
          createdAt: now,
          version: 1,
          gapCount: report.gaps.length
        }

        await idbPut('datasets', dataset)
        await idbPut('candles', { datasetId: id, candles, gaps: report.gaps } satisfies StoredCandles)
        const updatedList = await idbGetAll<DatasetInfo>('datasets')
        return { dataset, report, datasets: updatedList }
      },

      download: async (payload: {
        symbol: string
        timeframe: Timeframe
        startTs: number
        endTs: number
      }): Promise<{ dataset: DatasetInfo; datasets: DatasetInfo[] }> => {
        // Fallback demo generation for requested symbol in browser
        const days = Math.max(1, Math.round((payload.endTs - payload.startTs) / (24 * 3600 * 1000)))
        const res = await api.datasets.generateDemo({
          symbol: payload.symbol,
          days: Math.min(days, 30)
        })
        return { dataset: res.dataset, datasets: res.datasets }
      },

      downloadEstimate: async (_payload: {
        symbol: string
        timeframe: Timeframe
        startTs: number
        endTs: number
      }) => {
        return { chunks: 1, batchSize: 1, pauseBetweenBatchesMs: 0 }
      },

      refresh: async (datasetId: number) => {
        const dataset = await idbGet<DatasetInfo>('datasets', datasetId)
        if (!dataset) throw new Error('Dataset not found')
        const datasets = await idbGetAll<DatasetInfo>('datasets')
        return { dataset, added: 0, datasets }
      }
    },

    sessions: {
      save: async (session: BacktestSession, trades: Trade[]): Promise<void> => {
        await idbPut('sessions', { id: session.id, session, trades } satisfies StoredSession)
      },

      load: async (id: string): Promise<{ session: BacktestSession; trades: Trade[] } | null> => {
        const stored = await idbGet<StoredSession>('sessions', id)
        if (!stored) return null
        return { session: stored.session, trades: stored.trades }
      },

      delete: async (id: string): Promise<void> => {
        await idbDelete('sessions', id)
      }
    },

    strategies: {
      list: async (): Promise<SavedStrategy[]> => {
        return loadLocalStrategies()
      },

      save: async (strategy: SavedStrategy): Promise<SavedStrategy[]> => {
        return upsertLocalStrategy(strategy)
      },

      delete: async (id: string): Promise<SavedStrategy[]> => {
        return removeLocalStrategy(id)
      }
    },

    eaScripts: {
      list: async (kind: ScriptKind): Promise<EaScript[]> => {
        const all = await idbGetAll<EaScript>('ea_scripts')
        return all.filter((s) => s.kind === kind)
      },

      save: async (script: EaScript): Promise<EaScript[]> => {
        await idbPut('ea_scripts', script)
        const all = await idbGetAll<EaScript>('ea_scripts')
        return all.filter((s) => s.kind === script.kind)
      },

      delete: async (id: string, kind: ScriptKind): Promise<EaScript[]> => {
        await idbDelete('ea_scripts', id)
        const all = await idbGetAll<EaScript>('ea_scripts')
        return all.filter((s) => s.kind === kind)
      }
    },

    ai: {
      listProviders: async (): Promise<AiProviderProfile[]> => {
        const saved = localStorage.getItem('kairos.ai_providers')
        const list: AiProviderProfile[] = saved ? JSON.parse(saved) : DEFAULT_AI_PROFILES
        return list.map((p) => ({
          ...p,
          hasApiKey: Boolean(p.hasApiKey || localStorage.getItem(`kairos.ai_key.${p.id}`))
        }))
      },

      saveProvider: async (profile: {
        id: string
        name: string
        provider: AiProviderProfile['provider']
        model: string
        baseUrl: string | null
      }): Promise<AiProviderProfile[]> => {
        const list = await api.ai.listProviders()
        const index = list.findIndex((p) => p.id === profile.id)
        const updatedProfile: AiProviderProfile = {
          ...profile,
          hasApiKey: Boolean(localStorage.getItem(`kairos.ai_key.${profile.id}`))
        }
        if (index >= 0) list[index] = updatedProfile
        else list.unshift(updatedProfile)
        localStorage.setItem('kairos.ai_providers', JSON.stringify(list))
        return list
      },

      setProviderApiKey: async (id: string, key: string): Promise<{ ok: boolean; error?: string }> => {
        localStorage.setItem(`kairos.ai_key.${id}`, key)
        return { ok: true }
      },

      clearProviderApiKey: async (id: string): Promise<void> => {
        localStorage.removeItem(`kairos.ai_key.${id}`)
      },

      deleteProvider: async (id: string): Promise<AiProviderProfile[]> => {
        const list = await api.ai.listProviders()
        const next = list.filter((p) => p.id !== id)
        localStorage.setItem('kairos.ai_providers', JSON.stringify(next))
        localStorage.removeItem(`kairos.ai_key.${id}`)
        return next
      },

      testConnection: async (id: string): Promise<{ ok: boolean; message: string }> => {
        const key = localStorage.getItem(`kairos.ai_key.${id}`)
        if (!key && id !== 'ollama-local') {
          return { ok: false, message: 'No API key set for this provider.' }
        }
        return { ok: true, message: 'Provider ready.' }
      },

      listModels: async (id: string): Promise<{ ok: boolean; models: string[]; message?: string }> => {
        const providers = await api.ai.listProviders()
        const target = providers.find((p) => p.id === id)
        const defaults = target?.model ? [target.model] : ['gpt-4o', 'claude-3-7-sonnet']
        return { ok: true, models: defaults }
      },

      listChatThreads: async (kind: ScriptKind): Promise<EaChatThread[]> => {
        const all = await idbGetAll<EaChatThread & { kind?: ScriptKind }>('chat_threads')
        return all.filter((t) => t.kind === kind)
      },

      listChatMessages: async (threadId: string): Promise<EaChatMessage[]> => {
        const all = await idbGetAll<EaChatMessage>('chat_messages')
        return all.filter((m) => m.threadId === threadId)
      },

      sendChatMessage: async (payload: {
        scriptId: string
        threadId: string | null
        providerId: string
        files: EaChatAttachedFile[]
        message: string
        requestId: string
      }): Promise<
        | { ok: true; thread: EaChatThread; messages: EaChatMessage[]; threads: EaChatThread[] }
        | { ok: false; message: string; thread?: EaChatThread; messages?: EaChatMessage[]; threads?: EaChatThread[] }
      > => {
        const now = Date.now()
        let threadId = payload.threadId
        let thread: EaChatThread | undefined

        if (!threadId) {
          threadId = `thread_${now}`
          thread = {
            id: threadId,
            title: payload.message.slice(0, 40) || 'New chat',
            scriptId: payload.scriptId,
            createdAt: now,
            updatedAt: now
          }
          await idbPut('chat_threads', thread)
        } else {
          thread = await idbGet<EaChatThread>('chat_threads', threadId)
        }

        const userMsg: EaChatMessage = {
          id: `msg_u_${now}`,
          scriptId: payload.scriptId,
          threadId,
          role: 'user',
          content: payload.message,
          providerId: payload.providerId,
          createdAt: now,
          thinkingOnly: false
        }
        await idbPut('chat_messages', userMsg)

        // Mock assistant reply for client-side web mode
        const assistantMsg: EaChatMessage = {
          id: `msg_a_${now + 1}`,
          scriptId: payload.scriptId,
          threadId,
          role: 'assistant',
          content: `Received your message for script #${payload.scriptId}. In web mode, configure your API key in Settings > AI Providers to stream responses directly from the model provider.`,
          providerId: payload.providerId,
          createdAt: now + 1,
          thinkingOnly: false
        }
        await idbPut('chat_messages', assistantMsg)

        const allThreads = await idbGetAll<EaChatThread>('chat_threads')
        const allMessages = (await idbGetAll<EaChatMessage>('chat_messages')).filter(
          (m) => m.threadId === threadId
        )

        return {
          ok: true,
          thread: thread ?? {
            id: threadId,
            title: 'Chat',
            scriptId: payload.scriptId,
            createdAt: now,
            updatedAt: now
          },
          messages: allMessages,
          threads: allThreads
        }
      },

      onChatChunk: (
        cb: (payload: { requestId: string; text?: string; thinking?: string }) => void
      ) => {
        chatChunkSubscribers.push(cb)
        return () => {
          chatChunkSubscribers = chatChunkSubscribers.filter((s) => s !== cb)
        }
      },

      deleteChatThread: async (threadId: string, kind: ScriptKind): Promise<EaChatThread[]> => {
        await idbDelete('chat_threads', threadId)
        const all = await idbGetAll<EaChatThread & { kind?: ScriptKind }>('chat_threads')
        return all.filter((t) => t.kind === kind)
      }
    },

    prefs: {
      load: async (): Promise<DeskPrefs> => {
        const raw = localStorage.getItem('kairos.desk_prefs')
        if (raw) {
          try {
            return JSON.parse(raw) as DeskPrefs
          } catch {
            // fallback
          }
        }
        return { ...DEFAULT_DESK_PREFS }
      },

      save: async (prefs: DeskPrefs): Promise<DeskPrefs> => {
        localStorage.setItem('kairos.desk_prefs', JSON.stringify(prefs))
        return prefs
      }
    },

    drawings: {
      list: async (symbol: string): Promise<Drawing[]> => {
        const all = await idbGetAll<Drawing>('drawings')
        return all.filter((d) => d.symbol === symbol)
      },

      save: async (drawing: Drawing): Promise<void> => {
        await idbPut('drawings', drawing)
      },

      delete: async (id: string): Promise<void> => {
        await idbDelete('drawings', id)
      },

      clear: async (symbol: string): Promise<void> => {
        const all = await idbGetAll<Drawing>('drawings')
        for (const d of all) {
          if (d.symbol === symbol) {
            await idbDelete('drawings', d.id)
          }
        }
      }
    },

    fundamentals: {
      get: async () => {
        const raw = localStorage.getItem('kairos.fundamentals')
        if (raw) {
          try {
            return {
              bundle: JSON.parse(raw) as FundamentalBundle,
              source: 'custom' as const,
              updatedAt: Date.now()
            }
          } catch {
            // fallback
          }
        }
        return {
          bundle: FUNDAMENTALS_BUNDLE,
          source: 'bundled' as const,
          updatedAt: null
        }
      },

      refresh: async () => {
        return {
          bundle: FUNDAMENTALS_BUNDLE,
          source: 'bundled' as const,
          updatedAt: Date.now()
        }
      },

      reset: async () => {
        localStorage.removeItem('kairos.fundamentals')
        return {
          bundle: FUNDAMENTALS_BUNDLE,
          source: 'bundled' as const,
          updatedAt: null
        }
      },

      upsertPoint: async (seriesId: string, point: FundamentalPoint) => {
        const current = (await api.fundamentals.get()).bundle
        const series = current.series.find((s) => s.id === seriesId)
        if (series) {
          const idx = series.points.findIndex((p) => p.ts === point.ts)
          if (idx >= 0) series.points[idx] = point
          else {
            series.points.push(point)
            series.points.sort((a, b) => a.ts - b.ts)
          }
        }
        localStorage.setItem('kairos.fundamentals', JSON.stringify(current))
        return { bundle: current, source: 'custom' as const, updatedAt: Date.now() }
      },

      upsertEvent: async (event: FundamentalEvent) => {
        const current = (await api.fundamentals.get()).bundle
        const idx = current.events.findIndex((e) => e.ts === event.ts && e.title === event.title)
        if (idx >= 0) current.events[idx] = event
        else {
          current.events.push(event)
          current.events.sort((a, b) => a.ts - b.ts)
        }
        localStorage.setItem('kairos.fundamentals', JSON.stringify(current))
        return { bundle: current, source: 'custom' as const, updatedAt: Date.now() }
      }
    }
  }

  return api
}

export function initBrowserApi(): void {
  if (typeof window === 'undefined') return

  // If already running in Electron desktop app with preload API, do not override
  const existing = window.kairos ?? window.quantify ?? (window as unknown as { aureum?: unknown }).aureum
  if (existing) return

  const browserApi = createBrowserApi()
  const target = window as unknown as Record<string, unknown>
  target.kairos = browserApi
  target.quantify = browserApi
  target.aureum = browserApi
}
