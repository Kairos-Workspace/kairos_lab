import { create } from 'zustand'
import { pickLocalDataset } from '@core/candles/dataset'
import { downloadWindow, normalizeSymbol } from '@core/market/catalog'
import { intervalMs, resample } from '@core/candles/resample'
import { ReplayEngine } from '@core/replay/engine'
import { createStrategy } from '@core/strategy/registry'
import { createAccount, applyClosedTrade } from '@core/trade/account'
import { calculatePositionSize, riskReward } from '@core/trade/sizing'
import { evaluateTradeOnCandle, lowerTimeframeWindow } from '@core/trade/simulation'
import { fromCandleBuffer } from '@shared/candleBuffer'
import {
  BASE_TICK_MS,
  DEFAULT_COSTS,
  DEFAULT_STRATEGY_SETTINGS,
  WARMUP_BARS
} from '@shared/constants'
import type {
  AmbiguityRule,
  BacktestSession,
  Candle,
  CostConfig,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  DeskTheme,
  Direction,
  SavedStrategy,
  StrategySettings,
  StrategySignal,
  Timeframe,
  Trade
} from '@shared/types'
import { desktop, desktopMissingMessage, loadDeskPrefs, requireDesktop } from '@/lib/desktop'
import { applyDeskTheme } from '@core/desk/theme'
import { notifyError, notifyInfo, notifySuccess } from '@/lib/notify'
import { drainLocalStrategies, mergeStrategyLists, withoutSeeds } from './strategyVault'

export type AppScreen = 'library' | 'workspace'
export type RightTab = 'strategy' | 'trade' | 'sessions' | 'costs'
export type HistoryFilter = 'ALL' | 'WIN' | 'LOSS' | 'BUY' | 'SELL'

export interface DraftTrade {
  direction: Direction
  entry: string
  stopLoss: string
  takeProfit: string
  riskPercent: string
  timestamp: number
}

interface AppState {
  datasets: DatasetInfo[]
  sessions: BacktestSession[]
  datasetId: number | null
  sourceCandles: Candle[]
  sourceTimeframe: Timeframe
  displayTimeframe: Timeframe
  displayCandles: Candle[]
  gaps: DataGap[]
  dbPath: string
  symbol: string
  mode: 'view' | 'replay'
  replayIndex: number
  replayFromTs: number | null
  replayToTs: number | null
  isPlaying: boolean
  speed: number
  hideDate: boolean
  settings: StrategySettings
  pendingSetup: StrategySignal | null
  draft: DraftTrade | null
  activeTrade: Trade | null
  trades: Trade[]
  skipped: Trade[]
  account: ReturnType<typeof createAccount>
  costs: CostConfig
  ambiguityRule: AmbiguityRule
  rightTab: RightTab
  historyFilter: HistoryFilter
  selectedTradeId: string | null
  status: string
  busy: boolean
  sessionId: string
  sessionName: string
  horizontalLevels: number[]
  chartFull: boolean
  screen: AppScreen
  strategies: SavedStrategy[]
  activeStrategyId: string | null
  theme: DeskTheme

  bootstrap: () => Promise<void>
  openStrategy: (id: string) => void
  leaveWorkspace: () => void
  createStrategy: (input: { name: string; notes?: string; settings?: Partial<StrategySettings> }) => Promise<string>
  persistActiveStrategy: () => void
  deleteSavedStrategy: (id: string) => Promise<void>
  purgeSeededStrategies: () => void
  setChartFull: (full: boolean) => void
  toggleChartFull: () => void
  setRightTab: (tab: RightTab) => void
  setHistoryFilter: (filter: HistoryFilter) => void
  setSpeed: (speed: number) => void
  setTheme: (theme: DeskTheme) => void
  setSettings: (patch: Partial<StrategySettings>) => void
  setCosts: (patch: Partial<CostConfig>) => void
  setAmbiguityRule: (rule: AmbiguityRule) => void
  setAccountRisk: (risk: number) => void
  setTimeframe: (tf: Timeframe) => Promise<void>
  selectSymbol: (symbol: string) => Promise<void>
  downloadPair: (input: {
    symbol: string
    timeframe: Timeframe
    lookbackMs: number
  }) => Promise<void>
  refreshTape: (id: number) => Promise<number>
  refreshTapes: (ids: number[]) => Promise<number>
  removeTape: (id: number) => Promise<void>
  loadDataset: (id: number) => Promise<void>
  startReplay: (opts?: {
    random?: boolean
    hideDate?: boolean
    timestamp?: number
    fromTs?: number
    toTs?: number
  }) => void
  setReplayRange: (fromTs: number | null, toTs: number | null) => void
  stopReplay: () => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  step: (n: number) => void
  resetReplay: () => void
  jumpToDate: (timestamp: number) => void
  takeSetup: () => void
  skipSetup: () => void
  startManualTrade: (direction: Direction) => void
  updateDraft: (patch: Partial<DraftTrade>) => void
  confirmTrade: () => void
  saveCurrentSession: (name?: string) => Promise<void>
  loadSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  selectTrade: (id: string | null) => void
  addHorizontal: (price: number) => void
  currentCandle: () => Candle | undefined
}

let raf = 0
let accMs = 0
let lastTick = 0
let strategy = createStrategy(DEFAULT_STRATEGY_SETTINGS)

function clearTimer(): void {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  accMs = 0
  lastTick = 0
}

function newId(): string {
  return crypto.randomUUID()
}

function defaultStopTarget(
  direction: Direction,
  entry: number,
  costs: CostConfig,
  settings: StrategySettings
): { stopLoss: number; takeProfit: number } {
  const slDist = Math.max(costs.tickSize * 50, entry * 0.0015)
  const stopLoss = direction === 'BUY' ? entry - slDist : entry + slDist
  const takeProfit =
    direction === 'BUY' ? entry + slDist * settings.defaultRr : entry - slDist * settings.defaultRr
  return { stopLoss, takeProfit }
}

function draftFromSignal(
  signal: StrategySignal,
  costs: CostConfig,
  settings: StrategySettings,
  riskPercent: number
): DraftTrade {
  const direction: Direction = signal.type === 'LONG' ? 'BUY' : 'SELL'
  const entry = signal.price
  const { stopLoss, takeProfit } = defaultStopTarget(direction, entry, costs, settings)
  return {
    direction,
    entry: entry.toFixed(2),
    stopLoss: stopLoss.toFixed(2),
    takeProfit: takeProfit.toFixed(2),
    riskPercent: String(riskPercent),
    timestamp: signal.timestamp
  }
}

function strategyBridge() {
  return desktop()?.strategies
}

function deskFromState(state: {
  symbol: string
  displayTimeframe: Timeframe
  speed: number
  theme: DeskTheme
  costs: CostConfig
  ambiguityRule: AmbiguityRule
  account: { riskPerTrade: number; initialBalance: number }
  activeStrategyId: string | null
  datasetId: number | null
}): DeskPrefs {
  return {
    symbol: state.symbol,
    displayTimeframe: state.displayTimeframe,
    speed: state.speed,
    theme: state.theme,
    costs: state.costs,
    ambiguityRule: state.ambiguityRule,
    riskPerTrade: state.account.riskPerTrade,
    initialBalance: state.account.initialBalance,
    lastStrategyId: state.activeStrategyId,
    lastDatasetId: state.datasetId
  }
}

function visibleFrom(state: Pick<AppState, 'mode' | 'displayCandles' | 'replayIndex'>): Candle[] {
  if (state.mode === 'view') return state.displayCandles
  return state.displayCandles.slice(0, state.replayIndex + 1)
}

function rebuildDisplay(source: Candle[], sourceTf: Timeframe, target: Timeframe): Candle[] {
  if (intervalMs(target) <= intervalMs(sourceTf)) return source.map((c) => ({ ...c }))
  return resample(source, target)
}

export const useAppStore = create<AppState>((set, get) => {
  const persistDesk = (): void => {
    const api = desktop()
    if (!api?.prefs) return
    void api.prefs.save(deskFromState(get()))
  }

  return {
  datasets: [],
  sessions: [],
  datasetId: null,
  sourceCandles: [],
  sourceTimeframe: '1M',
  displayTimeframe: '1H',
  displayCandles: [],
  gaps: [],
  dbPath: '',
  symbol: 'XAUUSD',
  mode: 'view',
  replayIndex: 0,
  replayFromTs: null,
  replayToTs: null,
  isPlaying: false,
  speed: 1,
  hideDate: false,
  settings: { ...DEFAULT_STRATEGY_SETTINGS },
  pendingSetup: null,
  draft: null,
  activeTrade: null,
  trades: [],
  skipped: [],
  account: createAccount(),
  costs: { ...DEFAULT_COSTS },
  ambiguityRule: 'ambiguous',
  rightTab: 'strategy',
  historyFilter: 'ALL',
  selectedTradeId: null,
  status: 'Opening local market data…',
  busy: true,
  sessionId: newId(),
  sessionName: 'Untitled session',
  horizontalLevels: [],
  chartFull: false,
  screen: 'library',
  strategies: [],
  activeStrategyId: null,
  theme: 'dark',

  currentCandle: () => {
    const s = get()
    const bars = visibleFrom(s)
    return bars.at(-1)
  },

  bootstrap: async () => {
    set({ busy: true, status: 'Opening local market data…' })
    const api = desktop()
    if (!api) {
      const status = desktopMissingMessage()
      set({ busy: false, status })
      notifyError(status)
      return
    }
    try {
      const leftover = drainLocalStrategies()
      const [datasets, sessions, storedStrategies, prefs, dbPath] = await Promise.all([
        api.datasets.list(),
        api.sessions.list(),
        strategyBridge()?.list().catch(() => []) ?? Promise.resolve([]),
        loadDeskPrefs(),
        api.dbPath()
      ])
      let strategies = mergeStrategyLists(leftover, storedStrategies)
      if (leftover.length > 0) {
        for (const row of leftover) {
          await strategyBridge()?.save(row)
        }
        strategies = (await strategyBridge()?.list()) ?? strategies
      }
      set({
        datasets,
        sessions,
        strategies,
        dbPath,
        symbol: prefs.symbol,
        displayTimeframe: prefs.displayTimeframe,
        speed: prefs.speed,
        costs: prefs.costs,
        ambiguityRule: prefs.ambiguityRule,
        account: createAccount(prefs.initialBalance, prefs.riskPerTrade),
        activeStrategyId: prefs.lastStrategyId,
        theme: prefs.theme,
        status: `Market tape ready · ${dbPath}`
      })
      applyDeskTheme(prefs.theme)
      const remembered = prefs.lastDatasetId
        ? datasets.find((row: DatasetInfo) => row.id === prefs.lastDatasetId)
        : undefined
      const auto =
        remembered ??
        pickLocalDataset(datasets, get().symbol, get().displayTimeframe) ??
        pickLocalDataset(datasets, datasets[0]?.symbol ?? get().symbol, get().displayTimeframe)
      if (auto) {
        await get().loadDataset(auto.id)
        set({ rightTab: 'strategy' })
      } else {
        set({ busy: false, status: 'No local market data found in the project database.' })
      }
    } catch {
      set({ busy: false, status: 'Could not open the local desk.' })
      notifyError('Could not open the local desk.')
    }
  },

  openStrategy: (id) => {
    const saved = get().strategies.find((s) => s.id === id)
    if (!saved) return
    const settings = { ...DEFAULT_STRATEGY_SETTINGS, ...saved.settings }
    strategy = createStrategy(settings)
    strategy.initialize()
    clearTimer()
    set({
      screen: 'workspace',
      activeStrategyId: saved.id,
      settings,
      sessionName: saved.name,
      sessionId: newId(),
      rightTab: 'strategy',
      mode: 'view',
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      trades: [],
      skipped: [],
      selectedTradeId: null,
      chartFull: false,
      status: `${saved.name} · ready to backtest`
    })
    persistDesk()
  },

  leaveWorkspace: () => {
    clearTimer()
    set({
      screen: 'library',
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      chartFull: false,
      status: 'Strategy library'
    })
  },

  createStrategy: async (input) => {
    const now = Date.now()
    const saved: SavedStrategy = {
      id: newId(),
      name: input.name.trim() || 'Untitled strategy',
      notes: input.notes?.trim() ?? '',
      settings: { ...DEFAULT_STRATEGY_SETTINGS, ...input.settings },
      createdAt: now,
      updatedAt: now
    }
    const strategies = (await strategyBridge()?.save(saved)) ?? [saved, ...get().strategies]
    set({ strategies })
    persistDesk()
    notifySuccess(`${saved.name} saved`)
    return saved.id
  },

  persistActiveStrategy: () => {
    const s = get()
    if (!s.activeStrategyId) return
    const current = s.strategies.find((row) => row.id === s.activeStrategyId)
    if (!current) return
    const next: SavedStrategy = {
      ...current,
      settings: s.settings,
      updatedAt: Date.now()
    }
    set({
      strategies: [next, ...s.strategies.filter((row) => row.id !== next.id)]
    })
    void strategyBridge()?.save(next).catch(() => undefined)
  },

  purgeSeededStrategies: () => {
    set({ strategies: withoutSeeds(get().strategies) })
  },

  deleteSavedStrategy: async (id) => {
    const strategies = (await strategyBridge()?.delete(id)) ?? get().strategies.filter((row) => row.id !== id)
    set({
      strategies,
      activeStrategyId: get().activeStrategyId === id ? null : get().activeStrategyId
    })
    persistDesk()
    notifyInfo('Strategy removed')
  },

  setChartFull: (chartFull) => set({ chartFull }),
  toggleChartFull: () => set({ chartFull: !get().chartFull }),
  setRightTab: (rightTab) => set({ rightTab }),
  setHistoryFilter: (historyFilter) => set({ historyFilter }),
  setSpeed: (speed) => {
    set({ speed })
    persistDesk()
    if (get().isPlaying) {
      get().pause()
      get().play()
    }
  },
  setTheme: (theme) => {
    applyDeskTheme(theme)
    set({ theme })
    persistDesk()
  },
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    strategy = createStrategy(settings)
    strategy.initialize()
    set({ settings })
    get().persistActiveStrategy()
  },
  setCosts: (patch) => {
    set({ costs: { ...get().costs, ...patch } })
    persistDesk()
  },
  setAmbiguityRule: (ambiguityRule) => {
    set({ ambiguityRule })
    persistDesk()
  },
  setAccountRisk: (riskPerTrade) => {
    set({ account: { ...get().account, riskPerTrade } })
    persistDesk()
  },

  setTimeframe: async (tf) => {
    const s = get()
    const best = pickLocalDataset(s.datasets, s.symbol, tf)
    if (best && best.id !== s.datasetId) {
      set({ displayTimeframe: tf })
      await get().loadDataset(best.id)
      return
    }
    const displayCandles = rebuildDisplay(s.sourceCandles, s.sourceTimeframe, tf)
    const ts = s.displayCandles[s.replayIndex]?.timestamp ?? displayCandles[0]?.timestamp ?? 0
    const replayIndex = ReplayEngine.mapTimestampToIndex(displayCandles, ts)
    set({ displayTimeframe: tf, displayCandles, replayIndex })
    persistDesk()
  },

  selectSymbol: async (symbol) => {
    const best = pickLocalDataset(get().datasets, symbol, get().displayTimeframe)
    if (!best) {
      clearTimer()
      set({
        symbol,
        datasetId: null,
        sourceCandles: [],
        displayCandles: [],
        gaps: [],
        isPlaying: false,
        status: `No local tape for ${symbol}`
      })
      notifyInfo(`No local tape for ${symbol}`)
      persistDesk()
      return
    }
    await get().loadDataset(best.id)
  },

  downloadPair: async (input) => {
    if (!desktop()) {
      const status = desktopMissingMessage()
      set({ status })
      notifyError(status)
      return
    }
    const symbol = normalizeSymbol(input.symbol)
    if (symbol.length < 3) {
      set({ status: 'Enter a pair such as EURUSD.' })
      notifyError('Enter a pair such as EURUSD.')
      return
    }
    const range = downloadWindow(input.timeframe, input.lookbackMs)
    set({ busy: true, status: `Downloading ${symbol} ${input.timeframe}…` })
    try {
      const result = await requireDesktop().datasets.download({
        symbol,
        timeframe: input.timeframe,
        startTs: range.startTs,
        endTs: range.endTs
      })
      const status = `${symbol} ${input.timeframe} · ${result.dataset.candleCount.toLocaleString()} bars ready`
      set({
        datasets: result.datasets,
        busy: false,
        status
      })
      persistDesk()
      notifySuccess(status)
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : `Could not download ${symbol}.`
      })
      notifyError(`Could not download ${symbol}.`, error)
      throw error
    }
  },

  refreshTape: async (id) => {
    return get().refreshTapes([id])
  },

  refreshTapes: async (ids) => {
    if (!desktop()) {
      const status = desktopMissingMessage()
      set({ status })
      notifyError(status)
      return 0
    }
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
    if (unique.length === 0) {
      set({ status: 'No tapes to update.' })
      notifyInfo('No tapes to update.')
      return 0
    }
    set({ busy: true, status: 'Getting latest data…' })
    try {
      let added = 0
      let datasets = get().datasets
      for (const id of unique) {
        const tape = get().datasets.find((row) => row.id === id)
        set({
          status: tape
            ? `Getting latest ${tape.symbol} ${tape.timeframe}…`
            : 'Getting latest data…'
        })
        const result = await requireDesktop().datasets.refresh(id)
        added += result.added
        datasets = result.datasets
        set({ datasets })
      }
      const openId = get().datasetId
      const shouldReload =
        openId != null &&
        (unique.includes(openId) || datasets.some((row) => row.id === openId && unique.includes(row.id)))
      const status =
        added > 0
          ? `Latest data in · ${added.toLocaleString()} new bars`
          : 'Already latest — nothing new to pull.'
      set({
        datasets,
        busy: false,
        status
      })
      if (added > 0) notifySuccess(status)
      else notifyInfo(status)
      if (shouldReload && openId != null) await get().loadDataset(openId)
      return added
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not get the latest data.'
      })
      notifyError('Could not get the latest data.', error)
      throw error
    }
  },

  removeTape: async (id) => {
    if (!desktop()) return
    set({ busy: true, status: 'Removing tape…' })
    try {
      const datasets = await requireDesktop().datasets.delete(id)
      const stillOpen = get().datasetId === id
      set({
        datasets,
        ...(stillOpen
          ? { datasetId: null, sourceCandles: [], displayCandles: [], gaps: [] }
          : {}),
        busy: false,
        status: 'Tape removed'
      })
      notifySuccess('Tape removed')
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not remove that tape.'
      })
      notifyError('Could not remove that tape.', error)
    }
  },

  loadDataset: async (id) => {
    const dataset = get().datasets.find((d) => d.id === id)
    if (!dataset) return
    set({ busy: true, status: `Loading ${dataset.source} tape…` })
    try {
    const [candleBuffer, gaps] = await Promise.all([
      requireDesktop().datasets.candles(id),
      requireDesktop().datasets.gaps(id)
    ])
    const sourceCandles = fromCandleBuffer(candleBuffer)
    const displayTimeframe =
      intervalMs(dataset.timeframe) <= intervalMs(get().displayTimeframe)
        ? get().displayTimeframe
        : dataset.timeframe
    const displayCandles = rebuildDisplay(sourceCandles, dataset.timeframe, displayTimeframe)
    strategy = createStrategy(get().settings)
    strategy.initialize()
    set({
      datasetId: id,
      symbol: dataset.symbol,
      sourceCandles,
      sourceTimeframe: dataset.timeframe,
      displayTimeframe,
      displayCandles,
      gaps,
      mode: 'view',
      replayIndex: Math.max(0, displayCandles.length - 1),
      replayFromTs: displayCandles[0]?.timestamp ?? null,
      replayToTs: displayCandles.at(-1)?.timestamp ?? null,
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      busy: false,
      status: `${dataset.symbol} ${dataset.timeframe} · ${sourceCandles.length.toLocaleString()} candles`
    })
    clearTimer()
    persistDesk()
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not load that tape.'
      })
      notifyError('Could not load that tape.', error)
    }
  },

  setReplayRange: (fromTs, toTs) => {
    let from = fromTs
    let to = toTs
    if (from != null && to != null && from > to) {
      const swap = from
      from = to
      to = swap
    }
    set({ replayFromTs: from, replayToTs: to })
  },

  startReplay: (opts) => {
    const s = get()
    if (s.displayCandles.length === 0) {
      set({ status: 'Load a dataset first.' })
      notifyError('Load a dataset first.')
      return
    }
    strategy = createStrategy(s.settings)
    strategy.initialize()
    const engine = new ReplayEngine(s.displayCandles, { warmup: WARMUP_BARS })
    const fromTs = opts?.fromTs ?? opts?.timestamp ?? s.replayFromTs
    const toTs = opts?.toTs ?? s.replayToTs
    let index = engine.index
    if (opts?.random) {
      index = engine.randomStart()
      engine.jumpToIndex(index)
    } else if (fromTs != null) {
      engine.jumpToTimestamp(fromTs)
      index = engine.index
    }
    const fromLabel = fromTs != null ? new Date(fromTs).toISOString().slice(0, 16).replace('T', ' ') : 'start'
    const toLabel = toTs != null ? new Date(toTs).toISOString().slice(0, 16).replace('T', ' ') : 'end'
    set({
      mode: 'replay',
      replayIndex: index,
      replayFromTs: fromTs ?? s.replayFromTs,
      replayToTs: toTs ?? s.replayToTs,
      hideDate: Boolean(opts?.hideDate),
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      trades: [],
      skipped: [],
      account: createAccount(s.account.initialBalance, s.account.riskPerTrade),
      sessionId: newId(),
      selectedTradeId: null,
      status: opts?.random
        ? 'Random replay armed. Press play.'
        : `Replay ${fromLabel} → ${toLabel}`
    })
  },

  stopReplay: () => {
    clearTimer()
    const s = get()
    set({
      mode: 'view',
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      replayIndex: Math.max(0, s.displayCandles.length - 1)
    })
  },

  play: () => {
    const s = get()
    if (s.pendingSetup || s.draft || s.displayCandles.length === 0) return
    if (s.mode !== 'replay') get().startReplay()
    clearTimer()
    set({ isPlaying: true, status: 'Replaying…' })
    lastTick = performance.now()
    const loop = (now: number) => {
      const current = get()
      if (!current.isPlaying || current.pendingSetup || current.draft) {
        raf = 0
        return
      }
      accMs += now - lastTick
      lastTick = now
      const stepMs = Math.max(48, BASE_TICK_MS / current.speed)
      if (accMs >= stepMs) {
        accMs -= stepMs
        if (accMs > stepMs) accMs = 0
        get().step(1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  },

  pause: () => {
    clearTimer()
    set({ isPlaying: false })
  },

  togglePlay: () => {
    if (get().isPlaying) get().pause()
    else get().play()
  },

  step: (n) => {
    const s = get()
    if (s.displayCandles.length === 0) return
    if (s.mode !== 'replay') get().startReplay()
    if (s.pendingSetup || s.draft) return

    const next = get()
    const tape = next.displayCandles
    const lastIndex = tape.length - 1
    const minIndex = Math.min(WARMUP_BARS, lastIndex)
    const direction = n >= 0 ? 1 : -1
    const steps = Math.abs(n)
    let index = next.replayIndex
    let pending: StrategySignal | null = null
    let active = next.activeTrade
    let account = next.account
    let trades = next.trades
    const lookback = Math.max(2, next.settings.lookback ?? 20)

    for (let i = 0; i < steps; i++) {
      const upcoming = tape[index + direction]
      if (!upcoming) {
        clearTimer()
        set({
          replayIndex: index,
          isPlaying: false,
          activeTrade: active,
          trades,
          account,
          status: 'End of tape.'
        })
        return
      }
      if (direction > 0 && next.replayToTs != null && upcoming.timestamp > next.replayToTs) {
        clearTimer()
        set({
          replayIndex: index,
          isPlaying: false,
          activeTrade: active,
          trades,
          account,
          pendingSetup: pending,
          draft: pending
            ? draftFromSignal(pending, next.costs, next.settings, account.riskPerTrade)
            : null,
          status: 'End of selected range.'
        })
        return
      }
      if (direction < 0 && index + direction < minIndex) {
        set({ replayIndex: minIndex, isPlaying: false, activeTrade: active, trades, account })
        return
      }

      index += direction
      const candle = tape[index]
      if (!candle) break

      if (active && direction > 0) {
        const prev = tape[index - 1]
        const micro =
          next.sourceTimeframe !== next.displayTimeframe
            ? lowerTimeframeWindow(
                next.sourceCandles,
                prev?.timestamp ?? candle.timestamp,
                candle.timestamp
              )
            : undefined
        const result = evaluateTradeOnCandle(active, candle, {
          contractSize: next.costs.contractSize,
          costs: next.costs,
          ambiguityRule: next.ambiguityRule,
          lowerTimeframe: micro
        })
        if (result.closed) {
          if (trades === next.trades) trades = next.trades.slice()
          trades.push({
            ...active,
            result: result.result,
            pnl: result.pnl,
            rMultiple: result.rMultiple,
            closedAt: candle.timestamp
          })
          account = applyClosedTrade(account, result.pnl ?? 0)
          active = null
        }
      }

      if (direction > 0 && !pending && !active) {
        pending = strategy.onCandle(candle, {
          candles: tape.slice(Math.max(0, index - lookback), index + 1),
          symbol: next.symbol,
          timeframe: next.displayTimeframe
        })
        if (pending && next.settings.pauseOnSetup) break
        if (pending && next.settings.autoEntry) {
          const dir: Direction = pending.type === 'LONG' ? 'BUY' : 'SELL'
          const entry = pending.price
          const { stopLoss: sl, takeProfit: tp } = defaultStopTarget(dir, entry, next.costs, next.settings)
          const sized = calculatePositionSize({
            balance: account.balance,
            riskPercent: account.riskPerTrade,
            entry,
            stopLoss: sl,
            costs: next.costs
          })
          active = {
            id: newId(),
            sessionId: next.sessionId,
            symbol: next.symbol,
            direction: dir,
            entry,
            stopLoss: sl,
            takeProfit: tp,
            positionSize: sized.positionSize,
            riskAmount: sized.riskAmount,
            openedAt: candle.timestamp,
            strategy: pending.strategy,
            reason: pending.reason
          }
          pending = null
        } else if (pending && !next.settings.pauseOnSetup) {
          pending = null
        }
      }
    }

    set({
      replayIndex: index,
      activeTrade: active,
      trades,
      account,
      pendingSetup: pending,
      draft: pending
        ? draftFromSignal(pending, next.costs, next.settings, account.riskPerTrade)
        : null,
      isPlaying: pending ? false : get().isPlaying,
      status: pending ? 'Setup detected. Replay paused.' : get().status
    })
    if (pending) clearTimer()
  },

  resetReplay: () => {
    const s = get()
    get().startReplay({
      hideDate: s.hideDate,
      fromTs: s.replayFromTs ?? undefined,
      toTs: s.replayToTs ?? undefined
    })
  },

  jumpToDate: (timestamp) => {
    const s = get()
    const index = ReplayEngine.mapTimestampToIndex(s.displayCandles, timestamp)
    if (s.mode === 'replay') set({ replayIndex: index, isPlaying: false })
    else set({ selectedTradeId: get().selectedTradeId })
  },

  takeSetup: () => {
    get().confirmTrade()
  },

  startManualTrade: (direction) => {
    const s = get()
    if (s.activeTrade || s.pendingSetup || s.draft) return
    const candle = s.currentCandle()
    if (!candle) return
    if (s.isPlaying) get().pause()
    const { stopLoss, takeProfit } = defaultStopTarget(direction, candle.close, s.costs, s.settings)
    set({
      draft: {
        direction,
        entry: candle.close.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        riskPercent: String(s.account.riskPerTrade),
        timestamp: candle.timestamp
      }
    })
  },

  skipSetup: () => {
    const signal = get().pendingSetup
    if (!signal) return
    const skipped: Trade = {
      id: newId(),
      sessionId: get().sessionId,
      symbol: get().symbol,
      direction: signal.type === 'LONG' ? 'BUY' : 'SELL',
      entry: signal.price,
      stopLoss: signal.price,
      takeProfit: signal.price,
      positionSize: 0,
      riskAmount: 0,
      openedAt: signal.timestamp,
      strategy: signal.strategy,
      reason: signal.reason,
      skipped: true
    }
    set({
      skipped: [...get().skipped, skipped],
      pendingSetup: null,
      draft: null,
      status: 'Setup skipped.'
    })
  },

  updateDraft: (patch) => {
    const draft = get().draft
    if (!draft) return
    set({ draft: { ...draft, ...patch } })
  },

  confirmTrade: () => {
    const { draft, pendingSetup, account, costs, symbol, sessionId } = get()
    if (!draft) return
    const entry = Number(draft.entry)
    const stopLoss = Number(draft.stopLoss)
    const takeProfit = Number(draft.takeProfit)
    const riskPercent = Number(draft.riskPercent)
    if (![entry, stopLoss, takeProfit, riskPercent].every(Number.isFinite)) {
      set({ status: 'Entry, SL, TP, and risk must be numbers.' })
      notifyError('Entry, SL, TP, and risk must be numbers.')
      return
    }
    const sized = calculatePositionSize({
      balance: account.balance,
      riskPercent,
      entry,
      stopLoss,
      costs
    })
    const trade: Trade = {
      id: newId(),
      sessionId,
      symbol,
      direction: draft.direction,
      entry,
      stopLoss,
      takeProfit,
      positionSize: sized.positionSize,
      riskAmount: sized.riskAmount,
      openedAt: draft.timestamp,
      strategy: pendingSetup?.strategy,
      reason: pendingSetup?.reason
    }
    set({
      activeTrade: trade,
      pendingSetup: null,
      draft: null,
      status: `${draft.direction} opened · RR ${riskReward(entry, stopLoss, takeProfit).toFixed(2)}`
    })
    requestAnimationFrame(() => get().play())
  },

  saveCurrentSession: async (name) => {
    set({ busy: true, status: 'Saving session…' })
    const s = get()
    const session: BacktestSession = {
      id: s.sessionId,
      name: name?.trim() || s.sessionName,
      symbol: s.symbol,
      timeframe: s.displayTimeframe,
      strategyId: s.activeStrategyId ?? s.settings.strategyId,
      strategyConfig: { ...s.settings },
      replayTimestamp: s.displayCandles[s.replayIndex]?.timestamp ?? 0,
      account: s.account,
      costs: s.costs,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    try {
      await requireDesktop().sessions.save(session, [...s.trades, ...s.skipped])
      const sessions = await requireDesktop().sessions.list()
      set({
        sessions,
        sessionName: session.name,
        busy: false,
        status: `Session saved · ${session.name}`
      })
      notifySuccess(`Session saved · ${session.name}`)
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not save the session.'
      })
      notifyError('Could not save the session.', error)
    }
  },

  loadSession: async (id) => {
    set({ busy: true, status: 'Opening session…' })
    let loaded: Awaited<ReturnType<ReturnType<typeof requireDesktop>['sessions']['load']>>
    try {
      loaded = await requireDesktop().sessions.load(id)
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not open that session.'
      })
      notifyError('Could not open that session.', error)
      return
    }
    if (!loaded) {
      set({ busy: false, status: 'Session not found.' })
      notifyError('Session not found.')
      return
    }
    const settings = {
      ...DEFAULT_STRATEGY_SETTINGS,
      ...(loaded.session.strategyConfig as Partial<StrategySettings>),
      strategyId: loaded.session.strategyId
    }
    strategy = createStrategy(settings)
    strategy.initialize()
    const taken = loaded.trades.filter((t: Trade) => !t.skipped)
    const skipped = loaded.trades.filter((t: Trade) => t.skipped)
    set({
      sessionId: loaded.session.id,
      sessionName: loaded.session.name,
      symbol: loaded.session.symbol,
      settings,
      account: loaded.session.account,
      costs: loaded.session.costs,
      trades: taken,
      skipped,
      mode: 'replay',
      busy: false,
      status: `Opened session · ${loaded.session.name}`
    })
    notifySuccess(`Opened session · ${loaded.session.name}`)
    if (loaded.session.replayTimestamp) get().jumpToDate(loaded.session.replayTimestamp)
  },

  deleteSession: async (id) => {
    const sessions = await requireDesktop().sessions.delete(id)
    set({ sessions })
    notifyInfo('Session removed')
  },

  selectTrade: (id) => {
    const trade = get().trades.find((t) => t.id === id)
    clearTimer()
    set({
      selectedTradeId: id,
      rightTab: 'trade',
      mode: 'view',
      isPlaying: false,
      replayIndex: Math.max(0, get().displayCandles.length - 1)
    })
    if (trade) get().jumpToDate(trade.openedAt)
  },

  addHorizontal: (price) => set({ horizontalLevels: [...get().horizontalLevels, price] })
}
})
