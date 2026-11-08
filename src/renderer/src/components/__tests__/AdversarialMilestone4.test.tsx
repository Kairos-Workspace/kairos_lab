// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { StrategyPanel } from '../StrategyPanel'
import { BotBacktestModal } from '../BotBacktestModal'
import { useAppStore } from '../../store/useAppStore'

describe('Adversarial Code Audit & Static Integrity: Milestone 4', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('verifies zero legacy button classes in FundamentalsDesk.tsx', () => {
    const file = path.resolve(__dirname, '../FundamentalsDesk.tsx')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).not.toMatch(/className="[^"]*\b(primary|ghost|danger)\b/)
    expect(content).not.toMatch(/className="icon-btn"/)
  })

  it('verifies zero legacy button classes in MarketDesk.tsx', () => {
    const file = path.resolve(__dirname, '../MarketDesk.tsx')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).not.toMatch(/className="[^"]*\b(primary|ghost|danger)\b/)
    expect(content).not.toMatch(/className="icon-btn"/)
  })

  it('verifies zero legacy button classes in StrategyPanel.tsx', () => {
    const file = path.resolve(__dirname, '../StrategyPanel.tsx')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).not.toMatch(/className="[^"]*\b(primary|ghost|danger)\b/)
    expect(content).not.toMatch(/className="icon-btn"/)
  })

  it('verifies zero legacy button classes in AiProviderSettings.tsx', () => {
    const file = path.resolve(__dirname, '../AiProviderSettings.tsx')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).not.toMatch(/className="[^"]*\b(primary|ghost|danger)\b/)
    expect(content).not.toMatch(/className="icon-btn"/)
  })

  it('verifies zero legacy button classes on action buttons in StrategyLibrary.tsx', () => {
    const file = path.resolve(__dirname, '../StrategyLibrary.tsx')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).not.toMatch(/className="icon-btn strategy-action-btn"/)
    expect(content).not.toMatch(/className="icon-btn danger strategy-action-btn"/)
  })

  it('verifies zero raw .field labels in StrategyPanel, CostsPanel, FundamentalsDesk', () => {
    for (const filename of ['StrategyPanel.tsx', 'CostsPanel.tsx', 'FundamentalsDesk.tsx']) {
      const file = path.resolve(__dirname, `../${filename}`)
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toMatch(/<label\s+className="field"/)
    }
  })

  it('verifies zero raw span stamps in owned components', () => {
    const files = [
      'AppearanceSettings.tsx',
      'AiProviderSettings.tsx',
      'StrategyLibrary.tsx',
      'FundamentalsDesk.tsx',
      'MarketDesk.tsx',
      'LoadingOverlay.tsx'
    ]
    for (const filename of files) {
      const file = path.resolve(__dirname, `../${filename}`)
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toMatch(/<span\s+className="stamp"/)
    }
  })

  it('verifies ChartPanel and CompanionChartPane use Badge for primary/companion badges', () => {
    const chartFile = path.resolve(__dirname, '../ChartPanel.tsx')
    const chartContent = fs.readFileSync(chartFile, 'utf-8')
    expect(chartContent).not.toMatch(/<span\s+className="companion-badge/)

    const companionFile = path.resolve(__dirname, '../CompanionChartPane.tsx')
    const companionContent = fs.readFileSync(companionFile, 'utf-8')
    expect(companionContent).not.toMatch(/<span\s+className="companion-badge/)
  })

  it('verifies Checkbox component state integrity under rapid interaction in StrategyPanel', () => {
    useAppStore.setState({
      activeEaScriptId: null,
      settings: {
        strategyId: 'engulfing',
        defaultRr: 2.0,
        lookback: 10,
        volumeMultiplier: 1.0,
        autoEntry: false,
        pauseOnSetup: false
      },
      showFundamentals: false
    })

    render(<StrategyPanel />)

    const autoEntry = screen.getByRole('checkbox', { name: /auto entry/i }) as HTMLInputElement
    const showFund = screen.getByRole('checkbox', { name: /show fundamentals/i }) as HTMLInputElement

    expect(autoEntry.checked).toBe(false)
    expect(showFund.checked).toBe(false)

    // Rapid toggle
    fireEvent.click(autoEntry)
    expect(useAppStore.getState().settings.autoEntry).toBe(true)

    fireEvent.click(showFund)
    expect(useAppStore.getState().showFundamentals).toBe(true)

    fireEvent.click(autoEntry)
    expect(useAppStore.getState().settings.autoEntry).toBe(false)
  })

  it('verifies BotBacktestModal submission with Checkbox visualize state', async () => {
    useAppStore.setState({
      symbol: 'XAUUSD',
      displayTimeframe: '1M',
      datasets: [
        {
          id: 1,
          symbol: 'XAUUSD',
          timeframe: '1M',
          source: 'demo',
          candleCount: 500,
          startTs: 1000000,
          endTs: 2000000,
          createdAt: 1000,
          version: 1,
          gapCount: 0
        }
      ]
    })

    const onConfirm = vi.fn()
    const onClose = vi.fn()

    const { container } = render(
      <BotBacktestModal
        scriptName="TrendFollower"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    const chk = screen.getByRole('checkbox', { name: /visualize/i }) as HTMLInputElement
    expect(chk.checked).toBe(true)

    // Uncheck visualize mode
    fireEvent.click(chk)
    expect(chk.checked).toBe(false)

    // Submit form (rendered in portal)
    const form = document.getElementById('bot-backtest-form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        visualize: false
      })
    )
  })
})
