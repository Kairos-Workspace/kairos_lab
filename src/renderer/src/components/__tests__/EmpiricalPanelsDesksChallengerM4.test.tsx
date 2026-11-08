// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { StrategyPanel } from '../StrategyPanel'
import { CostsPanel } from '../CostsPanel'
import { FundamentalsDesk } from '../FundamentalsDesk'
import { BotBacktestModal } from '../BotBacktestModal'
import { StrategyLibrary } from '../StrategyLibrary'
import { useAppStore } from '../../store/useAppStore'
import { DEFAULT_COSTS, DEFAULT_STRATEGY_SETTINGS } from '@shared/constants'
import type { SavedStrategy, Timeframe } from '@shared/types'

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

describe('Empirical Challenger M4: Panels, Desks, Buttons & Forms Stress Suite', () => {
  beforeEach(() => {
    // Reset app store state to known baseline
    useAppStore.setState({
      activeEaScriptId: null,
      sessionName: 'London Replay',
      activeStrategyId: null,
      settings: { ...DEFAULT_STRATEGY_SETTINGS },
      costs: { ...DEFAULT_COSTS },
      ambiguityRule: 'ambiguous',
      account: {
        balance: 10000,
        equity: 10000,
        initialBalance: 10000,
        riskPerTrade: 1.0,
        leverage: 1
      },
      showFundamentals: false,
      strategies: [],
      datasets: [
        {
          id: 1,
          symbol: 'XAUUSD',
          timeframe: '1M',
          source: 'demo',
          candleCount: 1000,
          startTs: 1700000000000,
          endTs: 1700100000000,
          createdAt: 1700000000000,
          version: 1,
          gapCount: 0
        }
      ],
      symbol: 'XAUUSD',
      displayTimeframe: '1M',
      busy: false,
      status: ''
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. StrategyPanel Stress & Edge Cases
  // =========================================================================
  describe('StrategyPanel: Form Submissions, Clearing & Boundary Values', () => {
    it('handles Bot Backtest mode (activeEaScriptId set) inputs and checkbox dependencies', () => {
      useAppStore.setState({
        activeEaScriptId: 'ea_test_bot_1',
        sessionName: 'AlphaBot · EA',
        settings: {
          ...DEFAULT_STRATEGY_SETTINGS,
          defaultRr: 2.0,
          autoEntry: false,
          pauseOnSetup: true
        },
        account: {
          balance: 10000,
          equity: 10000,
          initialBalance: 10000,
          riskPerTrade: 1.5,
          leverage: 10
        }
      })

      const { container } = render(<StrategyPanel />)

      expect(screen.getByText(/running/i).textContent).toContain('AlphaBot')

      // 1. Boundary: Clearing and setting Default RR
      const rrInput = screen.getByLabelText(/default rr/i) as HTMLInputElement
      expect(rrInput.value).toBe('2')

      // Clear input
      fireEvent.change(rrInput, { target: { value: '' } })
      expect(useAppStore.getState().settings.defaultRr).toBe(0)

      // Extreme values
      fireEvent.change(rrInput, { target: { value: '0.05' } })
      expect(useAppStore.getState().settings.defaultRr).toBe(0.05)

      fireEvent.change(rrInput, { target: { value: '999.9' } })
      expect(useAppStore.getState().settings.defaultRr).toBe(999.9)

      // 2. Risk % input boundary & clearing
      const riskInput = screen.getByLabelText(/risk %/i) as HTMLInputElement
      expect(riskInput.value).toBe('1.5')

      fireEvent.change(riskInput, { target: { value: '' } })
      expect(useAppStore.getState().account.riskPerTrade).toBe(0)

      fireEvent.change(riskInput, { target: { value: '100' } })
      expect(useAppStore.getState().account.riskPerTrade).toBe(100)

      // 3. Auto entry vs Pause on setup interaction
      const autoEntry = screen.getByRole('checkbox', { name: /auto entry/i }) as HTMLInputElement
      const pauseOnSetup = screen.getByRole('checkbox', { name: /pause on setup/i }) as HTMLInputElement

      expect(autoEntry.checked).toBe(false)
      expect(pauseOnSetup.checked).toBe(true)
      expect(pauseOnSetup.disabled).toBe(false)

      // Turn on Auto Entry
      fireEvent.click(autoEntry)
      expect(useAppStore.getState().settings.autoEntry).toBe(true)

      // In store state updated, Pause on setup should now be disabled and labeled with caveat
      const updatedPauseOnSetup = screen.getByRole('checkbox', { name: /pause on setup \(off while auto entry\)/i }) as HTMLInputElement
      expect(updatedPauseOnSetup.disabled).toBe(true)

      // 4. Show fundamentals checkbox
      const fundCheckbox = screen.getByRole('checkbox', { name: /show fundamentals/i }) as HTMLInputElement
      expect(fundCheckbox.checked).toBe(false)
      fireEvent.click(fundCheckbox)
      expect(useAppStore.getState().showFundamentals).toBe(true)

      // 5. Start replay button opens ReplayRangeModal
      const startReplayBtn = screen.getByRole('button', { name: /start replay/i })
      expect(startReplayBtn).toBeDefined()
      fireEvent.click(startReplayBtn)
      // Modal should mount
      expect(screen.getByRole('dialog')).toBeDefined()
    })

    it('handles Catalog Strategy mode switching, lookback boundaries, and none strategy', () => {
      useAppStore.setState({
        activeEaScriptId: null,
        settings: {
          ...DEFAULT_STRATEGY_SETTINGS,
          strategyId: 'engulfing',
          lookback: 20,
          volumeMultiplier: 1.5,
          defaultRr: 2.0
        }
      })

      const { rerender } = render(<StrategyPanel />)

      // Check fields for standard strategy
      expect(screen.getByLabelText(/lookback \/ slow ma/i)).toBeDefined()
      expect(screen.getByLabelText(/volume multiple/i)).toBeDefined()

      // Boundary inputs on Lookback
      const lookbackInput = screen.getByLabelText(/lookback \/ slow ma/i) as HTMLInputElement
      fireEvent.change(lookbackInput, { target: { value: '0' } })
      expect(useAppStore.getState().settings.lookback).toBe(0)

      fireEvent.change(lookbackInput, { target: { value: '-10' } })
      expect(useAppStore.getState().settings.lookback).toBe(-10)

      fireEvent.change(lookbackInput, { target: { value: '500' } })
      expect(useAppStore.getState().settings.lookback).toBe(500)

      // Switch to bbma strategy
      useAppStore.setState({
        settings: { ...useAppStore.getState().settings, strategyId: 'bbma' }
      })
      rerender(<StrategyPanel />)

      // Label changes to BB period
      expect(screen.getByLabelText(/bb period/i)).toBeDefined()

      // Switch to strategy 'none'
      useAppStore.setState({
        settings: { ...useAppStore.getState().settings, strategyId: 'none' }
      })
      rerender(<StrategyPanel />)

      // In 'none' mode, lookback and volume multiple are hidden
      expect(screen.queryByLabelText(/bb period/i)).toBeNull()
      expect(screen.queryByLabelText(/lookback \/ slow ma/i)).toBeNull()
      expect(screen.queryByLabelText(/volume multiple/i)).toBeNull()
      // Only Default RR and Risk % remain
      expect(screen.getByLabelText(/default rr/i)).toBeDefined()
      expect(screen.getByLabelText(/risk %/i)).toBeDefined()
    })
  })

  // =========================================================================
  // 2. CostsPanel Stress & Edge Cases
  // =========================================================================
  describe('CostsPanel: Boundary Values, Clearing & Ambiguity Rule', () => {
    it('properly propagates zero, negative, and fractional values for all 7 execution costs', () => {
      render(<CostsPanel />)

      const costKeys = [
        { label: 'Spread (price)', key: 'spread', testVal: '0.00005', expected: 0.00005 },
        { label: 'Commission (USD)', key: 'commission', testVal: '7.5', expected: 7.5 },
        { label: 'Slippage (price)', key: 'slippage', testVal: '0.0001', expected: 0.0001 },
        { label: 'Min lot', key: 'minLot', testVal: '0.01', expected: 0.01 },
        { label: 'Lot step', key: 'lotStep', testVal: '0.01', expected: 0.01 },
        { label: 'Contract size', key: 'contractSize', testVal: '100000', expected: 100000 },
        { label: 'Tick size', key: 'tickSize', testVal: '0.00001', expected: 0.00001 }
      ] as const

      for (const item of costKeys) {
        const input = screen.getByLabelText(item.label) as HTMLInputElement
        expect(input).toBeDefined()

        // Test clearing input
        fireEvent.change(input, { target: { value: '' } })
        expect((useAppStore.getState().costs as any)[item.key]).toBe(0)

        // Test set value
        fireEvent.change(input, { target: { value: item.testVal } })
        expect((useAppStore.getState().costs as any)[item.key]).toBe(item.expected)
      }
    })

    it('toggles same-bar SL/TP ambiguity rule across all 4 valid variants', () => {
      render(<CostsPanel />)

      const dropdownBtn = screen.getByRole('button', { name: /same-bar sl and tp/i })
      expect(dropdownBtn).toBeDefined()

      const rules = [
        { label: 'Assume stop first', val: 'sl-first' },
        { label: 'Assume target first', val: 'tp-first' },
        { label: 'Random', val: 'random' },
        { label: 'Mark ambiguous', val: 'ambiguous' }
      ]

      for (const r of rules) {
        fireEvent.click(dropdownBtn)
        const option = screen.getByRole('option', { name: r.label })
        fireEvent.click(option)
        expect(useAppStore.getState().ambiguityRule).toBe(r.val)
      }
    })
  })

  // =========================================================================
  // 3. FundamentalsDesk Stress & Edge Cases
  // =========================================================================
  describe('FundamentalsDesk: Form Submissions, Clearing & Boundary Validation', () => {
    it('updates range presets accurately and enforces disabled state when fromDate > toDate', () => {
      const refreshMock = vi.fn()
      useAppStore.setState({
        refreshFundamentals: refreshMock,
        fundamentalsUpdatedAt: 1700000000000,
        fundamentalsBundle: {
          series: [
            { id: 'fed_funds', unit: '%', points: [{ ts: 1700000000000, value: 5.25 }] }
          ],
          events: []
        }
      })

      render(<FundamentalsDesk />)

      // Test preset button clicks
      const preset2y = screen.getByRole('button', { name: '2Y' })
      fireEvent.click(preset2y)
      const fromInput = screen.getByLabelText(/^from$/i) as HTMLInputElement
      const toInput = screen.getByLabelText(/^to$/i) as HTMLInputElement
      expect(fromInput.value).toBeTruthy()
      expect(toInput.value).toBeTruthy()

      // Click Max preset
      const presetMax = screen.getByRole('button', { name: 'Max' })
      fireEvent.click(presetMax)
      expect(fromInput.value).toBe('2000-01-01')

      // Valid range triggers refreshFundamentals
      const getMacroBtn = screen.getByRole('button', { name: /get macro/i })
      expect(getMacroBtn.hasAttribute('disabled')).toBe(false)
      fireEvent.click(getMacroBtn)
      expect(refreshMock).toHaveBeenCalledTimes(1)

      // Inverted range: fromDate > toDate
      fireEvent.change(fromInput, { target: { value: '2026-12-31' } })
      fireEvent.change(toInput, { target: { value: '2020-01-01' } })

      // Get macro button must be disabled
      expect(getMacroBtn.hasAttribute('disabled')).toBe(true)
      fireEvent.click(getMacroBtn)
      // Call count should NOT have increased
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    it('submits fundamental point edits, handles negative values and clears input upon save', async () => {
      const upsertPointMock = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        upsertFundamentalPoint: upsertPointMock,
        fundamentalsUpdatedAt: 1700000000000,
        fundamentalsBundle: {
          series: [
            { id: 'fed_funds', unit: '%', points: [] }
          ],
          events: []
        }
      })

      render(<FundamentalsDesk />)

      const savePointBtn = screen.getByRole('button', { name: /save point/i })
      // When pointValue is empty, button is disabled
      expect(savePointBtn.hasAttribute('disabled')).toBe(true)

      const valueInput = screen.getByPlaceholderText('4.10') as HTMLInputElement
      const periodInput = screen.getByPlaceholderText('Aug 2026') as HTMLInputElement

      // Enter negative value (e.g. negative interest rate or yield curve inversion)
      fireEvent.change(valueInput, { target: { value: '-0.75' } })
      fireEvent.change(periodInput, { target: { value: 'Q1 2026' } })

      expect(savePointBtn.hasAttribute('disabled')).toBe(false)

      fireEvent.click(savePointBtn)

      expect(upsertPointMock).toHaveBeenCalledTimes(1)
      expect(upsertPointMock).toHaveBeenCalledWith('fed_funds', expect.objectContaining({
        value: -0.75,
        period: 'Q1 2026'
      }))

      // Input must be cleared after save (async)
      await waitFor(() => {
        expect(valueInput.value).toBe('')
        expect(periodInput.value).toBe('')
        expect(savePointBtn.hasAttribute('disabled')).toBe(true)
      })
    })

    it('submits calendar event, handles empty actual and whitespace title guards', async () => {
      const upsertEventMock = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        upsertFundamentalEvent: upsertEventMock,
        fundamentalsUpdatedAt: 1700000000000,
        fundamentalsBundle: {
          series: [],
          events: []
        }
      })

      render(<FundamentalsDesk />)

      const saveEventBtn = screen.getByRole('button', { name: /save event/i })
      // Initially empty -> disabled
      expect(saveEventBtn.hasAttribute('disabled')).toBe(true)

      const titleInput = screen.getByPlaceholderText(/fomc hike 25bp/i) as HTMLInputElement
      const actualInput = screen.getByLabelText(/actual/i) as HTMLInputElement

      // Whitespace only -> still disabled
      fireEvent.change(titleInput, { target: { value: '   ' } })
      expect(saveEventBtn.hasAttribute('disabled')).toBe(true)

      // Valid title without actual
      fireEvent.change(titleInput, { target: { value: 'US CPI Release' } })
      expect(saveEventBtn.hasAttribute('disabled')).toBe(false)

      fireEvent.click(saveEventBtn)
      expect(upsertEventMock).toHaveBeenCalledTimes(1)
      expect(upsertEventMock).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'fomc',
        title: 'US CPI Release',
        actual: undefined
      }))

      // Inputs cleared (async)
      await waitFor(() => {
        expect(titleInput.value).toBe('')
        expect(actualInput.value).toBe('')
      })

      // Valid title with actual numeric value
      fireEvent.change(titleInput, { target: { value: 'NFP Surprise' } })
      fireEvent.change(actualInput, { target: { value: '250' } })
      fireEvent.click(saveEventBtn)

      expect(upsertEventMock).toHaveBeenCalledTimes(2)
      expect(upsertEventMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'NFP Surprise',
        actual: 250
      }))

      await waitFor(() => {
        expect(titleInput.value).toBe('')
        expect(actualInput.value).toBe('')
      })
    })

    it('handles reset macro ConfirmIconButton two-step confirmation', () => {
      const resetMock = vi.fn()
      useAppStore.setState({
        resetFundamentals: resetMock,
        fundamentalsSource: 'custom'
      })

      render(<FundamentalsDesk />)

      const resetBtn = screen.getByRole('button', { name: /reset to bundled macro/i })
      expect(resetBtn).toBeDefined()

      // First click: triggers confirmation state
      fireEvent.click(resetBtn)
      expect(resetMock).not.toHaveBeenCalled()

      // Second click on the confirmed button: triggers resetFundamentals
      const confirmBtn = screen.getByRole('button', { name: /click again to restore shipped bundle/i })
      fireEvent.click(confirmBtn)
      expect(resetMock).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // 4. BotBacktestModal Stress & Transitions
  // =========================================================================
  describe('BotBacktestModal: Mode Transitions, Visualize Toggle & Form Validation', () => {
    it('dynamically toggles visualize mode and updates submit button label accordingly', () => {
      const onConfirm = vi.fn()
      const onClose = vi.fn()

      render(
        <BotBacktestModal
          scriptName="EaScalperPro"
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )

      const submitBtn = screen.getByRole('button', { name: /open tester/i })
      expect(submitBtn).toBeDefined()

      const visualizeCheckbox = screen.getByRole('checkbox', { name: /visualize/i }) as HTMLInputElement
      expect(visualizeCheckbox.checked).toBe(true)

      // Toggle visualize off
      fireEvent.click(visualizeCheckbox)
      expect(visualizeCheckbox.checked).toBe(false)

      // Button label must now read 'Run in background'
      expect(screen.getByRole('button', { name: /run in background/i })).toBeDefined()
      expect(screen.queryByRole('button', { name: /open tester/i })).toBeNull()

      // Toggle visualize on again
      fireEvent.click(visualizeCheckbox)
      expect(visualizeCheckbox.checked).toBe(true)
      expect(screen.getByRole('button', { name: /open tester/i })).toBeDefined()
    })

    it('enforces busy state disables all inputs, close actions, and displays Running…', () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      const { rerender } = render(
        <BotBacktestModal
          scriptName="EaScalperPro"
          busy={true}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )

      // Submit button shows Running… and is disabled
      const submitBtn = screen.getByRole('button', { name: /running…/i })
      expect(submitBtn.hasAttribute('disabled')).toBe(true)

      // Cancel button disabled
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      expect(cancelBtn.hasAttribute('disabled')).toBe(true)

      // Checkbox disabled
      const visualizeCheckbox = screen.getByRole('checkbox', { name: /visualize/i }) as HTMLInputElement
      expect(visualizeCheckbox.disabled).toBe(true)

      // Rerender as not busy
      rerender(
        <BotBacktestModal
          scriptName="EaScalperPro"
          busy={false}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )

      expect(screen.getByRole('button', { name: /open tester/i }).hasAttribute('disabled')).toBe(false)
      expect(screen.getByRole('button', { name: /cancel/i }).hasAttribute('disabled')).toBe(false)
      expect(visualizeCheckbox.disabled).toBe(false)
    })

    it('validates edge cases: inverted dates, non-positive balance, leverage < 1, missing tape', async () => {
      const onConfirm = vi.fn()
      const onClose = vi.fn()

      render(
        <BotBacktestModal
          scriptName="EaScalperPro"
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )

      const form = document.getElementById('bot-backtest-form')!
      const fromInput = screen.getByLabelText(/backtest from/i) as HTMLInputElement
      const toInput = screen.getByLabelText(/backtest to/i) as HTMLInputElement
      const balanceInput = screen.getByLabelText(/initial balance/i) as HTMLInputElement
      const leverageInput = screen.getByLabelText(/leverage/i) as HTMLInputElement

      // 1. Inverted date range
      fireEvent.change(fromInput, { target: { value: '2026-05-10T12:00' } })
      fireEvent.change(toInput, { target: { value: '2026-05-01T12:00' } })
      fireEvent.submit(form)

      expect(screen.getByRole('alert').textContent).toBe('From must be before To.')
      expect(onConfirm).not.toHaveBeenCalled()

      // Reset to valid range
      fireEvent.change(fromInput, { target: { value: '2023-11-14T00:00' } })
      fireEvent.change(toInput, { target: { value: '2023-11-15T00:00' } })

      // 2. Non-positive balance
      fireEvent.change(balanceInput, { target: { value: '0' } })
      fireEvent.submit(form)

      expect(screen.getByRole('alert').textContent).toBe('Initial balance must be a positive number.')
      expect(onConfirm).not.toHaveBeenCalled()

      // 3. Leverage < 1
      fireEvent.change(balanceInput, { target: { value: '10000' } })
      fireEvent.change(leverageInput, { target: { value: '0' } })
      fireEvent.submit(form)

      expect(screen.getByRole('alert').textContent).toBe('Leverage must be 1 or higher.')
      expect(onConfirm).not.toHaveBeenCalled()

      // 4. Missing local dataset for selected symbol/tf
      useAppStore.setState({ datasets: [] })
      fireEvent.change(leverageInput, { target: { value: '10' } })
      fireEvent.submit(form)

      // When tape is missing, both local hint alert and submit error alert can be rendered
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(alerts.some((el) => el.textContent?.includes('No local tape'))).toBe(true)
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // 5. StrategyLibrary Stress & Strategy Card Actions
  // =========================================================================
  describe('StrategyLibrary: Card Actions, Composer, Delete Confirmation & Search', () => {
    const mockStrategy1: SavedStrategy = {
      id: 'strat-alpha',
      name: 'London Breakout Setup',
      notes: 'London session 20-bar lookback',
      createdAt: 1000,
      updatedAt: 1000,
      settings: {
        strategyId: 'breakout',
        defaultRr: 2.0,
        lookback: 20,
        volumeMultiplier: 1.5,
        autoEntry: true,
        pauseOnSetup: false
      }
    }

    const mockStrategy2: SavedStrategy = {
      id: 'strat-beta',
      name: 'Golden Cross Trend',
      notes: 'Trend following with SMA crossover',
      createdAt: 2000,
      updatedAt: 2000,
      settings: {
        strategyId: 'ma-crossover',
        defaultRr: 3.0,
        lookback: 50,
        volumeMultiplier: 1.0,
        autoEntry: false,
        pauseOnSetup: true
      }
    }

    it('renders empty library and creates a strategy using preset chip', async () => {
      const createStrategyMock = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        strategies: [],
        createStrategy: createStrategyMock
      })

      render(<StrategyLibrary />)

      expect(screen.getByText(/no strategies yet/i)).toBeDefined()

      // Click Create button in empty state (distinguished by exact: true and no form attribute)
      const createButtons = screen.getAllByRole('button', { name: /^create$/i })
      const emptyCreateBtn = createButtons.find((btn) => !btn.getAttribute('form'))!
      expect(emptyCreateBtn).toBeDefined()
      fireEvent.click(emptyCreateBtn)

      // Composer modal opens with heading 'New strategy'
      expect(screen.getByRole('heading', { name: /new strategy/i })).toBeDefined()

      // Click preset chip 'BBMA Reversal'
      const presetChip = screen.getByRole('button', { name: /bbma reversal/i })
      fireEvent.click(presetChip)

      const nameInput = screen.getByPlaceholderText('London breakout') as HTMLInputElement
      expect(nameInput.value).toBe('BBMA Reversal')

      // Submit composer
      const submitBtn = document.querySelector<HTMLButtonElement>('button[form="strategy-composer-form"][type="submit"]')!
      expect(submitBtn).toBeDefined()
      fireEvent.click(submitBtn)

      expect(createStrategyMock).toHaveBeenCalledTimes(1)
      expect(createStrategyMock).toHaveBeenCalledWith(expect.objectContaining({
        name: 'BBMA Reversal',
        settings: expect.objectContaining({
          strategyId: 'bbma',
          lookback: 20
        })
      }))
    })

    it('edits an existing strategy via card Edit button and updates store', async () => {
      const updateStrategyMock = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        strategies: [mockStrategy1],
        updateSavedStrategy: updateStrategyMock
      })

      render(<StrategyLibrary />)

      // Click Edit IconButton
      const editBtn = screen.getByRole('button', { name: /edit london breakout setup/i })
      fireEvent.click(editBtn)

      // Modal opens with 'Edit strategy' title and populated inputs
      expect(screen.getByRole('heading', { name: /edit strategy/i })).toBeDefined()
      const nameInput = screen.getByPlaceholderText('London breakout') as HTMLInputElement
      expect(nameInput.value).toBe('London Breakout Setup')

      // Modify name
      fireEvent.change(nameInput, { target: { value: 'London Breakout Setup v2' } })

      // Submit form
      const saveBtn = document.querySelector<HTMLButtonElement>('button[form="strategy-composer-form"][type="submit"]')!
      expect(saveBtn).toBeDefined()
      fireEvent.click(saveBtn)

      expect(updateStrategyMock).toHaveBeenCalledTimes(1)
      expect(updateStrategyMock).toHaveBeenCalledWith('strat-alpha', expect.objectContaining({
        name: 'London Breakout Setup v2'
      }))
    })

    it('handles delete strategy card action with confirmation dialog and cancel/confirm branches', async () => {
      const deleteStrategyMock = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        strategies: [mockStrategy1],
        deleteSavedStrategy: deleteStrategyMock
      })

      render(<StrategyLibrary />)

      // Click Delete IconButton
      const deleteBtn = screen.getByRole('button', { name: /delete london breakout setup/i })
      fireEvent.click(deleteBtn)

      // Modal appears with 'Delete Strategy'
      expect(screen.getByRole('heading', { name: /delete strategy/i })).toBeDefined()
      expect(screen.getByText(/are you sure you want to delete/i).textContent).toContain('London Breakout Setup')

      // Branch 1: Click Cancel -> does not delete
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelBtn)
      expect(deleteStrategyMock).not.toHaveBeenCalled()

      // Branch 2: Click Delete again, this time confirm
      fireEvent.click(deleteBtn)
      const confirmDeleteBtn = document.querySelector<HTMLButtonElement>('.ui-modal-footer .ui-btn-danger')!
      expect(confirmDeleteBtn).toBeDefined()
      fireEvent.click(confirmDeleteBtn)

      expect(deleteStrategyMock).toHaveBeenCalledTimes(1)
      expect(deleteStrategyMock).toHaveBeenCalledWith('strat-alpha')
    })

    it('opens strategy when clicking card body or start button', () => {
      const openStrategyMock = vi.fn()
      useAppStore.setState({
        strategies: [mockStrategy1],
        openStrategy: openStrategyMock
      })

      render(<StrategyLibrary />)

      // Click card Start button
      const startBtn = screen.getByRole('button', { name: /start/i })
      fireEvent.click(startBtn)
      expect(openStrategyMock).toHaveBeenCalledWith('strat-alpha')

      // Click card main button
      const cardMain = screen.getByText('London Breakout Setup').closest('button')!
      fireEvent.click(cardMain)
      expect(openStrategyMock).toHaveBeenCalledWith('strat-alpha')
    })

    it('filters strategy list, displays no match message, and clears filter', () => {
      // Need > 4 strategies for search bar to render
      const strats = [
        mockStrategy1,
        mockStrategy2,
        { ...mockStrategy1, id: 'strat-3', name: 'Scalp Gamma', notes: 'Gamma scalper' },
        { ...mockStrategy1, id: 'strat-4', name: 'Swing Delta', notes: 'Delta swings' },
        { ...mockStrategy1, id: 'strat-5', name: 'Momentum Epsilon', notes: 'Epsilon run' }
      ]

      useAppStore.setState({ strategies: strats })

      render(<StrategyLibrary />)

      const searchInput = screen.getByPlaceholderText(/search strategies.../i) as HTMLInputElement
      expect(searchInput).toBeDefined()

      // Filter for 'london' (matches mockStrategy1 name)
      fireEvent.change(searchInput, { target: { value: 'london' } })
      expect(screen.getByText('London Breakout Setup')).toBeDefined()
      expect(screen.queryByText('Golden Cross Trend')).toBeNull()

      // Filter for nonexistent query
      fireEvent.change(searchInput, { target: { value: 'nonexistent-query-xyz' } })
      expect(screen.getByText(/no matching strategies/i)).toBeDefined()

      // Click 'Clear filter'
      const clearBtn = screen.getByRole('button', { name: /clear filter/i })
      fireEvent.click(clearBtn)
      expect(searchInput.value).toBe('')
      expect(screen.getByText('London Breakout Setup')).toBeDefined()
      expect(screen.getByText('Golden Cross Trend')).toBeDefined()
    })

    it('renders and manages duplicate-named strategies without cross-id collision', async () => {
      const deleteStrategyMock = vi.fn().mockResolvedValue(undefined)
      const updateStrategyMock = vi.fn().mockResolvedValue(undefined)

      const dup1: SavedStrategy = {
        id: 'dup-1',
        name: 'Dual Moving Average',
        notes: 'Instance 1',
        createdAt: 1000,
        updatedAt: 1000,
        settings: { ...DEFAULT_STRATEGY_SETTINGS }
      }
      const dup2: SavedStrategy = {
        id: 'dup-2',
        name: 'Dual Moving Average',
        notes: 'Instance 2',
        createdAt: 2000,
        updatedAt: 2000,
        settings: { ...DEFAULT_STRATEGY_SETTINGS }
      }

      useAppStore.setState({
        strategies: [dup1, dup2],
        deleteSavedStrategy: deleteStrategyMock,
        updateSavedStrategy: updateStrategyMock
      })

      render(<StrategyLibrary />)

      const editButtons = screen.getAllByRole('button', { name: /edit dual moving average/i })
      expect(editButtons.length).toBe(2)

      const deleteButtons = screen.getAllByRole('button', { name: /delete dual moving average/i })
      expect(deleteButtons.length).toBe(2)

      // Click delete on the second strategy card
      fireEvent.click(deleteButtons[1])

      const confirmDeleteBtn = document.querySelector<HTMLButtonElement>('.ui-modal-footer .ui-btn-danger')!
      expect(confirmDeleteBtn).toBeDefined()
      fireEvent.click(confirmDeleteBtn)

      // Expect targeted deletion of dup-2 specifically
      expect(deleteStrategyMock).toHaveBeenCalledWith('dup-2')
    })
  })

  // =========================================================================
  // 6. Deep Pair/Timeframe Transitions in BotBacktestModal
  // =========================================================================
  describe('BotBacktestModal: Pair / Timeframe Transitions & Full Valid Submit', () => {
    it('switches symbol and timeframe, recalibrating tape range and submittable config', async () => {
      const datasets = [
        {
          id: 1,
          symbol: 'XAUUSD',
          timeframe: '1M' as Timeframe,
          source: 'demo' as const,
          candleCount: 1000,
          startTs: 1700000000000,
          endTs: 1700100000000,
          createdAt: 1700000000000,
          version: 1,
          gapCount: 0
        },
        {
          id: 2,
          symbol: 'EURUSD',
          timeframe: '5M' as Timeframe,
          source: 'demo' as const,
          candleCount: 2000,
          startTs: 1710000000000,
          endTs: 1710200000000,
          createdAt: 1710000000000,
          version: 1,
          gapCount: 0
        }
      ]

      useAppStore.setState({
        datasets,
        symbol: 'XAUUSD',
        displayTimeframe: '1M'
      })

      const onConfirm = vi.fn().mockResolvedValue(undefined)
      const onClose = vi.fn()

      render(
        <BotBacktestModal
          scriptName="MultiAssetBot"
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )

      // Change Pair to EURUSD
      const pairDropdownBtn = screen.getByRole('button', { name: /^pair$/i })
      fireEvent.click(pairDropdownBtn)
      const eurusdOption = screen.getByRole('option', { name: 'EURUSD' })
      fireEvent.click(eurusdOption)

      // Timeframe automatically adjusts to 5M (the only available timeframe for EURUSD)
      expect(screen.getByRole('button', { name: /^timeframe$/i }).textContent).toBe('5M')

      // Submit form
      const form = document.getElementById('bot-backtest-form')!
      fireEvent.submit(form)

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'EURUSD',
          timeframe: '5M',
          initialBalance: 10000,
          leverage: 1,
          visualize: true
        })
      )
    })
  })
})
