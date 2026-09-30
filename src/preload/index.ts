import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { CandleBuffer } from '../shared/candleBuffer'
import type {
  AiProviderProfile,
  BacktestSession,
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
  Trade
} from '../shared/types'

const api = {
  dbPath: (): Promise<string> => ipcRenderer.invoke(IPC.DB_PATH),
  datasets: {
    list: () => ipcRenderer.invoke(IPC.DATASETS_LIST) as Promise<DatasetInfo[]>,
    candles: (datasetId: number, fromTs?: number, toTs?: number) =>
      ipcRenderer.invoke(IPC.DATASETS_CANDLES, datasetId, fromTs, toTs) as Promise<CandleBuffer>,
    candlesPage: (datasetId: number, limit: number, beforeTs?: number) =>
      ipcRenderer.invoke(IPC.DATASETS_CANDLES_PAGE, datasetId, limit, beforeTs) as Promise<CandleBuffer>,
    gaps: (datasetId: number) => ipcRenderer.invoke(IPC.DATASETS_GAPS, datasetId),
    delete: (datasetId: number) => ipcRenderer.invoke(IPC.DATASETS_DELETE, datasetId),
    importCsv: (payload: { symbol: string; timeframe: Timeframe; csv: string; source?: string }) =>
      ipcRenderer.invoke(IPC.DATASETS_IMPORT, payload),
    generateDemo: (payload: { symbol?: string; days?: number; seed?: number }) =>
      ipcRenderer.invoke(IPC.DATASETS_DEMO, payload),
    download: (payload: {
      symbol: string
      timeframe: Timeframe
      startTs: number
      endTs: number
    }) =>
      ipcRenderer.invoke(IPC.DATASETS_DOWNLOAD, payload) as Promise<{
        dataset: DatasetInfo
        datasets: DatasetInfo[]
      }>,
    downloadEstimate: (payload: {
      symbol: string
      timeframe: Timeframe
      startTs: number
      endTs: number
    }) =>
      ipcRenderer.invoke(IPC.DATASETS_DOWNLOAD_ESTIMATE, payload) as Promise<{
        chunks: number | null
        batchSize: number
        pauseBetweenBatchesMs: number
      }>,
    refresh: (datasetId: number) =>
      ipcRenderer.invoke(IPC.DATASETS_REFRESH, datasetId) as Promise<{
        dataset: DatasetInfo
        added: number
        datasets: DatasetInfo[]
      }>
  },
  sessions: {
    save: (session: BacktestSession, trades: Trade[]) =>
      ipcRenderer.invoke(IPC.SESSIONS_SAVE, session, trades),
    load: (id: string) =>
      ipcRenderer.invoke(IPC.SESSIONS_LOAD, id) as Promise<{
        session: BacktestSession
        trades: Trade[]
      } | null>,
    delete: (id: string) => ipcRenderer.invoke(IPC.SESSIONS_DELETE, id)
  },
  strategies: {
    list: () => ipcRenderer.invoke(IPC.STRATEGIES_LIST) as Promise<SavedStrategy[]>,
    save: (strategy: SavedStrategy) =>
      ipcRenderer.invoke(IPC.STRATEGIES_SAVE, strategy) as Promise<SavedStrategy[]>,
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.STRATEGIES_DELETE, id) as Promise<SavedStrategy[]>
  },
  eaScripts: {
    list: (kind: ScriptKind) => ipcRenderer.invoke(IPC.EA_SCRIPTS_LIST, kind) as Promise<EaScript[]>,
    save: (script: EaScript) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_SAVE, script) as Promise<EaScript[]>,
    delete: (id: string, kind: ScriptKind) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_DELETE, id, kind) as Promise<EaScript[]>
  },
  ai: {
    listProviders: () => ipcRenderer.invoke(IPC.AI_LIST_PROVIDERS) as Promise<AiProviderProfile[]>,
    saveProvider: (profile: {
      id: string
      name: string
      provider: AiProviderProfile['provider']
      model: string
      baseUrl: string | null
    }) => ipcRenderer.invoke(IPC.AI_SAVE_PROVIDER, profile) as Promise<AiProviderProfile[]>,
    setProviderApiKey: (id: string, key: string) =>
      ipcRenderer.invoke(IPC.AI_SET_PROVIDER_API_KEY, id, key) as Promise<{
        ok: boolean
        error?: string
      }>,
    clearProviderApiKey: (id: string) =>
      ipcRenderer.invoke(IPC.AI_CLEAR_PROVIDER_API_KEY, id) as Promise<void>,
    deleteProvider: (id: string) =>
      ipcRenderer.invoke(IPC.AI_DELETE_PROVIDER, id) as Promise<AiProviderProfile[]>,
    testConnection: (id: string) =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION, id) as Promise<{ ok: boolean; message: string }>,
    listModels: (id: string) =>
      ipcRenderer.invoke(IPC.AI_LIST_MODELS, id) as Promise<{
        ok: boolean
        models: string[]
        message?: string
      }>,
    listChatThreads: (kind: ScriptKind) =>
      ipcRenderer.invoke(IPC.AI_LIST_CHAT_THREADS, kind) as Promise<EaChatThread[]>,
    listChatMessages: (threadId: string) =>
      ipcRenderer.invoke(IPC.AI_LIST_CHAT_MESSAGES, threadId) as Promise<EaChatMessage[]>,
    sendChatMessage: (payload: {
      scriptId: string
      threadId: string | null
      providerId: string
      files: EaChatAttachedFile[]
      message: string
      requestId: string
    }) =>
      ipcRenderer.invoke(IPC.AI_SEND_CHAT_MESSAGE, payload) as Promise<
        | { ok: true; thread: EaChatThread; messages: EaChatMessage[]; threads: EaChatThread[] }
        | {
            ok: false
            message: string
            thread?: EaChatThread
            messages?: EaChatMessage[]
            threads?: EaChatThread[]
          }
      >,
    onChatChunk: (
      cb: (payload: { requestId: string; text?: string; thinking?: string }) => void
    ) => {
      const listener = (
        _event: unknown,
        payload: { requestId: string; text?: string; thinking?: string }
      ): void => {
        cb(payload)
      }
      ipcRenderer.on(IPC.AI_CHAT_CHUNK, listener)
      return () => {
        ipcRenderer.removeListener(IPC.AI_CHAT_CHUNK, listener)
      }
    },
    deleteChatThread: (threadId: string, kind: ScriptKind) =>
      ipcRenderer.invoke(IPC.AI_DELETE_CHAT_THREAD, threadId, kind) as Promise<EaChatThread[]>
  },
  prefs: {
    load: () => ipcRenderer.invoke(IPC.PREFS_LOAD) as Promise<DeskPrefs>,
    save: (prefs: DeskPrefs) => ipcRenderer.invoke(IPC.PREFS_SAVE, prefs) as Promise<DeskPrefs>
  },
  drawings: {
    list: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_LIST, symbol) as Promise<Drawing[]>,
    save: (drawing: Drawing) => ipcRenderer.invoke(IPC.DRAWINGS_SAVE, drawing) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke(IPC.DRAWINGS_DELETE, id) as Promise<void>,
    clear: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_CLEAR, symbol) as Promise<void>
  },
  fundamentals: {
    get: () =>
      ipcRenderer.invoke(IPC.FUNDAMENTALS_GET) as Promise<{
        bundle: import('../core/fundamentals/types').FundamentalBundle
        source: 'bundled' | 'custom'
        updatedAt: number | null
      }>,
    refresh: (range?: { startDate: string; endDate: string }) =>
      ipcRenderer.invoke(IPC.FUNDAMENTALS_REFRESH, range) as Promise<{
        bundle: import('../core/fundamentals/types').FundamentalBundle
        source: 'bundled' | 'custom'
        updatedAt: number
      }>,
    reset: () =>
      ipcRenderer.invoke(IPC.FUNDAMENTALS_RESET) as Promise<{
        bundle: import('../core/fundamentals/types').FundamentalBundle
        source: 'bundled' | 'custom'
        updatedAt: null
      }>,
    upsertPoint: (
      seriesId: string,
      point: import('../core/fundamentals/types').FundamentalPoint
    ) =>
      ipcRenderer.invoke(IPC.FUNDAMENTALS_UPSERT_POINT, seriesId, point) as Promise<{
        bundle: import('../core/fundamentals/types').FundamentalBundle
        source: 'bundled' | 'custom'
        updatedAt: number
      }>,
    upsertEvent: (event: import('../core/fundamentals/types').FundamentalEvent) =>
      ipcRenderer.invoke(IPC.FUNDAMENTALS_UPSERT_EVENT, event) as Promise<{
        bundle: import('../core/fundamentals/types').FundamentalBundle
        source: 'bundled' | 'custom'
        updatedAt: number
      }>
  }
}

export type QuantifyApi = typeof api

contextBridge.exposeInMainWorld('kairos', api)
contextBridge.exposeInMainWorld('quantify', api)
contextBridge.exposeInMainWorld('aureum', api)
