// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { StrategyPanel } from '../StrategyPanel'
import { BotBacktestModal } from '../BotBacktestModal'
import { AppearanceSettings } from '../AppearanceSettings'
import { AiProviderSettings } from '../AiProviderSettings'
import { StrategyLibrary } from '../StrategyLibrary'
import { MarketDesk } from '../MarketDesk'
import { FundamentalsDesk } from '../FundamentalsDesk'
import { CostsPanel } from '../CostsPanel'
import { LoadingOverlay } from '../LoadingOverlay'
import { CompanionChartPane } from '../CompanionChartPane'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { FormField } from '../ui/FormField'
import { Checkbox } from '../ui/Checkbox'
import { Badge } from '../ui/Badge'
import { useAppStore } from '../../store/useAppStore'
import { useAiProvidersStore } from '../../store/useAiProvidersStore'

// Mock heavyweight external dependencies to isolate UI component testing
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

describe('Milestone 4 Empirical Adversarial Challenge Suite', () => {
  beforeEach(() => {
    // Reset Zustand store state to pristine defaults before each test
    useAppStore.setState({
      activeEaScriptId: null,
      settings: {
        strategyId: 'engulfing',
        defaultRr: 2.0,
        lookback: 14,
        volumeMultiplier: 1.5,
        autoEntry: false,
        pauseOnSetup: false
      },
      showFundamentals: false,
      symbol: 'EURUSD',
      displayTimeframe: '1H',
      datasets: [
        {
          id: 1,
          symbol: 'EURUSD',
          timeframe: '1H',
          source: 'demo',
          candleCount: 1000,
          startTs: 1600000000,
          endTs: 1700000000,
          createdAt: 1600000000,
          version: 1,
          gapCount: 0
        }
      ]
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('1. Checkbox Interactions & State Machine Stress Testing', () => {
    it('handles StrategyPanel checkbox toggles in EA Bot Script mode', () => {
      useAppStore.setState({ activeEaScriptId: 'bot_alpha' })
      render(<StrategyPanel />)

      const autoEntryCheckbox = screen.getByRole('checkbox', { name: /^auto entry/i }) as HTMLInputElement
      const pauseOnSetupCheckbox = screen.getByRole('checkbox', { name: /pause on setup/i }) as HTMLInputElement
      const showFundCheckbox = screen.getByRole('checkbox', { name: /show fundamentals/i }) as HTMLInputElement

      expect(autoEntryCheckbox.checked).toBe(false)
      expect(pauseOnSetupCheckbox.checked).toBe(false)
      expect(pauseOnSetupCheckbox.disabled).toBe(false)
      expect(showFundCheckbox.checked).toBe(false)

      // Toggle pause on setup when autoEntry is off
      fireEvent.click(pauseOnSetupCheckbox)
      expect(useAppStore.getState().settings.pauseOnSetup).toBe(true)
      expect(pauseOnSetupCheckbox.checked).toBe(true)

      // Turn on autoEntry -> pauseOnSetup should be disabled
      fireEvent.click(autoEntryCheckbox)
      expect(useAppStore.getState().settings.autoEntry).toBe(true)
      expect(autoEntryCheckbox.checked).toBe(true)

      // Re-query pauseOnSetup after autoEntry label and disabled prop change
      const disabledPauseCheckbox = screen.getByRole('checkbox', { name: /pause on setup \(off while auto entry\)/i }) as HTMLInputElement
      expect(disabledPauseCheckbox.disabled).toBe(true)

      // Adversarial action: try clicking the disabled checkbox
      fireEvent.click(disabledPauseCheckbox)
      // Store state must not flip while disabled
      expect(useAppStore.getState().settings.pauseOnSetup).toBe(true)

      // Untoggle autoEntry
      fireEvent.click(autoEntryCheckbox)
      expect(useAppStore.getState().settings.autoEntry).toBe(false)
      const reEnabledPauseCheckbox = screen.getByRole('checkbox', { name: /^pause on setup$/i }) as HTMLInputElement
      expect(reEnabledPauseCheckbox.disabled).toBe(false)

      // Toggle showFundamentals
      fireEvent.click(showFundCheckbox)
      expect(useAppStore.getState().showFundamentals).toBe(true)
      fireEvent.click(showFundCheckbox)
      expect(useAppStore.getState().showFundamentals).toBe(false)
    })

    it('handles StrategyPanel checkbox toggles in Catalog Strategy mode', () => {
      useAppStore.setState({ activeEaScriptId: null })
      render(<StrategyPanel />)

      const autoEntryCheckbox = screen.getByRole('checkbox', { name: /^auto entry/i }) as HTMLInputElement
      const pauseOnSetupCheckbox = screen.getByRole('checkbox', { name: /^pause on setup/i }) as HTMLInputElement
      const showFundCheckbox = screen.getByRole('checkbox', { name: /show fundamentals/i }) as HTMLInputElement

      // Toggle pause on setup when autoEntry is off
      fireEvent.click(pauseOnSetupCheckbox)
      expect(useAppStore.getState().settings.pauseOnSetup).toBe(true)

      // Turn on autoEntry -> pauseOnSetup should be disabled
      fireEvent.click(autoEntryCheckbox)
      expect(useAppStore.getState().settings.autoEntry).toBe(true)

      // Re-query pauseOnSetup after autoEntry label and disabled prop change
      const disabledPauseCheckbox = screen.getByRole('checkbox', { name: /^pause on setup/i }) as HTMLInputElement
      expect(disabledPauseCheckbox.disabled).toBe(true)

      // Toggle show fundamentals
      fireEvent.click(showFundCheckbox)
      expect(useAppStore.getState().showFundamentals).toBe(true)
    })

    it('stress tests rapid toggling of checkboxes without desynchronization', () => {
      useAppStore.setState({ activeEaScriptId: null })
      render(<StrategyPanel />)

      const autoEntryCheckbox = screen.getByRole('checkbox', { name: /^auto entry/i }) as HTMLInputElement
      let expectedState = false

      // 30 rapid clicks
      for (let i = 0; i < 30; i++) {
        fireEvent.click(autoEntryCheckbox)
        expectedState = !expectedState
        expect(useAppStore.getState().settings.autoEntry).toBe(expectedState)
        expect(autoEntryCheckbox.checked).toBe(expectedState)
      }
    })

    it('validates BotBacktestModal visualize checkbox transitions and form submission', async () => {
      const onConfirm = vi.fn()
      const onClose = vi.fn()

      render(
        <BotBacktestModal
          scriptName="AlphaTrend"
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )

      const visualizeCheckbox = screen.getByRole('checkbox', { name: /visualize/i }) as HTMLInputElement
      expect(visualizeCheckbox.checked).toBe(true)

      // Submit button text when visualize is true
      const submitBtn = screen.getByRole('button', { name: /open tester/i })
      expect(submitBtn).toBeDefined()
      expect(submitBtn.getAttribute('type')).toBe('submit')

      // Uncheck visualize
      fireEvent.click(visualizeCheckbox)
      expect(visualizeCheckbox.checked).toBe(false)

      // Submit button text should update dynamically to 'Run in background'
      const bgSubmitBtn = screen.getByRole('button', { name: /run in background/i })
      expect(bgSubmitBtn).toBeDefined()

      // Submit form
      const form = document.getElementById('bot-backtest-form')!
      expect(form).not.toBeNull()
      fireEvent.submit(form)

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          visualize: false,
          symbol: 'EURUSD',
          timeframe: '1H'
        })
      )

      // Test cancel button
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('validates Checkbox standalone component with description, error, and disabled props', () => {
      const onChange = vi.fn()
      const { rerender } = render(
        <Checkbox
          label="Advanced Mode"
          description="Enable developer experimental options"
          checked={false}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('checkbox', { name: /advanced mode/i }) as HTMLInputElement
      expect(input.checked).toBe(false)
      expect(screen.getByText('Enable developer experimental options').classList.contains('ui-checkbox-desc')).toBe(true)

      fireEvent.click(input)
      expect(onChange).toHaveBeenCalledTimes(1)

      rerender(
        <Checkbox
          label="Advanced Mode"
          description="Enable developer experimental options"
          checked={true}
          disabled
          error="Field is locked"
          onChange={onChange}
        />
      )

      expect(input.disabled).toBe(true)
      const labelContainer = input.closest('label')
      expect(labelContainer?.classList.contains('ui-checkbox-disabled')).toBe(true)
      expect(labelContainer?.classList.contains('ui-checkbox-error')).toBe(true)
    })
  })

  describe('2. FormField Component Contracts & A11y', () => {
    it('associates label with inner control via generated id or explicit htmlFor', () => {
      render(
        <FormField label="Username">
          <input type="text" placeholder="Enter username" />
        </FormField>
      )

      const label = screen.getByText('Username')
      const input = screen.getByPlaceholderText('Enter username') as HTMLInputElement

      expect(label.tagName.toLowerCase()).toBe('label')
      expect(input.id).toBeTruthy()
      expect(label.getAttribute('for')).toBe(input.id)
    })

    it('preserves existing id on child input', () => {
      render(
        <FormField label="Custom Email" htmlFor="custom-email-id">
          <input id="custom-email-id" type="email" />
        </FormField>
      )

      const label = screen.getByText('Custom Email')
      const input = screen.getByRole('textbox') as HTMLInputElement

      expect(input.id).toBe('custom-email-id')
      expect(label.getAttribute('for')).toBe('custom-email-id')
    })

    it('renders required asterisk and optional indicator', () => {
      const { rerender } = render(
        <FormField label="Required Field" required>
          <input type="text" />
        </FormField>
      )

      const req = screen.getByText('*')
      expect(req.classList.contains('ui-field-required')).toBe(true)
      expect(req.getAttribute('title')).toBe('Required')

      rerender(
        <FormField label="Optional Field" optional>
          <input type="text" />
        </FormField>
      )

      const opt = screen.getByText('(optional)')
      expect(opt.classList.contains('ui-field-optional')).toBe(true)
    })

    it('renders error state and suppresses hint when error is present', () => {
      const { rerender, container } = render(
        <FormField label="Field" hint="Helper hint text" error={null}>
          <input type="text" />
        </FormField>
      )

      const hintEl = screen.getByText('Helper hint text')
      expect(hintEl.classList.contains('ui-field-hint')).toBe(true)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(container.querySelector('.ui-field-has-error')).toBeNull()

      // Introduce error
      rerender(
        <FormField label="Field" hint="Helper hint text" error="Value is invalid">
          <input type="text" />
        </FormField>
      )

      const errorAlert = screen.getByRole('alert')
      expect(errorAlert.classList.contains('ui-field-error')).toBe(true)
      expect(errorAlert.textContent).toBe('Value is invalid')
      expect(container.querySelector('.ui-field-has-error')).not.toBeNull()
      // Hint must be hidden when error is active
      expect(screen.queryByText('Helper hint text')).toBeNull()
    })

    it('handles non-label FormField without rendering header', () => {
      const { container } = render(
        <FormField>
          <input type="text" aria-label="Plain input" />
        </FormField>
      )

      expect(container.querySelector('.ui-field-header')).toBeNull()
      expect(screen.getByLabelText('Plain input')).toBeDefined()
    })

    it('supports wrapping <select> and <textarea> elements', () => {
      render(
        <FormField label="Timeframe Selection">
          <select aria-label="Timeframe Selection">
            <option value="1H">1H</option>
            <option value="4H">4H</option>
          </select>
        </FormField>
      )

      const select = screen.getByRole('combobox', { name: /timeframe selection/i }) as HTMLSelectElement
      expect(select.id).toBeTruthy()
      const label = screen.getByText('Timeframe Selection')
      expect(label.getAttribute('for')).toBe(select.id)
    })
  })

  describe('3. Button & IconButton Variants and Dimensions', () => {
    it('verifies Button variants, sizes, icons, and loading states', () => {
      const onClick = vi.fn()
      const { container, rerender } = render(
        <Button variant="primary" size="md" icon="play" onClick={onClick}>
          Start
        </Button>
      )

      let btn = screen.getByRole('button', { name: /start/i })
      expect(btn.classList.contains('ui-btn')).toBe(true)
      expect(btn.classList.contains('ui-btn-primary')).toBe(true)
      expect(btn.classList.contains('ui-btn-md')).toBe(true)
      expect(btn.classList.contains('ui-btn-with-icon')).toBe(true)

      fireEvent.click(btn)
      expect(onClick).toHaveBeenCalledTimes(1)

      rerender(
        <Button variant="ghost" size="sm" icon="trash">
          Delete
        </Button>
      )
      btn = screen.getByRole('button', { name: /delete/i })
      expect(btn.classList.contains('ui-btn')).toBe(true)
      expect(btn.classList.contains('ui-btn-ghost')).toBe(true)
      expect(btn.classList.contains('ui-btn-sm')).toBe(true)

      rerender(
        <Button variant="danger" size="lg" loading onClick={onClick}>
          Processing
        </Button>
      )
      btn = screen.getByRole('button', { name: /processing/i })
      expect(btn.classList.contains('ui-btn')).toBe(true)
      expect(btn.classList.contains('ui-btn-danger')).toBe(true)
      expect(btn.classList.contains('ui-btn-lg')).toBe(true)
      expect(btn.classList.contains('ui-btn-loading')).toBe(true)
      expect((btn as HTMLButtonElement).disabled).toBe(true)
      expect(container.querySelector('.ui-btn-spinner')).not.toBeNull()

      // Disabled / loading button should not trigger click handler
      fireEvent.click(btn)
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('verifies IconButton sizes (sm, md, lg) and accessible attributes', () => {
      const onClick = vi.fn()
      const { rerender } = render(
        <IconButton icon="plus" label="Add item" size="sm" variant="ghost" onClick={onClick} />
      )

      let btn = screen.getByRole('button', { name: /add item/i })
      expect(btn.classList.contains('ui-icon-btn')).toBe(true)
      expect(btn.classList.contains('ui-icon-btn-ghost')).toBe(true)
      expect(btn.classList.contains('ui-icon-btn-sm')).toBe(true)
      expect(btn.getAttribute('title')).toBe('Add item')
      expect(btn.getAttribute('aria-label')).toBe('Add item')

      fireEvent.click(btn)
      expect(onClick).toHaveBeenCalledTimes(1)

      rerender(
        <IconButton icon="download" label="Download tape" size="md" variant="secondary" active />
      )
      btn = screen.getByRole('button', { name: /download tape/i })
      expect(btn.classList.contains('ui-icon-btn')).toBe(true)
      expect(btn.classList.contains('ui-icon-btn-secondary')).toBe(true)
      expect(btn.classList.contains('ui-icon-btn-md')).toBe(true)
      expect(btn.getAttribute('data-active')).toBe('true')
    })
  })

  describe('4. Badge Component & Variants', () => {
    it('verifies Badge variants (stamp, brand, neutral, bull, bear, muted) and sizes', () => {
      const variants: Array<'stamp' | 'brand' | 'neutral' | 'bull' | 'bear' | 'muted'> = [
        'stamp',
        'brand',
        'neutral',
        'bull',
        'bear',
        'muted'
      ]

      for (const variant of variants) {
        const { container } = render(
          <Badge variant={variant} size="sm">
            {variant.toUpperCase()}
          </Badge>
        )

        const badge = container.querySelector('.ui-badge')!
        expect(badge).not.toBeNull()
        expect(badge.classList.contains(`ui-badge-${variant}`)).toBe(true)
        expect(badge.classList.contains('ui-badge-sm')).toBe(true)
        expect(badge.textContent).toBe(variant.toUpperCase())
        cleanup()
      }
    })

    it('verifies Badge rendering in LoadingOverlay', () => {
      useAppStore.setState({ busy: true, status: 'Testing Overlay', downloadProgress: null })
      const { container } = render(<LoadingOverlay />)
      const badge = container.querySelector('.ui-badge-stamp')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('Working')
    })

    it('verifies Badge rendering in CompanionChartPane', () => {
      const { container } = render(
        <CompanionChartPane index={1} />
      )

      const badge = container.querySelector('.companion-badge')
      expect(badge).not.toBeNull()
      expect(badge?.classList.contains('ui-badge')).toBe(true)
      expect(badge?.classList.contains('ui-badge-neutral')).toBe(true)
      expect(badge?.textContent).toContain('PANE 3')
    })
  })

  describe('5. Adversarial Static Grep & Zero Legacy Selectors Audit', () => {
    const ownedComponents = [
      'StrategyPanel.tsx',
      'TradePanel.tsx',
      'CostsPanel.tsx',
      'PineIndicatorPanel.tsx',
      'MarketDesk.tsx',
      'FundamentalsDesk.tsx',
      'BotBacktestModal.tsx',
      'AppearanceSettings.tsx',
      'AiProviderSettings.tsx',
      'StrategyLibrary.tsx',
      'ChartPanel.tsx',
      'CompanionChartPane.tsx',
      'LoadingOverlay.tsx'
    ]

    it('ensures none of the owned components use raw className="primary", "ghost", or "danger" on buttons', () => {
      for (const comp of ownedComponents) {
        const filePath = path.resolve(__dirname, `../${comp}`)
        const code = fs.readFileSync(filePath, 'utf-8')

        // Match <button ... className="... primary ..."> or similar legacy raw classes
        const matches = code.match(/<button[^>]*className=["'][^"']*\b(primary|ghost)\b[^"']*["']/g)
        expect(matches, `Found raw legacy button class in ${comp}: ${matches}`).toBeNull()
      }
    })

    it('ensures StrategyPanel, CostsPanel, FundamentalsDesk have 0 raw <label className="field">', () => {
      const checkPanels = ['StrategyPanel.tsx', 'CostsPanel.tsx', 'FundamentalsDesk.tsx']
      for (const comp of checkPanels) {
        const filePath = path.resolve(__dirname, `../${comp}`)
        const code = fs.readFileSync(filePath, 'utf-8')
        expect(code).not.toMatch(/<label\s+className="field"/)
      }
    })

    it('ensures M4 views do not use ad-hoc <span className="stamp">', () => {
      const stampViews = [
        'AppearanceSettings.tsx',
        'AiProviderSettings.tsx',
        'StrategyLibrary.tsx',
        'FundamentalsDesk.tsx',
        'MarketDesk.tsx',
        'LoadingOverlay.tsx'
      ]
      for (const comp of stampViews) {
        const filePath = path.resolve(__dirname, `../${comp}`)
        const code = fs.readFileSync(filePath, 'utf-8')
        expect(code).not.toMatch(/<span\s+className="stamp"/)
      }
    })

    it('verifies global.css icon button dimensions sm=28px and md=36px', () => {
      const cssPath = path.resolve(__dirname, '../../styles/global.css')
      const css = fs.readFileSync(cssPath, 'utf-8')

      // Verify sm: 28px
      expect(css).toMatch(/\.ui-icon-btn-sm\s*\{[^}]*width:\s*28px;\s*height:\s*28px;/)
      // Verify md: 36px
      expect(css).toMatch(/\.ui-icon-btn-md\s*\{[^}]*width:\s*36px;\s*height:\s*36px;/)
      // Verify lg: 42px
      expect(css).toMatch(/\.ui-icon-btn-lg\s*\{[^}]*width:\s*42px;\s*height:\s*42px;/)
    })
  })
})
