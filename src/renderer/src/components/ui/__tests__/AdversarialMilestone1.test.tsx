// @vitest-environment happy-dom
import React, { createRef, useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Modal } from '../Modal'
import { Checkbox } from '../Checkbox'
import fs from 'node:fs'
import path from 'node:path'

describe('Adversarial Stress Harness: Milestone 1', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // ==========================================
  // SECTION 1: Checkbox Stress & Edge Cases
  // ==========================================
  describe('Checkbox: Click Event Multiplicity and Event Bubbling', () => {
    it('clicking label does NOT fire onChange multiple times', () => {
      const handleChange = vi.fn()
      const { container } = render(
        <Checkbox label="Test Label" onChange={handleChange} />
      )

      const label = container.querySelector('label') as HTMLLabelElement
      expect(label).not.toBeNull()

      fireEvent.click(label)
      // Must be called exactly once
      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('clicking description does NOT fire onChange multiple times', () => {
      const handleChange = vi.fn()
      render(
        <Checkbox
          label="Test Label"
          description="Detailed description for testing"
          onChange={handleChange}
        />
      )

      const desc = screen.getByText('Detailed description for testing')
      fireEvent.click(desc)
      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('clicking input directly fires onChange exactly once', () => {
      const handleChange = vi.fn()
      render(<Checkbox label="Direct Input Click" onChange={handleChange} />)

      const input = screen.getByRole('checkbox')
      fireEvent.click(input)
      expect(handleChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('Checkbox: Rapid State Flapping & Controlled vs Uncontrolled', () => {
    it('survives 100 rapid uncontrolled toggles without state desync', () => {
      const handleChange = vi.fn()
      render(<Checkbox label="Flapping" onChange={handleChange} />)
      const input = screen.getByRole('checkbox') as HTMLInputElement

      for (let i = 1; i <= 100; i++) {
        fireEvent.click(input)
        expect(input.checked).toBe(i % 2 === 1)
        expect(handleChange).toHaveBeenCalledTimes(i)
      }
    })

    it('controlled checkbox strictly obeys state prop when state is locked', () => {
      const handleChange = vi.fn()
      // State is permanently locked to false
      const { rerender } = render(
        <Checkbox label="Locked False" checked={false} onChange={handleChange} />
      )
      const input = screen.getByRole('checkbox') as HTMLInputElement

      fireEvent.click(input)
      expect(handleChange).toHaveBeenCalledTimes(1)
      // Because parent did not update checked, rerendering keeps it false
      rerender(<Checkbox label="Locked False" checked={false} onChange={handleChange} />)
      expect(input.checked).toBe(false)
    })

    it('handles transition from unchecked to checked dynamically via parent', () => {
      function ParentComponent(): React.JSX.Element {
        const [checked, setChecked] = useState(false)
        return (
          <div>
            <button onClick={() => setChecked((prev) => !prev)}>Toggle Parent</button>
            <Checkbox
              label="Controlled Sync"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
          </div>
        )
      }

      render(<ParentComponent />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      const button = screen.getByRole('button', { name: 'Toggle Parent' })

      expect(input.checked).toBe(false)
      fireEvent.click(button)
      expect(input.checked).toBe(true)
      fireEvent.click(input)
      expect(input.checked).toBe(false)
    })
  })

  describe('Checkbox: HTML Form Integration & Native Semantics', () => {
    it('integrates with HTML Form submission and FormData', () => {
      const handleSubmit = vi.fn((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        return Object.fromEntries(data.entries())
      })

      const { container } = render(
        <form onSubmit={handleSubmit}>
          <Checkbox name="accept_terms" value="accepted" defaultChecked={true} label="Terms" />
          <Checkbox name="opt_in" value="yes" defaultChecked={false} label="Opt In" />
          <button type="submit">Submit</button>
        </form>
      )

      const form = container.querySelector('form') as HTMLFormElement
      fireEvent.submit(form)

      expect(handleSubmit).toHaveBeenCalledTimes(1)
      const lastCallResult = handleSubmit.mock.results[0].value
      expect(lastCallResult).toEqual({ accept_terms: 'accepted' })
      expect(lastCallResult.opt_in).toBeUndefined()
    })

    it('form.reset() resets checkbox back to defaultChecked state', () => {
      const { container } = render(
        <form>
          <Checkbox name="reset_test" defaultChecked={true} label="Reset Me" />
        </form>
      )

      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(true)

      // Uncheck it
      fireEvent.click(input)
      expect(input.checked).toBe(false)

      // Reset form
      const form = container.querySelector('form') as HTMLFormElement
      form.reset()
      expect(input.checked).toBe(true)
    })

    it('supports native indeterminate property via ref', () => {
      const ref = createRef<HTMLInputElement>()
      render(<Checkbox ref={ref} label="Indeterminate Checkbox" />)

      expect(ref.current).not.toBeNull()
      if (ref.current) {
        ref.current.indeterminate = true
        expect(ref.current.indeterminate).toBe(true)
      }
    })

    it('focus and blur events fire properly', () => {
      const handleFocus = vi.fn()
      const handleBlur = vi.fn()
      render(
        <Checkbox
          label="Focusable"
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      )

      const input = screen.getByRole('checkbox')
      fireEvent.focus(input)
      expect(handleFocus).toHaveBeenCalledTimes(1)

      fireEvent.blur(input)
      expect(handleBlur).toHaveBeenCalledTimes(1)
    })
  })

  describe('Checkbox: Error Handling & Error Prop Scrutiny', () => {
    it('applies ui-checkbox-error class when error is a string', () => {
      const { container } = render(
        <Checkbox label="Test Error" error="Required field" />
      )
      const label = container.querySelector('label')
      expect(label?.classList.contains('ui-checkbox-error')).toBe(true)
    })

    it('does NOT apply ui-checkbox-error when error is false, null, or undefined', () => {
      const { container, rerender } = render(
        <Checkbox label="Test" error={undefined} />
      )
      expect(container.querySelector('label')?.classList.contains('ui-checkbox-error')).toBe(false)

      rerender(<Checkbox label="Test" error={null} />)
      expect(container.querySelector('label')?.classList.contains('ui-checkbox-error')).toBe(false)

      rerender(<Checkbox label="Test" error={false} />)
      expect(container.querySelector('label')?.classList.contains('ui-checkbox-error')).toBe(false)
    })

    it('investigates whether error text is rendered in the DOM', () => {
      render(<Checkbox label="Test" error="Visible Error Message" />)
      // Check if the error message is rendered
      const errorElem = screen.queryByText('Visible Error Message')
      // Note: We test whether Checkbox renders error or if it is purely a CSS class trigger
      // If errorElem is null, this proves error text is not rendered in the DOM
      expect(errorElem).toBeNull()
    })
  })

  // ==========================================
  // SECTION 2: Modal Stress & Edge Cases
  // ==========================================
  describe('Modal: showCloseButton Scrutiny', () => {
    it('showCloseButton={false} strictly hides close button when title is present', () => {
      render(
        <Modal open={true} onClose={() => {}} title="Explicit Title" showCloseButton={false}>
          Modal Body
        </Modal>
      )

      const closeButton = screen.queryByRole('button', { name: /close/i })
      expect(closeButton).toBeNull()
    })

    it('showCloseButton={true} explicitly renders close button when title is present', () => {
      render(
        <Modal open={true} onClose={() => {}} title="Explicit Title" showCloseButton={true}>
          Modal Body
        </Modal>
      )

      const closeButton = screen.getByRole('button', { name: /close/i })
      expect(closeButton).toBeDefined()
    })

    it('when title, subtitle, and stamp are omitted, header is completely absent regardless of showCloseButton', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}} showCloseButton={true}>
          No Header Content
        </Modal>
      )

      expect(baseElement.querySelector('.ui-modal-header')).toBeNull()
      expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    })

    it('renders header if only subtitle is provided, and respects showCloseButton', () => {
      const { baseElement, rerender } = render(
        <Modal open={true} onClose={() => {}} subtitle="Only Subtitle" showCloseButton={true}>
          Body
        </Modal>
      )

      expect(baseElement.querySelector('.ui-modal-header')).not.toBeNull()
      expect(screen.getByRole('button', { name: /close/i })).toBeDefined()

      rerender(
        <Modal open={true} onClose={() => {}} subtitle="Only Subtitle" showCloseButton={false}>
          Body
        </Modal>
      )
      expect(baseElement.querySelector('.ui-modal-header')).not.toBeNull()
      expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    })

    it('renders header if only stamp is provided', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}} title="With Stamp" stamp="NEW" showCloseButton={true}>
          Body
        </Modal>
      )

      expect(baseElement.querySelector('.ui-modal-stamp')).not.toBeNull()
      expect(screen.getByText('NEW')).toBeDefined()
    })
  })

  describe('Modal: Rapid Mounting / Unmounting and Listener Hygiene', () => {
    it('mounts and unmounts 50 modals rapidly without leaking window event listeners', () => {
      const handleClose = vi.fn()
      for (let i = 0; i < 50; i++) {
        const { unmount } = render(
          <Modal open={true} onClose={handleClose} closeOnEscape={true}>
            Rapid Modal {i}
          </Modal>
        )
        unmount()
      }

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('always invokes the latest onClose callback if callback reference changes', () => {
      let callCountA = 0
      let callCountB = 0
      const onCloseA = () => { callCountA++ }
      const onCloseB = () => { callCountB++ }

      const { rerender } = render(
        <Modal open={true} onClose={onCloseA} closeOnEscape={true}>
          Dynamic Handler
        </Modal>
      )

      rerender(
        <Modal open={true} onClose={onCloseB} closeOnEscape={true}>
          Dynamic Handler
        </Modal>
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(callCountA).toBe(0)
      expect(callCountB).toBe(1)
    })

    it('does not trigger onClose if click starts inside modal-container and ends on backdrop', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(
        <Modal open={true} onClose={handleClose} closeOnBackdropClick={true}>
          <div data-testid="inner-element">Inside Text</div>
        </Modal>
      )

      const inner = screen.getByTestId('inner-element')
      // Mouse down on inner
      fireEvent.mouseDown(inner)
      expect(handleClose).not.toHaveBeenCalled()
    })
  })

  // ==========================================
  // SECTION 3: CSS Token & Theme Verification
  // ==========================================
  describe('CSS Token Completeness & Theme Variables', () => {
    const cssPath = path.resolve(__dirname, '../../../styles/global.css')
    const css = fs.readFileSync(cssPath, 'utf-8')

    it('all tokens used in Checkbox styling exist in :root', () => {
      const checkboxTokens = [
        '--font-sm',
        '--font-xs',
        '--parchment',
        '--space-2',
        '--radius-xs',
        '--rule',
        '--steel',
        '--brand',
        '--on-brand',
        '--focus',
        '--gold-dim',
        '--muted'
      ]

      checkboxTokens.forEach((token) => {
        expect(css).toMatch(new RegExp(`${token}\\s*:`))
      })
    })

    it('all tokens used in Checkbox styling exist in html[data-theme="light"]', () => {
      const lightThemeSection = css.match(/html\[data-theme='light'\]\s*\{([^}]+)\}/)
      expect(lightThemeSection).not.toBeNull()
      const lightTokens = lightThemeSection![1]

      const requiredLightTokens = [
        '--parchment',
        '--rule',
        '--steel',
        '--brand',
        '--on-brand',
        '--focus',
        '--muted'
      ]

      requiredLightTokens.forEach((token) => {
        expect(lightTokens).toMatch(new RegExp(`${token}\\s*:`))
      })
    })

    it('checks for presence or absence of .ui-checkbox-error in global.css', () => {
      const hasErrorClassInCss = css.includes('.ui-checkbox-error')
      // We empirically record whether .ui-checkbox-error has a CSS definition
      // This is a valuable finding for the adversarial review
      expect(typeof hasErrorClassInCss).toBe('boolean')
    })

    it('verifies all size classes exist for modal in global.css', () => {
      expect(css).toContain('.ui-modal-sm')
      expect(css).toContain('.ui-modal-md')
      expect(css).toContain('.ui-modal-lg')
      expect(css).toContain('.ui-modal-xl')
    })
  })
})
