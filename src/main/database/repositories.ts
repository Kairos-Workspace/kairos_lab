import { randomUUID } from 'node:crypto'
import { DEFAULT_DESK_PREFS, parseDeskPrefs } from '@core/desk/prefs'
import { parseDrawing } from '@core/drawings/model'
import type {
  BacktestSession,
  Candle,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  StrategySettings,
  Timeframe,
  Trade
} from '@shared/types'
import { getDb } from './db'

interface DatasetRow {
  id: number
  symbol: string
  timeframe: Timeframe
  source: string
  start_ts: number
  end_ts: number
  candle_count: number
  created_at: number
  version: number
  gap_count: number
}

export function listDatasets(): DatasetInfo[] {
  const rows = getDb()
    .prepare(
      `SELECT d.*,
        (SELECT COUNT(*) FROM data_gaps g WHERE g.dataset_id = d.id) AS gap_count
       FROM datasets d
       ORDER BY d.created_at DESC`
    )
    .all() as DatasetRow[]
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    source: r.source,
    startTs: r.start_ts,
    endTs: r.end_ts,
    candleCount: r.candle_count,
    createdAt: r.created_at,
    version: r.version,
    gapCount: r.gap_count
  }))
}

export function insertDataset(input: {
  symbol: string
  timeframe: Timeframe
  source: string
  candles: Candle[]
  gaps: DataGap[]
}): DatasetInfo {
  const database = getDb()
  const createdAt = Date.now()
  const startTs = input.candles[0]?.timestamp ?? 0
  const endTs = input.candles.at(-1)?.timestamp ?? 0

  const tx = database.transaction(() => {
    const info = database
      .prepare(
        `INSERT INTO datasets
          (symbol, timeframe, source, start_ts, end_ts, candle_count, created_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        input.symbol,
        input.timeframe,
        input.source,
        startTs,
        endTs,
        input.candles.length,
        createdAt
      )
    const datasetId = Number(info.lastInsertRowid)
    const insert = database.prepare(
      `INSERT OR REPLACE INTO candles
        (dataset_id, timestamp, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (const c of input.candles) {
      insert.run(datasetId, c.timestamp, c.open, c.high, c.low, c.close, c.volume ?? null)
    }
    const gapInsert = database.prepare(
      `INSERT INTO data_gaps (dataset_id, from_ts, to_ts, expected_bars) VALUES (?, ?, ?, ?)`
    )
    for (const g of input.gaps) {
      gapInsert.run(datasetId, g.fromTs, g.toTs, g.expectedBars ?? null)
    }
    return datasetId
  })

  const id = tx()
  return listDatasets().find((d) => d.id === id)!
}

export function replaceTape(input: {
  symbol: string
  timeframe: Timeframe
  source: string
  candles: Candle[]
  gaps: DataGap[]
}): DatasetInfo {
  const existing = listDatasets().find(
    (row) => row.symbol === input.symbol && row.timeframe === input.timeframe
  )
  if (!existing) return insertDataset(input)
  const database = getDb()
  const startTs = input.candles[0]?.timestamp ?? 0
  const endTs = input.candles.at(-1)?.timestamp ?? 0
  const tx = database.transaction(() => {
    database.prepare('DELETE FROM candles WHERE dataset_id = ?').run(existing.id)
    database.prepare('DELETE FROM data_gaps WHERE dataset_id = ?').run(existing.id)
    database
      .prepare(
        `UPDATE datasets
         SET source = ?, start_ts = ?, end_ts = ?, candle_count = ?, version = version + 1
         WHERE id = ?`
      )
      .run(input.source, startTs, endTs, input.candles.length, existing.id)
    const insert = database.prepare(
      `INSERT OR REPLACE INTO candles
        (dataset_id, timestamp, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (const c of input.candles) {
      insert.run(existing.id, c.timestamp, c.open, c.high, c.low, c.close, c.volume ?? null)
    }
    const gapInsert = database.prepare(
      `INSERT INTO data_gaps (dataset_id, from_ts, to_ts, expected_bars) VALUES (?, ?, ?, ?)`
    )
    for (const g of input.gaps) {
      gapInsert.run(existing.id, g.fromTs, g.toTs, g.expectedBars ?? null)
    }
  })
  tx()
  return listDatasets().find((row) => row.id === existing.id) ?? existing
}

export function getCandles(datasetId: number, fromTs?: number, toTs?: number): Candle[] {
  if (fromTs !== undefined && toTs !== undefined) {
    return getDb()
      .prepare(
        `SELECT timestamp, open, high, low, close, volume
         FROM candles
         WHERE dataset_id = ? AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp ASC`
      )
      .all(datasetId, fromTs, toTs) as Candle[]
  }
  return getDb()
    .prepare(
      `SELECT timestamp, open, high, low, close, volume
       FROM candles WHERE dataset_id = ? ORDER BY timestamp ASC`
    )
    .all(datasetId) as Candle[]
}

export function getRecentCandles(datasetId: number, limit: number, beforeTs?: number): Candle[] {
  const rows =
    beforeTs === undefined
      ? getDb()
          .prepare(
            `SELECT timestamp, open, high, low, close, volume
             FROM candles WHERE dataset_id = ?
             ORDER BY timestamp DESC LIMIT ?`
          )
          .all(datasetId, limit)
      : getDb()
          .prepare(
            `SELECT timestamp, open, high, low, close, volume
             FROM candles WHERE dataset_id = ? AND timestamp < ?
             ORDER BY timestamp DESC LIMIT ?`
          )
          .all(datasetId, beforeTs, limit)
  return (rows as Candle[]).reverse()
}

export function getGaps(datasetId: number): DataGap[] {
  return (
    getDb()
      .prepare(
        `SELECT from_ts AS fromTs, to_ts AS toTs, expected_bars AS expectedBars
         FROM data_gaps WHERE dataset_id = ? ORDER BY from_ts`
      )
      .all(datasetId) as DataGap[]
  )
}

export function deleteDataset(datasetId: number): void {
  getDb().prepare('DELETE FROM datasets WHERE id = ?').run(datasetId)
}

export function saveSession(session: BacktestSession, trades: Trade[]): BacktestSession {
  const database = getDb()
  const now = Date.now()
  const record = { ...session, updatedAt: now }
  database
    .prepare(
      `INSERT INTO sessions
        (id, name, symbol, timeframe, strategy_id, strategy_config, replay_timestamp,
         account_json, costs_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         symbol = excluded.symbol,
         timeframe = excluded.timeframe,
         strategy_id = excluded.strategy_id,
         strategy_config = excluded.strategy_config,
         replay_timestamp = excluded.replay_timestamp,
         account_json = excluded.account_json,
         costs_json = excluded.costs_json,
         updated_at = excluded.updated_at`
    )
    .run(
      record.id,
      record.name,
      record.symbol,
      record.timeframe,
      record.strategyId,
      JSON.stringify(record.strategyConfig),
      record.replayTimestamp,
      JSON.stringify(record.account),
      JSON.stringify(record.costs),
      record.createdAt,
      record.updatedAt
    )

  database.prepare('DELETE FROM trades WHERE session_id = ?').run(record.id)
  const insert = database.prepare(
    `INSERT INTO trades
      (id, session_id, symbol, direction, entry, stop_loss, take_profit, position_size,
       risk_amount, result, pnl, r_multiple, opened_at, closed_at, strategy, reason, skipped)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const t of trades) {
    insert.run(
      t.id,
      record.id,
      t.symbol,
      t.direction,
      t.entry,
      t.stopLoss,
      t.takeProfit,
      t.positionSize,
      t.riskAmount,
      t.result ?? null,
      t.pnl ?? null,
      t.rMultiple ?? null,
      t.openedAt,
      t.closedAt ?? null,
      t.strategy ?? null,
      t.reason ?? null,
      t.skipped ? 1 : 0
    )
  }
  return record
}

interface SessionRow {
  id: string
  name: string
  symbol: string
  timeframe: Timeframe
  strategy_id: string
  strategy_config: string
  replay_timestamp: number
  account_json: string
  costs_json: string
  created_at: number
  updated_at: number
}

function mapSession(row: SessionRow): BacktestSession {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    strategyId: row.strategy_id,
    strategyConfig: JSON.parse(row.strategy_config) as Record<string, unknown>,
    replayTimestamp: row.replay_timestamp,
    account: JSON.parse(row.account_json),
    costs: JSON.parse(row.costs_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listSessions(): BacktestSession[] {
  const rows = getDb()
    .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
    .all() as SessionRow[]
  return rows.map(mapSession)
}

export function loadSession(id: string): { session: BacktestSession; trades: Trade[] } | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    | SessionRow
    | undefined
  if (!row) return null
  const trades = getDb()
    .prepare('SELECT * FROM trades WHERE session_id = ? ORDER BY opened_at')
    .all(id) as Array<Record<string, unknown>>
  return {
    session: mapSession(row),
    trades: trades.map((t) => ({
      id: t.id as string,
      sessionId: t.session_id as string,
      symbol: t.symbol as string,
      direction: t.direction as Trade['direction'],
      entry: t.entry as number,
      stopLoss: t.stop_loss as number,
      takeProfit: t.take_profit as number,
      positionSize: t.position_size as number,
      riskAmount: t.risk_amount as number,
      result: (t.result as Trade['result']) ?? undefined,
      pnl: (t.pnl as number | null) ?? undefined,
      rMultiple: (t.r_multiple as number | null) ?? undefined,
      openedAt: t.opened_at as number,
      closedAt: (t.closed_at as number | null) ?? undefined,
      strategy: (t.strategy as string | null) ?? undefined,
      reason: (t.reason as string | null) ?? undefined,
      skipped: t.skipped === 1
    }))
  }
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function newSessionId(): string {
  return randomUUID()
}

interface StrategyRow {
  id: string
  name: string
  notes: string
  settings_json: string
  created_at: number
  updated_at: number
}

function mapStrategy(row: StrategyRow): SavedStrategy {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    settings: JSON.parse(row.settings_json) as StrategySettings,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listStrategies(): SavedStrategy[] {
  getDb()
    .prepare(
      `DELETE FROM strategies WHERE id LIKE 'seed-%'
        OR notes IN (
          'Close breaks the prior N-bar high or low, with volume confirmation.',
          'Fast SMA crossing the slow SMA.'
        )`
    )
    .run()
  const rows = getDb()
    .prepare('SELECT * FROM strategies ORDER BY updated_at DESC')
    .all() as StrategyRow[]
  return rows.map(mapStrategy)
}

export function saveStrategy(strategy: SavedStrategy): SavedStrategy {
  const now = Date.now()
  const row = {
    ...strategy,
    updatedAt: now,
    createdAt: strategy.createdAt || now
  }
  getDb()
    .prepare(
      `INSERT INTO strategies (id, name, notes, settings_json, created_at, updated_at)
       VALUES (@id, @name, @notes, @settings, @created, @updated)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         notes = excluded.notes,
         settings_json = excluded.settings_json,
         updated_at = excluded.updated_at`
    )
    .run({
      id: row.id,
      name: row.name.trim() || 'Untitled strategy',
      notes: row.notes,
      settings: JSON.stringify(row.settings),
      created: row.createdAt,
      updated: row.updatedAt
    })
  return { ...row, name: row.name.trim() || 'Untitled strategy' }
}

export function deleteStrategy(id: string): void {
  getDb().prepare('DELETE FROM strategies WHERE id = ?').run(id)
}

export function loadDeskPrefs(): DeskPrefs {
  const row = getDb().prepare('SELECT value FROM prefs WHERE key = ?').get('desk') as
    | { value: string }
    | undefined
  if (!row?.value) return { ...DEFAULT_DESK_PREFS }
  try {
    return parseDeskPrefs(JSON.parse(row.value))
  } catch {
    return { ...DEFAULT_DESK_PREFS }
  }
}

export function saveDeskPrefs(prefs: DeskPrefs): DeskPrefs {
  const next = parseDeskPrefs(prefs)
  getDb()
    .prepare(
      `INSERT INTO prefs (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run('desk', JSON.stringify(next))
  return next
}

interface DrawingRow {
  id: string
  symbol: string
  type: string
  payload_json: string
  created_at: number
  updated_at: number
}

function mapDrawing(row: DrawingRow): Drawing | null {
  let payload: unknown = {}
  try {
    payload = JSON.parse(row.payload_json)
  } catch {
    return null
  }
  return parseDrawing({
    ...(payload as object),
    id: row.id,
    symbol: row.symbol,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })
}

export function listDrawings(symbol: string): Drawing[] {
  const rows = getDb()
    .prepare('SELECT * FROM drawings WHERE symbol = ? ORDER BY created_at ASC')
    .all(symbol) as DrawingRow[]
  return rows.map(mapDrawing).filter((d): d is Drawing => d !== null)
}

export function saveDrawing(drawing: Drawing): void {
  const validated = parseDrawing(drawing)
  if (!validated) return
  const updatedAt = Date.now()
  getDb()
    .prepare(
      `INSERT INTO drawings (id, symbol, type, payload_json, created_at, updated_at)
       VALUES (@id, @symbol, @type, @payload, @created, @updated)
       ON CONFLICT(id) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    )
    .run({
      id: validated.id,
      symbol: validated.symbol,
      type: validated.type,
      payload: JSON.stringify({
        type: validated.type,
        points: validated.points,
        text: validated.text,
        style: validated.style
      }),
      created: validated.createdAt,
      updated: updatedAt
    })
}

export function deleteDrawing(id: string): void {
  getDb().prepare('DELETE FROM drawings WHERE id = ?').run(id)
}

export function clearDrawings(symbol: string): void {
  getDb().prepare('DELETE FROM drawings WHERE symbol = ?').run(symbol)
}
