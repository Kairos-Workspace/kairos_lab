// @vitest-environment happy-dom
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Welcome } from '../Welcome'
import { EaLab } from '../EaLab'
import { TradePanel } from '../TradePanel'
import { useAppStore } from '../../store/useAppStore'
import { useEaLabStore } from '../../store/useEaLabStore'

// Mock heavyweight external dependencies not relevant to UI/badge testing
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

describe('Milestone 5: Final Polish & Comprehensive Verification', () => {
  const cssPath = path.resolve(__dirname, '../../styles/global.css')
  const globalCss = fs.readFileSync(cssPath, 'utf-8')

  afterEach(() => {
    cleanup()
  })

  describe('1. global.css Polish & Token Integrity', () => {
    it('asserts .trade-management-title has margin: 0 for pixel-consistent heading layout', () => {
      const match = /\.trade-management-title\s*\{([^}]+)\}/.exec(globalCss)
      expect(match).not.toBeNull()
      expect(match![1]).toMatch(/margin:\s*0\s*;/)
    })

    it('asserts zero sub-pixel font sizes (10.5px, 11.5px, 12.5px, 14.5px) in global.css', () => {
      expect(globalCss).not.toMatch(/font-size:\s*10\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*11\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*12\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*14\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*\d+\.\d+px/)
    })

    it('asserts zero legacy dark overlay rgba(18, 22, 18, ...) in global.css', () => {
      expect(globalCss).not.toMatch(/rgba\(\s*18\s*,\s*22\s*,\s*18/)
    })

    it('asserts zero hardcoded white borders (rgba(255, 255, 255, 0.45) or 0.55) in global.css', () => {
      expect(globalCss).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.45\s*\)/)
      expect(globalCss).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.55\s*\)/)
    })

    it('asserts .buy and .sell trigger buttons use design tokens for text color', () => {
      const match = /\.buy,\s*\.sell\s*\{([^}]+)\}/.exec(globalCss)
      expect(match).not.toBeNull()
      expect(match![1]).not.toMatch(/color:\s*#fff\b/i)
      expect(match![1]).toMatch(/color:\s*var\(--parchment\)/)
    })

    it('asserts .ui-btn-danger:hover uses design tokens rather than hardcoded #ffffff', () => {
      const match = /\.ui-btn-danger:hover:not\(:disabled\)\s*\{([^}]+)\}/.exec(globalCss)
      expect(match).not.toBeNull()
      expect(match![1]).not.toMatch(/color:\s*#ffffff\b/i)
      expect(match![1]).toMatch(/color:\s*var\(--parchment\)/)
    })

    it('preserves .tab, .buy, .sell, .icon-btn, .primary, .ghost, .danger refactored to theme tokens', () => {
      expect(globalCss).toContain('.tab')
      expect(globalCss).toContain('.buy')
      expect(globalCss).toContain('.sell')
      expect(globalCss).toContain('.primary')
      expect(globalCss).toContain('.ghost')
      expect(globalCss).toContain('.danger')
      expect(globalCss).toContain('.icon-btn')

      // Verify .primary uses design tokens
      const primaryMatch = /(?:^|\})\s*\.primary\s*\{([^}]+)\}/.exec(globalCss)
      expect(primaryMatch).not.toBeNull()
      expect(primaryMatch![1]).toMatch(/background:\s*var\(--brand\)/)
      expect(primaryMatch![1]).toMatch(/color:\s*var\(--on-brand\)/)

      // Verify .ghost uses design tokens
      const ghostMatch = /(?:^|\})\s*\.ghost\s*\{([^}]+)\}/.exec(globalCss)
      expect(ghostMatch).not.toBeNull()
      expect(ghostMatch![1]).toMatch(/color:\s*var\(--parchment\)/)

      // Verify .danger uses design tokens
      const dangerMatch = /(?:^|\})\s*\.danger\s*\{([^}]+)\}/.exec(globalCss)
      expect(dangerMatch).not.toBeNull()
      expect(dangerMatch![1]).toMatch(/color:\s*var\(--bear\)/)
    })
  })

  describe('2. Welcome.tsx Badge & Stamp Migration', () => {
    it('renders Badge variant="stamp" for Desk, Bots, and Editor cards in Welcome', () => {
      const { container } = render(<Welcome />)
      const stamps = container.querySelectorAll('.ui-badge-stamp')
      expect(stamps.length).toBe(3)

      const stampTexts = Array.from(stamps).map((el) => el.textContent?.trim())
      expect(stampTexts).toEqual(['Desk', 'Bots', 'Editor'])
    })

    it('ensures Welcome.tsx contains zero ad-hoc className="stamp" spans', () => {
      const welcomeFile = fs.readFileSync(path.resolve(__dirname, '../Welcome.tsx'), 'utf-8')
      expect(welcomeFile).not.toMatch(/className=["'][^"']*(^|\s)stamp(\s|["'])/)
    })
  })

  describe('3. EaLab.tsx Badge & Stamp Migration', () => {
    it('renders Badge variant="stamp" for Explorer in EaLab sidebar', () => {
      useEaLabStore.setState({
        scripts: [
          {
            id: 'bot-1',
            name: 'TrendFollower',
            kind: 'ea',
            language: 'mql5',
            code: '// bot code',
            createdAt: 1700000000000,
            updatedAt: 1700000000000
          }
        ]
      })

      const { container } = render(<EaLab kind="ea" />)
      const stampBadge = container.querySelector('.ea-lab-sidebar-head .ui-badge-stamp')
      expect(stampBadge).not.toBeNull()
      expect(stampBadge?.textContent?.trim()).toBe('Explorer')
    })

    it('ensures EaLab.tsx contains zero ad-hoc className="stamp" spans', () => {
      const eaLabFile = fs.readFileSync(path.resolve(__dirname, '../EaLab.tsx'), 'utf-8')
      expect(eaLabFile).not.toMatch(/className=["'][^"']*(^|\s)stamp(\s|["'])/)
    })
  })

  describe('4. Component Static Scans: Zero lingering ad-hoc stamps', () => {
    const componentsDir = path.resolve(__dirname, '..')
    const tsxFiles = fs
      .readdirSync(componentsDir)
      .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))

    it('verifies zero ad-hoc className="stamp" spans across ALL components', () => {
      const lingering: string[] = []
      tsxFiles.forEach((file) => {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8')
        if (/<span[^>]*className=["'][^"']*(^|\s)stamp(\s|["'])/.test(content)) {
          lingering.push(file)
        }
      })
      expect(lingering).toEqual([])
    })
  })

  describe('5. TradePanel Semantic Headings', () => {
    it('renders semantic h4.trade-management-title in TradePanel with active trade', () => {
      useAppStore.setState({
        activeTrade: {
          id: 'trade-active-1',
          sessionId: 'session-1',
          symbol: 'EURUSD',
          direction: 'BUY',
          entry: 1.1000,
          stopLoss: 1.0950,
          takeProfit: 1.1100,
          positionSize: 1,
          riskAmount: 50,
          openedAt: 1000,
          reason: 'Test setup'
        }
      })

      const { container } = render(<TradePanel />)
      const titles = container.querySelectorAll('h4.trade-management-title')
      expect(titles.length).toBeGreaterThan(0)
      expect(titles[0].textContent).toBe('Position Management')
    })

    it('renders semantic h4.trade-management-title in TradePanel with draft setup', () => {
      useAppStore.setState({
        activeTrade: null,
        draft: {
          direction: 'BUY',
          entry: '100.00',
          stopLoss: '95.00',
          takeProfit: '110.00',
          riskPercent: '1',
          lots: '1.0',
          timestamp: 1000
        }
      })

      const { container } = render(<TradePanel />)
      const titles = container.querySelectorAll('h4.trade-management-title')
      expect(titles.length).toBeGreaterThan(0)
      expect(titles[0].textContent).toBe('Target R:R Presets')
    })
  })
})
