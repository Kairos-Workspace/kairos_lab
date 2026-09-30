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
  CANDLE_PAGE_SIZE,
  DEFAULT_COSTS,
  DEFAULT_STRATEGY_SETTINGS,
  DEFAULT_SYMBOL,
  INITIAL_VIEW_CANDLES,
  WARMUP_BARS
} from '@shared/constants'
import type {
  AmbiguityRule,
  BacktestSession,
  Candle,
  ChartTool,
  CostConfig,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  DeskTheme,
  Direction,
  Drawing,
  DrawingPoint,
  DrawingStyle,
  DrawingTool,
  SavedStrategy,
  Strategy,
  StrategySettings,
  StrategySignal,
  Timeframe,
  Trade
} from '@shared/types'
import type { FundamentalBundle, FundamentalEvent, FundamentalPoint } from '@core/fundamentals/types'
import { FUNDAMENTALS_BUNDLE } from '@core/fundamentals/bundle'
import { desktop, desktopMissingMessage, loadDeskPrefs, requireDesktop } from '@/lib/desktop'
import { applyDeskTheme } from '@core/desk/theme'
import { notifyError, notifyInfo, notifySuccess } from '@/lib/notify'
import { drainLocalStrategies, mergeStrategyLists, withoutSeeds } from './strategyVault'
import { DEFAULT_DRAWING_STYLE, DRAWING_TOOLS } from '@core/drawings/model'

export type AppScreen = 'welcome' | 'library' | 'workspace' | 'ea-lab' | 'indicator-lab' | 'settings'
export type RightTab = 'strategy' | 'indicators' | 'trade' | 'costs'
export type HistoryFilter = 'ALL' | 'WIN' | 'LOSS' | 'BUY' | 'SELL'

export interface DraftTrade {
  direction: Direction
  entry: string
  stopLoss: string
  takeProfit: string
  riskPercent: string
  timestamp: number
}

export interface PineIndicatorInstance {
  id: string
  name: string
  code: string
  enabled: boolean
}

interface AppState {
  datasets: DatasetInfo[]
  datasetId: number | null
  sourceCandles: Candle[]
  sourceTimeframe: Timeframe
  displayTimeframe: Timeframe
  displayCandles: Candle[]
  gaps: DataGap[]
  sourceHasOlder: boolean
  loadingOlderCandles: boolean
  pendingRangeShift: number | null
  downloadProgress: { fraction: number; indeterminate: boolean } | null
  dbPath: string
  symbol: string
  mode: 'view' | 'replay'
  replayIndex: number
  replayFromTs: number | null
  replayToTs: number | null
  isPlaying: boolean
  followReplay: boolean
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
  drawings: Drawing[]
  drawingsHidden: boolean
  activeTool: ChartTool | null
  selectedDrawingId: string | null
  drawingDefaults: Record<DrawingTool, DrawingStyle>
  drawingUndoStack: Drawing[][]
  drawingRedoStack: Drawing[][]
  chartFull: boolean
  screen: AppScreen
  settingsReturnScreen: AppScreen
  strategies: SavedStrategy[]
  activeStrategyId: string | null
  activeEaScriptId: string | null
  theme: DeskTheme
  showFundamentals: boolean
  fundamentalsBundle: FundamentalBundle
  fundamentalsSource: 'bundled' | 'custom'
  fundamentalsUpdatedAt: number | null
  pineIndicators: PineIndicatorInstance[]
  activePineIndicatorId: string | null
  pineIndicatorCode: string
  pineIndicatorEnabled: boolean

  setPineIndicatorCode: (code: string) => void
  setPineIndicatorEnabled: (enabled: boolean) => void
  addPineIndicator: (preset?: { name: string; code: string }) => string
  removePineIndicator: (id: string) => void
  updatePineIndicator: (id: string, patch: Partial<PineIndicatorInstance>) => void
  togglePineIndicator: (id: string) => void
  duplicatePineIndicator: (id: string) => void
  setActivePineIndicatorId: (id: string) => void
  loadFundamentals: () => Promise<void>
  refreshFundamentals: (range?: { startDate: string; endDate: string }) => Promise<void>
  resetFundamentals: () => Promise<void>
  upsertFundamentalPoint: (seriesId: string, point: FundamentalPoint) => Promise<void>
  upsertFundamentalEvent: (event: FundamentalEvent) => Promise<void>

  bootstrap: () => Promise<void>
  openStrategy: (id: string) => Promise<void>
  openEaBacktest: (input: {
    scriptId: string
    scriptName: string
    strategy: Strategy
  }) => Promise<void>
  autosaveProgress: () => void
  leaveWorkspace: () => void
  enterLibrary: () => void
  enterEaLab: () => void
  enterIndicatorLab: () => void
  enterSettings: () => void
  leaveSettings: () => void
  goHome: () => void
  createStrategy: (input: { name: string; notes?: string; settings?: Partial<StrategySettings> }) => Promise<string>
  updateSavedStrategy: (id: string, patch: { name: string; notes?: string; settings: StrategySettings }) => Promise<void>
  persistActiveStrategy: () => void
  deleteSavedStrategy: (id: string) => Promise<void>
  purgeSeededStrategies: () => void
  setChartFull: (full: boolean) => void
  toggleChartFull: () => void
  setRightTab: (tab: RightTab) => void
  setHistoryFilter: (filter: HistoryFilter) => void
  setSpeed: (speed: number) => void
  setTheme: (theme: DeskTheme) => void
  setShowFundamentals: (show: boolean) => void
  setSettings: (patch: Partial<StrategySettings>) => void
  setCosts: (patch: Partial<CostConfig>) => void
  setAmbiguityRule: (rule: AmbiguityRule) => void
  setAccountRisk: (risk: number) => void
  setTimeframe: (tf: Timeframe) => Promise<void>
  selectSymbol: (symbol: string) => Promise<void>
  downloadPair: (input: {
    symbol: string
    timeframe: Timeframe
    startTs: number
    endTs: number
  }) => Promise<void>
  refreshTape: (id: number) => Promise<number>
  refreshTapes: (ids: number[]) => Promise<number>
  removeTape: (id: number) => Promise<void>
  removeTapes: (ids: number[]) => Promise<void>
  loadDataset: (id: number) => Promise<void>
  loadOlderCandles: () => Promise<void>
  loadReplayRange: (fromTs: number, toTs: number) => Promise<void>
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
  /** Stop playback without autosave — used when the user pans/zooms the chart. */
  softPause: () => void
  togglePlay: () => void
  setFollowReplay: (follow: boolean) => void
  manualStep: (n: number) => void
  step: (n: number) => void
  resetReplay: () => void
  jumpToDate: (timestamp: number) => void
  takeSetup: () => void
  skipSetup: () => void
  startManualTrade: (direction: Direction) => void
  updateDraft: (patch: Partial<DraftTrade>) => void
  confirmTrade: () => void
  selectTrade: (id: string | null) => void
  addHorizontal: (price: number) => void
  setActiveTool: (tool: ChartTool | null) => void
  selectDrawing: (id: string | null) => void
  setDrawingsHidden: (hidden: boolean) => void
  addDrawing: (input: { type: DrawingTool; points: DrawingPoint[]; text?: string }) => string
  updateDrawing: (
    id: string,
    patch: { points?: DrawingPoint[]; text?: string; style?: Partial<DrawingStyle>; immediate?: boolean }
  ) => void
  removeDrawing: (id: string) => void
  clearDrawings: () => void
  pushDrawingUndoSnapshot: () => void
  undoDrawing: () => void
  redoDrawing: () => void
  loadDrawingsForSymbol: (symbol: string) => Promise<void>
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
  showFundamentals: boolean
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
    showFundamentals: state.showFundamentals,
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

  const drawingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let downloadProgressTimer: ReturnType<typeof setInterval> | null = null

  const clearDownloadProgressTimer = (): void => {
    if (downloadProgressTimer) {
      clearInterval(downloadProgressTimer)
      downloadProgressTimer = null
    }
  }
  const triggeredAlertIds = new Set<string>()

  const saveDrawingNow = (drawing: Drawing): void => {
    const api = desktop()
    if (api?.drawings) void api.drawings.save(drawing)
  }

  const scheduleDrawingSave = (drawing: Drawing, immediate: boolean): void => {
    const existing = drawingSaveTimers.get(drawing.id)
    if (existing) clearTimeout(existing)
    if (immediate) {
      drawingSaveTimers.delete(drawing.id)
      saveDrawingNow(drawing)
      return
    }
    drawingSaveTimers.set(
      drawing.id,
      setTimeout(() => {
        drawingSaveTimers.delete(drawing.id)
        saveDrawingNow(drawing)
      }, 300)
    )
  }

  const DRAWING_UNDO_LIMIT = 50

  // Undo/redo swap the whole `drawings` array wholesale rather than
  // replaying individual add/update/remove ops, so reconciling persistence
  // is simplest as a diff against the array being replaced: delete whatever
  // existed before and no longer does, upsert everything in the new array.
  const syncDrawingsToDb = (from: Drawing[], to: Drawing[]): void => {
    const api = desktop()
    if (!api?.drawings) return
    const toIds = new Set(to.map((d) => d.id))
    for (const drawing of from) {
      if (!toIds.has(drawing.id)) void api.drawings.delete(drawing.id)
    }
    for (const drawing of to) void api.drawings.save(drawing)
  }

  return {
  datasets: [],
  datasetId: null,
  sourceCandles: [],
  sourceTimeframe: '1M',
  displayTimeframe: '1H',
  displayCandles: [],
  gaps: [],
  sourceHasOlder: false,
  loadingOlderCandles: false,
  pendingRangeShift: null,
  downloadProgress: null,
  dbPath: '',
  symbol: 'XAUUSD',
  mode: 'view',
  replayIndex: 0,
  replayFromTs: null,
  replayToTs: null,
  isPlaying: false,
  followReplay: true,
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
  pineIndicators: [
    {
      id: 'pine-default',
      name: 'Custom EMA',
      code: `//@version=5
indicator("Custom EMA", overlay=true)

plot(ta.ema(close, 20), "EMA 20", color=color.yellow, linewidth=2)
plot(ta.ema(close, 50), "EMA 50", color=color.blue, linewidth=2)
`,
      enabled: false
    }
  ],
  activePineIndicatorId: 'pine-default',
  pineIndicatorCode: `//@version=5
indicator("Custom EMA", overlay=true)

plot(ta.ema(close, 20), "EMA 20", color=color.yellow, linewidth=2)
plot(ta.ema(close, 50), "EMA 50", color=color.blue, linewidth=2)
`,
  pineIndicatorEnabled: false,
  historyFilter: 'ALL',
  selectedTradeId: null,
  status: 'Opening local market data…',
  busy: true,
  sessionId: newId(),
  sessionName: 'Untitled session',
  horizontalLevels: [],
  drawings: [],
  drawingsHidden: false,
  activeTool: null,
  selectedDrawingId: null,
  drawingDefaults: Object.fromEntries(
    DRAWING_TOOLS.map((t) => [t, { ...DEFAULT_DRAWING_STYLE }])
  ) as Record<DrawingTool, DrawingStyle>,
  drawingUndoStack: [],
  drawingRedoStack: [],
  chartFull: false,
  screen: 'welcome',
  settingsReturnScreen: 'ea-lab',
  strategies: [],
  activeStrategyId: null,
  activeEaScriptId: null,
  theme: 'dark',
  showFundamentals: false,
  fundamentalsBundle: FUNDAMENTALS_BUNDLE,
  fundamentalsSource: 'bundled',
  fundamentalsUpdatedAt: null,

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
      const [datasets, storedStrategies, prefs, dbPath, fundamentals] = await Promise.all([
        api.datasets.list(),
        strategyBridge()?.list().catch(() => []) ?? Promise.resolve([]),
        loadDeskPrefs(),
        api.dbPath(),
        api.fundamentals?.get().catch(() => null) ?? Promise.resolve(null)
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
        showFundamentals: prefs.showFundamentals,
        fundamentalsBundle: fundamentals?.bundle ?? FUNDAMENTALS_BUNDLE,
        fundamentalsSource: fundamentals?.source ?? 'bundled',
        fundamentalsUpdatedAt: fundamentals?.updatedAt ?? null,
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
      // The symbol-change subscriber that loads drawings only fires when the
      // resolved symbol differs from the store's hardcoded initial value, so
      // a remembered symbol that happens to match it (the common case) would
      // otherwise never trigger a load. Load explicitly once bootstrap settles.
      void get().loadDrawingsForSymbol(get().symbol)
    } catch {
      set({ busy: false, status: 'Could not open the local desk.' })
      notifyError('Could not open the local desk.')
    }
  },

  openStrategy: async (id) => {
    const saved = get().strategies.find((s) => s.id === id)
    if (!saved) return
    const settings = { ...DEFAULT_STRATEGY_SETTINGS, ...saved.settings }
    clearTimer()

    const resumed = desktop() ? await requireDesktop().sessions.load(id) : null
    if (resumed) {
      const resumedSettings = {
        ...settings,
        ...(resumed.session.strategyConfig as Partial<StrategySettings>)
      }
      strategy = createStrategy(resumedSettings)
      strategy.initialize()
      const taken = resumed.trades.filter((t) => !t.skipped)
      const skippedTrades = resumed.trades.filter((t) => t.skipped)
      set({
        screen: 'workspace',
        activeStrategyId: saved.id,
        activeEaScriptId: null,
        settings: resumedSettings,
        sessionName: saved.name,
        sessionId: resumed.session.id,
        displayTimeframe: resumed.session.timeframe,
        rightTab: 'strategy',
        // Stay in 'view' mode until the resumed symbol's candles are
        // actually loaded below. The chart repaints on every store change
        // via a raw subscription (not batched React state), so flipping to
        // 'replay' here — before displayCandles/replayIndex reflect this
        // strategy's data — lets a freshly-mounted chart's first paint see
        // 'replay' mode paired with stale leftover data from whatever was
        // open before, which can wrongly trigger an incremental
        // series.update() on a series that never had setData() called yet.
        mode: 'view',
        isPlaying: false,
        pendingSetup: null,
        draft: null,
        activeTrade: null,
        trades: taken,
        skipped: skippedTrades,
        account: resumed.session.account,
        costs: resumed.session.costs,
        selectedTradeId: null,
        chartFull: false,
        status: `${saved.name} · resuming…`
      })
      await get().selectSymbol(resumed.session.symbol)
      // Now displayCandles is correct for the resumed symbol/timeframe —
      // safe to compute the resumed replay position and flip into replay
      // mode in one atomic update, exactly like startReplay() does.
      const afterLoad = get()
      if (afterLoad.displayCandles.length === 0) {
        // selectSymbol already set a "No local tape for X" status and left
        // us in view mode — don't stomp that with a fake "resumed" status
        // or switch into replay mode with nothing to replay.
        persistDesk()
        return
      }
      const index = resumed.session.replayTimestamp
        ? ReplayEngine.mapTimestampToIndex(afterLoad.displayCandles, resumed.session.replayTimestamp)
        : afterLoad.replayIndex
      set({ mode: 'replay', replayIndex: index, status: `${saved.name} · resumed` })
      persistDesk()
      return
    }

    strategy = createStrategy(settings)
    strategy.initialize()
    set({
      screen: 'workspace',
      activeStrategyId: saved.id,
      activeEaScriptId: null,
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
    // A brand-new strategy (no prior session to resume) carries forward
    // whatever symbol happened to be loaded before, which is often nothing
    // — leaving the chart on an empty "pick a pair" state. Default to
    // XAUUSD so the chart always has something to show right away.
    if (get().displayCandles.length === 0) await get().selectSymbol(DEFAULT_SYMBOL)
    persistDesk()
  },

  openEaBacktest: async ({ scriptId, scriptName, strategy: eaStrategy }) => {
    clearTimer()
    strategy = eaStrategy
    strategy.initialize()
    const settings = { ...get().settings, autoEntry: true }
    set({
      screen: 'workspace',
      activeStrategyId: null,
      activeEaScriptId: scriptId,
      settings,
      sessionName: `${scriptName} · EA`,
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
      status: `${scriptName} · EA ready to backtest`
    })
    if (get().displayCandles.length === 0) await get().selectSymbol(DEFAULT_SYMBOL)
    persistDesk()
  },

  autosaveProgress: () => {
    const s = get()
    if (!s.activeStrategyId || !desktop()) return
    // Only persist once a replay has actually been started for this
    // strategy — not on a bare "opened it and left" view. Trade/skipped
    // count alone isn't the right gate: resetReplay() legitimately clears
    // both while still being 'replay' mode, and that reset must still
    // overwrite the previous autosave, not silently no-op and leave the
    // old trades to reappear next time this strategy is resumed.
    if (s.mode !== 'replay') return
    const session: BacktestSession = {
      id: s.activeStrategyId,
      name: s.sessionName,
      symbol: s.symbol,
      timeframe: s.displayTimeframe,
      strategyId: s.activeStrategyId,
      strategyConfig: { ...s.settings },
      replayTimestamp: s.displayCandles[s.replayIndex]?.timestamp ?? 0,
      account: s.account,
      costs: s.costs,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    void requireDesktop()
      .sessions.save(session, [...s.trades, ...s.skipped])
      .catch((error) => console.error('[autosaveProgress] failed', error))
  },

  leaveWorkspace: () => {
    get().autosaveProgress()
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

  enterLibrary: () => {
    set({ screen: 'library' })
  },

  enterEaLab: () => {
    set({ screen: 'ea-lab' })
  },

  enterIndicatorLab: () => {
    set({ screen: 'indicator-lab' })
  },

  enterSettings: () => {
    set({ settingsReturnScreen: get().screen, screen: 'settings' })
  },

  leaveSettings: () => {
    const next = get().settingsReturnScreen
    set({ screen: next === 'settings' ? 'ea-lab' : next })
  },

  goHome: () => {
    set({ screen: 'welcome' })
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

  updateSavedStrategy: async (id, patch) => {
    const current = get().strategies.find((row) => row.id === id)
    if (!current) return
    const next: SavedStrategy = {
      ...current,
      name: patch.name.trim() || 'Untitled strategy',
      notes: patch.notes?.trim() ?? '',
      settings: patch.settings,
      updatedAt: Date.now()
    }
    const strategies = (await strategyBridge()?.save(next)) ?? [
      next,
      ...get().strategies.filter((row) => row.id !== id)
    ]
    set({ strategies })
    persistDesk()
    notifySuccess(`${next.name} updated`)
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
    if (desktop()) void requireDesktop().sessions.delete(id).catch(() => undefined)
    persistDesk()
    notifyInfo('Strategy removed')
  },

  setChartFull: (chartFull) => set({ chartFull }),
  toggleChartFull: () => set({ chartFull: !get().chartFull }),
  setRightTab: (rightTab) => set({ rightTab }),
  setPineIndicatorCode: (pineIndicatorCode) => {
    const { pineIndicators, activePineIndicatorId } = get()
    if (!activePineIndicatorId || pineIndicators.length === 0) {
      const newInd: PineIndicatorInstance = {
        id: newId(),
        name: 'Custom Indicator',
        code: pineIndicatorCode,
        enabled: false
      }
      set({
        pineIndicators: [newInd],
        activePineIndicatorId: newInd.id,
        pineIndicatorCode,
        pineIndicatorEnabled: false
      })
      return
    }
    const updated = pineIndicators.map((ind) =>
      ind.id === activePineIndicatorId ? { ...ind, code: pineIndicatorCode } : ind
    )
    set({ pineIndicators: updated, pineIndicatorCode })
  },
  setPineIndicatorEnabled: (pineIndicatorEnabled) => {
    const { pineIndicators, activePineIndicatorId } = get()
    if (!activePineIndicatorId || pineIndicators.length === 0) {
      const newInd: PineIndicatorInstance = {
        id: newId(),
        name: 'Custom Indicator',
        code: get().pineIndicatorCode || '',
        enabled: pineIndicatorEnabled
      }
      set({
        pineIndicators: [newInd],
        activePineIndicatorId: newInd.id,
        pineIndicatorEnabled
      })
      return
    }
    const updated = pineIndicators.map((ind) =>
      ind.id === activePineIndicatorId ? { ...ind, enabled: pineIndicatorEnabled } : ind
    )
    set({ pineIndicators: updated, pineIndicatorEnabled })
  },
  addPineIndicator: (preset) => {
    const code = preset?.code ?? `//@version=5\nindicator("New Indicator", overlay=true)\n\nplot(ta.ema(close, 20), "EMA 20", color=color.yellow)\n`
    const name = preset?.name ?? 'New Indicator'
    const id = newId()
    const newIndicator: PineIndicatorInstance = {
      id,
      name,
      code,
      enabled: false
    }
    set((state) => ({
      pineIndicators: [...state.pineIndicators, newIndicator],
      activePineIndicatorId: id,
      pineIndicatorCode: code,
      pineIndicatorEnabled: false
    }))
    return id
  },
  removePineIndicator: (id) => {
    const { pineIndicators, activePineIndicatorId } = get()
    const remaining = pineIndicators.filter((ind) => ind.id !== id)
    if (remaining.length === 0) {
      const fallback: PineIndicatorInstance = {
        id: newId(),
        name: 'Custom Indicator',
        code: `//@version=5\nindicator("Custom Indicator", overlay=true)\n\nplot(ta.ema(close, 20), "EMA 20", color=color.yellow)\n`,
        enabled: false
      }
      set({
        pineIndicators: [fallback],
        activePineIndicatorId: fallback.id,
        pineIndicatorCode: fallback.code,
        pineIndicatorEnabled: false
      })
      return
    }
    const nextActiveId =
      activePineIndicatorId === id
        ? remaining[0].id
        : activePineIndicatorId
    const nextActive = remaining.find((ind) => ind.id === nextActiveId) ?? remaining[0]
    set({
      pineIndicators: remaining,
      activePineIndicatorId: nextActive.id,
      pineIndicatorCode: nextActive.code,
      pineIndicatorEnabled: nextActive.enabled
    })
  },
  updatePineIndicator: (id, patch) => {
    set((state) => {
      const updated = state.pineIndicators.map((ind) =>
        ind.id === id ? { ...ind, ...patch } : ind
      )
      const isActive = state.activePineIndicatorId === id
      return {
        pineIndicators: updated,
        ...(isActive && patch.code !== undefined ? { pineIndicatorCode: patch.code } : {}),
        ...(isActive && patch.enabled !== undefined ? { pineIndicatorEnabled: patch.enabled } : {})
      }
    })
  },
  togglePineIndicator: (id) => {
    set((state) => {
      const target = state.pineIndicators.find((ind) => ind.id === id)
      if (!target) return state
      const nextEnabled = !target.enabled
      const updated = state.pineIndicators.map((ind) =>
        ind.id === id ? { ...ind, enabled: nextEnabled } : ind
      )
      const isActive = state.activePineIndicatorId === id
      return {
        pineIndicators: updated,
        ...(isActive ? { pineIndicatorEnabled: nextEnabled } : {})
      }
    })
  },
  duplicatePineIndicator: (id) => {
    const { pineIndicators } = get()
    const target = pineIndicators.find((ind) => ind.id === id)
    if (!target) return
    const newIdVal = newId()
    const duplicated: PineIndicatorInstance = {
      id: newIdVal,
      name: `${target.name} (Copy)`,
      code: target.code,
      enabled: false
    }
    set((state) => ({
      pineIndicators: [...state.pineIndicators, duplicated],
      activePineIndicatorId: newIdVal,
      pineIndicatorCode: duplicated.code,
      pineIndicatorEnabled: false
    }))
  },
  setActivePineIndicatorId: (id) => {
    const { pineIndicators } = get()
    const target = pineIndicators.find((ind) => ind.id === id)
    if (!target) return
    set({
      activePineIndicatorId: id,
      pineIndicatorCode: target.code,
      pineIndicatorEnabled: target.enabled
    })
  },
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
  setShowFundamentals: (showFundamentals) => {
    set({ showFundamentals })
    persistDesk()
  },
  loadFundamentals: async () => {
    const api = desktop()
    if (!api?.fundamentals) return
    try {
      const state = await api.fundamentals.get()
      set({
        fundamentalsBundle: state.bundle,
        fundamentalsSource: state.source,
        fundamentalsUpdatedAt: state.updatedAt
      })
    } catch (error) {
      notifyError('Could not load fundamentals.', error)
    }
  },
  refreshFundamentals: async (range) => {
    const api = desktop()
    if (!api) {
      notifyError(desktopMissingMessage())
      return
    }
    if (!api.fundamentals) {
      notifyError('Restart Kairos to load the fundamentals bridge (preload changed).')
      return
    }
    const label =
      range?.startDate && range?.endDate
        ? `Fetching macro ${range.startDate} → ${range.endDate}…`
        : 'Refreshing macro from FRED…'
    set({ busy: true, status: label })
    try {
      const state = await api.fundamentals.refresh(range)
      set({
        fundamentalsBundle: state.bundle,
        fundamentalsSource: state.source,
        fundamentalsUpdatedAt: state.updatedAt,
        busy: false,
        status: range
          ? `Macro loaded ${range.startDate} → ${range.endDate}`
          : 'Macro updated from FRED'
      })
      notifySuccess(
        range
          ? `Macro ${range.startDate} → ${range.endDate} ready`
          : 'Macro data refreshed from FRED'
      )
    } catch (error) {
      set({ busy: false, status: 'Macro refresh failed' })
      notifyError('Could not refresh fundamentals.', error)
    }
  },
  resetFundamentals: async () => {
    const api = desktop()
    if (!api) {
      notifyError(desktopMissingMessage())
      return
    }
    if (!api.fundamentals) {
      notifyError('Restart Kairos to load the fundamentals bridge (preload changed).')
      return
    }
    try {
      const state = await api.fundamentals.reset()
      set({
        fundamentalsBundle: state.bundle,
        fundamentalsSource: state.source,
        fundamentalsUpdatedAt: state.updatedAt
      })
      notifySuccess('Restored shipped macro bundle')
    } catch (error) {
      notifyError('Could not reset fundamentals.', error)
    }
  },
  upsertFundamentalPoint: async (seriesId, point) => {
    const api = desktop()
    if (!api) {
      notifyError(desktopMissingMessage())
      return
    }
    if (!api.fundamentals) {
      notifyError('Restart Kairos to load the fundamentals bridge (preload changed).')
      return
    }
    try {
      const state = await api.fundamentals.upsertPoint(seriesId, point)
      set({
        fundamentalsBundle: state.bundle,
        fundamentalsSource: state.source,
        fundamentalsUpdatedAt: state.updatedAt
      })
      notifySuccess('Saved macro point')
    } catch (error) {
      notifyError('Could not save that point.', error)
    }
  },
  upsertFundamentalEvent: async (event) => {
    const api = desktop()
    if (!api) {
      notifyError(desktopMissingMessage())
      return
    }
    if (!api.fundamentals) {
      notifyError('Restart Kairos to load the fundamentals bridge (preload changed).')
      return
    }
    try {
      const state = await api.fundamentals.upsertEvent(event)
      set({
        fundamentalsBundle: state.bundle,
        fundamentalsSource: state.source,
        fundamentalsUpdatedAt: state.updatedAt
      })
      notifySuccess('Saved macro event')
    } catch (error) {
      notifyError('Could not save that event.', error)
    }
  },
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    // EA backtests install a compiled Strategy outside the catalog — do not
    // replace it when the user tweaks desk settings (autoEntry, lookback, …).
    if (get().activeEaScriptId) {
      strategy.initialize()
    } else {
      strategy = createStrategy(settings)
      strategy.initialize()
    }
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
    if (tf === s.displayTimeframe) return
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
    set({ busy: true, status: `Downloading ${symbol} ${input.timeframe}…` })
    try {
      const estimate = await requireDesktop().datasets.downloadEstimate({
        symbol,
        timeframe: input.timeframe,
        startTs: input.startTs,
        endTs: input.endTs
      })
      clearDownloadProgressTimer()
      if (estimate.chunks == null) {
        set({ downloadProgress: { fraction: 0, indeterminate: true } })
      } else {
        const totalBatches = Math.max(1, Math.ceil(estimate.chunks / estimate.batchSize))
        const estimatedMs = Math.max(600, totalBatches * estimate.pauseBetweenBatchesMs)
        const startedAt = Date.now()
        const PROGRESS_CAP = 0.92
        set({ downloadProgress: { fraction: 0, indeterminate: false } })
        downloadProgressTimer = setInterval(() => {
          const fraction = Math.min(PROGRESS_CAP, (Date.now() - startedAt) / estimatedMs)
          set({ downloadProgress: { fraction, indeterminate: false } })
        }, 100)
      }

      const result = await requireDesktop().datasets.download({
        symbol,
        timeframe: input.timeframe,
        startTs: input.startTs,
        endTs: input.endTs
      })
      clearDownloadProgressTimer()
      const status = `${symbol} ${input.timeframe} · ${result.dataset.candleCount.toLocaleString()} bars ready`
      set({
        datasets: result.datasets,
        busy: false,
        status,
        downloadProgress: { fraction: 1, indeterminate: false }
      })
      persistDesk()
      notifySuccess(status)
      setTimeout(() => {
        if (get().downloadProgress?.fraction === 1) set({ downloadProgress: null })
      }, 400)
    } catch (error) {
      clearDownloadProgressTimer()
      set({
        busy: false,
        status: error instanceof Error ? error.message : `Could not download ${symbol}.`,
        downloadProgress: null
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
      let failed = 0
      let rateLimited = false
      let datasets = get().datasets
      let i = 0
      for (; i < unique.length; i++) {
        const id = unique[i]
        const tape = get().datasets.find((row) => row.id === id)
        set({
          status: tape
            ? `Getting latest ${tape.symbol} ${tape.timeframe}…`
            : 'Getting latest data…'
        })
        try {
          const result = await requireDesktop().datasets.refresh(id)
          added += result.added
          datasets = result.datasets
          set({ datasets })
        } catch (error) {
          failed += 1
          console.error('[refreshTapes] failed for dataset', id, error)
          // A 429 means the provider is already throttling us — stop asking
          // for more tapes instead of hammering it again on every remaining
          // one (that's why the same tape could fail over and over before).
          if (error instanceof Error && error.message.includes('429')) {
            rateLimited = true
            break
          }
        }
        // Refreshing several timeframes back to back can trip the provider's
        // rate limit even though each individual download paces its own
        // requests — leave a gap between tapes, not just within one.
        if (i < unique.length - 1) await new Promise((resolve) => setTimeout(resolve, 800))
      }
      const skipped = rateLimited ? unique.length - 1 - i : 0
      const openId = get().datasetId
      const shouldReload =
        openId != null &&
        (unique.includes(openId) || datasets.some((row) => row.id === openId && unique.includes(row.id)))
      const parts: string[] = []
      if (added > 0) parts.push(`${added.toLocaleString()} new bars`)
      if (rateLimited) {
        parts.push('rate-limited by the data provider — wait a minute and try again')
        if (skipped > 0) parts.push(`${skipped} tape${skipped === 1 ? '' : 's'} not attempted`)
      } else if (failed > 0) {
        parts.push(`${failed} tape${failed === 1 ? '' : 's'} failed`)
      }
      const status =
        parts.length > 0 ? `Latest data in · ${parts.join(' · ')}` : 'Already latest — nothing new to pull.'
      set({
        datasets,
        busy: false,
        status
      })
      if (failed > 0) notifyError(status)
      else if (added > 0) notifySuccess(status)
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

  removeTapes: async (ids) => {
    if (!desktop()) return
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
    if (unique.length === 0) return
    set({ busy: true, status: 'Removing tapes…' })
    try {
      let datasets = get().datasets
      for (const id of unique) {
        datasets = await requireDesktop().datasets.delete(id)
      }
      const openId = get().datasetId
      const stillOpen = openId != null && unique.includes(openId)
      set({
        datasets,
        ...(stillOpen
          ? { datasetId: null, sourceCandles: [], displayCandles: [], gaps: [] }
          : {}),
        busy: false,
        status: 'Tapes removed'
      })
      notifySuccess('Tapes removed')
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not remove those tapes.'
      })
      notifyError('Could not remove those tapes.', error)
    }
  },

  loadDataset: async (id) => {
    const dataset = get().datasets.find((d) => d.id === id)
    if (!dataset) return
    set({ busy: true, status: `Loading ${dataset.source} tape…` })
    try {
    const [candleBuffer, gaps] = await Promise.all([
      requireDesktop().datasets.candlesPage(id, INITIAL_VIEW_CANDLES),
      requireDesktop().datasets.gaps(id)
    ])
    const sourceCandles = fromCandleBuffer(candleBuffer)
    const displayTimeframe =
      intervalMs(dataset.timeframe) <= intervalMs(get().displayTimeframe)
        ? get().displayTimeframe
        : dataset.timeframe
    const displayCandles = rebuildDisplay(sourceCandles, dataset.timeframe, displayTimeframe)
    if (get().activeEaScriptId) {
      strategy.initialize()
    } else {
      strategy = createStrategy(get().settings)
      strategy.initialize()
    }
    set({
      datasetId: id,
      symbol: dataset.symbol,
      sourceCandles,
      sourceTimeframe: dataset.timeframe,
      displayTimeframe,
      displayCandles,
      gaps,
      sourceHasOlder: sourceCandles.length === INITIAL_VIEW_CANDLES,
      loadingOlderCandles: false,
      pendingRangeShift: null,
      mode: 'view',
      replayIndex: Math.max(0, displayCandles.length - 1),
      replayFromTs: displayCandles[0]?.timestamp ?? null,
      replayToTs: displayCandles.at(-1)?.timestamp ?? null,
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      busy: false,
      status: `${dataset.symbol} ${dataset.timeframe} · ${dataset.candleCount.toLocaleString()} candles`
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

  loadOlderCandles: async () => {
    const s = get()
    if (s.loadingOlderCandles || !s.sourceHasOlder || s.sourceCandles.length === 0 || s.datasetId == null) {
      return
    }
    const datasetId = s.datasetId
    const beforeTs = s.sourceCandles[0].timestamp
    set({ loadingOlderCandles: true })
    try {
      const older = fromCandleBuffer(
        await requireDesktop().datasets.candlesPage(datasetId, CANDLE_PAGE_SIZE, beforeTs)
      )
      if (get().datasetId !== datasetId) return
      if (older.length === 0) {
        set({ sourceHasOlder: false, loadingOlderCandles: false })
        return
      }
      const next = get()
      const sourceCandles = [...older, ...next.sourceCandles]
      const displayCandles = rebuildDisplay(sourceCandles, next.sourceTimeframe, next.displayTimeframe)
      const addedCount = displayCandles.length - next.displayCandles.length
      set({
        sourceCandles,
        displayCandles,
        sourceHasOlder: older.length === CANDLE_PAGE_SIZE,
        loadingOlderCandles: false,
        pendingRangeShift: addedCount
      })
    } catch (error) {
      set({ loadingOlderCandles: false })
      notifyError('Could not load older candles.', error)
    }
  },

  loadReplayRange: async (fromTs, toTs) => {
    const s = get()
    if (s.datasetId == null) return
    const datasetId = s.datasetId
    const warmupSpanMs = WARMUP_BARS * intervalMs(s.displayTimeframe) * 3
    set({ busy: true, status: 'Loading replay range…' })
    try {
      const candleBuffer = await requireDesktop().datasets.candles(datasetId, fromTs - warmupSpanMs, toTs)
      const sourceCandles = fromCandleBuffer(candleBuffer)
      const next = get()
      const displayCandles = rebuildDisplay(sourceCandles, next.sourceTimeframe, next.displayTimeframe)
      set({
        sourceCandles,
        displayCandles,
        sourceHasOlder: true,
        loadingOlderCandles: false,
        pendingRangeShift: null,
        busy: false
      })
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not load that replay range.'
      })
      notifyError('Could not load that replay range.', error)
      throw error
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
    // Keep the compiled EA strategy when running an EA backtest; recreating
    // from catalog settings would silently drop the Signal DSL script.
    if (s.activeEaScriptId) {
      strategy.initialize()
    } else {
      strategy = createStrategy(s.settings)
      strategy.initialize()
    }
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
    triggeredAlertIds.clear()
    set({
      mode: 'replay',
      replayIndex: index,
      replayFromTs: fromTs ?? s.replayFromTs,
      replayToTs: toTs ?? s.replayToTs,
      hideDate: Boolean(opts?.hideDate),
      isPlaying: false,
      followReplay: true,
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
    set({ isPlaying: true, followReplay: true, status: 'Replaying…' })
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
    get().autosaveProgress()
  },

  softPause: () => {
    clearTimer()
    set({ isPlaying: false, followReplay: false })
  },

  togglePlay: () => {
    const s = get()
    if (s.isPlaying) {
      // Scrolling releases follow without pausing — first Play/Space re-locks.
      if (!s.followReplay) {
        set({ followReplay: true })
        return
      }
      get().pause()
      return
    }
    // Resume/start even after a chart soft-pause (followReplay may be false).
    set({ followReplay: true })
    get().play()
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

      if (direction > 0) {
        for (const drawing of next.drawings) {
          if (drawing.type !== 'horizontal' || triggeredAlertIds.has(drawing.id)) continue
          const level = drawing.points[0]?.price
          if (level == null || level < candle.low || level > candle.high) continue
          triggeredAlertIds.add(drawing.id)
          notifyInfo(`${next.symbol} crossed ${level.toFixed(2)}`)
        }
      }

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
        try {
          pending = strategy.onCandle(candle, {
            // EA periods and shifts may be expressions. Preserve all loaded
            // history (including EMA's seed), but never expose future bars.
            candles: tape.slice(next.activeEaScriptId ? 0 : Math.max(0, index - lookback), index + 1),
            symbol: next.symbol,
            timeframe: next.displayTimeframe
          })
        } catch (error) {
          clearTimer()
          const detail = error instanceof Error ? error.message : String(error)
          const status = `${strategy.name} stopped at ${new Date(candle.timestamp).toISOString()}: ${detail}`
          set({
            replayIndex: index,
            isPlaying: false,
            activeTrade: active,
            trades,
            account,
            pendingSetup: null,
            draft: null,
            status
          })
          notifyError(status)
          return
        }
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

  setFollowReplay: (follow) => set({ followReplay: follow }),

  manualStep: (n) => {
    set({ followReplay: true })
    get().step(n)
  },

  jumpToDate: (timestamp) => {
    const s = get()
    const index = ReplayEngine.mapTimestampToIndex(s.displayCandles, timestamp)
    if (s.mode === 'replay') set({ replayIndex: index, isPlaying: false, followReplay: true })
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

  addHorizontal: (price) => set({ horizontalLevels: [...get().horizontalLevels, price] }),

  setActiveTool: (tool) => set({ activeTool: tool, selectedDrawingId: tool ? null : get().selectedDrawingId }),

  selectDrawing: (id) => set({ selectedDrawingId: id, activeTool: id ? null : get().activeTool }),

  setDrawingsHidden: (hidden) => set({ drawingsHidden: hidden }),

  addDrawing: (input) => {
    get().pushDrawingUndoSnapshot()
    const id = newId()
    const now = Date.now()
    const drawing: Drawing = {
      id,
      symbol: get().symbol,
      type: input.type,
      points: input.points,
      text: input.text,
      style: { ...get().drawingDefaults[input.type] },
      createdAt: now,
      updatedAt: now
    }
    set({ drawings: [...get().drawings, drawing], selectedDrawingId: id, activeTool: null })
    scheduleDrawingSave(drawing, true)
    return id
  },

  updateDrawing: (id, patch) => {
    let updated: Drawing | undefined
    const drawings = get().drawings.map((d) => {
      if (d.id !== id) return d
      updated = {
        ...d,
        points: patch.points ?? d.points,
        text: patch.text !== undefined ? patch.text : d.text,
        style: patch.style ? { ...d.style, ...patch.style } : d.style,
        updatedAt: Date.now()
      }
      return updated
    })
    if (!updated) return
    set({ drawings })
    if (patch.style) {
      set({ drawingDefaults: { ...get().drawingDefaults, [updated.type]: updated.style } })
    }
    scheduleDrawingSave(updated, patch.immediate ?? false)
  },

  removeDrawing: (id) => {
    get().pushDrawingUndoSnapshot()
    set({
      drawings: get().drawings.filter((d) => d.id !== id),
      selectedDrawingId: get().selectedDrawingId === id ? null : get().selectedDrawingId
    })
    const timer = drawingSaveTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      drawingSaveTimers.delete(id)
    }
    const api = desktop()
    if (api?.drawings) void api.drawings.delete(id)
  },

  clearDrawings: () => {
    get().pushDrawingUndoSnapshot()
    const symbol = get().symbol
    for (const timer of drawingSaveTimers.values()) clearTimeout(timer)
    drawingSaveTimers.clear()
    set({ drawings: [], selectedDrawingId: null })
    const api = desktop()
    if (api?.drawings) void api.drawings.clear(symbol)
  },

  pushDrawingUndoSnapshot: () => {
    const stack = [...get().drawingUndoStack, get().drawings]
    if (stack.length > DRAWING_UNDO_LIMIT) stack.shift()
    set({ drawingUndoStack: stack, drawingRedoStack: [] })
  },

  undoDrawing: () => {
    const stack = get().drawingUndoStack
    if (stack.length === 0) return
    const current = get().drawings
    const previous = stack[stack.length - 1]
    set({
      drawings: previous,
      drawingUndoStack: stack.slice(0, -1),
      drawingRedoStack: [...get().drawingRedoStack, current],
      selectedDrawingId: previous.some((d) => d.id === get().selectedDrawingId)
        ? get().selectedDrawingId
        : null
    })
    syncDrawingsToDb(current, previous)
  },

  redoDrawing: () => {
    const stack = get().drawingRedoStack
    if (stack.length === 0) return
    const current = get().drawings
    const next = stack[stack.length - 1]
    set({
      drawings: next,
      drawingRedoStack: stack.slice(0, -1),
      drawingUndoStack: [...get().drawingUndoStack, current],
      selectedDrawingId: next.some((d) => d.id === get().selectedDrawingId)
        ? get().selectedDrawingId
        : null
    })
    syncDrawingsToDb(current, next)
  },

  loadDrawingsForSymbol: async (symbol) => {
    set({ drawingUndoStack: [], drawingRedoStack: [] })
    const api = desktop()
    if (!api?.drawings) {
      set({ drawings: [], selectedDrawingId: null })
      return
    }
    try {
      const drawings = await api.drawings.list(symbol)
      if (get().symbol === symbol) set({ drawings, selectedDrawingId: null })
    } catch {
      if (get().symbol === symbol) set({ drawings: [], selectedDrawingId: null })
    }
  }
}
})

useAppStore.subscribe((state, prev) => {
  if (state.symbol !== prev.symbol) void state.loadDrawingsForSymbol(state.symbol)
})
