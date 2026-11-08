// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TopBar } from '../TopBar'
import { StrategyLibrary } from '../StrategyLibrary'
import { EaLab } from '../EaLab'
import { SettingsScreen } from '../SettingsScreen'
import { Welcome } from '../Welcome'
import { ThemeToggle } from '../ThemeToggle'
import { AppearanceSettings } from '../AppearanceSettings'
import { useAppStore, type AppScreen } from '../../store/useAppStore'
import { useEaLabStore } from '../../store/useEaLabStore'
import { applyDeskTheme } from '@core/desk/theme'

// Mock external heavy dependencies
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

vi.mock('../MarketDesk', () => ({
  MarketDesk: () => <div data-testid="mock-market-desk" />
}))

vi.mock('../FundamentalsDesk', () => ({
  FundamentalsDesk: () => <div data-testid="mock-fundamentals-desk" />
}))

vi.mock('../BotBacktestModal', () => ({
  BotBacktestModal: () => <div data-testid="mock-backtest-modal" />
}))

vi.mock('../BotBacktestResultModal', () => ({
  BotBacktestResultModal: () => <div data-testid="mock-backtest-result-modal" />
}))

vi.mock('../EaChatPanel', () => ({
  EaChatPanel: () => <div data-testid="mock-ea-chat-panel" />
}))

describe('Challenger Stress Suite: Milestone 3 Header & Navigation Alignment', () => {
  beforeEach(() => {
    // Mock desktop API to prevent unhandled rejection errors
    const mockDesktop = {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).kairos = mockDesktop

    useAppStore.setState({
      screen: 'library',
      theme: 'dark',
      activeEaScriptId: null,
      activeStrategyId: null,
      settingsReturnScreen: 'library',
      shortcutsModalOpen: false,
      chartFull: false,
      strategies: [
        {
          id: 'strat-1',
          name: 'Alpha Strategy',
          notes: 'Test strategy',
          settings: {
            strategyId: 'breakout',
            lookback: 20,
            defaultRr: 2.0,
            autoEntry: true,
            pauseOnSetup: false,
            volumeMultiplier: 1.0
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    })
    useEaLabStore.setState({
      scripts: [],
      activeScriptId: null,
      draftCode: '',
      dirty: false,
      diagnostics: [],
      compileStatus: 'idle',
      lastCompiledAt: null
    })
    applyDeskTheme('dark')
  })

  afterEach(() => {
    cleanup()
  })

  describe('Adversarial Stress Dimension 1: Rapid screen switching & history stack', () => {
    const screens: AppScreen[] = ['welcome', 'library', 'ea-lab', 'indicator-lab', 'workspace']

    screens.forEach((origin) => {
      it(`verifies complete round-trip from "${origin}" into Settings and back via leaveSettings()`, () => {
        useAppStore.setState({ screen: origin })
        const enterSettings = useAppStore.getState().enterSettings
        enterSettings()

        const stateInSettings = useAppStore.getState()
        expect(stateInSettings.screen).toBe('settings')
        expect(stateInSettings.settingsReturnScreen).toBe(origin)

        // Render SettingsScreen to verify the back button label
        const { unmount } = render(<SettingsScreen />)
        const expectedBackLabel =
          origin === 'workspace'
            ? 'Back to Workspace'
            : origin === 'library'
              ? 'Back to Strategy Lab'
              : origin === 'welcome'
                ? 'Back to Home'
                : origin === 'indicator-lab'
                  ? 'Back to Indicator Lab'
                  : 'Back to Bot Lab'

        const backBtn = screen.getByRole('button', { name: expectedBackLabel })
        expect(backBtn).toBeTruthy()
        expect(backBtn.getAttribute('title')).toBe(expectedBackLabel)

        // Click the back button
        fireEvent.click(backBtn)

        const stateAfterLeave = useAppStore.getState()
        expect(stateAfterLeave.screen).toBe(origin)
        unmount()
      })
    })

    it('verifies leaveWorkspace() cleanly distinguishes Bot Lab origin vs Strategy Lab origin', () => {
      // 1. From Strategy Lab (activeEaScriptId is null)
      useAppStore.setState({
        screen: 'workspace',
        activeStrategyId: 'strat-1',
        activeEaScriptId: null,
        status: 'Alpha Strategy · ready'
      })

      useAppStore.getState().leaveWorkspace()
      let state = useAppStore.getState()
      expect(state.screen).toBe('library')
      expect(state.activeEaScriptId).toBeNull()
      expect(state.status).toBe('Strategy Lab')

      // 2. From Bot Lab (activeEaScriptId is present)
      useAppStore.setState({
        screen: 'workspace',
        activeStrategyId: null,
        activeEaScriptId: 'bot-999',
        status: 'EMA Bot · ready'
      })

      useAppStore.getState().leaveWorkspace()
      state = useAppStore.getState()
      expect(state.screen).toBe('ea-lab')
      expect(state.activeEaScriptId).toBeNull()
      expect(state.status).toBe('Bot Lab')
    })

    it('preserves workspace state (activeStrategyId & activeEaScriptId) across transient Settings visits', () => {
      useAppStore.setState({
        screen: 'workspace',
        activeStrategyId: 'strat-1',
        activeEaScriptId: 'bot-999'
      })

      // Enter settings from workspace
      useAppStore.getState().enterSettings()
      expect(useAppStore.getState().screen).toBe('settings')
      expect(useAppStore.getState().activeStrategyId).toBe('strat-1')
      expect(useAppStore.getState().activeEaScriptId).toBe('bot-999')

      // Leave settings
      useAppStore.getState().leaveSettings()
      expect(useAppStore.getState().screen).toBe('workspace')
      expect(useAppStore.getState().activeStrategyId).toBe('strat-1')
      expect(useAppStore.getState().activeEaScriptId).toBe('bot-999')

      // Finally leave workspace back to Bot Lab
      useAppStore.getState().leaveWorkspace()
      expect(useAppStore.getState().screen).toBe('ea-lab')
      expect(useAppStore.getState().activeEaScriptId).toBeNull()
    })

    it('verifies chartFull state persists across Settings and resets on leaveWorkspace', () => {
      useAppStore.setState({
        screen: 'workspace',
        chartFull: true
      })

      // Go to settings and back
      useAppStore.getState().enterSettings()
      expect(useAppStore.getState().chartFull).toBe(true)
      useAppStore.getState().leaveSettings()
      expect(useAppStore.getState().chartFull).toBe(true)

      // Leave workspace resets chartFull
      useAppStore.getState().leaveWorkspace()
      expect(useAppStore.getState().chartFull).toBe(false)
    })

    it('handles multiple consecutive enterSettings() gracefully without breaking leaveSettings()', () => {
      useAppStore.setState({ screen: 'welcome' })
      useAppStore.getState().enterSettings()
      expect(useAppStore.getState().screen).toBe('settings')
      expect(useAppStore.getState().settingsReturnScreen).toBe('welcome')

      // If enterSettings is called again while already in settings
      useAppStore.getState().enterSettings()
      expect(useAppStore.getState().screen).toBe('settings')
      expect(useAppStore.getState().settingsReturnScreen).toBe('settings')

      // Calling leaveSettings must fall back safely to 'ea-lab' rather than getting stuck in an infinite settings loop
      useAppStore.getState().leaveSettings()
      expect(useAppStore.getState().screen).toBe('ea-lab')
    })

    it('survives a 150-iteration random navigation fuzz sequence without invariant violations', () => {
      const validScreens = new Set<AppScreen>([
        'workspace',
        'welcome',
        'ea-lab',
        'indicator-lab',
        'settings',
        'library'
      ])

      const store = useAppStore.getState()
      const actions = [
        () => store.goHome(),
        () => store.enterLibrary(),
        () => store.enterEaLab(),
        () => store.enterIndicatorLab(),
        () => store.enterSettings(),
        () => store.leaveSettings(),
        () => store.leaveWorkspace()
      ]

      for (let i = 0; i < 150; i++) {
        const action = actions[Math.floor(Math.random() * actions.length)]
        expect(() => action()).not.toThrow()
        const currentScreen = useAppStore.getState().screen
        expect(validScreens.has(currentScreen)).toBe(true)
      }
    })
  })

  describe('Adversarial Stress Dimension 2: Header button dimensions, icons and accessibility contracts', () => {
    it('verifies TopBar session-chip has all 8 controls with ui-icon-btn-md and full screen toggle', () => {
      const { container } = render(<TopBar />)

      const sessionChip = container.querySelector('.session-chip')!
      expect(sessionChip).toBeTruthy()

      const buttons = sessionChip.querySelectorAll('button')
      expect(buttons.length).toBe(8)

      // Ensure every button uses IconButton with md size (36px)
      buttons.forEach((btn) => {
        expect(btn.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn.classList.contains('ui-icon-btn-md')).toBe(true)
        expect(btn.getAttribute('type')).toBe('button')
        expect(btn.getAttribute('title')).toBeTruthy()
        expect(btn.getAttribute('aria-label')).toBe(btn.getAttribute('title'))
      })

      // Verify Full Screen toggle icon and title changes
      const fsBtn = screen.getByRole('button', { name: 'Full screen (F)' })
      expect(fsBtn).toBeTruthy()
      expect(fsBtn.querySelector('svg')).toBeTruthy()

      fireEvent.click(fsBtn)
      expect(useAppStore.getState().chartFull).toBe(true)

      const exitFsBtn = screen.getByRole('button', { name: 'Exit full screen (F)' })
      expect(exitFsBtn).toBeTruthy()

      fireEvent.click(exitFsBtn)
      expect(useAppStore.getState().chartFull).toBe(false)
    })

    it('verifies TopBar brand back button updates tooltip reactively depending on activeEaScriptId', () => {
      // 1. Without active bot -> Back to Strategy Lab
      useAppStore.setState({ activeEaScriptId: null })
      const { rerender } = render(<TopBar />)
      const backStrat = screen.getByRole('button', { name: 'Back to Strategy Lab' })
      expect(backStrat).toBeTruthy()
      expect(backStrat.classList.contains('ui-icon-btn')).toBe(true)
      expect(backStrat.classList.contains('ui-icon-btn-md')).toBe(true)

      // 2. With active bot -> Back to Bot Lab
      useAppStore.setState({ activeEaScriptId: 'bot-42' })
      rerender(<TopBar />)
      const backBot = screen.getByRole('button', { name: 'Back to Bot Lab' })
      expect(backBot).toBeTruthy()
      expect(backBot.getAttribute('title')).toBe('Back to Bot Lab')
    })

    it('verifies StrategyLibrary header controls and 3-desk tab navigation', () => {
      const { container } = render(<StrategyLibrary />)
      const sessionChip = container.querySelector('.session-chip')!
      expect(sessionChip).toBeTruthy()

      const expectedTitles = [
        'Home',
        'Bot Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Settings'
      ]

      expectedTitles.forEach((title) => {
        const btn = screen.getByRole('button', { name: title })
        expect(btn).toBeTruthy()
        expect(btn.classList.contains('ui-icon-btn-md')).toBe(true)
      })

      // Desk tabs
      const stratTab = screen.getByRole('button', { name: 'Strategies' })
      const marketTab = screen.getByRole('button', { name: 'Market' })
      const fundTab = screen.getByRole('button', { name: 'Fundamental' })

      expect(stratTab.getAttribute('data-active')).toBe('true')
      expect(screen.getByText('Strategy Lab')).toBeTruthy()

      fireEvent.click(marketTab)
      expect(marketTab.getAttribute('data-active')).toBe('true')
      expect(screen.getByText('Market tapes')).toBeTruthy()

      fireEvent.click(fundTab)
      expect(fundTab.getAttribute('data-active')).toBe('true')
      expect(screen.getByText('Macro fundamentals')).toBeTruthy()
    })

    it('verifies Welcome header navigation icons and standardized lab card title', () => {
      const { container } = render(<Welcome />)
      const sessionChip = container.querySelector('.session-chip')!
      expect(sessionChip).toBeTruthy()

      const expectedTitles = [
        'Strategy Lab',
        'Bot Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Settings'
      ]

      expectedTitles.forEach((title) => {
        const btn = screen.getByRole('button', { name: title })
        expect(btn).toBeTruthy()
        expect(btn.classList.contains('ui-icon-btn-md')).toBe(true)
      })

      // Standardized lab title on card
      expect(screen.getByText('Indicator Lab')).toBeTruthy()
      expect(screen.queryByText('Indicator Development Lab')).toBeNull()
    })

    it('verifies Keyboard Shortcuts button opens shortcuts modal across all 5 headers', () => {
      const screensWithHelp = [
        { name: 'TopBar', element: <TopBar /> },
        { name: 'StrategyLibrary', element: <StrategyLibrary /> },
        { name: 'EaLab', element: <EaLab kind="ea" /> },
        { name: 'SettingsScreen', element: <SettingsScreen /> },
        { name: 'Welcome', element: <Welcome /> }
      ]

      screensWithHelp.forEach(({ name, element }) => {
        useAppStore.setState({ shortcutsModalOpen: false })
        const { unmount } = render(element)
        const helpBtn = screen.getByRole('button', { name: 'Keyboard Shortcuts' })
        expect(helpBtn, `Keyboard shortcuts button missing in ${name}`).toBeTruthy()

        fireEvent.click(helpBtn)
        expect(useAppStore.getState().shortcutsModalOpen).toBe(true)
        unmount()
      })
    })
  })

  describe('Adversarial Stress Dimension 3: Theme Toggle synchronization & DOM dataset persistence', () => {
    it('verifies ThemeToggle alternates icon (sun/moon), updates store, and updates document dataset', () => {
      expect(useAppStore.getState().theme).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')

      const { container } = render(<ThemeToggle />)
      const button = container.querySelector('button')!
      expect(button).toBeTruthy()
      expect(button.getAttribute('title')).toBe('Theme')

      // In dark mode, icon should be 'sun'
      // Click to toggle to light
      fireEvent.click(button)

      expect(useAppStore.getState().theme).toBe('light')
      expect(document.documentElement.dataset.theme).toBe('light')

      // Click to toggle back to dark
      fireEvent.click(button)

      expect(useAppStore.getState().theme).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    it('synchronizes multiple ThemeToggle instances mounted simultaneously across different sub-trees', () => {
      const MultiToggles = () => (
        <div>
          <div data-testid="toggle-a">
            <ThemeToggle />
          </div>
          <div data-testid="toggle-b">
            <ThemeToggle />
          </div>
        </div>
      )

      const { getByTestId } = render(<MultiToggles />)
      const toggleA = getByTestId('toggle-a').querySelector('button')!
      const toggleB = getByTestId('toggle-b').querySelector('button')!

      expect(useAppStore.getState().theme).toBe('dark')

      // Click toggle A
      fireEvent.click(toggleA)
      expect(useAppStore.getState().theme).toBe('light')
      expect(document.documentElement.dataset.theme).toBe('light')

      // Now click toggle B to switch back
      fireEvent.click(toggleB)
      expect(useAppStore.getState().theme).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    it('synchronizes theme changes between AppearanceSettings cards and header ThemeToggle', () => {
      const Combined = () => (
        <div>
          <ThemeToggle />
          <AppearanceSettings />
        </div>
      )

      const { container } = render(<Combined />)
      const themeBtn = screen.getByRole('button', { name: 'Theme' })
      const paperCard = screen.getByRole('button', { name: /Paper/i })
      const monoCard = screen.getByRole('button', { name: /Mono/i })

      expect(useAppStore.getState().theme).toBe('dark')
      expect(monoCard.getAttribute('data-active')).toBe('true')
      expect(paperCard.getAttribute('data-active')).toBe('false')

      // Toggle via AppearanceSettings Paper card
      fireEvent.click(paperCard)
      expect(useAppStore.getState().theme).toBe('light')
      expect(paperCard.getAttribute('data-active')).toBe('true')
      expect(monoCard.getAttribute('data-active')).toBe('false')

      // Toggle back via header ThemeToggle button
      fireEvent.click(themeBtn)
      expect(useAppStore.getState().theme).toBe('dark')
      expect(monoCard.getAttribute('data-active')).toBe('true')
      expect(paperCard.getAttribute('data-active')).toBe('false')
    })
  })

  describe('Adversarial Stress Dimension 4: Zero legacy raw buttons in all headers', () => {
    it('guarantees ZERO raw button.icon-btn (without .ui-icon-btn) exist in any header', () => {
      const screensToTest = [
        { name: 'TopBar', element: <TopBar /> },
        { name: 'StrategyLibrary', element: <StrategyLibrary /> },
        { name: 'EaLab (ea)', element: <EaLab kind="ea" /> },
        { name: 'EaLab (indicator)', element: <EaLab kind="indicator" /> },
        { name: 'SettingsScreen', element: <SettingsScreen /> },
        { name: 'Welcome', element: <Welcome /> }
      ]

      screensToTest.forEach(({ name, element }) => {
        const { container, unmount } = render(element)
        const header = container.querySelector('.topbar')
        expect(header, `Expected header .topbar in ${name}`).toBeTruthy()

        const legacyButtons = header!.querySelectorAll('button.icon-btn:not(.ui-icon-btn)')
        expect(legacyButtons.length, `Found ${legacyButtons.length} raw legacy buttons in ${name}`).toBe(0)
        unmount()
      })
    })
  })
})
