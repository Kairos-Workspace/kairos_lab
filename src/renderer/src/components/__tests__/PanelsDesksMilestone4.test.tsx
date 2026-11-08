// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StrategyPanel } from '../StrategyPanel'
import { TradePanel } from '../TradePanel'
import { CostsPanel } from '../CostsPanel'
import { PineIndicatorPanel } from '../PineIndicatorPanel'
import { MarketDesk } from '../MarketDesk'
import { FundamentalsDesk } from '../FundamentalsDesk'
import { BotBacktestModal } from '../BotBacktestModal'
import { AppearanceSettings } from '../AppearanceSettings'
import { AiProviderSettings } from '../AiProviderSettings'
import { StrategyLibrary } from '../StrategyLibrary'
import { LoadingOverlay } from '../LoadingOverlay'
import { CompanionChartPane } from '../CompanionChartPane'
import { useAppStore } from '../../store/useAppStore'
import { useAiProvidersStore } from '../../store/useAiProvidersStore'

// Mock heavyweight dependencies
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="mock-monaco-editor" />,
  loader: { config: vi.fn() }
}))

vi.mock('monaco-editor', () => ({
  editor: {
    defineTheme: vi.fn(),
    setModelMarkers: vi.fn()
  },
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn()
  }
}))

vi.mock('lightweight-charts', () => ({
  createChart: () => ({
    applyOptions: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
    timeScale: () => ({
      fitContent: vi.fn(),
      setVisibleLogicalRange: vi.fn(),
      getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 100 })),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn()
    }),
    addSeries: () => ({
      setData: vi.fn(),
      update: vi.fn(),
      createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
      removePriceLine: vi.fn(),
      applyOptions: vi.fn()
    })
  }),
  CandlestickSeries: 'CandlestickSeries',
  LineSeries: 'LineSeries',
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  PriceScaleMode: { Normal: 0 }
}))

vi.mock('../lib/pineChartPrimitive', () => ({
  PineOverlayPrimitive: vi.fn().mockImplementation(() => ({
    setData: vi.fn(),
    paneViews: vi.fn(() => []),
    timeAxisViews: vi.fn(() => []),
    priceAxisViews: vi.fn(() => []),
    autoscaleInfo: vi.fn(() => null),
    updateAllViews: vi.fn()
  }))
}))

describe('Milestone 4: Panels, Desks, Buttons & Forms Unification', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('Task 1: Button Unification (R3)', () => {
    it('uses Button and IconButton in AiProviderSettings', async () => {
      useAiProvidersStore.setState({
        providers: [
          {
            id: 'p1',
            name: 'Test Profile',
            provider: 'openai',
            model: 'gpt-4o',
            baseUrl: null,
            hasApiKey: true
          }
        ]
      })

      render(<AiProviderSettings />)

      // Add profile button is a Button component with ui-btn
      const addBtn = screen.getByRole('button', { name: /add profile/i })
      expect(addBtn.classList.contains('ui-btn')).toBe(true)
      expect(addBtn.classList.contains('ui-btn-ghost')).toBe(true)

      // Edit button is an IconButton with ui-icon-btn and ui-icon-btn-sm
      const editBtn = screen.getByRole('button', { name: /edit test profile/i })
      expect(editBtn.classList.contains('ui-icon-btn')).toBe(true)
      expect(editBtn.classList.contains('ui-icon-btn-sm')).toBe(true)
    })

    it('uses Button in StrategyPanel for replay controls', () => {
      useAppStore.setState({ activeEaScriptId: null })
      render(<StrategyPanel />)

      const startBtn = screen.getByRole('button', { name: /start/i })
      expect(startBtn.classList.contains('ui-btn')).toBe(true)
      expect(startBtn.classList.contains('ui-btn-primary')).toBe(true)
    })

    it('uses Button in MarketDesk for import, demo tape, and get latest actions', () => {
      useAppStore.setState({
        datasets: [
          {
            id: 1,
            symbol: 'XAUUSD',
            timeframe: '1M',
            source: 'demo',
            candleCount: 500,
            startTs: 1000,
            endTs: 2000,
            createdAt: 1000,
            version: 1,
            gapCount: 0
          }
        ],
        busy: false
      })

      render(<MarketDesk />)

      const importBtn = screen.getByRole('button', { name: /import csv/i })
      expect(importBtn.classList.contains('ui-btn')).toBe(true)
      expect(importBtn.classList.contains('ui-btn-ghost')).toBe(true)

      const demoBtn = screen.getByRole('button', { name: /demo tape/i })
      expect(demoBtn.classList.contains('ui-btn')).toBe(true)

      const latestBtn = screen.getByRole('button', { name: /^get latest$/i })
      expect(latestBtn.classList.contains('ui-btn')).toBe(true)

      // Row action IconButton
      const rowDownloadBtn = screen.getByRole('button', { name: /get latest xauusd data/i })
      expect(rowDownloadBtn.classList.contains('ui-icon-btn')).toBe(true)
      expect(rowDownloadBtn.classList.contains('ui-icon-btn-sm')).toBe(true)
    })

    it('uses Button in FundamentalsDesk for presets, macro pull, and saves', () => {
      render(<FundamentalsDesk />)

      const getMacroBtn = screen.getByRole('button', { name: /get macro/i })
      expect(getMacroBtn.classList.contains('ui-btn')).toBe(true)
      expect(getMacroBtn.classList.contains('ui-btn-primary')).toBe(true)

      const savePointBtn = screen.getByRole('button', { name: /save point/i })
      expect(savePointBtn.classList.contains('ui-btn')).toBe(true)

      const saveEventBtn = screen.getByRole('button', { name: /save event/i })
      expect(saveEventBtn.classList.contains('ui-btn')).toBe(true)

      // Preset buttons are Button with ghost variant
      const preset2y = screen.getByRole('button', { name: '2Y' })
      expect(preset2y.classList.contains('ui-btn')).toBe(true)
      expect(preset2y.classList.contains('ui-btn-ghost')).toBe(true)
    })

    it('uses IconButton for card edit and delete in StrategyLibrary', () => {
      useAppStore.setState({
        strategies: [
          {
            id: 'strat-1',
            name: 'Breakout Alpha',
            notes: 'Test notes',
            createdAt: 1000,
            updatedAt: 1000,
            settings: {
              strategyId: 'engulfing',
              defaultRr: 2.0,
              lookback: 20,
              volumeMultiplier: 1.5,
              autoEntry: false,
              pauseOnSetup: false
            }
          }
        ]
      })

      render(<StrategyLibrary />)

      const editBtn = screen.getByRole('button', { name: /edit breakout alpha/i })
      expect(editBtn.classList.contains('ui-icon-btn')).toBe(true)
      expect(editBtn.classList.contains('ui-icon-btn-sm')).toBe(true)

      const deleteBtn = screen.getByRole('button', { name: /delete breakout alpha/i })
      expect(deleteBtn.classList.contains('ui-icon-btn')).toBe(true)
      expect(deleteBtn.classList.contains('ui-icon-btn-danger')).toBe(true)
      expect(deleteBtn.classList.contains('ui-icon-btn-sm')).toBe(true)
    })
  })

  describe('Task 2: Form Controls & Checkbox UI (R4)', () => {
    it('uses FormField and Checkbox in StrategyPanel', () => {
      useAppStore.setState({
        activeEaScriptId: null,
        settings: {
          strategyId: 'engulfing',
          defaultRr: 2.5,
          lookback: 20,
          volumeMultiplier: 1.0,
          autoEntry: true,
          pauseOnSetup: false
        },
        account: {
          balance: 10000,
          equity: 10000,
          initialBalance: 10000,
          riskPerTrade: 1.5,
          leverage: 1
        },
        showFundamentals: false
      })

      const { container } = render(<StrategyPanel />)

      // FormField elements
      const fields = container.querySelectorAll('.ui-field')
      expect(fields.length).toBeGreaterThan(0)

      // Checkbox elements
      const checkboxes = container.querySelectorAll('.ui-checkbox')
      expect(checkboxes.length).toBeGreaterThanOrEqual(2)

      const autoEntryInput = screen.getByRole('checkbox', { name: /auto entry/i }) as HTMLInputElement
      expect(autoEntryInput.checked).toBe(true)
      expect(autoEntryInput.classList.contains('ui-checkbox-input')).toBe(true)

      // Toggling checkbox calls store
      fireEvent.click(autoEntryInput)
      expect(useAppStore.getState().settings.autoEntry).toBe(false)
    })

    it('uses FormField across CostsPanel', () => {
      const { container } = render(<CostsPanel />)
      const fields = container.querySelectorAll('.ui-field')
      expect(fields.length).toBe(8) // 7 numeric costs + 1 SL/TP dropdown

      expect(screen.getByText('Spread (price)')).toBeDefined()
      expect(screen.getByText('Same-bar SL and TP')).toBeDefined()
    })

    it('uses FormField across FundamentalsDesk', () => {
      const { container } = render(<FundamentalsDesk />)
      const fields = container.querySelectorAll('.ui-field')
      expect(fields.length).toBeGreaterThanOrEqual(6)

      expect(screen.getByText('From')).toBeDefined()
      expect(screen.getByText('To')).toBeDefined()
      expect(screen.getAllByText('Date (UTC)').length).toBe(2)
    })

    it('uses Checkbox in BotBacktestModal for visualize replay', () => {
      render(
        <BotBacktestModal
          scriptName="SampleBot"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )

      const chk = screen.getByRole('checkbox', { name: /visualize/i }) as HTMLInputElement
      expect(chk).toBeDefined()
      expect(chk.classList.contains('ui-checkbox-input')).toBe(true)
      expect(chk.checked).toBe(true)

      // Footer button displays 'Open tester' when visualize is true
      expect(screen.getByRole('button', { name: /open tester/i })).toBeDefined()

      // Uncheck visualize
      fireEvent.click(chk)
      expect(chk.checked).toBe(false)

      // Footer button updates to 'Run in background'
      expect(screen.getByRole('button', { name: /run in background/i })).toBeDefined()
    })
  })

  describe('Task 3: Section Headings Typography (R5)', () => {
    it('uses consistent heading levels across panels and desks', () => {
      const { container: tradeCont } = render(<TradePanel />)
      expect(tradeCont.querySelector('h3')?.textContent).toBe('Trade')

      const { container: costsCont } = render(<CostsPanel />)
      expect(costsCont.querySelector('h3')?.textContent).toBe('Execution assumptions')

      const { container: stratCont } = render(<StrategyPanel />)
      expect(stratCont.querySelector('h3')).not.toBeNull()

      const { container: pineCont } = render(<PineIndicatorPanel />)
      expect(pineCont.querySelector('h3')?.textContent).toBe('Pine Script Indicators')
      expect(pineCont.querySelector('h4.pine-stack-label')?.textContent).toBe('Library')
    })
  })

  describe('Task 4: Badges, Stamps & Status Indicators (R6)', () => {
    it('renders Badge variant="stamp" in AppearanceSettings', () => {
      const { container } = render(<AppearanceSettings />)
      const badge = container.querySelector('.ui-badge-stamp')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('UI')
    })

    it('renders Badge variant="stamp" in AiProviderSettings', () => {
      const { container } = render(<AiProviderSettings />)
      const badge = container.querySelector('.ui-badge-stamp')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('AI')
    })

    it('renders Badge variant="stamp" in LoadingOverlay when busy', () => {
      useAppStore.setState({ busy: true, status: 'Testing...', downloadProgress: null })
      const { container } = render(<LoadingOverlay />)
      const badge = container.querySelector('.ui-badge-stamp')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('Working')
    })

    it('renders Badge variant="stamp" in MarketDesk', () => {
      const { container } = render(<MarketDesk />)
      // Switch to 'add' view
      const addPairTab = screen.getByRole('button', { name: 'Add a pair' })
      fireEvent.click(addPairTab)

      const badge = container.querySelector('.ui-badge-stamp')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('Free tape')
    })

    it('renders Badge variant="stamp" and Badge variant="neutral" in StrategyLibrary', () => {
      useAppStore.setState({
        strategies: [
          {
            id: 'strat-1',
            name: 'Engulfing Trend',
            notes: 'Test',
            createdAt: 1000,
            updatedAt: 1000,
            settings: {
              strategyId: 'engulfing',
              defaultRr: 2.0,
              lookback: 20,
              volumeMultiplier: 1.0,
              autoEntry: false,
              pauseOnSetup: false
            }
          }
        ]
      })

      const { container } = render(<StrategyLibrary />)

      // Library status badge
      const statusBadge = container.querySelector('.library-status.ui-badge')
      expect(statusBadge).not.toBeNull()
      expect(statusBadge?.classList.contains('ui-badge-neutral')).toBe(true)

      // Card stamp badge
      const stampBadge = container.querySelector('.strategy-card-header .ui-badge-stamp')
      expect(stampBadge).not.toBeNull()
      expect(stampBadge?.textContent).toBe('engulfing')
    })

    it('renders Badge variant="neutral" in CompanionChartPane', () => {
      const { container } = render(<CompanionChartPane index={0} />)
      const badge = container.querySelector('.companion-badge.ui-badge')
      expect(badge).not.toBeNull()
      expect(badge?.classList.contains('ui-badge-neutral')).toBe(true)
      expect(badge?.textContent).toBe('PANE 2')
    })
  })
})
