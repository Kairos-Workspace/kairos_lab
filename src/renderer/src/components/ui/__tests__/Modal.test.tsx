// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Modal } from '../Modal'
import type { ModalSize } from '../Modal'

describe('Modal Component', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('Portaling and Visibility', () => {
    it('renders into document.body when open is true', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(
        <Modal open={true} onClose={handleClose} title="Test Modal">
          <p>Modal body content</p>
        </Modal>
      )

      const backdrop = baseElement.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.parentElement).toBe(document.body)
      expect(screen.getByRole('dialog')).toBe(backdrop)
      expect(backdrop?.getAttribute('aria-modal')).toBe('true')
      expect(screen.getByText('Modal body content')).toBeDefined()
    })

    it('renders null and appends nothing when open is false', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(
        <Modal open={false} onClose={handleClose} title="Closed Modal">
          <p>Hidden content</p>
        </Modal>
      )

      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(screen.queryByText('Hidden content')).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('Modal Sizing', () => {
    const sizes: ModalSize[] = ['sm', 'md', 'lg', 'xl']

    sizes.forEach((size) => {
      it(`applies correct CSS class for size="${size}"`, () => {
        const { baseElement } = render(
          <Modal open={true} onClose={() => {}} size={size} title={`${size} modal`}>
            Content
          </Modal>
        )

        const container = baseElement.querySelector('.ui-modal-container')
        expect(container).not.toBeNull()
        expect(container?.classList.contains(`ui-modal-${size}`)).toBe(true)
      })
    })

    it('defaults to size="md" when size is omitted', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}} title="Default Size">
          Content
        </Modal>
      )

      const container = baseElement.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-md')).toBe(true)
    })

    it('merges custom className onto modal container', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}} className="custom-theme-class">
          Content
        </Modal>
      )

      const container = baseElement.querySelector('.ui-modal-container')
      expect(container?.classList.contains('custom-theme-class')).toBe(true)
      expect(container?.classList.contains('ui-modal-md')).toBe(true)
    })
  })

  describe('Header, Stamp, Subtitle, and Close Button', () => {
    it('renders title, subtitle, and stamp badge', () => {
      const { baseElement } = render(
        <Modal
          open={true}
          onClose={() => {}}
          title="Export Strategy"
          subtitle="Configure format parameters"
          stamp="BETA"
        >
          Body
        </Modal>
      )

      expect(screen.getByText('Export Strategy')).toBeDefined()
      expect(screen.getByText('Configure format parameters')).toBeDefined()
      const stampBadge = baseElement.querySelector('.ui-modal-stamp')
      expect(stampBadge).not.toBeNull()
      expect(stampBadge?.textContent).toContain('BETA')
      expect(stampBadge?.classList.contains('ui-badge-stamp')).toBe(true)
      expect(stampBadge?.classList.contains('ui-badge-sm')).toBe(true)
    })

    it('associates aria-labelledby with title ID', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}} title="Aria Title">
          Body
        </Modal>
      )

      const dialog = baseElement.querySelector('[role="dialog"]')
      const titleElem = screen.getByText('Aria Title')
      const titleId = titleElem.getAttribute('id')

      expect(titleId).toBeTruthy()
      expect(dialog?.getAttribute('aria-labelledby')).toBe(titleId)
    })

    it('renders close button by default and triggers onClose when clicked', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} title="With Close Button">
          Body
        </Modal>
      )

      const closeButton = screen.getByRole('button', { name: /close/i })
      expect(closeButton).toBeDefined()
      expect(closeButton.classList.contains('ui-modal-close')).toBe(true)

      fireEvent.click(closeButton)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('hides close button when showCloseButton={false}', () => {
      render(
        <Modal open={true} onClose={() => {}} title="No Close Button" showCloseButton={false}>
          Body
        </Modal>
      )

      const closeBtn = screen.queryByRole('button', { name: /close/i })
      expect(closeBtn).toBeNull()
    })

    it('omits header when neither title, stamp, nor subtitle is provided', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}}>
          Body without header
        </Modal>
      )

      expect(baseElement.querySelector('.ui-modal-header')).toBeNull()
      expect(screen.getByText('Body without header')).toBeDefined()
    })
  })

  describe('Dismissal Behavior', () => {
    it('calls onClose when clicking directly on backdrop (closeOnBackdropClick=true)', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(
        <Modal open={true} onClose={handleClose} closeOnBackdropClick={true}>
          <div data-testid="inner-content">Inside Container</div>
        </Modal>
      )

      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      expect(backdrop).not.toBeNull()

      // Click backdrop directly
      fireEvent.mouseDown(backdrop)
      expect(handleClose).toHaveBeenCalledTimes(1)

      // Click inside container should not call onClose
      const inner = screen.getByTestId('inner-content')
      fireEvent.mouseDown(inner)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose on backdrop click when closeOnBackdropClick={false}', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(
        <Modal open={true} onClose={handleClose} closeOnBackdropClick={false}>
          Inside Container
        </Modal>
      )

      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('calls onClose when pressing Escape key (closeOnEscape=true)', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnEscape={true}>
          Body
        </Modal>
      )

      // Press non-Escape key first
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(handleClose).not.toHaveBeenCalled()

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose on Escape when closeOnEscape={false}', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnEscape={false}>
          Body
        </Modal>
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })
  })

  describe('Footer and Children', () => {
    it('renders footer inside .ui-modal-footer when provided', () => {
      const { baseElement } = render(
        <Modal
          open={true}
          onClose={() => {}}
          footer={<button type="button">Confirm Action</button>}
        >
          Body
        </Modal>
      )

      const footer = baseElement.querySelector('.ui-modal-footer')
      expect(footer).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Confirm Action' })).toBeDefined()
    })

    it('omits .ui-modal-footer when footer is not provided', () => {
      const { baseElement } = render(
        <Modal open={true} onClose={() => {}}>
          Body Only
        </Modal>
      )

      expect(baseElement.querySelector('.ui-modal-footer')).toBeNull()
    })
  })

  describe('Adversarial & Edge Cases', () => {
    it('safely handles special characters and formatting tags in title/subtitle', () => {
      render(
        <Modal
          open={true}
          onClose={() => {}}
          title={'<script>alert("xss")</script> & "quotes"'}
          subtitle={'<b>Bold text</b> & <svg onload="evil()"/>'}
        >
          Special Content
        </Modal>
      )

      expect(screen.getByText('<script>alert("xss")</script> & "quotes"')).toBeDefined()
      expect(screen.getByText('<b>Bold text</b> & <svg onload="evil()"/>')).toBeDefined()
    })

    it('cleans up window keydown event listener when unmounted', () => {
      const handleClose = vi.fn()
      const { unmount } = render(
        <Modal open={true} onClose={handleClose} closeOnEscape={true}>
          Escape Listener
        </Modal>
      )

      unmount()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('cleans up window keydown event listener when toggling open from true to false', () => {
      const handleClose = vi.fn()
      const { rerender } = render(
        <Modal open={true} onClose={handleClose} closeOnEscape={true}>
          Dynamic Modal
        </Modal>
      )

      rerender(
        <Modal open={false} onClose={handleClose} closeOnEscape={true}>
          Dynamic Modal
        </Modal>
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('supports rapid escape keypresses without multiple listener accumulation', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} closeOnEscape={true}>
          Rapid Escape
        </Modal>
      )

      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(window, { key: 'Escape' })
      }

      expect(handleClose).toHaveBeenCalledTimes(5)
    })
  })
})
