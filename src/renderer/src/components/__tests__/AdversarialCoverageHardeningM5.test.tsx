// @vitest-environment happy-dom
import React, { useState } from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'

// Component imports
import { Modal } from '../ui/Modal'
import { Checkbox } from '../ui/Checkbox'
import { FormField } from '../ui/FormField'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Badge } from '../ui/Badge'
import { TopBar } from '../TopBar'
import { SettingsScreen } from '../SettingsScreen'
import { StrategyLibrary } from '../StrategyLibrary'
import { StrategyPanel } from '../StrategyPanel'
import { CostsPanel } from '../CostsPanel'
import { TradePanel } from '../TradePanel'
import { ThemeToggle } from '../ThemeToggle'
import { AppearanceSettings } from '../AppearanceSettings'
import { AiProviderModal } from '../AiProviderModal'
import { DownloadWizard } from '../DownloadWizard'
import { EaLab } from '../EaLab'
import { EaChatPanel } from '../EaChatPanel'
import { MarketDesk } from '../MarketDesk'
import { FundamentalsDesk } from '../FundamentalsDesk'

// Store imports
import { useAppStore, type AppScreen } from '../../store/useAppStore'
import { useAiProvidersStore } from '../../store/useAiProvidersStore'
import { useEaLabStore } from '../../store/useEaLabStore'
import { useEaChatStore } from '../../store/useEaChatStore'
import { applyDeskTheme } from '@core/desk/theme'

// Mock external heavy dependencies that rely on Canvas or Monaco
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

vi.mock('../IndicatorChart', () => ({
  IndicatorChart: () => <div data-testid="mock-indicator-chart" />
}))

vi.mock('../BotBacktestModal', () => ({
  BotBacktestModal: () => <div data-testid="mock-backtest-modal" />
}))

vi.mock('../BotBacktestResultModal', () => ({
  BotBacktestResultModal: () => <div data-testid="mock-backtest-result-modal" />
}))

describe('Milestone 5 Adversarial Coverage Hardening & Empirical Stress Suite', () => {
  beforeEach(() => {
    // Setup desktop mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).kairos = {
      preferences: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      sessions: {
        save: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      datasets: {
        candles: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        candlesPage: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        gaps: vi.fn().mockResolvedValue([])
      }
    }

    useAppStore.setState({
      screen: 'workspace',
      theme: 'dark',
      symbol: 'EURUSD',
      displayTimeframe: '1H',
      chartLayout: 1,
      chartFull: false,
      speed: 1,
      mode: 'view',
      hideDate: false,
      datasets: [],
      strategies: [
        {
          id: 'strat-1',
          name: 'Momentum Breakout',
          notes: 'Test',
          settings: {
            strategyId: 'breakout',
            lookback: 20,
            defaultRr: 2.0,
            autoEntry: false,
            pauseOnSetup: false,
            volumeMultiplier: 1.0
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      activeStrategyId: 'strat-1',
      activeEaScriptId: null,
      sessionName: 'Momentum Breakout',
      settingsReturnScreen: 'workspace',
      shortcutsModalOpen: false,
      settings: {
        strategyId: 'breakout',
        lookback: 20,
        defaultRr: 2.0,
        autoEntry: false,
        pauseOnSetup: false,
        volumeMultiplier: 1.0
      },
      account: {
        initialBalance: 10000,
        balance: 10000,
        equity: 10000,
        riskPerTrade: 1,
        leverage: 100
      },
      costs: {
        spread: 1.5,
        commission: 3.5,
        slippage: 0.5,
        minLot: 0.01,
        lotStep: 0.01,
        contractSize: 100000,
        tickSize: 0.00001,
        tickValue: 1
      },
      ambiguityRule: 'ambiguous',
      activeTrade: null,
      selectedTradeId: null,
      draft: null,
      trades: []
    })

    applyDeskTheme('dark')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    // Clean any lingering portal nodes in document.body
    document.body.innerHTML = ''
    document.documentElement.dataset.theme = 'dark'
  })

  // =========================================================================
  // AREA 1: MODALS STRESS & RESILIENCE
  // =========================================================================
  describe('Area 1: Modals Stress & Resilience Harness', () => {
    it('survives rapid Escape key bursts (100x events in tight loop) without event buildup or leaks', () => {
      const handleClose = vi.fn()
      const { unmount } = render(
        <Modal open={true} onClose={handleClose} title="Stress Modal">
          <p>Content</p>
        </Modal>
      )

      expect(document.querySelector('.ui-modal-backdrop')).not.toBeNull()

      // Rapidly fire 100 Escape keydown events
      for (let i = 0; i < 100; i++) {
        fireEvent.keyDown(window, { key: 'Escape' })
      }

      expect(handleClose).toHaveBeenCalledTimes(100)

      // Unmount modal and assert no lingering keydown listeners remain that call onClose
      unmount()
      handleClose.mockClear()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('ignores 100 Escape events when closeOnEscape is false', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnEscape={false} title="Locked Modal">
          <p>Locked</p>
        </Modal>
      )

      for (let i = 0; i < 100; i++) {
        fireEvent.keyDown(window, { key: 'Escape' })
      }
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('handles 100 rapid backdrop clicks and distinguishes container clicks', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} title="Backdrop Test">
          <p className="inner-text">Inner content</p>
        </Modal>
      )

      const backdrop = document.querySelector('.ui-modal-backdrop') as HTMLElement
      const container = document.querySelector('.ui-modal-container') as HTMLElement
      const innerText = document.querySelector('.inner-text') as HTMLElement
      expect(backdrop).not.toBeNull()
      expect(container).not.toBeNull()

      // Clicks inside container or inner text must NOT trigger onClose
      for (let i = 0; i < 50; i++) {
        fireEvent.mouseDown(container)
        fireEvent.mouseDown(innerText)
      }
      expect(handleClose).not.toHaveBeenCalled()

      // Clicks directly on backdrop MUST trigger onClose
      for (let i = 0; i < 50; i++) {
        fireEvent.mouseDown(backdrop)
      }
      expect(handleClose).toHaveBeenCalledTimes(50)
    })

    it('ignores backdrop clicks when closeOnBackdropClick is false', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnBackdropClick={false} title="No Backdrop Close">
          <p>Content</p>
        </Modal>
      )

      const backdrop = document.querySelector('.ui-modal-backdrop') as HTMLElement
      for (let i = 0; i < 50; i++) {
        fireEvent.mouseDown(backdrop)
      }
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('survives rapid mount-unmount thrashing (50 toggles) without dangling DOM nodes or errors', () => {
      function ThrashParent(): React.JSX.Element {
        const [open, setOpen] = useState(false)
        return (
          <div>
            <button data-testid="toggle-btn" onClick={() => setOpen((v) => !v)}>
              Toggle
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title="Thrash">
              <p>Dynamic Content</p>
            </Modal>
          </div>
        )
      }

      const { getByTestId } = render(<ThrashParent />)
      const toggleBtn = getByTestId('toggle-btn')

      for (let i = 0; i < 50; i++) {
        act(() => {
          fireEvent.click(toggleBtn)
        })
        if (i % 2 === 0) {
          expect(document.querySelector('.ui-modal-backdrop')).not.toBeNull()
        } else {
          expect(document.querySelector('.ui-modal-backdrop')).toBeNull()
        }
      }
    })

    it('unmounts cleanly when parent component abruptly unmounts while modal is active', () => {
      const { unmount } = render(
        <div data-testid="parent-container">
          <Modal open={true} onClose={vi.fn()} title="Orphan Test">
            <p>Orphan body</p>
          </Modal>
        </div>
      )

      expect(document.querySelector('.ui-modal-backdrop')).not.toBeNull()
      unmount()
      expect(document.querySelector('.ui-modal-backdrop')).toBeNull()
    })

    it('stresses AiProviderModal under rapid submit and test clicks', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined)
      const mockTest = vi.fn().mockResolvedValue(undefined)
      useAiProvidersStore.setState({
        saveProvider: mockSave,
        testConnection: mockTest,
        testing: false,
        testResult: null
      })

      const handleClose = vi.fn()
      render(
        <AiProviderModal
          profile={{
            id: 'prov-1',
            name: 'OpenAI Prod',
            provider: 'openai',
            model: 'gpt-4o',
            baseUrl: null,
            hasApiKey: true
          }}
          onClose={handleClose}
        />
      )

      const form = document.getElementById('ai-provider-form') as HTMLFormElement
      expect(form).not.toBeNull()

      // Rapidly fire multiple form submits
      for (let i = 0; i < 10; i++) {
        fireEvent.submit(form)
      }
      expect(mockSave).toHaveBeenCalled()
      await waitFor(() => {
        expect(handleClose).toHaveBeenCalled()
      })
    })

    it('stresses DownloadWizard through rapid timeframe toggling and step navigation', () => {
      const mockDownload = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({ downloadPair: mockDownload })

      const handleClose = vi.fn()
      const { baseElement } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)

      // Timeframe checkboxes rapid toggling
      const m15 = screen.getByLabelText('15M') as HTMLInputElement
      const h4 = screen.getByLabelText('4H') as HTMLInputElement

      for (let i = 0; i < 20; i++) {
        fireEvent.click(m15)
        fireEvent.click(h4)
      }

      // Ensure 1H remains checked (at least one timeframe)
      const h1 = screen.getByLabelText('1H') as HTMLInputElement
      expect(h1.checked).toBe(true)

      // Next step
      const nextBtn = screen.getByRole('button', { name: 'Next' })
      fireEvent.click(nextBtn)
      expect(screen.getByText('Download data · Step 2 of 4')).toBeDefined()

      // Back step
      const backBtn = screen.getByRole('button', { name: 'Back' })
      fireEvent.click(backBtn)
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()

      // Close via header close button
      const closeBtn = baseElement.querySelector('.ui-modal-close') as HTMLButtonElement
      expect(closeBtn).not.toBeNull()
      fireEvent.click(closeBtn)
      expect(handleClose).toHaveBeenCalled()
    })

    it('stresses EaLab script deletion confirmation modal and Escape cancel', () => {
      useEaLabStore.setState({
        scripts: [
          {
            id: 'bot-delete-1',
            name: 'DeleteMeBot',
            kind: 'ea',
            language: 'mql5',
            code: '// bot code',
            createdAt: 1000,
            updatedAt: 1000
          }
        ],
        activeScriptId: 'bot-delete-1'
      })

      render(<EaLab kind="ea" />)

      // Find and click delete button in explorer item
      const deleteBtn = screen.getByRole('button', { name: 'Delete DeleteMeBot' })
      expect(deleteBtn).toBeDefined()
      fireEvent.click(deleteBtn)

      // Modal is open (shows copy.deleteTitle, which for ea is 'Delete bot')
      expect(screen.getByText('Delete bot')).toBeDefined()

      // Press Escape to cancel
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByText('Delete bot')).toBeNull()

      // Re-trigger and click Cancel button
      fireEvent.click(deleteBtn)
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelBtn)
      expect(screen.queryByText('Delete bot')).toBeNull()
    })

    it('stresses EaChatPanel delete thread confirmation modal and Escape cancel', () => {
      useAiProvidersStore.setState({
        providers: [
          {
            id: 'prov-mock-1',
            name: 'Test AI Provider',
            provider: 'openai',
            model: 'gpt-4o',
            baseUrl: null,
            hasApiKey: true
          }
        ]
      })

      useEaLabStore.setState({
        scripts: [
          {
            id: 'bot-1',
            name: 'TestBot',
            kind: 'ea',
            language: 'mql5',
            code: '// code',
            createdAt: 1000,
            updatedAt: 1000
          }
        ],
        activeScriptId: 'bot-1'
      })

      useEaChatStore.setState({
        threads: [
          {
            id: 'thread-1',
            scriptId: 'bot-1',
            title: 'Chat to delete',
            createdAt: 1000,
            updatedAt: 1000
          }
        ],
        currentThreadId: 'thread-1'
      })

      render(<EaChatPanel />)

      // Open history drawer
      const historyToggle = screen.getByRole('button', { name: 'Chat history' })
      expect(historyToggle).toBeDefined()
      fireEvent.click(historyToggle)

      // Click delete thread button
      const threadDeleteBtn = screen.getByRole('button', { name: 'Delete Chat to delete' })
      expect(threadDeleteBtn).toBeDefined()
      fireEvent.click(threadDeleteBtn)

      // Confirm modal is displayed
      expect(screen.getByText('Delete chat')).toBeDefined()

      // Press Escape to dismiss
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByText('Delete chat')).toBeNull()
    })
  })

  // =========================================================================
  // AREA 2: NAVIGATION STRESS & HISTORY LOOP RESILIENCE
  // =========================================================================
  describe('Area 2: Navigation Stress & History Loop Resilience', () => {
    it('survives chaotic cross-screen jumping (200 random screen transitions) in store without corruption', () => {
      const screens: AppScreen[] = [
        'welcome',
        'library',
        'workspace',
        'ea-lab',
        'indicator-lab',
        'settings'
      ]

      for (let i = 0; i < 200; i++) {
        const targetScreen = screens[i % screens.length]
        act(() => {
          if (targetScreen === 'welcome') useAppStore.getState().goHome()
          else if (targetScreen === 'library') useAppStore.getState().enterLibrary()
          else if (targetScreen === 'ea-lab') useAppStore.getState().enterEaLab()
          else if (targetScreen === 'indicator-lab') useAppStore.getState().enterIndicatorLab()
          else if (targetScreen === 'settings') useAppStore.getState().enterSettings()
          else useAppStore.setState({ screen: 'workspace' })
        })

        const current = useAppStore.getState().screen
        expect(screens).toContain(current)
      }
    })

    it('preserves history and guards against recursive loops during enterSettings and leaveSettings', () => {
      const origins: AppScreen[] = ['welcome', 'library', 'workspace', 'ea-lab', 'indicator-lab']

      for (const origin of origins) {
        act(() => {
          useAppStore.setState({ screen: origin })
          useAppStore.getState().enterSettings()
        })
        expect(useAppStore.getState().screen).toBe('settings')
        expect(useAppStore.getState().settingsReturnScreen).toBe(origin)

        act(() => {
          useAppStore.getState().leaveSettings()
        })
        expect(useAppStore.getState().screen).toBe(origin)
      }

      // Stress recursive guard: if settingsReturnScreen is set to 'settings'
      act(() => {
        useAppStore.setState({ screen: 'settings', settingsReturnScreen: 'settings' })
        useAppStore.getState().leaveSettings()
      })
      // Must not loop back to 'settings'
      expect(useAppStore.getState().screen).toBe('ea-lab')
    })

    it('stresses TopBar navigation actions and verifies idempotency when clicking active screens', () => {
      const { container } = render(<TopBar />)

      const homeBtn = screen.getByRole('button', { name: 'Home' })
      const stratBtn = screen.getByRole('button', { name: 'Strategy Lab' })
      const botBtn = screen.getByRole('button', { name: 'Bot Lab' })
      const indBtn = screen.getByRole('button', { name: 'Indicator Lab' })
      const setBtn = screen.getByRole('button', { name: 'Settings' })

      // Rapidly click Home 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(homeBtn)
      }
      expect(useAppStore.getState().screen).toBe('welcome')

      // Rapidly click Strategy Lab 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(stratBtn)
      }
      expect(useAppStore.getState().screen).toBe('library')

      // Rapidly click Bot Lab 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(botBtn)
      }
      expect(useAppStore.getState().screen).toBe('ea-lab')

      // Rapidly click Indicator Lab 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(indBtn)
      }
      expect(useAppStore.getState().screen).toBe('indicator-lab')

      // Rapidly click Settings 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(setBtn)
      }
      expect(useAppStore.getState().screen).toBe('settings')

      // Verify leave workspace button when activeStrategyId exists
      useAppStore.setState({ screen: 'workspace', activeStrategyId: 'strat-1' })
      const backBtn = container.querySelector('.brand-back') as HTMLButtonElement
      expect(backBtn).not.toBeNull()
      fireEvent.click(backBtn)
      expect(useAppStore.getState().screen).toBe('library')
    })

    it('verifies SettingsScreen back button navigation correctly uses settingsReturnScreen label', () => {
      useAppStore.setState({ screen: 'settings', settingsReturnScreen: 'workspace' })
      const { rerender } = render(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Workspace' })).toBeDefined()

      useAppStore.setState({ screen: 'settings', settingsReturnScreen: 'library' })
      rerender(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Strategy Lab' })).toBeDefined()

      useAppStore.setState({ screen: 'settings', settingsReturnScreen: 'welcome' })
      rerender(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Home' })).toBeDefined()

      useAppStore.setState({ screen: 'settings', settingsReturnScreen: 'ea-lab' })
      rerender(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Bot Lab' })).toBeDefined()

      useAppStore.setState({ screen: 'settings', settingsReturnScreen: 'indicator-lab' })
      rerender(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Indicator Lab' })).toBeDefined()
    })
  })

  // =========================================================================
  // AREA 3: CHECKBOXES & FORMS ADVERSARIAL INPUT HARNESS
  // =========================================================================
  describe('Area 3: Checkboxes & Forms Adversarial Input Harness', () => {
    it('verifies Checkbox component state integrity under controlled & uncontrolled 100x rapid toggles', () => {
      const handleChange = vi.fn()
      const { rerender } = render(<Checkbox label="Controlled Checkbox" checked={false} onChange={handleChange} />)

      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(false)

      // Controlled rapid toggling
      for (let i = 0; i < 50; i++) {
        fireEvent.click(input)
        rerender(<Checkbox label="Controlled Checkbox" checked={i % 2 === 0} onChange={handleChange} />)
      }
      expect(handleChange).toHaveBeenCalledTimes(50)

      // Uncontrolled rapid toggling
      cleanup()
      render(<Checkbox label="Uncontrolled Checkbox" defaultChecked={false} />)
      const uncontrolledInput = screen.getByRole('checkbox') as HTMLInputElement

      for (let i = 0; i < 50; i++) {
        fireEvent.click(uncontrolledInput)
        expect(uncontrolledInput.checked).toBe(i % 2 === 0)
      }
    })

    it('prevents state changes and events when Checkbox is disabled', () => {
      const handleChange = vi.fn()
      render(<Checkbox label="Disabled Checkbox" disabled={true} checked={false} onChange={handleChange} />)

      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.disabled).toBe(true)

      for (let i = 0; i < 20; i++) {
        fireEvent.click(input)
      }
      expect(handleChange).not.toHaveBeenCalled()
    })

    it('verifies Checkbox indeterminate DOM attribute support and label/description click propagation', () => {
      const ref = React.createRef<HTMLInputElement>()
      const handleChange = vi.fn()
      render(
        <Checkbox
          ref={ref}
          label="Indeterminate Test"
          description="Helper description"
          onChange={handleChange}
        />
      )

      expect(ref.current).not.toBeNull()
      ref.current!.indeterminate = true
      expect(ref.current!.indeterminate).toBe(true)

      // Click on description text
      const desc = screen.getByText('Helper description')
      fireEvent.click(desc)
      expect(handleChange).toHaveBeenCalledTimes(1)

      // Click on label text
      const label = screen.getByText('Indeterminate Test')
      fireEvent.click(label)
      expect(handleChange).toHaveBeenCalledTimes(2)
    })

    it('verifies FormField handles missing id, custom htmlFor, hints, and error alerts', () => {
      const { rerender, container } = render(
        <FormField label="Email" hint="We will never share your email">
          <input type="text" />
        </FormField>
      )

      // FormField generated id attached to input
      const input = screen.getByLabelText('Email')
      expect(input).toBeDefined()
      expect(input.id).toBeTruthy()
      expect(screen.getByText('We will never share your email')).toBeDefined()

      // Error state
      rerender(
        <FormField label="Email" error="Invalid email address">
          <input type="text" />
        </FormField>
      )

      expect(container.querySelector('.ui-field-has-error')).not.toBeNull()
      const errorMsg = screen.getByRole('alert')
      expect(errorMsg.textContent).toBe('Invalid email address')

      // Required and optional markers
      rerender(
        <FormField label="Username" required={true}>
          <input type="text" />
        </FormField>
      )
      expect(container.querySelector('.ui-field-required')).not.toBeNull()

      rerender(
        <FormField label="Nickname" optional={true}>
          <input type="text" />
        </FormField>
      )
      expect(container.querySelector('.ui-field-optional')).not.toBeNull()
    })

    it('stresses StrategyPanel with boundary and extreme numbers (NaN, Infinity, 0, negative, long string)', () => {
      const { rerender } = render(<StrategyPanel />)

      const lookbackInput = screen.getByDisplayValue('20') as HTMLInputElement
      const rrInput = screen.getByDisplayValue('2') as HTMLInputElement

      const extremeInputs = ['0', '-999999', '1e20', '0.0000001', 'NaN', 'Infinity', '']
      for (const val of extremeInputs) {
        fireEvent.change(lookbackInput, { target: { value: val } })
        fireEvent.change(rrInput, { target: { value: val } })
      }

      // Checkbox toggles in StrategyPanel (catalog mode)
      const autoEntry = screen.getByLabelText('Auto entry') as HTMLInputElement
      act(() => {
        fireEvent.click(autoEntry)
      })
      expect(useAppStore.getState().settings.autoEntry).toBe(true)

      // Test bot backtest mode where pauseOnSetup is disabled when autoEntry is true
      useAppStore.setState({
        activeEaScriptId: 'bot-1',
        sessionName: 'TestBot · EA',
        settings: {
          strategyId: 'breakout',
          lookback: 20,
          defaultRr: 2.0,
          autoEntry: true,
          pauseOnSetup: false,
          volumeMultiplier: 1.0
        }
      })
      rerender(<StrategyPanel />)
      const pauseOnSetupBot = screen.getByLabelText(/Pause on setup/) as HTMLInputElement
      expect(pauseOnSetupBot.disabled).toBe(true)
    })

    it('stresses CostsPanel with boundary inputs without crashing', () => {
      render(<CostsPanel />)

      const spreadInput = screen.getByDisplayValue('1.5') as HTMLInputElement
      const commissionInput = screen.getByDisplayValue('3.5') as HTMLInputElement

      const testValues = ['-1', '0', '99999999', '', '0.00001']
      for (const val of testValues) {
        fireEvent.change(spreadInput, { target: { value: val } })
        fireEvent.change(commissionInput, { target: { value: val } })
      }

      // Assert costs updated in store
      expect(typeof useAppStore.getState().costs.spread).toBe('number')
      expect(typeof useAppStore.getState().costs.commission).toBe('number')
    })

    it('stresses TradePanel RR presets with active draft trade and rapid clicks', () => {
      useAppStore.setState({
        activeTrade: null,
        draft: {
          direction: 'BUY',
          entry: '1.1000',
          stopLoss: '1.0950',
          takeProfit: '1.1100',
          riskPercent: '1',
          lots: '1.0',
          timestamp: Date.now()
        }
      })

      render(<TradePanel />)

      const rrButtons = screen.getAllByRole('button', { name: /1:/ })
      expect(rrButtons.length).toBe(5)

      // Rapidly click all 5 RR presets 10 times each
      for (let i = 0; i < 10; i++) {
        for (const btn of rrButtons) {
          fireEvent.click(btn)
        }
      }

      // Take profit should be a valid calculated number
      const draft = useAppStore.getState().draft
      expect(draft).not.toBeNull()
      const tp = parseFloat(draft!.takeProfit)
      expect(Number.isFinite(tp)).toBe(true)
      expect(tp).toBeGreaterThan(1.1000)
    })
  })

  // =========================================================================
  // AREA 4: TYPOGRAPHY & LAYOUT STRESS
  // =========================================================================
  describe('Area 4: Typography, Headings & Responsive Layout Stress', () => {
    it('statically audits global.css: asserts ZERO sub-pixel font sizes anywhere', () => {
      const cssPath = path.resolve(__dirname, '../../styles/global.css')
      const cssContent = fs.readFileSync(cssPath, 'utf-8')

      // Check for any decimal pixel font sizes like 10.5px, 11.5px, 12.5px, 14.5px, etc.
      const subPixelMatches = cssContent.match(/font-size:\s*\d+\.\d+px/gi)
      expect(subPixelMatches).toBeNull()
    })

    it('verifies all standard typography scale tokens exist in global.css', () => {
      const cssPath = path.resolve(__dirname, '../../styles/global.css')
      const cssContent = fs.readFileSync(cssPath, 'utf-8')

      const tokens = [
        '--font-2xs',
        '--font-xs',
        '--font-sm',
        '--font-base',
        '--font-md',
        '--font-lg',
        '--font-xl'
      ]

      tokens.forEach((token) => {
        expect(cssContent).toContain(token)
      })
    })

    it('verifies consistent semantic headings across panels', () => {
      // 1. CostsPanel has h3
      const { container: costsContainer } = render(<CostsPanel />)
      expect(costsContainer.querySelector('h3')?.textContent).toBe('Execution assumptions')
      cleanup()

      // 2. StrategyPanel has h3 (shows active strategy name when loaded, or 'Strategy settings')
      useAppStore.setState({ activeStrategyId: null })
      const { container: stratContainer } = render(<StrategyPanel />)
      expect(stratContainer.querySelector('h3')?.textContent).toBe('Strategy settings')
      cleanup()

      // 3. TradePanel has h3 and h4.trade-management-title
      useAppStore.setState({
        draft: {
          direction: 'BUY',
          entry: '1.1000',
          stopLoss: '1.0950',
          takeProfit: '1.1100',
          riskPercent: '1',
          lots: '1.0',
          timestamp: Date.now()
        }
      })
      const { container: tradeContainer } = render(<TradePanel />)
      expect(tradeContainer.querySelector('h3')?.textContent).toBe('Trade')
      expect(tradeContainer.querySelector('h4.trade-management-title')?.textContent).toBe('Target R:R Presets')
      cleanup()
    })

    it('simulates viewport resizing across compact (320px) to ultra-wide (3840px) without errors', () => {
      const viewports = [320, 480, 768, 1024, 1440, 1920, 3840]

      const { container } = render(<TopBar />)

      viewports.forEach((width) => {
        act(() => {
          window.innerWidth = width
          window.innerHeight = 900
          window.dispatchEvent(new Event('resize'))
        })

        expect(container.querySelector('.topbar')).not.toBeNull()
        expect(container.querySelector('.top-controls')).not.toBeNull()
        expect(container.querySelector('.session-chip')).not.toBeNull()
      })
    })
  })

  // =========================================================================
  // AREA 5: THEMES RAPID TOGGLING & DESIGN TOKEN INTEGRITY
  // =========================================================================
  describe('Area 5: Themes Rapid Toggling & Design Token Integrity', () => {
    it('survives rapid theme toggling (100x) and maintains html[data-theme] sync', () => {
      for (let i = 0; i < 100; i++) {
        const nextTheme = i % 2 === 0 ? 'light' : 'dark'
        act(() => {
          useAppStore.getState().setTheme(nextTheme)
        })
        expect(useAppStore.getState().theme).toBe(nextTheme)
        expect(document.documentElement.dataset.theme).toBe(nextTheme)
      }
    })

    it('survives rapid clicking of ThemeToggle component (50x)', () => {
      render(<ThemeToggle />)
      const toggleBtn = screen.getByRole('button', { name: /Theme/ })

      for (let i = 0; i < 50; i++) {
        act(() => {
          fireEvent.click(toggleBtn)
        })
        const expected = i % 2 === 0 ? 'light' : 'dark'
        expect(useAppStore.getState().theme).toBe(expected)
        expect(document.documentElement.dataset.theme).toBe(expected)
      }
    })

    it('survives AppearanceSettings theme swatch switching', () => {
      render(<AppearanceSettings />)

      const lightOption = screen.getByText('Paper').closest('button') as HTMLButtonElement
      const darkOption = screen.getByText('Mono').closest('button') as HTMLButtonElement

      expect(lightOption).not.toBeNull()
      expect(darkOption).not.toBeNull()

      for (let i = 0; i < 10; i++) {
        fireEvent.click(lightOption)
        expect(useAppStore.getState().theme).toBe('light')
        expect(document.documentElement.dataset.theme).toBe('light')

        fireEvent.click(darkOption)
        expect(useAppStore.getState().theme).toBe('dark')
        expect(document.documentElement.dataset.theme).toBe('dark')
      }
    })

    it('asserts core color tokens are defined for both dark (:root) and light (html[data-theme="light"]) in global.css', () => {
      const cssPath = path.resolve(__dirname, '../../styles/global.css')
      const cssContent = fs.readFileSync(cssPath, 'utf-8')

      const rootBlock = /:root\s*\{([^}]+)\}/.exec(cssContent)?.[1] ?? ''
      const lightBlock = /html\[data-theme=['"]light['"]\]\s*\{([^}]+)\}/.exec(cssContent)?.[1] ?? ''

      expect(rootBlock).not.toBe('')
      expect(lightBlock).not.toBe('')

      const requiredTokens = [
        '--ink',
        '--vault',
        '--steel',
        '--plate',
        '--rule',
        '--brand',
        '--on-brand',
        '--parchment',
        '--muted',
        '--bull',
        '--bear'
      ]

      requiredTokens.forEach((token) => {
        expect(rootBlock).toContain(token)
        expect(lightBlock).toContain(token)
      })
    })

    it('verifies zero legacy rgba(18, 22, 18, ...) or hardcoded white borders in global.css', () => {
      const cssPath = path.resolve(__dirname, '../../styles/global.css')
      const cssContent = fs.readFileSync(cssPath, 'utf-8')

      expect(cssContent).not.toMatch(/rgba\(\s*18\s*,\s*22\s*,\s*18/)
      expect(cssContent).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.45\s*\)/)
      expect(cssContent).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.55\s*\)/)
    })
  })
})
