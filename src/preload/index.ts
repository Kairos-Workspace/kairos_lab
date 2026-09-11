import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { CandleBuffer } from '../shared/candleBuffer'
import type {
  BacktestSession,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '../shared/types'

const api = {
  dbPath: (): Promise<string> => ipcRenderer.invoke(IPC.DB_PATH),
  datasets: {
    list: () => ipcRenderer.invoke(IPC.DATASETS_LIST) as Promise<DatasetInfo[]>,
    candles: (datasetId: number, fromTs?: number, toTs?: number) =>
      ipcRenderer.invoke(IPC.DATASETS_CANDLES, datasetId, fromTs, toTs) as Promise<CandleBuffer>,
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
  prefs: {
    load: () => ipcRenderer.invoke(IPC.PREFS_LOAD) as Promise<DeskPrefs>,
    save: (prefs: DeskPrefs) => ipcRenderer.invoke(IPC.PREFS_SAVE, prefs) as Promise<DeskPrefs>
  },
  drawings: {
    list: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_LIST, symbol) as Promise<Drawing[]>,
    save: (drawing: Drawing) => ipcRenderer.invoke(IPC.DRAWINGS_SAVE, drawing) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke(IPC.DRAWINGS_DELETE, id) as Promise<void>,
    clear: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_CLEAR, symbol) as Promise<void>
  }
}

export type QuantifyApi = typeof api

contextBridge.exposeInMainWorld('quantify', api)
contextBridge.exposeInMainWorld('aureum', api)
