// @vitest-environment happy-dom
import React, { createRef, useState } from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Modal } from '../ui/Modal'
import { Checkbox } from '../ui/Checkbox'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Badge } from '../ui/Badge'
import { FormField } from '../ui/FormField'
import { ThemeToggle } from '../ThemeToggle'
import { Welcome } from '../Welcome'
import { SettingsScreen } from '../SettingsScreen'
import { TopBar } from '../TopBar'
import { StrategyLibrary } from '../StrategyLibrary'
import { EaLab } from '../EaLab'
import { CostsPanel } from '../CostsPanel'
import { StrategyPanel } from '../StrategyPanel'
import { useAppStore, type AppScreen } from '../../store/useAppStore'
import { useEaLabStore } from '../../store/useEaLabStore'
import { DEFAULT_COSTS, DEFAULT_STRATEGY_SETTINGS } from '@shared/constants'

// Mock external heavy dependencies to isolate UI testing
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

describe('Challenger Tier 5 Adversarial Verification Suite: Milestone 5', () => {
  const cssPath = path.resolve(__dirname, '../../styles/global.css')
  const globalCss = fs.readFileSync(cssPath, 'utf-8')

  beforeEach(() => {
    useAppStore.setState({
      screen: 'welcome',
      theme: 'dark',
      activeEaScriptId: null,
      activeStrategyId: null,
      costs: { ...DEFAULT_COSTS },
      settings: { ...DEFAULT_STRATEGY_SETTINGS },
      strategies: []
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. MODAL RESILIENCE & ADVERSARIAL FAILURE MODES
  // =========================================================================
  describe('1. Modal Resilience & Failure Modes', () => {
    it('does not trigger onClose on backdrop click when closeOnBackdropClick is false', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnBackdropClick={false} title="Locked Modal">
          <p>Protected download in progress</p>
        </Modal>
      )

      const backdrop = document.querySelector('.ui-modal-backdrop') as HTMLElement
      expect(backdrop).not.toBeNull()

      fireEvent.mouseDown(backdrop)
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('does not trigger onClose on Escape keydown when closeOnEscape is false', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnEscape={false} title="Locked Modal">
          <p>Protected download in progress</p>
        </Modal>
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('survives rapid-fire 50 Escape key events cleanly without throwing', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} title="Escape Bombardment">
          <p>Modal body content</p>
        </Modal>
      )

      for (let i = 0; i < 50; i++) {
        fireEvent.keyDown(window, { key: 'Escape' })
      }
      expect(handleClose).toHaveBeenCalledTimes(50)
    })

    it('does not trigger onClose when mousedown originates on inner modal container or content', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} title="Inner Click Test">
          <button type="button" data-testid="inner-button">Inner Button</button>
        </Modal>
      )

      const container = document.querySelector('.ui-modal-container') as HTMLElement
      const button = screen.getByTestId('inner-button')

      fireEvent.mouseDown(container)
      fireEvent.mouseDown(button)
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('does not render close button when showCloseButton is false', () => {
      render(
        <Modal open={true} onClose={vi.fn()} showCloseButton={false} title="No Close Button">
          <p>Modal Content</p>
        </Modal>
      )

      const closeBtn = document.querySelector('.ui-modal-close')
      expect(closeBtn).toBeNull()
    })

    it('supports dynamic modal size variants without breaking layout classes', () => {
      const { rerender } = render(
        <Modal open={true} onClose={vi.fn()} size="sm" title="Size Test">
          <p>Body</p>
        </Modal>
      )
      expect(document.querySelector('.ui-modal-sm')).not.toBeNull()

      rerender(
        <Modal open={true} onClose={vi.fn()} size="md" title="Size Test">
          <p>Body</p>
        </Modal>
      )
      expect(document.querySelector('.ui-modal-md')).not.toBeNull()

      rerender(
        <Modal open={true} onClose={vi.fn()} size="lg" title="Size Test">
          <p>Body</p>
        </Modal>
      )
      expect(document.querySelector('.ui-modal-lg')).not.toBeNull()

      rerender(
        <Modal open={true} onClose={vi.fn()} size="xl" title="Size Test">
          <p>Body</p>
        </Modal>
      )
      expect(document.querySelector('.ui-modal-xl')).not.toBeNull()
    })

    it('unmounts cleanly and removes event listeners when open becomes false', () => {
      const handleClose = vi.fn()
      const { rerender } = render(
        <Modal open={true} onClose={handleClose} title="Unmount Test">
          <p>Body</p>
        </Modal>
      )

      expect(document.querySelector('.ui-modal-backdrop')).not.toBeNull()

      rerender(
        <Modal open={false} onClose={handleClose} title="Unmount Test">
          <p>Body</p>
        </Modal>
      )

      expect(document.querySelector('.ui-modal-backdrop')).toBeNull()

      // Further Escape keys after close must not trigger handler
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // 2. CHECKBOX COMPONENT ADVERSARIAL STRESS
  // =========================================================================
  describe('2. Checkbox Component Adversarial Stress', () => {
    it('correctly forwards ref and supports indeterminate DOM state', () => {
      const ref = createRef<HTMLInputElement>()
      render(<Checkbox ref={ref} label="Indeterminate Checkbox" />)

      expect(ref.current).not.toBeNull()
      expect(ref.current instanceof HTMLInputElement).toBe(true)

      // Set indeterminate
      act(() => {
        if (ref.current) ref.current.indeterminate = true
      })
      expect(ref.current?.indeterminate).toBe(true)
    })

    it('strictly suppresses click events and state changes when disabled', () => {
      const handleChange = vi.fn()
      const { container } = render(
        <Checkbox
          disabled={true}
          label="Disabled Checkbox"
          description="Cannot be checked"
          onChange={handleChange}
        />
      )

      const label = container.querySelector('label') as HTMLLabelElement
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.disabled).toBe(true)

      fireEvent.click(label)
      fireEvent.click(input)

      expect(handleChange).not.toHaveBeenCalled()
      expect(input.checked).toBe(false)
    })

    it('renders error styling and keeps accessible structure', () => {
      const { container } = render(
        <Checkbox error="This field is required" label="Accept Terms" />
      )
      const label = container.querySelector('.ui-checkbox')
      expect(label?.classList.contains('ui-checkbox-error')).toBe(true)
    })

    it('supports rich ReactNode label and description content', () => {
      render(
        <Checkbox
          label={<span data-testid="rich-label">Agree to <strong>Policy</strong></span>}
          description={<span data-testid="rich-desc">Read <a href="#test">Terms</a></span>}
        />
      )

      expect(screen.getByTestId('rich-label')).not.toBeNull()
      expect(screen.getByTestId('rich-desc')).not.toBeNull()
    })
  })

  // =========================================================================
  // 3. BUTTON & ICONBUTTON ADVERSARIAL VERIFICATION
  // =========================================================================
  describe('3. Button & IconButton Invariants', () => {
    it('renders all standard IconButton sizes (sm: 28px, md: 36px, lg: 42px)', () => {
      const { rerender } = render(<IconButton icon="home" label="Home" size="sm" />)
      expect(document.querySelector('.ui-icon-btn-sm')).not.toBeNull()

      rerender(<IconButton icon="home" label="Home" size="md" />)
      expect(document.querySelector('.ui-icon-btn-md')).not.toBeNull()

      rerender(<IconButton icon="home" label="Home" size="lg" />)
      expect(document.querySelector('.ui-icon-btn-lg')).not.toBeNull()
    })

    it('suppresses onClick when IconButton is disabled even under rapid spam clicks', () => {
      const handleClick = vi.fn()
      render(<IconButton icon="trash" label="Delete" disabled={true} onClick={handleClick} />)

      const btn = screen.getByRole('button', { name: 'Delete' })
      for (let i = 0; i < 20; i++) {
        fireEvent.click(btn)
      }
      expect(handleClick).not.toHaveBeenCalled()
    })

    it('renders IconButton with active state data attribute', () => {
      const { rerender } = render(<IconButton icon="chat" label="AI Chat" active={true} />)
      const btn = screen.getByRole('button', { name: 'AI Chat' })
      expect(btn.getAttribute('data-active')).toBe('true')

      rerender(<IconButton icon="chat" label="AI Chat" active={false} />)
      expect(btn.getAttribute('data-active')).toBeNull()
    })

    it('renders Button with standard variants and disabled resilience', () => {
      const handleClick = vi.fn()
      render(
        <Button variant="danger" disabled={true} onClick={handleClick}>
          Delete Strategy
        </Button>
      )

      const btn = screen.getByRole('button', { name: 'Delete Strategy' })
      expect(btn.classList.contains('ui-btn-danger')).toBe(true)

      fireEvent.click(btn)
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // 4. CROSS-SCREEN NAVIGATION & HISTORY LOOP STRESS
  // =========================================================================
  describe('4. Cross-Screen Navigation & History Loop Stress', () => {
    const screens: AppScreen[] = ['welcome', 'workspace', 'ea-lab', 'indicator-lab', 'library']

    it('survives rapid random screen transitions without state corruption', () => {
      for (let i = 0; i < 50; i++) {
        const nextScreen = screens[i % screens.length]
        act(() => {
          if (nextScreen === 'welcome') useAppStore.getState().goHome()
          else if (nextScreen === 'library') useAppStore.getState().enterLibrary()
          else if (nextScreen === 'ea-lab') useAppStore.getState().enterEaLab()
          else if (nextScreen === 'indicator-lab') useAppStore.getState().enterIndicatorLab()
          else if (nextScreen === 'workspace') useAppStore.setState({ screen: 'workspace' })
        })
        expect(useAppStore.getState().screen).toBe(nextScreen)
      }
    })

    it('correctly remembers originating screen when navigating into and out of Settings', () => {
      screens.forEach((fromScreen) => {
        act(() => {
          useAppStore.setState({ screen: fromScreen })
          useAppStore.getState().enterSettings()
        })
        expect(useAppStore.getState().screen).toBe('settings')
        expect(useAppStore.getState().settingsReturnScreen).toBe(fromScreen)

        act(() => {
          useAppStore.getState().leaveSettings()
        })
        expect(useAppStore.getState().screen).toBe(fromScreen)
      })
    })

    it('renders standardized navigation tooltips and buttons across TopBar', () => {
      act(() => {
        useAppStore.setState({ screen: 'workspace' })
      })
      render(<TopBar />)

      expect(screen.getByRole('button', { name: 'Home' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Strategy Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Bot Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Indicator Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Keyboard Shortcuts' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Theme' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Settings' })).not.toBeNull()
    })

    it('renders standardized navigation tooltips and buttons across StrategyLibrary', () => {
      render(<StrategyLibrary />)

      expect(screen.getByRole('button', { name: 'Home' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Bot Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Indicator Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Keyboard Shortcuts' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Theme' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Settings' })).not.toBeNull()
    })

    it('renders standardized navigation tooltips and buttons across EaLab', () => {
      render(<EaLab kind="ea" />)

      expect(screen.getByRole('button', { name: 'Home' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Strategy Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Indicator Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Keyboard Shortcuts' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Theme' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Settings' })).not.toBeNull()
    })

    it('renders standardized navigation tooltips and buttons across SettingsScreen', () => {
      render(<SettingsScreen />)

      expect(screen.getByRole('button', { name: 'Home' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Strategy Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Bot Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Indicator Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Keyboard Shortcuts' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Theme' })).not.toBeNull()
    })

    it('renders standardized navigation tooltips and buttons across Welcome', () => {
      render(<Welcome />)

      expect(screen.getByRole('button', { name: 'Strategy Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Bot Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Indicator Lab' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Keyboard Shortcuts' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Theme' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Settings' })).not.toBeNull()
    })
  })

  // =========================================================================
  // 5. RAPID THEME TOGGLE STRESS
  // =========================================================================
  describe('5. Rapid Theme Toggle Stress', () => {
    it('survives 100 rapid theme toggles between dark and light modes', () => {
      for (let i = 0; i < 100; i++) {
        act(() => {
          const currentTheme = useAppStore.getState().theme
          useAppStore.getState().setTheme(currentTheme === 'dark' ? 'light' : 'dark')
        })
        const expected = i % 2 === 0 ? 'light' : 'dark'
        expect(useAppStore.getState().theme).toBe(expected)
      }
    })

    it('ThemeToggle reflects current theme and updates store on click', () => {
      const { rerender } = render(<ThemeToggle />)
      const btn = screen.getByRole('button', { name: 'Theme' })

      // Initially dark mode
      expect(useAppStore.getState().theme).toBe('dark')

      fireEvent.click(btn)
      expect(useAppStore.getState().theme).toBe('light')

      rerender(<ThemeToggle />)
      fireEvent.click(btn)
      expect(useAppStore.getState().theme).toBe('dark')
    })
  })

  // =========================================================================
  // 6. FORM CONTROLS & BOUNDARY VALUE ADVERSARIAL STRESS
  // =========================================================================
  describe('6. Form Controls & Boundary Value Stress', () => {
    it('handles extreme and boundary values in CostsPanel inputs', () => {
      render(<CostsPanel />)

      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs.length).toBeGreaterThanOrEqual(7)

      // Test extreme zero and large numbers
      const spreadInput = inputs[0]
      fireEvent.change(spreadInput, { target: { value: '0' } })
      expect(useAppStore.getState().costs.spread).toBe(0)

      fireEvent.change(spreadInput, { target: { value: '99999.99' } })
      expect(useAppStore.getState().costs.spread).toBe(99999.99)
    })

    it('disables pauseOnSetup when autoEntry is enabled in StrategyPanel', () => {
      act(() => {
        useAppStore.setState({
          activeEaScriptId: 'test-bot-id',
          sessionName: 'AlphaBot · EA',
          settings: { ...DEFAULT_STRATEGY_SETTINGS, autoEntry: false, pauseOnSetup: true }
        })
      })

      const { rerender } = render(<StrategyPanel />)
      const autoEntryCheckbox = screen.getByRole('checkbox', { name: /auto entry/i }) as HTMLInputElement
      const pauseCheckbox = screen.getByRole('checkbox', { name: /pause on setup/i }) as HTMLInputElement

      expect(autoEntryCheckbox.checked).toBe(false)
      expect(pauseCheckbox.disabled).toBe(false)

      // Enable auto entry
      fireEvent.click(autoEntryCheckbox)
      expect(useAppStore.getState().settings.autoEntry).toBe(true)

      rerender(<StrategyPanel />)
      const updatedPauseCheckbox = screen.getByRole('checkbox', { name: /pause on setup/i }) as HTMLInputElement
      expect(updatedPauseCheckbox.disabled).toBe(true)
    })
  })

  // =========================================================================
  // 7. COMPREHENSIVE STATIC AST & CODEBASE INTEGRITY VERIFICATION
  // =========================================================================
  describe('7. Static AST & Codebase Integrity Grep Verifications', () => {
    it('verifies ZERO raw <button className="primary|ghost|danger"> in migrated panel and modal views', () => {
      const componentsDir = path.resolve(__dirname, '..')
      const migratedViews = [
        'FundamentalsDesk.tsx',
        'MarketDesk.tsx',
        'StrategyPanel.tsx',
        'AiProviderSettings.tsx',
        'Welcome.tsx',
        'DownloadWizard.tsx',
        'AiProviderModal.tsx',
        'EaLab.tsx'
      ]

      const violations: { file: string; match: string }[] = []
      const legacyBtnPattern = /<button[^>]*className=["'][^"']*\b(primary|ghost|danger)\b/g

      migratedViews.forEach((file) => {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8')
        let match: RegExpExecArray | null
        while ((match = legacyBtnPattern.exec(content)) !== null) {
          violations.push({ file, match: match[0] })
        }
      })

      expect(violations).toEqual([])
    })

    it('verifies ZERO ad-hoc <span className="stamp"> spans across ALL components', () => {
      const componentsDir = path.resolve(__dirname, '..')
      const tsxFiles = fs
        .readdirSync(componentsDir)
        .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))

      const lingeringStamps: string[] = []
      tsxFiles.forEach((file) => {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8')
        if (/<span[^>]*className=["'][^"']*(^|\s)stamp(\s|["'])/.test(content)) {
          lingeringStamps.push(file)
        }
      })

      expect(lingeringStamps).toEqual([])
    })

    it('verifies ZERO sub-pixel font sizes in global.css', () => {
      const subPixelRegex = /font-size:\s*\d+\.\d+px/g
      const matches = globalCss.match(subPixelRegex) ?? []
      expect(matches).toEqual([])
    })

    it('verifies ZERO legacy dark overlay rgba(18, 22, 18) in global.css', () => {
      expect(globalCss).not.toMatch(/rgba\(\s*18\s*,\s*22\s*,\s*18/)
    })

    it('verifies ZERO hardcoded white borders (rgba(255, 255, 255, 0.45) or 0.55) in global.css', () => {
      expect(globalCss).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.45\s*\)/)
      expect(globalCss).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.55\s*\)/)
    })

    it('verifies ZERO hardcoded white text colors in global.css button rules', () => {
      const buySellMatch = /\.buy,\s*\.sell\s*\{([^}]+)\}/.exec(globalCss)
      expect(buySellMatch).not.toBeNull()
      expect(buySellMatch![1]).not.toMatch(/color:\s*#fff\b/i)

      const dangerHoverMatch = /\.ui-btn-danger:hover:not\(:disabled\)\s*\{([^}]+)\}/.exec(globalCss)
      expect(dangerHoverMatch).not.toBeNull()
      expect(dangerHoverMatch![1]).not.toMatch(/color:\s*#ffffff\b/i)
    })

    it('verifies .trade-management-title has margin: 0 in global.css', () => {
      const match = /\.trade-management-title\s*\{([^}]+)\}/.exec(globalCss)
      expect(match).not.toBeNull()
      expect(match![1]).toMatch(/margin:\s*0\s*;/)
    })
  })
})
