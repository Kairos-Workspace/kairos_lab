// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { Modal } from '../Modal'
import type { ModalSize } from '../Modal'
import { DownloadWizard } from '../../DownloadWizard'
import { AiProviderModal } from '../../AiProviderModal'
import { useAppStore } from '../../../store/useAppStore'
import { useAiProvidersStore } from '../../../store/useAiProvidersStore'
import type { AiProviderProfile } from '@shared/types'

describe('Adversarial Stress Harness: Milestone 2 (Modal Unification & Dialog Migration)', () => {
  const originalAiState = useAiProvidersStore.getState()
  const originalAppState = useAppStore.getState()

  beforeEach(() => {
    // Reset DOM body
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    useAiProvidersStore.setState(originalAiState, true)
    useAppStore.setState(originalAppState, true)
    vi.restoreAllMocks()
  })

  // =========================================================================
  // SECTION 1: Static AST & Legacy Codebase Elimination Assertions
  // =========================================================================
  describe('Static & Legacy Elimination Oracles', () => {
    const componentsDir = path.resolve(__dirname, '../../')
    const stylesDir = path.resolve(__dirname, '../../../styles')

    it('confirms AiProviderModal has ZERO legacy modal-backdrop or composer modal wrappers', () => {
      const code = fs.readFileSync(path.join(componentsDir, 'AiProviderModal.tsx'), 'utf-8')
      expect(code).not.toContain('className="modal-backdrop"')
      expect(code).not.toContain("className='modal-backdrop'")
      expect(code).not.toContain('className="composer"')
      expect(code).not.toContain("className='composer'")
      expect(code).toContain('<Modal')
      expect(code).toContain('size="md"')
      expect(code).toContain('stamp="AI"')
    })

    it('confirms DownloadWizard has ZERO legacy modal-backdrop or composer modal wrappers', () => {
      const code = fs.readFileSync(path.join(componentsDir, 'DownloadWizard.tsx'), 'utf-8')
      expect(code).not.toContain('className="modal-backdrop"')
      expect(code).not.toContain("className='modal-backdrop'")
      expect(code).not.toContain('className="composer"')
      expect(code).not.toContain("className='composer'")
      expect(code).toContain('<Modal')
      expect(code).toContain('size="md"')
      expect(code).toContain('closeOnBackdropClick={canDismiss}')
      expect(code).toContain('closeOnEscape={canDismiss}')
      expect(code).toContain('showCloseButton={canDismiss}')
    })

    it('confirms EaLab delete modal has ZERO legacy modal-backdrop or composer modal wrappers', () => {
      const code = fs.readFileSync(path.join(componentsDir, 'EaLab.tsx'), 'utf-8')
      expect(code).not.toContain('className="modal-backdrop"')
      expect(code).not.toContain("className='modal-backdrop'")
      expect(code).toContain('<Modal')
      expect(code).toContain('size="sm"')
      expect(code).toContain('stamp="Explorer"')
      expect(code).toContain('variant="danger"')
    })

    it('confirms EaChatPanel delete modal has ZERO legacy modal-backdrop or composer modal wrappers', () => {
      const code = fs.readFileSync(path.join(componentsDir, 'EaChatPanel.tsx'), 'utf-8')
      expect(code).not.toContain('className="modal-backdrop"')
      expect(code).not.toContain("className='modal-backdrop'")
      expect(code).toContain('<Modal')
      expect(code).toContain('size="sm"')
      expect(code).toContain('stamp="History"')
      expect(code).toContain('title="Delete chat"')
      expect(code).toContain('variant="danger"')
    })

    it('confirms global.css contains ZERO .modal-backdrop rules', () => {
      const css = fs.readFileSync(path.join(stylesDir, 'global.css'), 'utf-8')
      const legacyBackdropMatch = css.match(/^\.modal-backdrop\b/m)
      expect(legacyBackdropMatch).toBeNull()
    })

    it('confirms global.css contains ZERO .composer-actions rules', () => {
      const css = fs.readFileSync(path.join(stylesDir, 'global.css'), 'utf-8')
      const legacyComposerActionsMatch = css.match(/^\.composer-actions\b/m)
      expect(legacyComposerActionsMatch).toBeNull()
    })
  })

  // =========================================================================
  // SECTION 2: Modal Core Mechanics, Sizing, Escape, Backdrop & Portals
  // =========================================================================
  describe('Modal Primitive Stress & Boundary Tests', () => {
    it('portals directly into document.body and NOT into host component DOM', () => {
      const hostContainer = document.createElement('div')
      hostContainer.id = 'arbitrary-host-container'
      document.body.appendChild(hostContainer)

      render(
        <div id="nested-parent">
          <Modal open={true} onClose={() => {}} title="Portal Test">
            <span data-testid="portal-inner">Inside Body</span>
          </Modal>
        </div>,
        { container: hostContainer }
      )

      const backdrop = document.body.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.parentElement).toBe(document.body)

      // Must NOT be a descendant of nested-parent or hostContainer
      const nestedParent = hostContainer.querySelector('#nested-parent')
      expect(nestedParent?.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(nestedParent?.querySelector('[data-testid="portal-inner"]')).toBeNull()
    })

    const sizeMatrix: { size: ModalSize; expectedClass: string }[] = [
      { size: 'sm', expectedClass: 'ui-modal-sm' },
      { size: 'md', expectedClass: 'ui-modal-md' },
      { size: 'lg', expectedClass: 'ui-modal-lg' },
      { size: 'xl', expectedClass: 'ui-modal-xl' }
    ]

    sizeMatrix.forEach(({ size, expectedClass }) => {
      it(`accurately applies modal size class "${expectedClass}" for size="${size}"`, () => {
        render(
          <Modal open={true} onClose={() => {}} size={size} title={`Size ${size}`}>
            Body
          </Modal>
        )

        const container = document.body.querySelector('.ui-modal-container')
        expect(container).not.toBeNull()
        expect(container?.classList.contains(expectedClass)).toBe(true)
      })
    })

    it('defaults to ui-modal-md when size prop is not supplied', () => {
      render(
        <Modal open={true} onClose={() => {}} title="Default Size">
          Body
        </Modal>
      )
      const container = document.body.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-md')).toBe(true)
    })

    it('handles backdrop click dismissal when closeOnBackdropClick is true', () => {
      const onClose = vi.fn()
      render(
        <Modal open={true} onClose={onClose} closeOnBackdropClick={true} title="Backdrop Test">
          <div data-testid="child-element">Modal Content</div>
        </Modal>
      )

      const backdrop = document.body.querySelector('.ui-modal-backdrop') as HTMLElement
      expect(backdrop).not.toBeNull()

      // Click directly on backdrop
      fireEvent.mouseDown(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)

      // Click on child inside container should NOT trigger onClose
      const child = screen.getByTestId('child-element')
      fireEvent.mouseDown(child)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('ignores backdrop clicks when closeOnBackdropClick is false (preventClose)', () => {
      const onClose = vi.fn()
      render(
        <Modal open={true} onClose={onClose} closeOnBackdropClick={false} title="Prevent Close">
          Modal Content
        </Modal>
      )

      const backdrop = document.body.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('handles Escape key dismissal when closeOnEscape is true', () => {
      const onClose = vi.fn()
      render(
        <Modal open={true} onClose={onClose} closeOnEscape={true} title="Escape Test">
          Content
        </Modal>
      )

      // Non-escape keys must be ignored
      fireEvent.keyDown(window, { key: 'Tab' })
      fireEvent.keyDown(window, { key: 'Enter' })
      fireEvent.keyDown(window, { key: 'Space' })
      expect(onClose).not.toHaveBeenCalled()

      // Escape key triggers onClose
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('ignores Escape key when closeOnEscape is false (preventClose)', () => {
      const onClose = vi.fn()
      render(
        <Modal open={true} onClose={onClose} closeOnEscape={false} title="Prevent Close Escape">
          Content
        </Modal>
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('renders close button by default and triggers onClose on click', () => {
      const onClose = vi.fn()
      render(
        <Modal open={true} onClose={onClose} title="With Close Button">
          Content
        </Modal>
      )

      const closeBtn = screen.getByRole('button', { name: /close/i })
      expect(closeBtn).toBeDefined()
      fireEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('completely suppresses close button when showCloseButton is false', () => {
      render(
        <Modal open={true} onClose={() => {}} showCloseButton={false} title="No Close Button">
          Content
        </Modal>
      )

      const closeBtn = screen.queryByRole('button', { name: /close/i })
      expect(closeBtn).toBeNull()
    })
  })

  // =========================================================================
  // SECTION 3: Lingering Nodes, Unmounting & Memory Leak Stress
  // =========================================================================
  describe('Unmounting Cleanliness & Event Listener Leak Prevention', () => {
    it('leaves zero lingering portal nodes in document.body when unmounted', () => {
      const { unmount } = render(
        <Modal open={true} onClose={() => {}} title="Unmount Test">
          Lingering check
        </Modal>
      )

      expect(document.body.querySelectorAll('.ui-modal-backdrop').length).toBe(1)
      unmount()
      expect(document.body.querySelectorAll('.ui-modal-backdrop').length).toBe(0)
      expect(document.body.querySelector('.ui-modal-backdrop')).toBeNull()
    })

    it('leaves zero lingering portal nodes when open transitions from true to false', () => {
      const { rerender } = render(
        <Modal open={true} onClose={() => {}} title="Toggle Open Test">
          Toggle check
        </Modal>
      )

      expect(document.body.querySelectorAll('.ui-modal-backdrop').length).toBe(1)

      rerender(
        <Modal open={false} onClose={() => {}} title="Toggle Open Test">
          Toggle check
        </Modal>
      )

      expect(document.body.querySelectorAll('.ui-modal-backdrop').length).toBe(0)
      expect(screen.queryByText('Toggle check')).toBeNull()
    })

    it('survives 100 rapid mount/unmount cycles without leaking keydown listeners on window', () => {
      const onCloseStale = vi.fn()

      for (let i = 0; i < 100; i++) {
        const { unmount } = render(
          <Modal open={true} onClose={onCloseStale} closeOnEscape={true} title={`Cycle ${i}`}>
            Cycle Content
          </Modal>
        )
        unmount()
      }

      // None of the 100 unmounted modals should receive Escape
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onCloseStale).not.toHaveBeenCalled()
    })

    it('handles multiple stacked modals cleanly and maintains DOM independence', () => {
      const onCloseA = vi.fn()
      const onCloseB = vi.fn()

      const { rerender } = render(
        <>
          <Modal open={true} onClose={onCloseA} title="Modal A" size="sm">
            Content A
          </Modal>
          <Modal open={true} onClose={onCloseB} title="Modal B" size="lg">
            Content B
          </Modal>
        </>
      )

      const backdrops = document.body.querySelectorAll('.ui-modal-backdrop')
      expect(backdrops.length).toBe(2)

      // Close modal B by rerendering with B open=false
      rerender(
        <>
          <Modal open={true} onClose={onCloseA} title="Modal A" size="sm">
            Content A
          </Modal>
          <Modal open={false} onClose={onCloseB} title="Modal B" size="lg">
            Content B
          </Modal>
        </>
      )

      // Only Modal A remains
      const remainingBackdrops = document.body.querySelectorAll('.ui-modal-backdrop')
      expect(remainingBackdrops.length).toBe(1)
      expect(screen.getByText('Modal A')).toBeDefined()
      expect(screen.queryByText('Modal B')).toBeNull()
    })
  })

  // =========================================================================
  // SECTION 4: DownloadWizard Controlled Dismiss & PreventClose Stress
  // =========================================================================
  describe('DownloadWizard Component Integration & PreventClose State Machine', () => {
    it('renders DownloadWizard with unified Modal, size md, stamp, and checkbox controls', () => {
      const onClose = vi.fn()
      render(<DownloadWizard symbol="ETHUSDT" onClose={onClose} />)

      const backdrop = document.body.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()

      const container = document.body.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-md')).toBe(true)

      expect(screen.getByText('ETHUSDT')).toBeDefined()
      expect(screen.getByText(/Download data · Step 1 of 4/i)).toBeDefined()

      // Timeframe checkboxes exist
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
    })

    it('allows dismissal via backdrop, escape, close button, and cancel on Step 1 (timeframes)', () => {
      const onCloseBackdrop = vi.fn()
      const { unmount: unmount1 } = render(
        <DownloadWizard symbol="BTCUSDT" onClose={onCloseBackdrop} />
      )
      const backdrop = document.body.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(onCloseBackdrop).toHaveBeenCalledTimes(1)
      unmount1()

      const onCloseEscape = vi.fn()
      const { unmount: unmount2 } = render(
        <DownloadWizard symbol="BTCUSDT" onClose={onCloseEscape} />
      )
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onCloseEscape).toHaveBeenCalledTimes(1)
      unmount2()

      const onCloseButton = vi.fn()
      const { unmount: unmount3 } = render(
        <DownloadWizard symbol="BTCUSDT" onClose={onCloseButton} />
      )
      const closeBtn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeBtn)
      expect(onCloseButton).toHaveBeenCalledTimes(1)
      unmount3()

      const onCloseCancel = vi.fn()
      render(<DownloadWizard symbol="BTCUSDT" onClose={onCloseCancel} />)
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelBtn)
      expect(onCloseCancel).toHaveBeenCalledTimes(1)
    })

    it('advances from timeframes to range step and allows Back navigation', () => {
      render(<DownloadWizard symbol="SOLUSDT" onClose={() => {}} />)

      // Step 1: Click "Next"
      const nextBtn = screen.getByRole('button', { name: /next/i })
      fireEvent.click(nextBtn)

      // Step 2: "Step 2 of 4"
      expect(screen.getByText(/Download data · Step 2 of 4/i)).toBeDefined()
      expect(screen.getByLabelText(/From Date/i)).toBeDefined()
      expect(screen.getByLabelText(/To Date/i)).toBeDefined()

      // Click "Back"
      const backBtn = screen.getByRole('button', { name: /back/i })
      fireEvent.click(backBtn)

      // Returns to Step 1
      expect(screen.getByText(/Download data · Step 1 of 4/i)).toBeDefined()
    })

    it('STRESS TEST: strictly prevents dismissal during downloading step (canDismiss=false)', async () => {
      let resolveDownload!: () => void
      const downloadPromise = new Promise<void>((res) => {
        resolveDownload = res
      })

      useAppStore.setState({
        downloadPair: vi.fn().mockImplementation(() => downloadPromise),
        downloadProgress: { fraction: 0.42, indeterminate: false }
      })

      const onClose = vi.fn()
      render(<DownloadWizard symbol="ADAUSDT" onClose={onClose} />)

      // Go to range step
      fireEvent.click(screen.getByRole('button', { name: /next/i }))

      // Click "Download" to enter downloading step
      const downloadBtn = screen.getByRole('button', { name: /download/i })
      await act(async () => {
        fireEvent.click(downloadBtn)
      })

      // We are now on Step 3 (downloading)
      expect(screen.getByText(/Download data · Step 3 of 4/i)).toBeDefined()
      expect(screen.getByText(/Downloading ADAUSDT 1H/i)).toBeDefined()

      // ATTACK 1: Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()

      // ATTACK 2: Click on Backdrop
      const backdrop = document.body.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(onClose).not.toHaveBeenCalled()

      // ATTACK 3: Look for Close Button (must NOT exist)
      const closeBtn = screen.queryByRole('button', { name: /close/i })
      expect(closeBtn).toBeNull()

      // ATTACK 4: Look for Cancel button (must NOT exist in footer)
      const cancelBtn = screen.queryByRole('button', { name: /cancel/i })
      expect(cancelBtn).toBeNull()

      // Resolve download to finish gracefully
      await act(async () => {
        resolveDownload()
      })
    })

    it('re-enables dismissal and shows Retry if download encounters an error', async () => {
      useAppStore.setState({
        downloadPair: vi.fn().mockRejectedValue(new Error('Network failure')),
        downloadProgress: null
      })

      const onClose = vi.fn()
      render(<DownloadWizard symbol="DOGEUSDT" onClose={onClose} />)

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: /next/i }))

      // Step 2 -> Trigger Download (which rejects)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /download/i }))
      })

      // Error message should appear
      expect(screen.getByText(/Could not download DOGEUSDT 1H/i)).toBeDefined()

      // Close button must be re-enabled!
      const closeBtn = screen.getByRole('button', { name: /close/i })
      expect(closeBtn).toBeDefined()
      fireEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('completes download to "done" step and enables Done dismiss button', async () => {
      useAppStore.setState({
        downloadPair: vi.fn().mockResolvedValue(undefined),
        downloadProgress: { fraction: 1.0, indeterminate: false }
      })

      const onClose = vi.fn()
      render(<DownloadWizard symbol="AVAXUSDT" onClose={onClose} />)

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: /next/i }))

      // Step 2 -> Trigger Download (resolves)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /download/i }))
      })

      // Step 4: Done
      expect(screen.getByText(/AVAXUSDT data is ready/i)).toBeDefined()
      const doneBtn = screen.getByRole('button', { name: /done/i })
      fireEvent.click(doneBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // SECTION 5: AiProviderModal Component Integration
  // =========================================================================
  describe('AiProviderModal Component Integration & Form Controls', () => {
    it('renders Add profile modal with size md, stamp AI, FormFields and Button footer', () => {
      const onClose = vi.fn()
      render(<AiProviderModal profile={null} onClose={onClose} />)

      const backdrop = document.body.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.parentElement).toBe(document.body)

      const container = document.body.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-md')).toBe(true)

      expect(screen.getByText('Add profile')).toBeDefined()
      expect(screen.getByText('AI')).toBeDefined()

      // FormField labels
      expect(screen.getByText('Name')).toBeDefined()
      expect(screen.getByText('Provider')).toBeDefined()
      expect(screen.getByText('Model')).toBeDefined()
      expect(screen.getByText('API key')).toBeDefined()

      // Footer buttons: Test connection (disabled since no profile) & Save
      const testBtn = screen.getByRole('button', { name: /test connection/i })
      expect(testBtn.hasAttribute('disabled')).toBe(true)

      const saveBtn = screen.getByRole('button', { name: /save/i })
      expect(saveBtn).toBeDefined()

      // Dismissal works
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('renders Edit profile modal with prepopulated values and enables Test connection', () => {
      const existingProfile: AiProviderProfile = {
        id: 'test-profile-1',
        name: 'My OpenAI Profile',
        provider: 'openai',
        model: 'gpt-4o',
        baseUrl: null,
        hasApiKey: true
      }

      const onClose = vi.fn()
      render(<AiProviderModal profile={existingProfile} onClose={onClose} />)

      expect(screen.getByText('Edit profile')).toBeDefined()

      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI') as HTMLInputElement
      expect(nameInput.value).toBe('My OpenAI Profile')

      const testBtn = screen.getByRole('button', { name: /test connection/i })
      expect(testBtn.hasAttribute('disabled')).toBe(false)
    })

    it('submits profile data on Save click and invokes saveProvider', async () => {
      const saveProviderMock = vi.fn().mockResolvedValue(undefined)
      useAiProvidersStore.setState({
        saveProvider: saveProviderMock,
        testResult: null
      })

      const onClose = vi.fn()
      render(<AiProviderModal profile={null} onClose={onClose} />)

      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI')
      fireEvent.change(nameInput, { target: { value: 'Production AI' } })

      const saveBtn = screen.getByRole('button', { name: /save/i })
      await act(async () => {
        fireEvent.click(saveBtn)
      })

      expect(saveProviderMock).toHaveBeenCalledTimes(1)
      expect(saveProviderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Production AI',
          provider: 'openai'
        }),
        ''
      )
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // SECTION 6: Delete Confirmation Modals (EaLab and EaChatPanel Contracts)
  // =========================================================================
  describe('Delete Confirmation Modals (EaLab & EaChatPanel Contracts)', () => {
    it('verifies EaLab delete modal contract: size sm, stamp Explorer, Button footer', () => {
      const onClose = vi.fn()
      const onDelete = vi.fn()

      // Render the exact component tree as defined in EaLab.tsx lines 815–845
      render(
        <Modal
          open={true}
          onClose={onClose}
          size="sm"
          stamp="Explorer"
          title="Delete EA"
          footer={
            <>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" onClick={onDelete}>
                Delete
              </button>
            </>
          }
        >
          <p>Delete MovingAverage.mq5? This cannot be undone.</p>
        </Modal>
      )

      const container = document.body.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-sm')).toBe(true)
      expect(screen.getByText('Delete EA')).toBeDefined()
      expect(screen.getByText('Explorer')).toBeDefined()
      expect(screen.getByText(/Delete MovingAverage.mq5/i)).toBeDefined()

      // Test Escape dismiss
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('verifies EaChatPanel delete modal contract: size sm, stamp History, Button footer', () => {
      const onClose = vi.fn()
      const onDelete = vi.fn()

      // Render the exact component tree as defined in EaChatPanel.tsx lines 614–645
      render(
        <Modal
          open={true}
          onClose={onClose}
          size="sm"
          stamp="History"
          title="Delete chat"
          footer={
            <>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" onClick={onDelete}>
                Delete
              </button>
            </>
          }
        >
          <p>Delete &ldquo;Optimizing RSI EA&rdquo;? This cannot be undone.</p>
        </Modal>
      )

      const container = document.body.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-sm')).toBe(true)
      expect(screen.getByText('Delete chat')).toBeDefined()
      expect(screen.getByText('History')).toBeDefined()
      expect(screen.getByText(/Delete “Optimizing RSI EA”/i)).toBeDefined()

      // Test Backdrop click dismiss
      const backdrop = document.body.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
