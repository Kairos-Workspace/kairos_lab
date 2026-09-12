import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { intervalMs } from '@core/candles/resample'
import { generateDemoCandles } from '@core/candles/demo'
import { validateCandles, dedupeCandles } from '@core/candles/validate'
import { parseCandleCsv } from '@core/csv/parse'
import { IPC } from '@shared/ipc'
import { toCandleBuffer } from '@shared/candleBuffer'
import type {
  BacktestSession,
  Candle,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
import { dbPath, getDb } from './database/db'
import {
  clearDrawings,
  deleteDataset,
  deleteDrawing,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  getRecentCandles,
  insertDataset,
  listDatasets,
  listDrawings,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveDeskPrefs,
  saveDrawing,
  saveSession,
  saveStrategy
} from './database/repositories'
import { latestWindow } from '@core/market/catalog'
import { csvCandles, deleteCsvTape, isCsvDataset, refreshCsvDatasets } from './data/csvTape'
import { estimateDownload, fetchMarketCandles } from './data/fetchMarket'

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

  handle(IPC.PREFS_LOAD, () => loadDeskPrefs())

  handle(IPC.PREFS_SAVE, (_e, prefs: DeskPrefs) => saveDeskPrefs(prefs))

  handle(IPC.DRAWINGS_LIST, (_e, symbol: string) => listDrawings(symbol))

  handle(IPC.DRAWINGS_SAVE, (_e, drawing: Drawing) => saveDrawing(drawing))

  handle(IPC.DRAWINGS_DELETE, (_e, id: string) => deleteDrawing(id))

  handle(IPC.DRAWINGS_CLEAR, (_e, symbol: string) => clearDrawings(symbol))
}
