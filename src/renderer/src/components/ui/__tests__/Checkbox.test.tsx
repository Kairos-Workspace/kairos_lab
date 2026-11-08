// @vitest-environment happy-dom
import React, { createRef, useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Checkbox } from '../Checkbox'

describe('Checkbox Component', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('Rendering and Structure', () => {
    it('renders with label text', () => {
      render(<Checkbox label="Auto entry" />)
      const label = screen.getByText('Auto entry')
      expect(label).toBeDefined()
      expect(label.classList.contains('ui-checkbox-label')).toBe(true)

      const input = screen.getByRole('checkbox')
      expect(input).toBeDefined()
      expect(input.classList.contains('ui-checkbox-input')).toBe(true)
    })

    it('renders with description text', () => {
      render(
        <Checkbox
          label="Pause on setup"
          description="Temporarily halts execution when signal fires"
        />
      )

      expect(screen.getByText('Pause on setup')).toBeDefined()
      const desc = screen.getByText('Temporarily halts execution when signal fires')
      expect(desc).toBeDefined()
      expect(desc.classList.contains('ui-checkbox-desc')).toBe(true)
    })

    it('omits label-group when neither label nor description is provided', () => {
      const { container } = render(<Checkbox aria-label="Standalone checkbox" />)
      expect(container.querySelector('.ui-checkbox-label-group')).toBeNull()
      expect(screen.getByRole('checkbox')).toBeDefined()
    })

    it('associates label htmlFor with input id', () => {
      const { container } = render(<Checkbox id="custom-chk-id" label="Custom ID Checkbox" />)
      const input = screen.getByRole('checkbox')
      expect(input.id).toBe('custom-chk-id')

      const labelElem = container.querySelector('label')
      expect(labelElem?.getAttribute('for')).toBe('custom-chk-id')
    })

    it('generates a fallback id if none is provided', () => {
      const { container } = render(<Checkbox label="Auto ID Checkbox" />)
      const input = screen.getByRole('checkbox')
      expect(input.id).toBeTruthy()

      const labelElem = container.querySelector('label')
      expect(labelElem?.getAttribute('for')).toBe(input.id)
    })

    it('applies ui-checkbox-error class when error is provided', () => {
      const { container } = render(<Checkbox label="Required acceptance" error="Must accept terms" />)
      const labelElem = container.querySelector('label')
      expect(labelElem?.classList.contains('ui-checkbox-error')).toBe(true)
    })

    it('merges custom className onto outer label', () => {
      const { container } = render(<Checkbox label="Class test" className="wizard-tf-item" />)
      const labelElem = container.querySelector('label')
      expect(labelElem?.classList.contains('ui-checkbox')).toBe(true)
      expect(labelElem?.classList.contains('wizard-tf-item')).toBe(true)
    })

    it('renders checkbox icon with aria-hidden="true"', () => {
      const { container } = render(<Checkbox label="Icon Checkbox" />)
      const box = container.querySelector('.ui-checkbox-box')
      expect(box).not.toBeNull()
      expect(box?.getAttribute('aria-hidden')).toBe('true')

      const svg = container.querySelector('svg.ui-checkbox-icon')
      expect(svg).not.toBeNull()
    })
  })

  describe('State and Toggle Interactions', () => {
    it('toggles unchecked to checked in uncontrolled mode', () => {
      render(<Checkbox label="Toggle me" />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(false)

      fireEvent.click(input)
      expect(input.checked).toBe(true)

      fireEvent.click(input)
      expect(input.checked).toBe(false)
    })

    it('respects defaultChecked in uncontrolled mode', () => {
      render(<Checkbox label="Default on" defaultChecked={true} />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(true)

      fireEvent.click(input)
      expect(input.checked).toBe(false)
    })

    it('works as controlled component with checked and onChange', () => {
      function ControlledHarness(): React.JSX.Element {
        const [checked, setChecked] = useState(false)
        return (
          <Checkbox
            label={`State is ${checked ? 'ON' : 'OFF'}`}
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
        )
      }

      render(<ControlledHarness />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(false)
      expect(screen.getByText('State is OFF')).toBeDefined()

      fireEvent.click(input)
      expect(input.checked).toBe(true)
      expect(screen.getByText('State is ON')).toBeDefined()

      fireEvent.click(input)
      expect(input.checked).toBe(false)
      expect(screen.getByText('State is OFF')).toBeDefined()
    })
  })

  describe('Disabled Behavior', () => {
    it('sets disabled attribute and applies ui-checkbox-disabled class', () => {
      const { container } = render(<Checkbox label="Disabled option" disabled={true} />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.disabled).toBe(true)

      const labelElem = container.querySelector('label')
      expect(labelElem?.classList.contains('ui-checkbox-disabled')).toBe(true)
    })

    it('prevents interaction and onChange when disabled', () => {
      const handleChange = vi.fn()
      render(<Checkbox label="Disabled click test" disabled={true} onChange={handleChange} />)
      const input = screen.getByRole('checkbox') as HTMLInputElement

      fireEvent.click(input)
      expect(handleChange).not.toHaveBeenCalled()
      expect(input.checked).toBe(false)
    })
  })

  describe('Ref Forwarding and Native Attributes', () => {
    it('forwards ref to underlying HTMLInputElement', () => {
      const ref = createRef<HTMLInputElement>()
      render(<Checkbox ref={ref} label="Ref test" name="test-chk" value="active" />)

      expect(ref.current).not.toBeNull()
      expect(ref.current?.tagName).toBe('INPUT')
      expect(ref.current?.type).toBe('checkbox')
      expect(ref.current?.name).toBe('test-chk')
      expect(ref.current?.value).toBe('active')
    })

    it('supports programmatic focus via ref', () => {
      const ref = createRef<HTMLInputElement>()
      render(<Checkbox ref={ref} label="Focus test" />)

      ref.current?.focus()
      expect(document.activeElement).toBe(ref.current)
    })
  })

  describe('Adversarial & Edge Cases', () => {
    it('handles rich React nodes in label, description, and error', () => {
      render(
        <Checkbox
          label={<strong data-testid="rich-label">Bold Label</strong>}
          description={<em data-testid="rich-desc">Emphasized description</em>}
          error={<span data-testid="rich-error">Validation failed</span>}
        />
      )

      expect(screen.getByTestId('rich-label').textContent).toBe('Bold Label')
      expect(screen.getByTestId('rich-desc').textContent).toBe('Emphasized description')
    })

    it('safely handles unicode, special characters, and HTML-like strings', () => {
      render(
        <Checkbox
          label="Option <1> & 2 — 100% Guaranteed 🚀"
          description="Supports $ € ¥ currencies and 'quotes' & symbols"
        />
      )

      expect(screen.getByText('Option <1> & 2 — 100% Guaranteed 🚀')).toBeDefined()
      expect(screen.getByText("Supports $ € ¥ currencies and 'quotes' & symbols")).toBeDefined()
    })

    it('forwards aria and data attributes to input', () => {
      render(
        <Checkbox
          label="Accessible option"
          data-testid="accessible-chk"
          aria-describedby="custom-helper-text"
          aria-invalid={true}
        />
      )

      const input = screen.getByTestId('accessible-chk')
      expect(input.getAttribute('aria-describedby')).toBe('custom-helper-text')
      expect(input.getAttribute('aria-invalid')).toBe('true')
    })

    it('handles rapid sequential clicks in uncontrolled mode', () => {
      render(<Checkbox label="Rapid Click" />)
      const input = screen.getByRole('checkbox') as HTMLInputElement

      for (let i = 0; i < 10; i++) {
        fireEvent.click(input)
      }

      // After 10 clicks, state should be back to false
      expect(input.checked).toBe(false)
    })
  })
})
