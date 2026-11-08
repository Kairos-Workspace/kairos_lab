// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { TopBar } from '../TopBar'
import { StrategyLibrary } from '../StrategyLibrary'
import { EaLab } from '../EaLab'
import { SettingsScreen } from '../SettingsScreen'
import { Welcome } from '../Welcome'
import { ThemeToggle } from '../ThemeToggle'
import { useAppStore, type AppScreen } from '../../store/useAppStore'
import { useEaLabStore } from '../../store/useEaLabStore'

// Mock heavyweight external dependencies not relevant to header/nav testing
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

describe('Adversarial Stress Suite: Milestone 3 Header & Navigation Alignment', () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: 'welcome',
      theme: 'dark',
      activeEaScriptId: null,
      activeStrategyId: null,
      settingsReturnScreen: 'welcome',
      shortcutsModalOpen: false,
      strategies: [],
      chartFull: false
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
  })

  afterEach(() => {
    cleanup()
  })

  describe('Dimension 1: Exact Header Button Labels & Tooltips Across All 5 Screens', () => {
    it('verifies ThemeToggle adheres strictly to label="Theme" and title="Theme"', () => {
      render(<ThemeToggle />)
      const btn = screen.getByRole('button', { name: 'Theme' })
      expect(btn).toBeTruthy()
      expect(btn.getAttribute('title')).toBe('Theme')
      expect(btn.getAttribute('aria-label')).toBe('Theme')
      expect(btn.classList.contains('ui-icon-btn')).toBe(true)
      expect(btn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(btn.classList.contains('icon-btn')).toBe(false)
    })

    it('verifies TopBar contains exact required header buttons with exact tooltips', () => {
      render(<TopBar />)
      const topbar = document.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const expectedLabels = [
        'Back to Strategy Lab',
        'Home',
        'Strategy Lab',
        'Bot Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Full screen (F)',
        'Theme',
        'Settings'
      ]

      for (const label of expectedLabels) {
        const btn = topbar.querySelector(`button[title="${label}"]`)
        expect(btn, `TopBar button with title "${label}" must exist`).not.toBeNull()
        expect(btn?.getAttribute('aria-label')).toBe(label)
        expect(btn?.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn?.classList.contains('ui-icon-btn-md')).toBe(true)
      }
    })

    it('verifies StrategyLibrary contains exact required header buttons with exact tooltips', () => {
      render(<StrategyLibrary />)
      const topbar = document.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const expectedLabels = [
        'Home',
        'Bot Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Settings',
        'Create strategy'
      ]

      for (const label of expectedLabels) {
        const btn = topbar.querySelector(`button[title="${label}"]`)
        expect(btn, `StrategyLibrary button with title "${label}" must exist`).not.toBeNull()
        expect(btn?.getAttribute('aria-label')).toBe(label)
        expect(btn?.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn?.classList.contains('ui-icon-btn-md')).toBe(true)
      }
    })

    it('verifies EaLab (Bot Lab) contains exact required header buttons with exact tooltips', () => {
      render(<EaLab kind="ea" />)
      const topbar = document.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const expectedLabels = [
        'Home',
        'Strategy Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Settings',
        'New bot',
        'AI chat'
      ]

      for (const label of expectedLabels) {
        const btn = topbar.querySelector(`button[title="${label}"]`)
        expect(btn, `EaLab (ea) button with title "${label}" must exist`).not.toBeNull()
        expect(btn?.getAttribute('aria-label')).toBe(label)
        expect(btn?.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn?.classList.contains('ui-icon-btn-md')).toBe(true)
      }
    })

    it('verifies EaLab (Indicator Lab) contains exact required header buttons with exact tooltips', () => {
      render(<EaLab kind="indicator" />)
      const topbar = document.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const expectedLabels = [
        'Home',
        'Strategy Lab',
        'Bot Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Settings',
        'New indicator',
        'AI chat'
      ]

      for (const label of expectedLabels) {
        const btn = topbar.querySelector(`button[title="${label}"]`)
        expect(btn, `EaLab (indicator) button with title "${label}" must exist`).not.toBeNull()
        expect(btn?.getAttribute('aria-label')).toBe(label)
        expect(btn?.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn?.classList.contains('ui-icon-btn-md')).toBe(true)
      }
    })

    it('verifies SettingsScreen contains exact required header buttons with exact tooltips', () => {
      useAppStore.setState({ settingsReturnScreen: 'welcome' })
      render(<SettingsScreen />)
      const topbar = document.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const expectedLabels = [
        'Home',
        'Strategy Lab',
        'Bot Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Back to Home'
      ]

      for (const label of expectedLabels) {
        const btn = topbar.querySelector(`button[title="${label}"]`)
        expect(btn, `SettingsScreen button with title "${label}" must exist`).not.toBeNull()
        expect(btn?.getAttribute('aria-label')).toBe(label)
        expect(btn?.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn?.classList.contains('ui-icon-btn-md')).toBe(true)
      }
    })

    it('verifies Welcome contains exact required topbar header buttons with exact tooltips', () => {
      render(<Welcome />)
      const topbar = document.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const expectedLabels = [
        'Strategy Lab',
        'Bot Lab',
        'Indicator Lab',
        'Keyboard Shortcuts',
        'Theme',
        'Settings'
      ]

      for (const label of expectedLabels) {
        const btn = topbar.querySelector(`button[title="${label}"]`)
        expect(btn, `Welcome topbar button with title "${label}" must exist`).not.toBeNull()
        expect(btn?.getAttribute('aria-label')).toBe(label)
        expect(btn?.classList.contains('ui-icon-btn')).toBe(true)
        expect(btn?.classList.contains('ui-icon-btn-md')).toBe(true)
      }
    })
  })

  describe('Dimension 2: Exact Subtitles & Naming Alignment', () => {
    it('verifies StrategyLibrary header displays exact subtitle "Strategy Lab" on default desk', () => {
      render(<StrategyLibrary />)
      const brand = document.querySelector('.topbar .brand')!
      expect(brand).toBeTruthy()
      expect(brand.textContent).toContain('Strategy Lab')
      expect(brand.textContent).not.toContain('Strategy library')
    })

    it('verifies EaLab displays exact subtitle "Bot Lab" for kind="ea"', () => {
      render(<EaLab kind="ea" />)
      const brand = document.querySelector('.topbar .brand')!
      expect(brand).toBeTruthy()
      expect(brand.textContent).toContain('Bot Lab')
    })

    it('verifies EaLab displays exact subtitle "Indicator Lab" for kind="indicator"', () => {
      render(<EaLab kind="indicator" />)
      const brand = document.querySelector('.topbar .brand')!
      expect(brand).toBeTruthy()
      expect(brand.textContent).toContain('Indicator Lab')
      expect(brand.textContent).not.toContain('Indicator development')
    })

    it('verifies Welcome screen card displays exact "Indicator Lab" (not "Indicator Development Lab")', () => {
      render(<Welcome />)
      const strongs = Array.from(document.querySelectorAll('.welcome-lab-card strong')).map(
        (el) => el.textContent?.trim()
      )
      expect(strongs).toEqual(['Strategy Lab', 'Bot Lab', 'Indicator Lab'])
      expect(screen.queryByText(/Indicator Development Lab/i)).toBeNull()
    })
  })

  describe('Dimension 3: Contextual Back Buttons Exhaustive State Testing', () => {
    it('verifies TopBar back button contextually updates when activeEaScriptId is null vs set', () => {
      // 1. Without bot
      useAppStore.setState({ activeEaScriptId: null })
      const { unmount } = render(<TopBar />)
      const btnWithoutBot = screen.getByRole('button', { name: 'Back to Strategy Lab' })
      expect(btnWithoutBot).toBeTruthy()
      expect(btnWithoutBot.getAttribute('title')).toBe('Back to Strategy Lab')
      unmount()

      // 2. With bot
      useAppStore.setState({ activeEaScriptId: 'bot-456' })
      render(<TopBar />)
      const btnWithBot = screen.getByRole('button', { name: 'Back to Bot Lab' })
      expect(btnWithBot).toBeTruthy()
      expect(btnWithBot.getAttribute('title')).toBe('Back to Bot Lab')
    })

    it('verifies SettingsScreen back button handles all 5 possible originating screens', () => {
      const origins: { screen: AppScreen; expectedLabel: string }[] = [
        { screen: 'workspace', expectedLabel: 'Back to Workspace' },
        { screen: 'library', expectedLabel: 'Back to Strategy Lab' },
        { screen: 'ea-lab', expectedLabel: 'Back to Bot Lab' },
        { screen: 'indicator-lab', expectedLabel: 'Back to Indicator Lab' },
        { screen: 'welcome', expectedLabel: 'Back to Home' }
      ]

      for (const origin of origins) {
        useAppStore.setState({ settingsReturnScreen: origin.screen })
        const { unmount } = render(<SettingsScreen />)
        const backBtn = screen.getByRole('button', { name: origin.expectedLabel })
        expect(backBtn, `Back button for ${origin.screen} must be "${origin.expectedLabel}"`).toBeTruthy()
        expect(backBtn.getAttribute('title')).toBe(origin.expectedLabel)

        // Trigger click and verify return
        fireEvent.click(backBtn)
        expect(useAppStore.getState().screen).toBe(origin.screen)
        unmount()
      }
    })

    it('verifies SettingsScreen defensive fallback when settingsReturnScreen is corrupted/settings', () => {
      useAppStore.setState({ settingsReturnScreen: 'settings' })
      render(<SettingsScreen />)
      // When settingsReturnScreen is 'settings', labCopy falls back to ea -> 'Back to Bot Lab'
      const backBtn = screen.getByRole('button', { name: 'Back to Bot Lab' })
      expect(backBtn).toBeTruthy()
      fireEvent.click(backBtn)
      // Defensive fallback returns to 'ea-lab', not stuck on 'settings'
      expect(useAppStore.getState().screen).toBe('ea-lab')
    })
  })

  describe('Dimension 4: Empirical Screen Switching Cycle & Active States', () => {
    it('executes full navigation cycle: Home -> Strategy Lab -> Bot Lab -> Indicator Lab -> Settings -> Workspace -> Home', () => {
      // Step 1: Start at Home (Welcome)
      useAppStore.setState({ screen: 'welcome' })
      const res1 = render(<Welcome />)
      expect(useAppStore.getState().screen).toBe('welcome')

      // Home -> Strategy Lab
      const toStratBtn = screen.getByRole('button', { name: 'Strategy Lab' })
      fireEvent.click(toStratBtn)
      expect(useAppStore.getState().screen).toBe('library')
      res1.unmount()

      // Step 2: In Strategy Lab -> Bot Lab
      const res2 = render(<StrategyLibrary />)
      const toBotBtn = screen.getByRole('button', { name: 'Bot Lab' })
      fireEvent.click(toBotBtn)
      expect(useAppStore.getState().screen).toBe('ea-lab')
      res2.unmount()

      // Step 3: In Bot Lab -> Indicator Lab
      const res3 = render(<EaLab kind="ea" />)
      const toIndBtn = screen.getByRole('button', { name: 'Indicator Lab' })
      fireEvent.click(toIndBtn)
      expect(useAppStore.getState().screen).toBe('indicator-lab')
      res3.unmount()

      // Step 4: In Indicator Lab -> Settings
      const res4 = render(<EaLab kind="indicator" />)
      const toSettingsBtn = screen.getByRole('button', { name: 'Settings' })
      fireEvent.click(toSettingsBtn)
      expect(useAppStore.getState().screen).toBe('settings')
      expect(useAppStore.getState().settingsReturnScreen).toBe('indicator-lab')
      res4.unmount()

      // Step 5: In Settings -> Back to Indicator Lab
      const res5 = render(<SettingsScreen />)
      const backToIndBtn = screen.getByRole('button', { name: 'Back to Indicator Lab' })
      fireEvent.click(backToIndBtn)
      expect(useAppStore.getState().screen).toBe('indicator-lab')
      res5.unmount()

      // Step 6: Enter Workspace
      act(() => {
        useAppStore.setState({ screen: 'workspace', activeEaScriptId: null })
      })
      const res6 = render(<TopBar />)
      expect(useAppStore.getState().screen).toBe('workspace')

      // Workspace -> Home
      const toHomeFromWorkspace = screen.getByRole('button', { name: 'Home' })
      fireEvent.click(toHomeFromWorkspace)
      expect(useAppStore.getState().screen).toBe('welcome')
      res6.unmount()

      // Step 7: Back at Welcome
      const res7 = render(<Welcome />)
      expect(document.querySelector('.welcome-screen')).toBeTruthy()
      res7.unmount()
    })

    it('verifies dynamic active button states in EaLab for AI Chat and New Indicator Menu', () => {
      // 1. Test AI chat toggle in EaLab
      const { unmount } = render(<EaLab kind="ea" />)
      const aiChatBtn = screen.getByRole('button', { name: 'AI chat' })
      expect(aiChatBtn.getAttribute('data-active')).toBeNull()

      // Click to open chat
      fireEvent.click(aiChatBtn)
      expect(aiChatBtn.getAttribute('data-active')).toBe('true')

      // Click to close chat
      fireEvent.click(aiChatBtn)
      expect(aiChatBtn.getAttribute('data-active')).toBeNull()
      unmount()

      // 2. Test NewIndicatorMenu in EaLab kind="indicator"
      render(<EaLab kind="indicator" />)
      const newIndicatorBtn = screen.getByRole('button', { name: 'New indicator' })
      expect(newIndicatorBtn.getAttribute('data-active')).toBeNull()
      expect(newIndicatorBtn.getAttribute('aria-expanded')).toBe('false')

      // Click to open indicator menu popover
      fireEvent.click(newIndicatorBtn)
      expect(newIndicatorBtn.getAttribute('data-active')).toBe('true')
      expect(newIndicatorBtn.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('menu')).toBeTruthy()
      expect(screen.getByRole('menuitem', { name: /MQL5/i })).toBeTruthy()
      expect(screen.getByRole('menuitem', { name: /Pine Script/i })).toBeTruthy()

      // Click again to close
      fireEvent.click(newIndicatorBtn)
      expect(newIndicatorBtn.getAttribute('data-active')).toBeNull()
      expect(newIndicatorBtn.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('verifies Full screen (F) toggle button updates label, title, and icon dynamically', () => {
      render(<TopBar />)
      const fsBtn = screen.getByRole('button', { name: 'Full screen (F)' })
      expect(fsBtn).toBeTruthy()
      expect(useAppStore.getState().chartFull).toBe(false)

      // Toggle fullscreen
      fireEvent.click(fsBtn)
      expect(useAppStore.getState().chartFull).toBe(true)

      const exitFsBtn = screen.getByRole('button', { name: 'Exit full screen (F)' })
      expect(exitFsBtn).toBeTruthy()
      expect(exitFsBtn.getAttribute('title')).toBe('Exit full screen (F)')

      // Toggle back
      fireEvent.click(exitFsBtn)
      expect(useAppStore.getState().chartFull).toBe(false)
      expect(screen.getByRole('button', { name: 'Full screen (F)' })).toBeTruthy()
    })

    it('verifies StrategyLibrary desk navigation tabs update active state and action button', () => {
      render(<StrategyLibrary />)
      // Strategies Desk
      const stratTab = screen.getByRole('button', { name: 'Strategies' })
      const marketTab = screen.getByRole('button', { name: 'Market' })
      const fundTab = screen.getByRole('button', { name: 'Fundamental' })

      expect(stratTab.getAttribute('data-active')).toBe('true')
      expect(marketTab.getAttribute('data-active')).toBe('false')
      expect(screen.getByRole('button', { name: 'Create strategy' })).toBeTruthy()

      // Switch to Market Desk
      fireEvent.click(marketTab)
      expect(stratTab.getAttribute('data-active')).toBe('false')
      expect(marketTab.getAttribute('data-active')).toBe('true')
      expect(screen.getByRole('button', { name: 'Download market tape' })).toBeTruthy()

      // Switch to Fundamental Desk
      fireEvent.click(fundTab)
      expect(fundTab.getAttribute('data-active')).toBe('true')
      expect(screen.getByRole('button', { name: 'Macro fundamentals' })).toBeTruthy()

      // Switch back to Strategies Desk
      fireEvent.click(stratTab)
      expect(stratTab.getAttribute('data-active')).toBe('true')
      expect(screen.getByRole('button', { name: 'Create strategy' })).toBeTruthy()
    })
  })

  describe('Dimension 5: Absence of Raw icon-btn in Topbar Headers Across All Screens', () => {
    it('confirms zero raw <button className="icon-btn"> exist in any .topbar across all 5 screens', () => {
      const screens = [
        { name: 'TopBar', component: <TopBar /> },
        { name: 'StrategyLibrary', component: <StrategyLibrary /> },
        { name: 'EaLab (ea)', component: <EaLab kind="ea" /> },
        { name: 'EaLab (indicator)', component: <EaLab kind="indicator" /> },
        { name: 'SettingsScreen', component: <SettingsScreen /> },
        { name: 'Welcome', component: <Welcome /> }
      ]

      for (const s of screens) {
        const { container, unmount } = render(s.component)
        const topbar = container.querySelector('.topbar')
        expect(topbar, `${s.name} must render a .topbar header`).not.toBeNull()

        // Check for any button with class icon-btn that does not have ui-icon-btn
        const rawLegacyButtons = topbar!.querySelectorAll('button.icon-btn:not(.ui-icon-btn)')
        expect(
          rawLegacyButtons.length,
          `${s.name} topbar has ${rawLegacyButtons.length} raw legacy .icon-btn buttons!`
        ).toBe(0)

        // Check that every button in .session-chip has ui-icon-btn and ui-icon-btn-md
        const sessionButtons = topbar!.querySelectorAll('.session-chip button')
        expect(sessionButtons.length, `${s.name} session-chip should have buttons`).toBeGreaterThan(0)
        sessionButtons.forEach((btn, idx) => {
          expect(
            btn.classList.contains('ui-icon-btn'),
            `${s.name} session-chip button #${idx} (${btn.getAttribute('title')}) missing .ui-icon-btn`
          ).toBe(true)
          expect(
            btn.classList.contains('ui-icon-btn-md'),
            `${s.name} session-chip button #${idx} (${btn.getAttribute('title')}) missing .ui-icon-btn-md`
          ).toBe(true)
        })

        unmount()
      }
    })
  })

  describe('Dimension 6: Adversarial Stress & Rapid State Transitions', () => {
    it('survives 100 rapid screen transitions without throwing or corrupting store state', () => {
      const screenCycle: AppScreen[] = ['welcome', 'library', 'ea-lab', 'indicator-lab', 'settings', 'workspace']

      expect(() => {
        for (let i = 0; i < 100; i++) {
          const nextScreen = screenCycle[i % screenCycle.length]
          if (nextScreen === 'welcome') useAppStore.getState().goHome()
          else if (nextScreen === 'library') useAppStore.getState().enterLibrary()
          else if (nextScreen === 'ea-lab') useAppStore.getState().enterEaLab()
          else if (nextScreen === 'indicator-lab') useAppStore.getState().enterIndicatorLab()
          else if (nextScreen === 'settings') useAppStore.getState().enterSettings()
          else if (nextScreen === 'workspace') useAppStore.setState({ screen: 'workspace' })
        }
      }).not.toThrow()

      expect(useAppStore.getState().screen).toBe(screenCycle[99 % screenCycle.length])
    })

    it('survives 50 rapid theme toggles via ThemeToggle component', () => {
      render(<ThemeToggle />)
      const btn = screen.getByRole('button', { name: 'Theme' })

      for (let i = 0; i < 50; i++) {
        fireEvent.click(btn)
        expect(useAppStore.getState().theme).toBe(i % 2 === 0 ? 'light' : 'dark')
      }
    })
  })
})
