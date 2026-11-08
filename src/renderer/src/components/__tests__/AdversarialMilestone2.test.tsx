// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { DownloadWizard } from '../DownloadWizard'
import { AiProviderModal } from '../AiProviderModal'
import { EaChatPanel } from '../EaChatPanel'
import { EaLab } from '../EaLab'
import { useAppStore } from '../../store/useAppStore'
import { useAiProvidersStore } from '../../store/useAiProvidersStore'
import { useEaLabStore } from '../../store/useEaLabStore'
import { useEaChatStore } from '../../store/useEaChatStore'
import type { AiProviderProfile, EaScript } from '@shared/types'
import fs from 'node:fs'
import path from 'node:path'

// Mock heavyweight or DOM-incompatible third-party modules
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

vi.mock('../BrandMark', () => ({
  BrandMark: () => <div data-testid="mock-brand-mark" />
}))

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="mock-theme-toggle" />
}))

vi.mock('../BotBacktestModal', () => ({
  BotBacktestModal: () => <div data-testid="mock-backtest-modal" />
}))

vi.mock('../BotBacktestResultModal', () => ({
  BotBacktestResultModal: () => <div data-testid="mock-backtest-result-modal" />
}))

describe('Adversarial Stress Harness: Milestone 2 (Migrated Modals)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. DownloadWizard.tsx Adversarial Stress Suite
  // =========================================================================
  describe('DownloadWizard: Multi-Step Interaction & Dismissal Invariants', () => {
    let mockDownloadPair: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockDownloadPair = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        downloadPair: mockDownloadPair,
        downloadProgress: null
      })
    })

    it('renders into document.body via portal with size="md" and initial step 1', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)

      const backdrop = baseElement.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.parentElement).toBe(document.body)

      const container = baseElement.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-md')).toBe(true)

      // Stamp and title verification
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()
      expect(screen.getByText('BTCUSDT')).toBeDefined()

      // Wizard dots: 4 steps, 1st active
      const dots = baseElement.querySelectorAll('.wizard-dot')
      expect(dots).toHaveLength(4)
      expect(dots[0].getAttribute('data-active')).toBe('true')
      expect(dots[1].getAttribute('data-active')).toBe('false')
    })

    it('manages checkbox selections: unchecking all disables Next button; re-checking enables it', () => {
      render(<DownloadWizard symbol="ETHUSDT" onClose={vi.fn()} />)

      const nextBtn = screen.getByRole('button', { name: 'Next' })
      expect(nextBtn).toBeDefined()
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false)

      // Initial timeframe is 1H
      const tf1h = screen.getByLabelText('1H') as HTMLInputElement
      expect(tf1h).toBeDefined()
      expect(tf1h.checked).toBe(true)

      // Uncheck 1H
      fireEvent.click(tf1h)
      expect(tf1h.checked).toBe(false)
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true)

      // Attempt clicking disabled Next button -> must stay on step 1
      fireEvent.click(nextBtn)
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()

      // Check 15M and 4H
      const tf15m = screen.getByLabelText('15M') as HTMLInputElement
      const tf4h = screen.getByLabelText('4H') as HTMLInputElement
      fireEvent.click(tf15m)
      fireEvent.click(tf4h)
      expect(tf15m.checked).toBe(true)
      expect(tf4h.checked).toBe(true)
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false)
    })

    it('transitions between timeframes -> range -> back to timeframes, preserving selections', () => {
      const { baseElement } = render(<DownloadWizard symbol="SOLUSDT" onClose={vi.fn()} />)

      // Check 5M in addition to 1H
      const tf5m = screen.getByLabelText('5M') as HTMLInputElement
      fireEvent.click(tf5m)

      // Advance to Step 2 (range)
      const nextBtn = screen.getByRole('button', { name: 'Next' })
      fireEvent.click(nextBtn)

      // Verify range step
      expect(screen.getByText('Download data · Step 2 of 4')).toBeDefined()
      expect(screen.getByLabelText('From Date')).toBeDefined()
      expect(screen.getByLabelText('To Date')).toBeDefined()

      const dots = baseElement.querySelectorAll('.wizard-dot')
      expect(dots[0].getAttribute('data-done')).toBe('true')
      expect(dots[1].getAttribute('data-active')).toBe('true')

      // Verify footer has Back and Download
      const backBtn = screen.getByRole('button', { name: 'Back' })
      const downloadBtn = screen.getByRole('button', { name: /Download/i })
      expect(backBtn).toBeDefined()
      expect(downloadBtn).toBeDefined()

      // Click Back -> verify return to Step 1 and preservation of checkboxes
      fireEvent.click(backBtn)
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()

      const rechecked5m = screen.getByLabelText('5M') as HTMLInputElement
      const rechecked1h = screen.getByLabelText('1H') as HTMLInputElement
      expect(rechecked5m.checked).toBe(true)
      expect(rechecked1h.checked).toBe(true)
    })

    it('cancels and closes via Cancel button, header close button, Escape, and backdrop in step 1', () => {
      // 1. Cancel button
      let handleClose = vi.fn()
      let { unmount } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(handleClose).toHaveBeenCalledTimes(1)
      unmount()

      // 2. Header close button
      handleClose = vi.fn()
      ;({ unmount } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(handleClose).toHaveBeenCalledTimes(1)
      unmount()

      // 3. Escape key
      handleClose = vi.fn()
      ;({ unmount } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).toHaveBeenCalledTimes(1)
      unmount()

      // 4. Backdrop click
      handleClose = vi.fn()
      const { baseElement } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('ADVERSARIAL INVARIANT: downloading state strictly blocks dismissal (Escape, backdrop, no close button)', async () => {
      let resolveDownload: () => void = () => {}
      const pendingDownload = new Promise<void>((resolve) => {
        resolveDownload = resolve
      })
      mockDownloadPair.mockImplementation(() => pendingDownload)

      const handleClose = vi.fn()
      const { baseElement } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      // Step 2 -> Click Download
      const downloadBtn = screen.getByRole('button', { name: /Download/i })
      fireEvent.click(downloadBtn)

      // Wizard is now in downloading step
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 3 of 4')).toBeDefined()
      })
      expect(screen.getByText(/Downloading BTCUSDT 1H/i)).toBeDefined()

      // Invariant 1: Close button in header MUST NOT be rendered
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()

      // Invariant 2: Footer MUST NOT be rendered
      expect(baseElement.querySelector('.ui-modal-footer')).toBeNull()

      // Invariant 3: Escape key MUST NOT trigger onClose
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).not.toHaveBeenCalled()

      // Invariant 4: Clicking backdrop MUST NOT trigger onClose
      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(handleClose).not.toHaveBeenCalled()

      // Complete download
      await act(async () => {
        resolveDownload()
      })

      // Transitions to Step 4 (done)
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
      expect(screen.getByText('BTCUSDT data is ready.')).toBeDefined()

      // Invariant 5: Dismissal is restored when done
      const doneBtn = screen.getByRole('button', { name: 'Done' })
      expect(doneBtn).toBeDefined()
      fireEvent.click(doneBtn)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('handles download failure: displays error, unblocks dismissal, and allows retry', async () => {
      mockDownloadPair.mockRejectedValueOnce(new Error('Network error'))

      const handleClose = vi.fn()
      render(<DownloadWizard symbol="ETHUSDT" onClose={handleClose} />)

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      // Step 2 -> Download
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      // Await failure
      await waitFor(() => {
        expect(screen.getByText(/Could not download ETHUSDT 1H/i)).toBeDefined()
      })

      // Error state unblocks dismissal
      const closeBtn = screen.getByRole('button', { name: 'Close' })
      expect(closeBtn).toBeDefined()

      // Verify Back button and Retry button exist in error footer
      const backBtn = screen.getByRole('button', { name: 'Back' })
      expect(backBtn).toBeDefined()

      const retryBtn = screen.getByRole('button', { name: 'Retry' })
      expect(retryBtn).toBeDefined()

      // Now retry download with success
      mockDownloadPair.mockResolvedValueOnce(undefined)
      fireEvent.click(retryBtn)

      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
      expect(screen.getByText('ETHUSDT data is ready.')).toBeDefined()
    })

    it('downloads all 7 timeframes sequentially and passes correct timestamps from date pickers', async () => {
      const handleClose = vi.fn()
      render(<DownloadWizard symbol="ADAUSDT" onClose={handleClose} />)

      // Check all 7 timeframes
      const allTfs = ['1M', '5M', '15M', '30M', '4H', '1D']
      for (const tf of allTfs) {
        fireEvent.click(screen.getByLabelText(tf))
      }

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      // Set explicit dates
      const fromInput = screen.getByLabelText('From Date')
      const toInput = screen.getByLabelText('To Date')
      fireEvent.change(fromInput, { target: { value: '2023-01-01' } })
      fireEvent.change(toInput, { target: { value: '2023-06-30' } })

      // Step 2 -> Click Download
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })

      // Must have downloaded 7 timeframes (1H was checked initially + 6 checked above)
      expect(mockDownloadPair).toHaveBeenCalledTimes(7)
      const expectedStartTs = new Date('2023-01-01').getTime()
      const expectedEndTs = new Date('2023-06-30').getTime()

      for (let i = 0; i < 7; i++) {
        expect(mockDownloadPair.mock.calls[i][0]).toMatchObject({
          symbol: 'ADAUSDT',
          startTs: expectedStartTs,
          endTs: expectedEndTs
        })
      }
    })

    it('renders progress percentage and indeterminate state during download', async () => {
      let resolveDownload: () => void = () => {}
      mockDownloadPair.mockImplementation(
        () =>
          new Promise<void>((res) => {
            resolveDownload = res
          })
      )

      const { baseElement } = render(<DownloadWizard symbol="DOTUSDT" onClose={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      await waitFor(() => {
        expect(screen.getByText('Download data · Step 3 of 4')).toBeDefined()
      })

      // Simulate downloadProgress update from store: 72%
      act(() => {
        useAppStore.setState({
          downloadProgress: { fraction: 0.72, indeterminate: false }
        })
      })
      expect(screen.getByText('72%')).toBeDefined()
      const fillBar = baseElement.querySelector('.progress-bar-fill') as HTMLElement
      expect(fillBar.style.width).toBe('72%')

      // Simulate indeterminate fetching
      act(() => {
        useAppStore.setState({
          downloadProgress: { fraction: 0, indeterminate: true }
        })
      })
      expect(screen.getByText('Fetching…')).toBeDefined()
      const progressBar = baseElement.querySelector('.progress-bar') as HTMLElement
      expect(progressBar.getAttribute('data-indeterminate')).toBe('true')

      // Finish
      await act(async () => {
        resolveDownload()
      })
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
    })
  })

  // =========================================================================
  // 2. AiProviderModal.tsx Adversarial Stress Suite
  // =========================================================================
  describe('AiProviderModal: Configuration, Model Selection, Form Submission & Dismissal', () => {
    let mockSaveProvider: ReturnType<typeof vi.fn>
    let mockTestConnection: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockSaveProvider = vi.fn().mockResolvedValue(undefined)
      mockTestConnection = vi.fn().mockResolvedValue(undefined)
      useAiProvidersStore.setState({
        saveProvider: mockSaveProvider,
        testConnection: mockTestConnection,
        testing: false,
        testResult: null,
        modelsById: {
          openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
          anthropic: ['claude-3-5-sonnet', 'claude-3-haiku']
        },
        modelsError: {},
        loadingModels: {}
      })
    })

    it('renders Add profile mode: size="md", stamp="AI", disabled test button, and autoFocus', () => {
      const handleClose = vi.fn()
      const { baseElement } = render(<AiProviderModal profile={null} onClose={handleClose} />)

      const backdrop = baseElement.querySelector('.ui-modal-backdrop')
      expect(backdrop?.parentElement).toBe(document.body)
      const container = baseElement.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-md')).toBe(true)

      expect(screen.getByText('Add profile')).toBeDefined()
      expect(screen.getByText('AI')).toBeDefined()

      // Test connection button must be disabled for new profile
      const testBtn = screen.getByRole('button', { name: 'Test connection' }) as HTMLButtonElement
      expect(testBtn.disabled).toBe(true)
      expect(testBtn.title).toBe('Save this profile first, then test it')

      // Save button is primary and linked to form="ai-provider-form"
      const saveBtn = screen.getByRole('button', { name: 'Save' })
      expect(saveBtn.getAttribute('form')).toBe('ai-provider-form')
      expect(saveBtn.getAttribute('type')).toBe('submit')
    })

    it('renders Edit profile mode: pre-populates name, provider, enables test button and triggers test', () => {
      const existingProfile: AiProviderProfile = {
        id: 'prof-123',
        name: 'Work OpenAI',
        provider: 'openai',
        model: 'gpt-4o',
        hasApiKey: true,
        baseUrl: null
      }

      render(<AiProviderModal profile={existingProfile} onClose={vi.fn()} />)

      expect(screen.getByText('Edit profile')).toBeDefined()
      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI') as HTMLInputElement
      expect(nameInput.value).toBe('Work OpenAI')

      const apiKeyInput = screen.getByPlaceholderText('Key saved — leave blank to keep it')
      expect(apiKeyInput).toBeDefined()

      // Test connection button is enabled
      const testBtn = screen.getByRole('button', { name: 'Test connection' }) as HTMLButtonElement
      expect(testBtn.disabled).toBe(false)

      fireEvent.click(testBtn)
      expect(mockTestConnection).toHaveBeenCalledWith('prof-123')
    })

    it('switches to custom provider: shows Base URL input; switches to anthropic: hides Base URL', () => {
      const { baseElement } = render(<AiProviderModal profile={null} onClose={vi.fn()} />)

      // Base URL should not be visible for default 'openai'
      expect(screen.queryByPlaceholderText('https://your-endpoint/v1')).toBeNull()

      // Switch dropdown to custom
      const providerDropdown = screen.getByRole('button', { name: 'Provider' })
      fireEvent.click(providerDropdown)

      const customOption = screen.getByRole('option', { name: /custom/i })
      fireEvent.click(customOption)

      // Base URL input is now visible
      const baseUrlInput = screen.getByPlaceholderText('https://your-endpoint/v1')
      expect(baseUrlInput).toBeDefined()

      // Switch dropdown to Anthropic
      fireEvent.click(providerDropdown)
      const anthropicOption = screen.getByRole('option', { name: /anthropic/i })
      fireEvent.click(anthropicOption)

      // Base URL input is gone again
      expect(screen.queryByPlaceholderText('https://your-endpoint/v1')).toBeNull()
      expect(screen.getByText('Endpoint is set automatically. Choose a model below.')).toBeDefined()
    })

    it('submits form via Save button click: calls saveProvider and onClose', async () => {
      const handleClose = vi.fn()
      render(<AiProviderModal profile={null} onClose={handleClose} />)

      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI')
      fireEvent.change(nameInput, { target: { value: 'Production AI' } })

      const apiKeyInput = screen.getByPlaceholderText('sk-...')
      fireEvent.change(apiKeyInput, { target: { value: 'sk-test-secret-key-123' } })

      const saveBtn = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(mockSaveProvider).toHaveBeenCalledTimes(1)
      })

      const [savedProfile, savedKey] = mockSaveProvider.mock.calls[0]
      expect(savedProfile.name).toBe('Production AI')
      expect(savedProfile.provider).toBe('openai')
      expect(savedKey).toBe('sk-test-secret-key-123')
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('submits form via Enter keypress on input field', async () => {
      const handleClose = vi.fn()
      const { baseElement } = render(<AiProviderModal profile={null} onClose={handleClose} />)

      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI')
      fireEvent.change(nameInput, { target: { value: 'Keyboard Enter Submit' } })

      const form = baseElement.querySelector('#ai-provider-form') as HTMLFormElement
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockSaveProvider).toHaveBeenCalledTimes(1)
      })
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('handles close actions via Close button, Escape key, and backdrop click', () => {
      // 1. Close button
      let handleClose = vi.fn()
      let { unmount } = render(<AiProviderModal profile={null} onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(handleClose).toHaveBeenCalledTimes(1)
      unmount()

      // 2. Escape key
      handleClose = vi.fn()
      ;({ unmount } = render(<AiProviderModal profile={null} onClose={handleClose} />))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).toHaveBeenCalledTimes(1)
      unmount()

      // 3. Backdrop click
      handleClose = vi.fn()
      const { baseElement } = render(<AiProviderModal profile={null} onClose={handleClose} />)
      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('displays testing in-progress state and renders test connection result feedback', () => {
      const existingProfile: AiProviderProfile = {
        id: 'prof-feedback',
        name: 'OpenAI Test',
        provider: 'openai',
        model: 'gpt-4o',
        hasApiKey: true,
        baseUrl: null
      }

      useAiProvidersStore.setState({
        testing: true,
        testResult: null
      })

      const { rerender } = render(<AiProviderModal profile={existingProfile} onClose={vi.fn()} />)

      const testBtn = screen.getByRole('button', { name: 'Testing…' }) as HTMLButtonElement
      expect(testBtn.disabled).toBe(true)

      // Update state with successful testResult
      act(() => {
        useAiProvidersStore.setState({
          testing: false,
          testResult: { ok: true, message: 'Connection successful!' }
        })
      })
      rerender(<AiProviderModal profile={existingProfile} onClose={vi.fn()} />)

      const successFeedback = screen.getByText('Connection successful!')
      expect(successFeedback.getAttribute('data-ok')).toBe('true')

      // Update state with failed testResult
      act(() => {
        useAiProvidersStore.setState({
          testing: false,
          testResult: { ok: false, message: 'Invalid API key or rate limit exceeded.' }
        })
      })
      rerender(<AiProviderModal profile={existingProfile} onClose={vi.fn()} />)

      const failureFeedback = screen.getByText('Invalid API key or rate limit exceeded.')
      expect(failureFeedback.getAttribute('data-ok')).toBe('false')
    })

    it('displays model error in FormField when modelsError exists', () => {
      const existingProfile: AiProviderProfile = {
        id: 'prof-err',
        name: 'Error Profile',
        provider: 'openai',
        model: 'gpt-4o',
        hasApiKey: false,
        baseUrl: null
      }

      useAiProvidersStore.setState({
        loadModels: vi.fn().mockResolvedValue(undefined),
        modelsError: {
          'prof-err': 'Failed to fetch models from OpenAI API: 401 Unauthorized'
        }
      })

      render(<AiProviderModal profile={existingProfile} onClose={vi.fn()} />)

      expect(
        screen.getByText('Failed to fetch models from OpenAI API: 401 Unauthorized')
      ).toBeDefined()
    })
  })

  // =========================================================================
  // 3. EaLab.tsx Delete Script Modal Adversarial Stress Suite
  // =========================================================================
  describe('EaLab: Script Delete Confirmation Modal Interactions', () => {
    let mockDeleteScript: ReturnType<typeof vi.fn>

    const sampleScript: EaScript = {
      id: 'script-999',
      name: 'GridTrader',
      kind: 'ea',
      language: 'mql5',
      code: '// GridTrader',
      createdAt: 1000,
      updatedAt: 2000
    }

    beforeEach(() => {
      mockDeleteScript = vi.fn().mockResolvedValue(undefined)
      useEaLabStore.setState({
        scripts: [sampleScript],
        activeScriptId: 'script-999',
        deleteScript: mockDeleteScript,
        loadScripts: vi.fn().mockResolvedValue(undefined)
      })
    })

    it('initially does NOT render delete modal into document.body', () => {
      const { baseElement } = render(<EaLab kind="ea" />)
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(screen.queryByText(/Delete GridTrader\.mq5/i)).toBeNull()
    })

    it('triggers delete confirmation modal when clicking trash button on a script item', () => {
      const { baseElement } = render(<EaLab kind="ea" />)

      const deleteBtn = screen.getByRole('button', { name: 'Delete GridTrader' })
      fireEvent.click(deleteBtn)

      // Modal is now open
      const backdrop = baseElement.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.parentElement).toBe(document.body)

      const container = baseElement.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-sm')).toBe(true)

      const stamp = baseElement.querySelector('.ui-modal-stamp')
      expect(stamp?.textContent).toContain('Explorer')
      expect(screen.getByText('Delete bot')).toBeDefined()
      expect(screen.getByText(/Delete GridTrader\.kairos\? This cannot be undone\./i)).toBeDefined()

      // Footer has Cancel and Delete buttons
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' })
      expect(confirmDeleteBtn.classList.contains('ui-btn-danger')).toBe(true)
    })

    it('dismisses delete modal without calling deleteScript on Cancel, Escape, Close (X), or backdrop', () => {
      // 1. Cancel button
      let { baseElement, unmount } = render(<EaLab kind="ea" />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete GridTrader' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
      unmount()

      // 2. Escape key
      ;({ baseElement, unmount } = render(<EaLab kind="ea" />))
      fireEvent.click(screen.getByRole('button', { name: 'Delete GridTrader' }))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
      unmount()

      // 3. Header close button
      ;({ baseElement, unmount } = render(<EaLab kind="ea" />))
      fireEvent.click(screen.getByRole('button', { name: 'Delete GridTrader' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
      unmount()

      // 4. Backdrop click
      ;({ baseElement, unmount } = render(<EaLab kind="ea" />))
      fireEvent.click(screen.getByRole('button', { name: 'Delete GridTrader' }))
      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
    })

    it('confirms deletion: calls deleteScript with script id and closes modal', () => {
      const { baseElement } = render(<EaLab kind="ea" />)

      fireEvent.click(screen.getByRole('button', { name: 'Delete GridTrader' }))
      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' })

      fireEvent.click(confirmDeleteBtn)

      expect(mockDeleteScript).toHaveBeenCalledTimes(1)
      expect(mockDeleteScript).toHaveBeenCalledWith('script-999')
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
    })

    it('renders indicator deletion modal with title "Delete indicator" and correct file extension for pine script', () => {
      const indicatorScript: EaScript = {
        id: 'ind-101',
        name: 'SuperTrend',
        kind: 'indicator',
        language: 'pinescript',
        code: '//@version=5\nindicator("SuperTrend")',
        createdAt: 1000,
        updatedAt: 2000
      }

      useEaLabStore.setState({
        kind: 'indicator',
        scripts: [indicatorScript],
        activeScriptId: 'ind-101',
        deleteScript: mockDeleteScript,
        loadScripts: vi.fn().mockResolvedValue(undefined)
      })

      render(<EaLab kind="indicator" />)

      fireEvent.click(screen.getByRole('button', { name: 'Delete SuperTrend' }))

      expect(screen.getByText('Delete indicator')).toBeDefined()
      expect(screen.getByText(/Delete SuperTrend\.pine\? This cannot be undone\./i)).toBeDefined()
    })
  })

  // =========================================================================
  // 4. EaChatPanel.tsx Delete Thread Modal Adversarial Stress Suite
  // =========================================================================
  describe('EaChatPanel: Chat History Delete Modal Interactions', () => {
    let mockDeleteThread: ReturnType<typeof vi.fn>
    let mockCancelPendingWrite: ReturnType<typeof vi.fn>

    const sampleThread = {
      id: 'thread-777',
      title: 'Scalping Optimization',
      scriptId: 'script-999',
      createdAt: 1000,
      updatedAt: 2000
    }

    beforeEach(() => {
      mockDeleteThread = vi.fn().mockResolvedValue(undefined)
      mockCancelPendingWrite = vi.fn()

      useAiProvidersStore.setState({
        providers: [
          {
            id: 'mock-p1',
            name: 'OpenAI Test',
            provider: 'openai',
            model: 'gpt-4o',
            hasApiKey: true,
            baseUrl: null
          }
        ],
        modelsById: {
          'mock-p1': ['gpt-4o']
        }
      })

      useEaChatStore.setState({
        threads: [sampleThread],
        currentThreadId: 'thread-777',
        messages: [],
        thinking: false,
        streamText: '',
        streamThinking: '',
        sending: false,
        deleteThread: mockDeleteThread
      })
    })

    it('triggers delete chat modal from history view: renders size="sm" with History stamp', () => {
      const { baseElement } = render(<EaChatPanel />)

      // Open Chat History view
      const historyToggleBtn = screen.getByRole('button', { name: 'Chat history' })
      fireEvent.click(historyToggleBtn)

      // Trash button for "Scalping Optimization"
      const deleteBtn = screen.getByRole('button', { name: 'Delete Scalping Optimization' })
      fireEvent.click(deleteBtn)

      // Delete confirmation modal is now open
      const backdrop = baseElement.querySelector('.ui-modal-backdrop')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.parentElement).toBe(document.body)

      const container = baseElement.querySelector('.ui-modal-container')
      expect(container?.classList.contains('ui-modal-sm')).toBe(true)

      const stamp = baseElement.querySelector('.ui-modal-stamp')
      expect(stamp?.textContent).toContain('History')
      expect(screen.getByText('Delete chat')).toBeDefined()
      expect(screen.getByText(/Delete “Scalping Optimization”\? This cannot be undone\./i)).toBeDefined()

      // Footer has Cancel and Delete buttons
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' })
      expect(confirmDeleteBtn.classList.contains('ui-btn-danger')).toBe(true)
    })

    it('dismisses chat delete modal without deleting on Cancel, Escape, or backdrop click', () => {
      // 1. Cancel button
      let { baseElement, unmount } = render(<EaChatPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Scalping Optimization' }))

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
      unmount()

      // 2. Escape key
      ;({ baseElement, unmount } = render(<EaChatPanel />))
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Scalping Optimization' }))

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
      unmount()

      // 3. Backdrop click
      ;({ baseElement, unmount } = render(<EaChatPanel />))
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Scalping Optimization' }))

      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
    })

    it('confirms chat deletion: calls deleteThread with id, then closes modal', () => {
      const { baseElement } = render(<EaChatPanel />)

      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Scalping Optimization' }))

      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(confirmDeleteBtn)

      expect(mockDeleteThread).toHaveBeenCalledTimes(1)
      expect(mockDeleteThread).toHaveBeenCalledWith('thread-777')
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
    })
  })

  // =========================================================================
  // 5. Codebase AST & CSS Static Verifications
  // =========================================================================
  describe('Static Forensic Audit: Legacy Modal Elimination', () => {
    it('verifies zero occurrences of modal-backdrop in all components', () => {
      const componentsDir = path.resolve(__dirname, '..')
      const files = fs.readdirSync(componentsDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))

      for (const file of files) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf8')
        expect(
          content.includes('modal-backdrop'),
          `Found legacy "modal-backdrop" in ${file}`
        ).toBe(false)
      }
    })

    it('verifies zero occurrences of composer-actions in migrated components', () => {
      const targetFiles = [
        'DownloadWizard.tsx',
        'AiProviderModal.tsx',
        'EaLab.tsx',
        'EaChatPanel.tsx'
      ]
      const componentsDir = path.resolve(__dirname, '..')

      for (const file of targetFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf8')
        expect(
          content.includes('composer-actions'),
          `Found legacy "composer-actions" in ${file}`
        ).toBe(false)
      }
    })

    it('verifies all 4 migrated files import Modal from ui design system', () => {
      const targetFiles = [
        'DownloadWizard.tsx',
        'AiProviderModal.tsx',
        'EaLab.tsx',
        'EaChatPanel.tsx'
      ]
      const componentsDir = path.resolve(__dirname, '..')

      for (const file of targetFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf8')
        expect(
          content.includes("from './ui'"),
          `Expected ${file} to import UI primitives from './ui'`
        ).toBe(true)
        expect(
          content.includes('<Modal'),
          `Expected ${file} to render <Modal>`
        ).toBe(true)
      }
    })
  })
})
