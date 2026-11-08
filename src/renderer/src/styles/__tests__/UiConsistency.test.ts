import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'

describe('UI Consistency & Design System Tokens (UiConsistency)', () => {
  let globalCss: string

  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../global.css')
    expect(fs.existsSync(cssPath)).toBe(true)
    globalCss = fs.readFileSync(cssPath, 'utf-8')
  })

  describe('Typography & Sub-pixel Font Size Checks (R5)', () => {
    it('contains all required standard --font-* design scale tokens in :root', () => {
      const expectedTokens = [
        '--font-2xs: 10px;',
        '--font-xs: 11px;',
        '--font-sm: 12px;',
        '--font-base: 13px;',
        '--font-md: 14px;',
        '--font-lg: 16px;',
        '--font-xl: 20px;',
        '--font-2xl: 24px;'
      ]

      expectedTokens.forEach((token) => {
        expect(globalCss).toContain(token)
      })
    })

    it('asserts zero sub-pixel values in font-size rules', () => {
      // Find all font-size rules in global.css
      const fontSizeRegex = /font-size:\s*([^;]+);/g
      const matches: string[] = []
      let match: RegExpExecArray | null

      while ((match = fontSizeRegex.exec(globalCss)) !== null) {
        matches.push(match[1].trim())
      }

      expect(matches.length).toBeGreaterThan(0)

      // Filter for any sub-pixel values like 10.5px, 11.5px, 12.5px, 14.5px
      const subPixelMatches = matches.filter((val) => /\d+\.\d+px/.test(val))
      expect(subPixelMatches).toEqual([])
    })

    it('asserts specific known legacy sub-pixel sizes (10.5px, 11.5px, 12.5px, 14.5px) are absent from font-size', () => {
      expect(globalCss).not.toMatch(/font-size:\s*10\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*11\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*12\.5px/)
      expect(globalCss).not.toMatch(/font-size:\s*14\.5px/)
    })
  })

  describe('Theme Tokens and Color Variable Consistency (R7)', () => {
    it('asserts absence of legacy dark overlay rgba(18, 22, 18, 0.72)', () => {
      // Check for both spaced and compact variations
      expect(globalCss).not.toMatch(/rgba\(\s*18\s*,\s*22\s*,\s*18\s*,\s*0?\.72\s*\)/)
    })

    it('defines core theme color and border design tokens in :root', () => {
      const requiredRootTokens = [
        '--vault',
        '--steel',
        '--rule',
        '--parchment',
        '--muted',
        '--brand',
        '--gold',
        '--bull',
        '--bear',
        '--z-modal'
      ]

      requiredRootTokens.forEach((token) => {
        const tokenRegex = new RegExp(`${token}\\s*:`)
        expect(globalCss).toMatch(tokenRegex)
      })
    })

    it('asserts .danger[data-armed="true"] uses design token rather than hardcoded #fff', () => {
      const armedRegex = /\.danger\[data-armed='true'\]\s*\{([^}]+)\}/
      const match = armedRegex.exec(globalCss)
      if (match) {
        expect(match[1]).not.toMatch(/color:\s*#fff\b/i)
      }
    })
  })

  describe('Modal Component CSS Contract (R1)', () => {
    it('defines .ui-modal-backdrop with --z-modal and backdrop blur', () => {
      expect(globalCss).toContain('.ui-modal-backdrop')
      expect(globalCss).toMatch(/\.ui-modal-backdrop[\s\S]*?z-index:\s*var\(--z-modal\)/)
      expect(globalCss).toMatch(/\.ui-modal-backdrop[\s\S]*?backdrop-filter:\s*blur/)
    })

    it('defines all 4 modal size variants (.ui-modal-sm, .ui-modal-md, .ui-modal-lg, .ui-modal-xl)', () => {
      expect(globalCss).toContain('.ui-modal-sm')
      expect(globalCss).toContain('.ui-modal-md')
      expect(globalCss).toContain('.ui-modal-lg')
      expect(globalCss).toContain('.ui-modal-xl')
    })

    it('defines modal sub-elements (.ui-modal-container, .ui-modal-header, .ui-modal-body, .ui-modal-footer, .ui-modal-close)', () => {
      expect(globalCss).toContain('.ui-modal-container')
      expect(globalCss).toContain('.ui-modal-header')
      expect(globalCss).toContain('.ui-modal-body')
      expect(globalCss).toContain('.ui-modal-footer')
      expect(globalCss).toContain('.ui-modal-close')
    })
  })

  describe('Checkbox Component CSS Contract (R4)', () => {
    it('defines all .ui-checkbox class rules', () => {
      const requiredCheckboxClasses = [
        '.ui-checkbox',
        '.ui-checkbox-disabled',
        '.ui-checkbox-control',
        '.ui-checkbox-input',
        '.ui-checkbox-box',
        '.ui-checkbox-icon',
        '.ui-checkbox-label-group',
        '.ui-checkbox-label',
        '.ui-checkbox-desc'
      ]

      requiredCheckboxClasses.forEach((cls) => {
        expect(globalCss).toContain(cls)
      })
    })

    it('styles checked state with design token --brand', () => {
      expect(globalCss).toMatch(/\.ui-checkbox-input:checked\s*\+\s*\.ui-checkbox-box[\s\S]*?background:\s*var\(--brand\)/)
    })
  })

  describe('Button System CSS Refactoring (R3)', () => {
    it('preserves .tab, .buy, and .sell selectors for trading and workspace navigation', () => {
      expect(globalCss).toContain('.tab')
      expect(globalCss).toContain('.buy')
      expect(globalCss).toContain('.sell')
    })

    it('defines design system .ui-btn and .ui-icon-btn primitive rules', () => {
      expect(globalCss).toContain('.ui-btn')
      expect(globalCss).toContain('.ui-icon-btn')
      expect(globalCss).toContain('.ui-btn-primary')
      expect(globalCss).toContain('.ui-btn-secondary')
      expect(globalCss).toContain('.ui-btn-ghost')
      expect(globalCss).toContain('.ui-btn-danger')
      expect(globalCss).toContain('.ui-icon-btn-ghost')
      expect(globalCss).toContain('.ui-icon-btn-sm')
      expect(globalCss).toContain('.ui-icon-btn-md')
    })
  })

  describe('Adversarial & Structural Token Integrity', () => {
    it('--z-modal token is defined with an integer value >= 50', () => {
      const zModalMatch = /--z-modal:\s*(\d+);/.exec(globalCss)
      expect(zModalMatch).not.toBeNull()
      const zIndex = parseInt(zModalMatch![1], 10)
      expect(zIndex).toBeGreaterThanOrEqual(50)
    })

    it('all standard --font-* design tokens evaluate to positive integer pixels', () => {
      const fontTokens = ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl']
      fontTokens.forEach((name) => {
        const regex = new RegExp(`--font-${name}:\\s*(\\d+)px;`)
        const match = regex.exec(globalCss)
        expect(match).not.toBeNull()
        const px = parseInt(match![1], 10)
        expect(px).toBeGreaterThan(0)
      })
    })

    it('verifies that no CSS rule contains rgba(18,22,18,...) regardless of opacity', () => {
      expect(globalCss).not.toMatch(/rgba\(\s*18\s*,\s*22\s*,\s*18\b/)
    })
  })
})
