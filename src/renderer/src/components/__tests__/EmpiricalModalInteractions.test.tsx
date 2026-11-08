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
import { SEALION_DEFAULT_MODEL, type AiProviderProfile, type EaScript } from '@shared/types'

// Mock heavyweight external dependencies that require canvas or complex browser APIs
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

describe('Challenger Empirical Interaction Test Suite: Milestone 2 Modals', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // =========================================================================
  // SECTION 1: DownloadWizard.tsx Stress Harness
  // =========================================================================
  describe('DownloadWizard Interaction Stress Testing', () => {
    let mockDownloadPair: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockDownloadPair = vi.fn().mockResolvedValue(undefined)
      useAppStore.setState({
        downloadPair: mockDownloadPair,
        downloadProgress: null
      })
    })

    it('validates complete step progression: timeframes -> range -> downloading -> done', async () => {
      const resolvers: Array<() => void> = []
      mockDownloadPair.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve)
          })
      )

      const handleClose = vi.fn()
      const { baseElement } = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)

      // Step 1: Timeframes
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()
      const dots = baseElement.querySelectorAll('.wizard-dot')
      expect(dots[0].getAttribute('data-active')).toBe('true')
      expect(dots[0].getAttribute('data-done')).toBe('false')

      // Select '15M' in addition to default '1H'
      const tf15m = screen.getByLabelText('15M') as HTMLInputElement
      fireEvent.click(tf15m)
      expect(tf15m.checked).toBe(true)

      // Advance to Step 2: Range
      const nextBtn = screen.getByRole('button', { name: 'Next' })
      fireEvent.click(nextBtn)

      // Step 2: Range
      expect(screen.getByText('Download data · Step 2 of 4')).toBeDefined()
      expect(dots[0].getAttribute('data-done')).toBe('true')
      expect(dots[1].getAttribute('data-active')).toBe('true')

      // Click Download button
      const downloadBtn = screen.getByRole('button', { name: /Download/i })
      fireEvent.click(downloadBtn)

      // Step 3: Downloading first timeframe
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 3 of 4')).toBeDefined()
      })
      expect(dots[1].getAttribute('data-done')).toBe('true')
      expect(dots[2].getAttribute('data-active')).toBe('true')
      expect(screen.getByText(/Downloading BTCUSDT 1H · 1 of 2/i)).toBeDefined()

      // Resolve 1st download
      await act(async () => {
        resolvers[0]()
      })

      // Now downloading 2nd timeframe
      await waitFor(() => {
        expect(screen.getByText(/Downloading BTCUSDT 15M · 2 of 2/i)).toBeDefined()
      })

      // Resolve 2nd download
      await act(async () => {
        resolvers[1]()
      })

      // Step 4: Done
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
      expect(dots[2].getAttribute('data-done')).toBe('true')
      expect(dots[3].getAttribute('data-active')).toBe('true')
      expect(screen.getByText('BTCUSDT data is ready.')).toBeDefined()

      // Complete via Done button
      const doneBtn = screen.getByRole('button', { name: 'Done' })
      fireEvent.click(doneBtn)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('enforces checkbox selection invariant: Next is disabled if and only if 0 checkboxes are selected', () => {
      render(<DownloadWizard symbol="ETHUSDT" onClose={vi.fn()} />)

      const nextBtn = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
      expect(nextBtn.disabled).toBe(false)

      // Deselect the default 1H timeframe
      const tf1h = screen.getByLabelText('1H') as HTMLInputElement
      fireEvent.click(tf1h)
      expect(tf1h.checked).toBe(false)
      expect(nextBtn.disabled).toBe(true)

      // Clicking disabled Next does nothing
      fireEvent.click(nextBtn)
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()

      // Toggle every timeframe on
      const allTfs = ['1M', '5M', '15M', '30M', '1H', '4H', '1D']
      for (const tf of allTfs) {
        const checkbox = screen.getByLabelText(tf) as HTMLInputElement
        if (!checkbox.checked) fireEvent.click(checkbox)
        expect(checkbox.checked).toBe(true)
      }
      expect(nextBtn.disabled).toBe(false)

      // Toggle them all off
      for (const tf of allTfs) {
        const checkbox = screen.getByLabelText(tf) as HTMLInputElement
        fireEvent.click(checkbox)
        expect(checkbox.checked).toBe(false)
      }
      expect(nextBtn.disabled).toBe(true)

      // Re-enable just one
      fireEvent.click(screen.getByLabelText('4H'))
      expect(nextBtn.disabled).toBe(false)
    })

    it('preserves checkbox selection state when navigating back and forth between Step 1 and Step 2', () => {
      render(<DownloadWizard symbol="SOLUSDT" onClose={vi.fn()} />)

      // Select 1M, 30M, 1D (plus default 1H)
      fireEvent.click(screen.getByLabelText('1M'))
      fireEvent.click(screen.getByLabelText('30M'))
      fireEvent.click(screen.getByLabelText('1D'))

      // Navigate to Step 2
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.getByText('Download data · Step 2 of 4')).toBeDefined()

      // Click Back to Step 1
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByText('Download data · Step 1 of 4')).toBeDefined()

      // Verify all selected checkboxes are still checked
      expect((screen.getByLabelText('1M') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText('30M') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText('1H') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText('1D') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText('5M') as HTMLInputElement).checked).toBe(false)
      expect((screen.getByLabelText('15M') as HTMLInputElement).checked).toBe(false)
      expect((screen.getByLabelText('4H') as HTMLInputElement).checked).toBe(false)
    })

    it('submits download via form submit event on range step (Enter key)', async () => {
      render(<DownloadWizard symbol="AVAXUSDT" onClose={vi.fn()} />)

      // Go to Step 2
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      // Change from date
      const fromInput = screen.getByLabelText('From Date')
      fireEvent.change(fromInput, { target: { value: '2024-01-01' } })

      // Press Enter inside form
      const form = fromInput.closest('form') as HTMLFormElement
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
      expect(mockDownloadPair).toHaveBeenCalledTimes(1)
      expect(mockDownloadPair).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AVAXUSDT',
          timeframe: '1H',
          startTs: new Date('2024-01-01').getTime()
        })
      )
    })

    it('handles download error and verifies retry flow cleans error and restarts execution', async () => {
      mockDownloadPair
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce(undefined)

      render(<DownloadWizard symbol="BNBUSDT" onClose={vi.fn()} />)

      // Go to Step 2 and download
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      // Await failure
      await waitFor(() => {
        expect(
          screen.getByText(/Could not download BNBUSDT 1H\. Check your connection and try again\./i)
        ).toBeDefined()
      })

      // Error UI state: Back and Retry buttons rendered
      const backBtn = screen.getByRole('button', { name: 'Back' })
      const retryBtn = screen.getByRole('button', { name: 'Retry' })
      expect(backBtn).toBeDefined()
      expect(retryBtn).toBeDefined()

      // Clicking Retry initiates download again
      fireEvent.click(retryBtn)

      // Progresses to Done
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
      expect(screen.getByText('BNBUSDT data is ready.')).toBeDefined()
      expect(mockDownloadPair).toHaveBeenCalledTimes(2)
    })

    it('tests Back button behavior from download error state back to Step 2', async () => {
      mockDownloadPair.mockRejectedValueOnce(new Error('Timeout'))

      render(<DownloadWizard symbol="XRPUSDT" onClose={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      await waitFor(() => {
        expect(screen.getByText(/Could not download XRPUSDT/i)).toBeDefined()
      })

      // Click Back button from error screen
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))

      // Verify returned to Step 2
      expect(screen.getByText('Download data · Step 2 of 4')).toBeDefined()
      expect(screen.getByLabelText('From Date')).toBeDefined()
    })

    it('verifies cancel and close interactions in Step 1, Step 2, and Step 4', () => {
      // Step 1: Cancel button
      let handleClose = vi.fn()
      let view = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(handleClose).toHaveBeenCalledTimes(1)
      view.unmount()

      // Step 1: Header Close button
      handleClose = vi.fn()
      view = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(handleClose).toHaveBeenCalledTimes(1)
      view.unmount()

      // Step 2: Header Close button
      handleClose = vi.fn()
      view = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(handleClose).toHaveBeenCalledTimes(1)
      view.unmount()

      // Step 2: Escape key
      handleClose = vi.fn()
      view = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).toHaveBeenCalledTimes(1)
      view.unmount()

      // Step 4: Done button and Header Close button
      handleClose = vi.fn()
      view = render(<DownloadWizard symbol="BTCUSDT" onClose={handleClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))
      return waitFor(() => {
        expect(screen.getByRole('button', { name: 'Done' })).toBeDefined()
      }).then(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(handleClose).toHaveBeenCalledTimes(1)
      })
    })

    it('adversarially isolates failure on second timeframe, verifies correct failedTimeframe and retry restart', async () => {
      // 1st call (1H) succeeds, 2nd call (4H) fails
      mockDownloadPair
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Network drop on 4H'))

      render(<DownloadWizard symbol="MATICUSDT" onClose={vi.fn()} />)

      // Select 4H in addition to 1H
      fireEvent.click(screen.getByLabelText('4H'))

      // Next -> Download
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      // Await failure on 4H
      await waitFor(() => {
        expect(
          screen.getByText(/Could not download MATICUSDT 4H\. Check your connection and try again\./i)
        ).toBeDefined()
      })

      // Verify header close button is restored during failure
      expect(screen.getByRole('button', { name: 'Close' })).toBeDefined()

      // Retry: mock both to succeed
      mockDownloadPair.mockResolvedValue(undefined)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
      expect(screen.getByText('MATICUSDT data is ready.')).toBeDefined()
    })

    it('verifies progress bar calculation and indeterminate rendering', async () => {
      let finishDownload: () => void = () => {}
      mockDownloadPair.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishDownload = resolve
          })
      )

      const { baseElement } = render(<DownloadWizard symbol="AVAXUSDT" onClose={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: /Download/i }))

      await waitFor(() => {
        expect(screen.getByText('Download data · Step 3 of 4')).toBeDefined()
      })

      // Set fractional progress: 0.456 -> 46%
      act(() => {
        useAppStore.setState({
          downloadProgress: { fraction: 0.456, indeterminate: false }
        })
      })
      expect(screen.getByText('46%')).toBeDefined()
      const fillBar = baseElement.querySelector('.progress-bar-fill') as HTMLElement
      expect(fillBar.style.width).toBe('46%')

      // Set indeterminate progress
      act(() => {
        useAppStore.setState({
          downloadProgress: { fraction: 0, indeterminate: true }
        })
      })
      expect(screen.getByText('Fetching…')).toBeDefined()
      const progressBar = baseElement.querySelector('.progress-bar') as HTMLElement
      expect(progressBar.getAttribute('data-indeterminate')).toBe('true')

      // Complete
      await act(async () => {
        finishDownload()
      })
      await waitFor(() => {
        expect(screen.getByText('Download data · Step 4 of 4')).toBeDefined()
      })
    })
  })

  // =========================================================================
  // SECTION 2: AiProviderModal.tsx Stress Harness
  // =========================================================================
  describe('AiProviderModal Interaction Stress Testing', () => {
    let mockSaveProvider: ReturnType<typeof vi.fn>
    let mockTestConnection: ReturnType<typeof vi.fn>
    let mockClearTestResult: ReturnType<typeof vi.fn>
    let mockLoadModels: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockSaveProvider = vi.fn().mockResolvedValue(undefined)
      mockTestConnection = vi.fn().mockResolvedValue(undefined)
      mockClearTestResult = vi.fn()
      mockLoadModels = vi.fn().mockResolvedValue(undefined)

      useAiProvidersStore.setState({
        saveProvider: mockSaveProvider,
        testConnection: mockTestConnection,
        clearTestResult: mockClearTestResult,
        loadModels: mockLoadModels,
        testing: false,
        testResult: null,
        modelsById: {
          'prof-saved-1': ['model-alpha', 'model-beta'],
          openai: ['gpt-4o', 'gpt-4o-mini'],
          anthropic: ['claude-3-5-sonnet', 'claude-3-5-haiku']
        },
        modelsError: {},
        loadingModels: {}
      })
    })

    it('clears prior test result upon mounting', () => {
      render(<AiProviderModal profile={null} onClose={vi.fn()} />)
      expect(mockClearTestResult).toHaveBeenCalledTimes(1)
    })

    it('switches to SEA-LION provider and auto-fills default name and model when fields are empty', () => {
      render(<AiProviderModal profile={null} onClose={vi.fn()} />)

      const providerBtn = screen.getByRole('button', { name: 'Provider' })
      fireEvent.click(providerBtn)

      const sealionOption = screen.getByRole('option', { name: /SEA-LION/i })
      fireEvent.click(sealionOption)

      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI') as HTMLInputElement
      expect(nameInput.value).toBe('SEA-LION')

      // When SEA-LION is chosen, model is set to SEALION_DEFAULT_MODEL, which renders the model dropdown
      const modelDropdown = screen.getByRole('button', { name: 'Model' })
      expect(modelDropdown.textContent).toContain('Qwen-SEA-LION-v4.5-27B-IT')
    })

    it('handles custom provider Base URL and saves correct configuration', async () => {
      const handleClose = vi.fn()
      render(<AiProviderModal profile={null} onClose={handleClose} />)

      // Set name
      fireEvent.change(screen.getByPlaceholderText('e.g. Work OpenAI'), {
        target: { value: 'Local Ollama' }
      })

      // Select Custom provider
      fireEvent.click(screen.getByRole('button', { name: 'Provider' }))
      fireEvent.click(screen.getByRole('option', { name: /Custom/i }))

      // Base URL field appears
      const baseUrlInput = screen.getByPlaceholderText('https://your-endpoint/v1')
      fireEvent.change(baseUrlInput, { target: { value: 'http://localhost:11434/v1' } })

      // Set model
      const modelInput = screen.getByPlaceholderText('model-id')
      fireEvent.change(modelInput, { target: { value: 'llama3:8b' } })

      // Set API key
      const apiKeyInput = screen.getByPlaceholderText('sk-...')
      fireEvent.change(apiKeyInput, { target: { value: 'ollama-no-key' } })

      // Save
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockSaveProvider).toHaveBeenCalledTimes(1)
      })

      const [savedProfile, savedKey] = mockSaveProvider.mock.calls[0]
      expect(savedProfile).toMatchObject({
        name: 'Local Ollama',
        provider: 'custom',
        model: 'llama3:8b',
        baseUrl: 'http://localhost:11434/v1'
      })
      expect(savedKey).toBe('ollama-no-key')
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('submits form on pressing Enter in input fields', async () => {
      const handleClose = vi.fn()
      render(<AiProviderModal profile={null} onClose={handleClose} />)

      const nameInput = screen.getByPlaceholderText('e.g. Work OpenAI')
      fireEvent.change(nameInput, { target: { value: 'Enter Submission Test' } })

      const form = nameInput.closest('form') as HTMLFormElement
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockSaveProvider).toHaveBeenCalledTimes(1)
      })
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('keeps modal open if testResult exists after save', async () => {
      const handleClose = vi.fn()
      // Simulate existing testResult in store
      useAiProvidersStore.setState({
        testResult: { ok: false, message: 'Invalid API credentials' }
      })

      render(<AiProviderModal profile={null} onClose={handleClose} />)

      const saveBtn = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(mockSaveProvider).toHaveBeenCalledTimes(1)
      })
      // Should NOT close because testResult is present
      expect(handleClose).not.toHaveBeenCalled()
    })

    it('selects model from dropdown when options are available in store', () => {
      const existingProfile: AiProviderProfile = {
        id: 'prof-saved-1',
        name: 'OpenAI Dev',
        provider: 'openai',
        model: 'model-alpha',
        hasApiKey: true,
        baseUrl: null
      }

      render(<AiProviderModal profile={existingProfile} onClose={vi.fn()} />)

      // Model dropdown should exist
      const modelDropdown = screen.getByRole('button', { name: 'Model' })
      expect(modelDropdown).toBeDefined()
      fireEvent.click(modelDropdown)

      const optionBeta = screen.getByRole('option', { name: /model-beta/i })
      fireEvent.click(optionBeta)

      // Dropdown now reflects model-beta
      expect(modelDropdown.textContent).toContain('model-beta')
    })

    it('submits null baseUrl when switching from custom provider back to standard provider', async () => {
      render(<AiProviderModal profile={null} onClose={vi.fn()} />)

      // Select Custom and enter URL
      fireEvent.click(screen.getByRole('button', { name: 'Provider' }))
      fireEvent.click(screen.getByRole('option', { name: /Custom/i }))

      const baseUrlInput = screen.getByPlaceholderText('https://your-endpoint/v1')
      fireEvent.change(baseUrlInput, { target: { value: 'https://custom.endpoint.com' } })

      // Switch back to Gemini
      fireEvent.click(screen.getByRole('button', { name: 'Provider' }))
      fireEvent.click(screen.getByRole('option', { name: /Gemini/i }))

      // Save
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockSaveProvider).toHaveBeenCalledTimes(1)
      })

      const [savedProfile] = mockSaveProvider.mock.calls[0]
      expect(savedProfile.provider).toBe('gemini')
      expect(savedProfile.baseUrl).toBeNull()
    })

    it('displays appropriate API key placeholder depending on hasApiKey status', () => {
      // 1. Existing profile with hasApiKey = false
      const profileNoKey: AiProviderProfile = {
        id: 'prof-nokey',
        name: 'No Key',
        provider: 'openai',
        model: 'gpt-4o',
        hasApiKey: false,
        baseUrl: null
      }
      let view = render(<AiProviderModal profile={profileNoKey} onClose={vi.fn()} />)
      expect(screen.getByPlaceholderText('sk-...')).toBeDefined()
      view.unmount()

      // 2. Existing profile with hasApiKey = true
      const profileWithKey: AiProviderProfile = {
        id: 'prof-withkey',
        name: 'With Key',
        provider: 'openai',
        model: 'gpt-4o',
        hasApiKey: true,
        baseUrl: null
      }
      view = render(<AiProviderModal profile={profileWithKey} onClose={vi.fn()} />)
      expect(screen.getByPlaceholderText('Key saved — leave blank to keep it')).toBeDefined()
    })

    it('verifies close behavior via header close button, Escape key, and backdrop click', () => {
      // 1. Header close button
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
  })

  // =========================================================================
  // SECTION 3: EaLab.tsx Delete Script Modal Stress Harness
  // =========================================================================
  describe('EaLab.tsx Delete Confirmation Interactions', () => {
    let mockDeleteScript: ReturnType<typeof vi.fn>

    const sampleScripts: EaScript[] = [
      {
        id: 'bot-1',
        name: 'TrendFollower',
        kind: 'ea',
        language: 'mql5',
        code: '// EA 1',
        createdAt: 100,
        updatedAt: 200
      },
      {
        id: 'ind-1',
        name: 'RsiBands',
        kind: 'indicator',
        language: 'pinescript',
        code: '//@version=5\nindicator("RsiBands")',
        createdAt: 300,
        updatedAt: 400
      }
    ]

    beforeEach(() => {
      mockDeleteScript = vi.fn().mockResolvedValue(undefined)
      useEaLabStore.setState({
        scripts: sampleScripts,
        activeScriptId: 'bot-1',
        deleteScript: mockDeleteScript,
        loadScripts: vi.fn().mockResolvedValue(undefined)
      })
    })

    it('opens delete modal for bot, cancels deletion on Cancel button click', () => {
      const { baseElement } = render(<EaLab kind="ea" />)

      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()

      // Click delete icon on TrendFollower
      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))

      // Modal is open
      expect(baseElement.querySelector('.ui-modal-backdrop')).not.toBeNull()
      expect(screen.getByText('Delete bot')).toBeDefined()
      expect(screen.getByText(/Delete TrendFollower\.kairos\?/i)).toBeDefined()

      // Click Cancel
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Modal is closed, deleteScript was NOT called
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
    })

    it('confirms deletion on Delete button click: calls deleteScript and removes modal', () => {
      const { baseElement } = render(<EaLab kind="ea" />)

      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))
      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' })

      fireEvent.click(confirmDeleteBtn)

      expect(mockDeleteScript).toHaveBeenCalledTimes(1)
      expect(mockDeleteScript).toHaveBeenCalledWith('bot-1')
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
    })

    it('clears overlayId when deleting the script that is currently the active overlay', () => {
      // In EaLab, if overlayId matches the deleted script id, it resets overlayId to null
      render(<EaLab kind="ea" />)

      // Open and confirm delete
      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      expect(mockDeleteScript).toHaveBeenCalledWith('bot-1')
    })

    it('handles multiple rapid Escape presses idempotently without exception', () => {
      render(<EaLab kind="ea" />)

      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))

      // Fire Escape 5 times rapidly
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyDown(window, { key: 'Escape' })

      expect(mockDeleteScript).not.toHaveBeenCalled()
    })

    it('cancels deletion on Escape key and backdrop click', () => {
      // Escape key
      let { baseElement, unmount } = render(<EaLab kind="ea" />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).not.toBeNull()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
      unmount()

      // Backdrop click
      ;({ baseElement, unmount } = render(<EaLab kind="ea" />))
      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))
      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
      unmount()

      // Header close button
      ;({ baseElement } = render(<EaLab kind="ea" />))
      fireEvent.click(screen.getByRole('button', { name: 'Delete TrendFollower' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteScript).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // SECTION 4: EaChatPanel.tsx Delete Thread Modal Stress Harness
  // =========================================================================
  describe('EaChatPanel.tsx Delete Confirmation Interactions', () => {
    let mockDeleteThread: ReturnType<typeof vi.fn>

    const sampleThreads = [
      {
        id: 't-101',
        title: 'Breakout Analysis',
        scriptId: 'bot-1',
        createdAt: 1000,
        updatedAt: 2000
      }
    ]

    beforeEach(() => {
      mockDeleteThread = vi.fn().mockResolvedValue(undefined)
      useAiProvidersStore.setState({
        providers: [
          {
            id: 'p-1',
            name: 'Provider 1',
            provider: 'openai',
            model: 'gpt-4o',
            hasApiKey: true,
            baseUrl: null
          }
        ]
      })

      useEaChatStore.setState({
        threads: sampleThreads,
        currentThreadId: 't-101',
        messages: [],
        thinking: false,
        streamText: '',
        streamThinking: '',
        sending: false,
        deleteThread: mockDeleteThread
      })
    })

    it('opens delete chat modal from thread list and cancels deletion on Cancel button', () => {
      const { baseElement } = render(<EaChatPanel />)

      // Open history
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))

      // Click delete icon on Breakout Analysis thread
      fireEvent.click(screen.getByRole('button', { name: 'Delete Breakout Analysis' }))

      // Modal open
      expect(baseElement.querySelector('.ui-modal-backdrop')).not.toBeNull()
      expect(screen.getByText('Delete chat')).toBeDefined()
      expect(screen.getByText(/Delete “Breakout Analysis”\?/i)).toBeDefined()

      // Click Cancel
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Modal closed, deleteThread NOT called
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
    })

    it('confirms thread deletion: calls deleteThread and dismisses modal', () => {
      const { baseElement } = render(<EaChatPanel />)

      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Breakout Analysis' }))

      const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(confirmDeleteBtn)

      expect(mockDeleteThread).toHaveBeenCalledTimes(1)
      expect(mockDeleteThread).toHaveBeenCalledWith('t-101')
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
    })

    it('cancels thread deletion on Escape key, backdrop click, or Close button', () => {
      // Escape
      let { baseElement, unmount } = render(<EaChatPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Breakout Analysis' }))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
      unmount()

      // Backdrop
      ;({ baseElement, unmount } = render(<EaChatPanel />))
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Breakout Analysis' }))
      const backdrop = baseElement.querySelector('.ui-modal-backdrop') as HTMLElement
      fireEvent.mouseDown(backdrop)
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
      unmount()

      // Close button
      ;({ baseElement } = render(<EaChatPanel />))
      fireEvent.click(screen.getByRole('button', { name: 'Chat history' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete Breakout Analysis' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(baseElement.querySelector('.ui-modal-backdrop')).toBeNull()
      expect(mockDeleteThread).not.toHaveBeenCalled()
    })
  })
})
