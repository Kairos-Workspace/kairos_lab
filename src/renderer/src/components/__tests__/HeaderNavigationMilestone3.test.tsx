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
import { useAppStore } from '../../store/useAppStore'
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

describe('Milestone 3: Header & Navigation Alignment', () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: 'library',
      theme: 'dark',
      activeEaScriptId: null,
      activeStrategyId: null,
      settingsReturnScreen: 'library',
      shortcutsModalOpen: false,
      strategies: []
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

  describe('Requirement 1 & 2: Standardized Naming, Subtitles & Tooltips', () => {
    it('verifies ThemeToggle renders with design system IconButton and title="Theme"', () => {
      render(<ThemeToggle />)
      const themeBtn = screen.getByRole('button', { name: 'Theme' })
      expect(themeBtn).toBeTruthy()
      expect(themeBtn.getAttribute('title')).toBe('Theme')
      expect(themeBtn.getAttribute('aria-label')).toBe('Theme')
      expect(themeBtn.classList.contains('ui-icon-btn')).toBe(true)
      expect(themeBtn.classList.contains('ui-icon-btn-md')).toBe(true)

      // Test theme toggling
      expect(useAppStore.getState().theme).toBe('dark')
      fireEvent.click(themeBtn)
      expect(useAppStore.getState().theme).toBe('light')
      fireEvent.click(themeBtn)
      expect(useAppStore.getState().theme).toBe('dark')
    })

    it('verifies StrategyLibrary header displays subtitle "Strategy Lab" and standardized tooltips', () => {
      render(<StrategyLibrary />)
      // Check subtitle
      expect(screen.getByText('Strategy Lab')).toBeTruthy()

      // Standard tooltips in session chip
      const homeBtn = screen.getByRole('button', { name: 'Home' })
      const botLabBtn = screen.getByRole('button', { name: 'Bot Lab' })
      const indicatorLabBtn = screen.getByRole('button', { name: 'Indicator Lab' })
      const shortcutsBtn = screen.getByRole('button', { name: 'Keyboard Shortcuts' })
      const themeBtn = screen.getByRole('button', { name: 'Theme' })
      const settingsBtn = screen.getByRole('button', { name: 'Settings' })

      expect(homeBtn.getAttribute('title')).toBe('Home')
      expect(botLabBtn.getAttribute('title')).toBe('Bot Lab')
      expect(indicatorLabBtn.getAttribute('title')).toBe('Indicator Lab')
      expect(shortcutsBtn.getAttribute('title')).toBe('Keyboard Shortcuts')
      expect(themeBtn.getAttribute('title')).toBe('Theme')
      expect(settingsBtn.getAttribute('title')).toBe('Settings')

      // All buttons use IconButton (ui-icon-btn-md)
      expect(homeBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(botLabBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(indicatorLabBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(shortcutsBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(themeBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(settingsBtn.classList.contains('ui-icon-btn-md')).toBe(true)

      // Verify actions
      fireEvent.click(homeBtn)
      expect(useAppStore.getState().screen).toBe('welcome')

      fireEvent.click(botLabBtn)
      expect(useAppStore.getState().screen).toBe('ea-lab')

      fireEvent.click(indicatorLabBtn)
      expect(useAppStore.getState().screen).toBe('indicator-lab')

      fireEvent.click(settingsBtn)
      expect(useAppStore.getState().screen).toBe('settings')

      fireEvent.click(shortcutsBtn)
      expect(useAppStore.getState().shortcutsModalOpen).toBe(true)
    })

    it('verifies TopBar header displays standardized back button, quick navigation, and tooltips', () => {
      render(<TopBar />)
      // Back button title defaults to "Back to Strategy Lab"
      const backBtn = screen.getByRole('button', { name: 'Back to Strategy Lab' })
      expect(backBtn).toBeTruthy()
      expect(backBtn.getAttribute('title')).toBe('Back to Strategy Lab')
      expect(backBtn.classList.contains('ui-icon-btn-md')).toBe(true)

      // Quick access buttons in session-chip
      const homeBtn = screen.getByRole('button', { name: 'Home' })
      const strategyBtn = screen.getByRole('button', { name: 'Strategy Lab' })
      const botLabBtn = screen.getByRole('button', { name: 'Bot Lab' })
      const indicatorLabBtn = screen.getByRole('button', { name: 'Indicator Lab' })
      const shortcutsBtn = screen.getByRole('button', { name: 'Keyboard Shortcuts' })
      const themeBtn = screen.getByRole('button', { name: 'Theme' })
      const settingsBtn = screen.getByRole('button', { name: 'Settings' })

      expect(homeBtn.getAttribute('title')).toBe('Home')
      expect(strategyBtn.getAttribute('title')).toBe('Strategy Lab')
      expect(botLabBtn.getAttribute('title')).toBe('Bot Lab')
      expect(indicatorLabBtn.getAttribute('title')).toBe('Indicator Lab')
      expect(shortcutsBtn.getAttribute('title')).toBe('Keyboard Shortcuts')
      expect(themeBtn.getAttribute('title')).toBe('Theme')
      expect(settingsBtn.getAttribute('title')).toBe('Settings')

      // Check actions
      fireEvent.click(homeBtn)
      expect(useAppStore.getState().screen).toBe('welcome')

      fireEvent.click(strategyBtn)
      expect(useAppStore.getState().screen).toBe('library')

      fireEvent.click(botLabBtn)
      expect(useAppStore.getState().screen).toBe('ea-lab')

      fireEvent.click(indicatorLabBtn)
      expect(useAppStore.getState().screen).toBe('indicator-lab')

      fireEvent.click(settingsBtn)
      expect(useAppStore.getState().screen).toBe('settings')
    })

    it('verifies TopBar back button updates title to "Back to Bot Lab" when activeEaScriptId is set', () => {
      useAppStore.setState({ activeEaScriptId: 'bot-123' })
      render(<TopBar />)
      const backBtn = screen.getByRole('button', { name: 'Back to Bot Lab' })
      expect(backBtn).toBeTruthy()
      expect(backBtn.getAttribute('title')).toBe('Back to Bot Lab')
    })

    it('verifies EaLab header displays standardized subtitles, tooltips, and separates AI chat from Bot Lab', () => {
      // 1. Test EA mode (Bot Lab)
      const { container, unmount } = render(<EaLab kind="ea" />)
      expect(screen.getByText('Bot Lab')).toBeTruthy()

      const topbar = container.querySelector('.topbar')!
      expect(topbar).toBeTruthy()

      const homeBtn = topbar.querySelector('button[title="Home"]')!
      const strategyBtn = topbar.querySelector('button[title="Strategy Lab"]')!
      const siblingIndicatorBtn = topbar.querySelector('button[title="Indicator Lab"]')!
      const shortcutsBtn = topbar.querySelector('button[title="Keyboard Shortcuts"]')!
      const themeBtn = topbar.querySelector('button[title="Theme"]')!
      const settingsBtn = topbar.querySelector('button[title="Settings"]')!
      const aiChatBtn = topbar.querySelector('button[title="AI chat"]')!
      const newBotBtn = topbar.querySelector('button[title="New bot"]')!

      expect(homeBtn.getAttribute('title')).toBe('Home')
      expect(strategyBtn.getAttribute('title')).toBe('Strategy Lab')
      expect(siblingIndicatorBtn.getAttribute('title')).toBe('Indicator Lab')
      expect(shortcutsBtn.getAttribute('title')).toBe('Keyboard Shortcuts')
      expect(themeBtn.getAttribute('title')).toBe('Theme')
      expect(settingsBtn.getAttribute('title')).toBe('Settings')
      expect(aiChatBtn.getAttribute('title')).toBe('AI chat')
      expect(newBotBtn.getAttribute('title')).toBe('New bot')

      // All header buttons use IconButton
      expect(homeBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(strategyBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(siblingIndicatorBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(shortcutsBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(themeBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(settingsBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(aiChatBtn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(newBotBtn.classList.contains('ui-icon-btn-md')).toBe(true)

      unmount()

      // 2. Test Indicator mode (Indicator Lab)
      const resIndicator = render(<EaLab kind="indicator" />)
      expect(screen.getByText('Indicator Lab')).toBeTruthy()

      const indicatorTopbar = resIndicator.container.querySelector('.topbar')!
      const siblingBotBtn = indicatorTopbar.querySelector('button[title="Bot Lab"]')!
      const newIndicatorBtn = indicatorTopbar.querySelector('button[title="New indicator"]')!
      const indicatorAiChatBtn = indicatorTopbar.querySelector('button[title="AI chat"]')!

      expect(siblingBotBtn.getAttribute('title')).toBe('Bot Lab')
      expect(newIndicatorBtn.getAttribute('title')).toBe('New indicator')
      expect(indicatorAiChatBtn.getAttribute('title')).toBe('AI chat')

      // Bot Lab navigation and AI chat toggle are distinctly separate buttons
      expect(siblingBotBtn).not.toBe(indicatorAiChatBtn)
      fireEvent.click(siblingBotBtn)
      expect(useAppStore.getState().screen).toBe('ea-lab')
    })

    it('verifies SettingsScreen header displays quick navigation and standardized back button tooltip', () => {
      // 1. Return to Strategy Lab
      useAppStore.setState({ settingsReturnScreen: 'library' })
      const { unmount } = render(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Strategy Lab' })).toBeTruthy()

      // Verify other navigation buttons in SettingsScreen
      expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Strategy Lab' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Bot Lab' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Indicator Lab' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Keyboard Shortcuts' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Theme' })).toBeTruthy()

      unmount()

      // 2. Return to Bot Lab
      useAppStore.setState({ settingsReturnScreen: 'ea-lab' })
      const res2 = render(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Bot Lab' })).toBeTruthy()
      res2.unmount()

      // 3. Return to Indicator Lab
      useAppStore.setState({ settingsReturnScreen: 'indicator-lab' })
      const res3 = render(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Indicator Lab' })).toBeTruthy()
      res3.unmount()

      // 4. Return to Workspace
      useAppStore.setState({ settingsReturnScreen: 'workspace' })
      const res4 = render(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Workspace' })).toBeTruthy()
      res4.unmount()

      // 5. Return to Home
      useAppStore.setState({ settingsReturnScreen: 'welcome' })
      const res5 = render(<SettingsScreen />)
      expect(screen.getByRole('button', { name: 'Back to Home' })).toBeTruthy()
      res5.unmount()
    })

    it('verifies Welcome screen displays top navigation bar and standardized card title "Indicator Lab"', () => {
      render(<Welcome />)
      // Check standardized card title (must NOT be "Indicator Development Lab")
      expect(screen.getByText('Indicator Lab')).toBeTruthy()
      expect(screen.queryByText('Indicator Development Lab')).toBeNull()

      // Check topbar presence
      const topbar = document.querySelector('.topbar')
      expect(topbar).toBeTruthy()

      // Check quick navigation icons in topbar
      const strategyBtn = screen.getByRole('button', { name: 'Strategy Lab' })
      const botLabBtn = screen.getByRole('button', { name: 'Bot Lab' })
      const indicatorLabBtn = screen.getByRole('button', { name: 'Indicator Lab' })
      const shortcutsBtn = screen.getByRole('button', { name: 'Keyboard Shortcuts' })
      const themeBtn = screen.getByRole('button', { name: 'Theme' })
      const settingsBtn = screen.getByRole('button', { name: 'Settings' })

      expect(strategyBtn).toBeTruthy()
      expect(botLabBtn).toBeTruthy()
      expect(indicatorLabBtn).toBeTruthy()
      expect(shortcutsBtn).toBeTruthy()
      expect(themeBtn).toBeTruthy()
      expect(settingsBtn).toBeTruthy()

      // Verify clicking quick navigation from Welcome
      fireEvent.click(strategyBtn)
      expect(useAppStore.getState().screen).toBe('library')

      fireEvent.click(botLabBtn)
      expect(useAppStore.getState().screen).toBe('ea-lab')

      fireEvent.click(indicatorLabBtn)
      expect(useAppStore.getState().screen).toBe('indicator-lab')

      fireEvent.click(settingsBtn)
      expect(useAppStore.getState().screen).toBe('settings')
    })
  })

  describe('Requirement 3: Zero Raw Header Buttons (Design System Migration)', () => {
    it('confirms TopBar has ZERO legacy raw .icon-btn in .topbar', () => {
      const { container } = render(<TopBar />)
      const rawLegacyBtns = container.querySelectorAll('.topbar button.icon-btn:not(.ui-icon-btn)')
      expect(rawLegacyBtns.length).toBe(0)
    })

    it('confirms StrategyLibrary has ZERO legacy raw .icon-btn in .topbar', () => {
      const { container } = render(<StrategyLibrary />)
      const rawLegacyBtns = container.querySelectorAll('.topbar button.icon-btn:not(.ui-icon-btn)')
      expect(rawLegacyBtns.length).toBe(0)
    })

    it('confirms EaLab has ZERO legacy raw .icon-btn in .topbar', () => {
      const { container } = render(<EaLab kind="ea" />)
      const rawLegacyBtns = container.querySelectorAll('.topbar button.icon-btn:not(.ui-icon-btn)')
      expect(rawLegacyBtns.length).toBe(0)
    })

    it('confirms SettingsScreen has ZERO legacy raw .icon-btn in .topbar', () => {
      const { container } = render(<SettingsScreen />)
      const rawLegacyBtns = container.querySelectorAll('.topbar button.icon-btn:not(.ui-icon-btn)')
      expect(rawLegacyBtns.length).toBe(0)
    })

    it('confirms Welcome has ZERO legacy raw .icon-btn in .topbar', () => {
      const { container } = render(<Welcome />)
      const rawLegacyBtns = container.querySelectorAll('.topbar button.icon-btn:not(.ui-icon-btn)')
      expect(rawLegacyBtns.length).toBe(0)
    })
  })

  describe('useAppStore: status constant alignment', () => {
    it('sets status to "Strategy Lab" when leaving workspace without active bot', () => {
      useAppStore.setState({
        screen: 'workspace',
        activeEaScriptId: null
      })
      useAppStore.getState().leaveWorkspace()
      expect(useAppStore.getState().status).toBe('Strategy Lab')
      expect(useAppStore.getState().screen).toBe('library')
    })

    it('sets status to "Bot Lab" when leaving workspace with active bot', () => {
      useAppStore.setState({
        screen: 'workspace',
        activeEaScriptId: 'bot-123'
      })
      useAppStore.getState().leaveWorkspace()
      expect(useAppStore.getState().status).toBe('Bot Lab')
      expect(useAppStore.getState().screen).toBe('ea-lab')
    })
  })
})
