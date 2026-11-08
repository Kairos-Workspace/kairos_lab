// @vitest-environment happy-dom
import React from 'react'
import fs from 'fs'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Mock monaco and canvas dependencies
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

import { Checkbox } from '../ui/Checkbox'
import { StrategyPanel } from '../StrategyPanel'
import { EaLab } from '../EaLab'
import { PineIndicatorPanel } from '../PineIndicatorPanel'
import { ReplayControls } from '../ReplayControls'
import { useAppStore } from '../../store/useAppStore'
import { useEaLabStore } from '../../store/useEaLabStore'

describe('Empirical Challenger Milestone 5 Iteration 2 Adversarial Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      activeEaScriptId: null,
      settings: {
        strategyId: 'sma',
        lookback: 20,
        defaultRr: 2,
        volumeMultiplier: 1,
        pauseOnSetup: false,
        autoEntry: false
      },
      showFundamentals: false,
      pineIndicators: [
        {
          id: 'pine-test-1',
          name: 'Empirical RSI',
          code: '//@version=5\nindicator("Empirical RSI")\nplot(close)',
          enabled: true
        }
      ],
      mode: 'view',
      displayCandles: [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 2000, open: 102, high: 108, low: 101, close: 107, volume: 1200 }
      ],
      replayIndex: 1
    })

    useEaLabStore.setState({
      scripts: [
        {
          id: 'script-1',
          name: 'TrendRider',
          kind: 'ea',
          language: 'mql5',
          code: '// TrendRider MQL5 code',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      activeScriptId: 'script-1',
      compileStatus: 'ok',
      diagnostics: []
    })
  })

  afterEach(() => {
    cleanup()
  })

  // =========================================================================
  // 1. CHECKBOX DISABLED LABEL CLICK GUARD & ADVERSARIAL STRESS TEST
  // =========================================================================
  describe('1. Checkbox Disabled Label Click Guard', () => {
    it('completely suppresses click events and onChange when disabled={true}', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Checkbox
          label="Adversarial Label"
          description="Detailed description"
          disabled={true}
          onChange={onChange}
        />
      )

      const labelElement = container.querySelector('label.ui-checkbox') as HTMLLabelElement
      expect(labelElement).not.toBeNull()
      expect(labelElement.className).toContain('ui-checkbox-disabled')

      const inputElement = container.querySelector('input[type="checkbox"]') as HTMLInputElement
      expect(inputElement.disabled).toBe(true)

      // 1. Click directly on outer <label>
      fireEvent.click(labelElement)
      expect(onChange).not.toHaveBeenCalled()
      expect(inputElement.checked).toBe(false)

      // 2. Click on inner label text
      const labelText = screen.getByText('Adversarial Label')
      fireEvent.click(labelText)
      expect(onChange).not.toHaveBeenCalled()
      expect(inputElement.checked).toBe(false)

      // 3. Click on inner description text
      const descText = screen.getByText('Detailed description')
      fireEvent.click(descText)
      expect(onChange).not.toHaveBeenCalled()
      expect(inputElement.checked).toBe(false)

      // 4. Click on inner checkbox box span
      const boxElement = container.querySelector('.ui-checkbox-box') as HTMLElement
      fireEvent.click(boxElement)
      expect(onChange).not.toHaveBeenCalled()
      expect(inputElement.checked).toBe(false)
    })

    it('permits label clicks and triggers onChange when disabled={false}', () => {
      let state = false
      const onChange = vi.fn((e) => {
        state = e.target.checked
      })

      const { rerender } = render(
        <Checkbox
          label="Active Label"
          checked={state}
          onChange={onChange}
        />
      )

      const labelText = screen.getByText('Active Label')
      fireEvent.click(labelText)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(state).toBe(true)

      rerender(
        <Checkbox
          label="Active Label"
          checked={state}
          onChange={onChange}
        />
      )

      fireEvent.click(labelText)
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(state).toBe(false)
    })

    it('survives rapid consecutive clicks without desynchronizing or leaking state', () => {
      let count = 0
      const onChange = vi.fn(() => {
        count++
      })

      const { container } = render(
        <Checkbox
          label="Rapid Click"
          disabled={true}
          onChange={onChange}
        />
      )

      const label = container.querySelector('label.ui-checkbox') as HTMLLabelElement
      for (let i = 0; i < 50; i++) {
        fireEvent.click(label)
      }

      expect(onChange).not.toHaveBeenCalled()
      expect(count).toBe(0)
    })
  })

  // =========================================================================
  // 2. STRATEGY PANEL MUTUAL EXCLUSION & CATALOG MODE VERIFICATION
  // =========================================================================
  describe('2. StrategyPanel Catalog Mode Mutual Exclusion', () => {
    it('enforces disabled state and dynamic copy on pauseOnSetup when autoEntry is enabled', () => {
      useAppStore.setState({
        activeEaScriptId: null,
        settings: {
          strategyId: 'sma',
          lookback: 20,
          defaultRr: 2,
          volumeMultiplier: 1,
          pauseOnSetup: false,
          autoEntry: false
        }
      })

      render(<StrategyPanel />)

      const autoEntryCheckbox = screen.getByRole('checkbox', { name: /^auto entry/i }) as HTMLInputElement
      const pauseCheckbox = screen.getByRole('checkbox', { name: /^pause on setup/i }) as HTMLInputElement

      expect(autoEntryCheckbox.checked).toBe(false)
      expect(pauseCheckbox.checked).toBe(false)
      expect(pauseCheckbox.disabled).toBe(false)
      expect(screen.getByText('Pause on setup')).toBeDefined()

      // Enable pauseOnSetup
      fireEvent.click(pauseCheckbox)
      expect(useAppStore.getState().settings.pauseOnSetup).toBe(true)

      // Enable autoEntry -> pauseOnSetup should now be disabled and show dynamic suffix
      fireEvent.click(autoEntryCheckbox)
      expect(useAppStore.getState().settings.autoEntry).toBe(true)

      const disabledPauseCheckbox = screen.getByRole('checkbox', { name: /^pause on setup/i }) as HTMLInputElement
      expect(disabledPauseCheckbox.disabled).toBe(true)
      expect(screen.getByText('Pause on setup (off while auto entry)')).toBeDefined()

      // Attempt to toggle disabled pauseOnSetup via label click
      const pauseLabel = screen.getByText('Pause on setup (off while auto entry)')
      fireEvent.click(pauseLabel)
      // Store state must remain intact
      expect(useAppStore.getState().settings.pauseOnSetup).toBe(true)

      // Turn off autoEntry -> pauseOnSetup should become re-enabled and restore label
      fireEvent.click(autoEntryCheckbox)
      expect(useAppStore.getState().settings.autoEntry).toBe(false)

      const reEnabledPauseCheckbox = screen.getByRole('checkbox', { name: /^pause on setup/i }) as HTMLInputElement
      expect(reEnabledPauseCheckbox.disabled).toBe(false)
      expect(screen.getByText('Pause on setup')).toBeDefined()
    })
  })

  // =========================================================================
  // 3. EA LAB BUTTON MIGRATIONS & USER INTERACTIONS
  // =========================================================================
  describe('3. EaLab Button Migrations', () => {
    it('verifies action buttons in toolbar are Button and IconButton primitives', () => {
      render(<EaLab kind="ea" />)

      // 1. Check bot rules button is IconButton with size="md"
      const checkRulesBtn = screen.getByRole('button', { name: /check bot rules/i })
      expect(checkRulesBtn.className).toContain('ui-icon-btn')
      expect(checkRulesBtn.className).toContain('ui-icon-btn-md')

      // 2. Run backtest button is Button with variant="primary"
      const runBacktestBtn = screen.getByRole('button', { name: /run backtest/i })
      expect(runBacktestBtn.className).toContain('ui-btn')
      expect(runBacktestBtn.className).toContain('ui-btn-primary')

      // 3. Export MQL5 button is Button with variant="ghost" and disabled
      const exportBtn = screen.getByRole('button', { name: /export to mql5/i })
      expect(exportBtn.className).toContain('ui-btn')
      expect(exportBtn.className).toContain('ui-btn-ghost')
      expect((exportBtn as HTMLButtonElement).disabled).toBe(true)

      // 4. Sidebar Rename and Delete buttons are IconButton with size="sm"
      const renameBtn = screen.getByRole('button', { name: /rename trendrider/i })
      expect(renameBtn.className).toContain('ui-icon-btn')
      expect(renameBtn.className).toContain('ui-icon-btn-sm')

      const deleteBtn = screen.getByRole('button', { name: /delete trendrider/i })
      expect(deleteBtn.className).toContain('ui-icon-btn')
      expect(deleteBtn.className).toContain('ui-icon-btn-sm')
    })

    it('opens and closes backtest modal via primary Run backtest button', () => {
      render(<EaLab kind="ea" />)

      const runBacktestBtn = screen.getByRole('button', { name: /run backtest/i })
      fireEvent.click(runBacktestBtn)

      // Modal should open
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText(/bot backtest/i)).toBeDefined()

      // Close modal
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelBtn)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('renders empty editor state creation buttons as Button primitives', () => {
      useEaLabStore.setState({
        scripts: [],
        activeScriptId: null
      })

      render(<EaLab kind="indicator" />)

      const newMql5Btn = screen.getByRole('button', { name: /new mql5/i })
      expect(newMql5Btn.className).toContain('ui-btn')
      expect(newMql5Btn.className).toContain('ui-btn-primary')

      const newPineBtn = screen.getByRole('button', { name: /new pine script/i })
      expect(newPineBtn.className).toContain('ui-btn')
      expect(newPineBtn.className).toContain('ui-btn-primary')
    })
  })

  // =========================================================================
  // 4. PINE INDICATOR PANEL BUTTON MIGRATIONS
  // =========================================================================
  describe('4. PineIndicatorPanel Button Migrations', () => {
    it('verifies item actions use IconButton with edit, duplicate, and danger delete', () => {
      render(<PineIndicatorPanel />)

      const editBtn = screen.getByRole('button', { name: /edit indicator/i })
      expect(editBtn.className).toContain('ui-icon-btn')
      expect(editBtn.className).toContain('ui-icon-btn-sm')

      const duplicateBtn = screen.getByRole('button', { name: /duplicate indicator/i })
      expect(duplicateBtn.className).toContain('ui-icon-btn')
      expect(duplicateBtn.className).toContain('ui-icon-btn-sm')

      const deleteBtn = screen.getByRole('button', { name: /delete indicator/i })
      expect(deleteBtn.className).toContain('ui-icon-btn')
      expect(deleteBtn.className).toContain('ui-icon-btn-danger')
      expect(deleteBtn.className).toContain('ui-icon-btn-sm')
    })

    it('triggers delete action and removes indicator from store', () => {
      render(<PineIndicatorPanel />)

      expect(useAppStore.getState().pineIndicators.some((i) => i.id === 'pine-test-1')).toBe(true)
      const deleteBtn = screen.getByRole('button', { name: /delete indicator/i })
      fireEvent.click(deleteBtn)

      expect(useAppStore.getState().pineIndicators.some((i) => i.id === 'pine-test-1')).toBe(false)
    })

    it('triggers duplicate action and adds duplicate to store', () => {
      render(<PineIndicatorPanel />)

      const duplicateBtn = screen.getByRole('button', { name: /duplicate indicator/i })
      fireEvent.click(duplicateBtn)

      expect(useAppStore.getState().pineIndicators.length).toBe(2)
      expect(useAppStore.getState().pineIndicators[1].name).toBe('Empirical RSI (Copy)')
    })
  })

  // =========================================================================
  // 5. REPLAY CONTROLS BUTTON MIGRATIONS
  // =========================================================================
  describe('5. ReplayControls Button Migrations', () => {
    it('verifies replay and period actions use Button variant="ghost"', () => {
      useAppStore.setState({
        mode: 'view',
        sourceHasOlder: true,
        historyStreaming: false
      })

      render(<ReplayControls />)

      // Step Render button
      const stepRenderBtn = screen.getByRole('button', { name: /step render/i })
      expect(stepRenderBtn.className).toContain('ui-btn')
      expect(stepRenderBtn.className).toContain('ui-btn-ghost')
      expect(stepRenderBtn.className).toContain('replay-step-btn')

      // Replay button
      const replayBtn = screen.getByRole('button', { name: /^replay$/i })
      expect(replayBtn.className).toContain('ui-btn')
      expect(replayBtn.className).toContain('ui-btn-ghost')
      expect(replayBtn.className).toContain('replay-start-action')

      // Period button
      const periodBtn = screen.getByRole('button', { name: /period/i })
      expect(periodBtn.className).toContain('ui-btn')
      expect(periodBtn.className).toContain('ui-btn-ghost')
      expect(periodBtn.className).toContain('replay-period')
      expect(periodBtn.getAttribute('title')).toBe('Choose replay period')
    })

    it('verifies Entire History button in replay mode uses Button variant="ghost"', () => {
      useAppStore.setState({
        mode: 'replay'
      })

      render(<ReplayControls />)

      const entireHistoryBtn = screen.getByRole('button', { name: /entire history/i })
      expect(entireHistoryBtn.className).toContain('ui-btn')
      expect(entireHistoryBtn.className).toContain('ui-btn-ghost')
      expect(entireHistoryBtn.className).toContain('replay-history-btn')
    })
  })

  // =========================================================================
  // 6. CODEBASE-WIDE AST & DESIGN SYSTEM INVARIANT AUDIT
  // =========================================================================
  describe('6. Codebase-wide AST & Design System Invariant Audit', () => {
    it('verifies ZERO legacy button classes across ALL component tsx files', () => {
      const componentsDir = path.resolve(__dirname, '..')
      const files = fs
        .readdirSync(componentsDir)
        .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))

      const violations: { file: string; match: string }[] = []

      files.forEach((file) => {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf8')
        const buttonMatches = content.match(/<button[\s\S]*?>/g) || []
        buttonMatches.forEach((btn) => {
          const classMatch = btn.match(/className=(?:\{`([^`]+)`\}|"([^"]+)"|'([^']+)')/)
          if (classMatch) {
            const cls = classMatch[1] || classMatch[2] || classMatch[3] || ''
            const classes = cls.trim().split(/\s+/)
            if (classes.some((c) => ['primary', 'ghost', 'danger'].includes(c))) {
              violations.push({ file, match: btn })
            }
          }
        })
      })

      expect(violations).toEqual([])
    })

    it('verifies EaLab.tsx is included in migratedViews test in ChallengerMilestone5Adversarial.test.tsx', () => {
      const suitePath = path.resolve(__dirname, 'ChallengerMilestone5Adversarial.test.tsx')
      const content = fs.readFileSync(suitePath, 'utf8')

      expect(content).toContain("'EaLab.tsx'")
    })
  })
})
