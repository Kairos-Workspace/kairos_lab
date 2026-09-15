import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAiCompatibleBaseUrl, sendChatMessage } from '../src/main/ai/providers'

describe('openAiCompatibleBaseUrl', () => {
  it('resolves the fixed OpenAI base URL', () => {
    expect(openAiCompatibleBaseUrl('openai', null)).toBe('https://api.openai.com/v1')
  })

  it('resolves the fixed SEA-LION base URL', () => {
    expect(openAiCompatibleBaseUrl('sealion', null)).toBe('https://api.sea-lion.ai/v1')
  })

  it('trims a trailing slash from a custom base URL', () => {
    expect(openAiCompatibleBaseUrl('custom', 'https://my-llm.example.com/v1/')).toBe(
      'https://my-llm.example.com/v1'
    )
  })

  it('returns null when a custom provider has no base URL configured', () => {
    expect(openAiCompatibleBaseUrl('custom', null)).toBeNull()
  })
})

function fakeResponse(bodyText: string, ok = true, status = 200): Response {
  const encoder = new TextEncoder()
  let delivered = false
  return {
    ok,
    status,
    body: {
      getReader() {
        return {
          async read() {
            if (!delivered) {
              delivered = true
              return { done: false, value: encoder.encode(bodyText) }
            }
            return { done: true, value: undefined }
          }
        }
      }
    },
    text: async () => bodyText
  } as unknown as Response
}

describe('sendChatMessage non-streaming JSON fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses an Anthropic-shaped fallback body when the response is not SSE', async () => {
    const body = JSON.stringify({ content: [{ text: 'Hello from Claude' }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(body)))

    const result = await sendChatMessage(
      { provider: 'anthropic', baseUrl: null, model: 'claude-x' },
      'key',
      'sys',
      []
    )

    expect(result.ok).toBe(true)
    expect(result.reply).toBe('Hello from Claude')
  })

  it('parses a Gemini-shaped fallback body when the response is not SSE', async () => {
    const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hi from Gemini' }] } }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(body)))

    const result = await sendChatMessage(
      { provider: 'gemini', baseUrl: null, model: 'gemini-x' },
      'key',
      'sys',
      []
    )

    expect(result.ok).toBe(true)
    expect(result.reply).toBe('Hi from Gemini')
  })

  it('still parses an OpenAI-shaped fallback body when the response is not SSE', async () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'Hi from GPT' } }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(body)))

    const result = await sendChatMessage(
      { provider: 'openai', baseUrl: null, model: 'gpt-x' },
      'key',
      'sys',
      []
    )

    expect(result.ok).toBe(true)
    expect(result.reply).toBe('Hi from GPT')
  })
})

describe('sendChatMessage retries a rejected stream request without streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries without stream/max_tokens when a custom endpoint rejects the streamed request', async () => {
    const errorResponse = fakeResponse('{"error":"unknown parameter: stream"}', false, 400)
    const retryBody = JSON.stringify({ choices: [{ message: { content: 'Plain reply' } }] })
    const successResponse = fakeResponse(retryBody)
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse).mockResolvedValueOnce(successResponse)
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendChatMessage(
      { provider: 'custom', baseUrl: 'https://my-llm.example.com/v1', model: 'local-model' },
      'key',
      'sys',
      []
    )

    expect(result.ok).toBe(true)
    expect(result.reply).toBe('Plain reply')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(retryCallBody.stream).toBeUndefined()
    expect(retryCallBody.max_tokens).toBeUndefined()
  })

  it('surfaces the retry\'s own error when the no-stream retry fails for a different reason', async () => {
    // The streaming attempt's error can be pure noise (e.g. "unknown param:
    // stream") that has nothing to do with the real problem; the retry is the
    // one using the request shape we actually expect the server to accept, so
    // its failure reason is the one worth showing.
    const errorResponse = fakeResponse('{"error":"unknown parameter: stream"}', false, 400)
    const retryErrorResponse = fakeResponse('{"error":"invalid api key"}', false, 401)
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse).mockResolvedValueOnce(retryErrorResponse)
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendChatMessage(
      { provider: 'custom', baseUrl: 'https://my-llm.example.com/v1', model: 'local-model' },
      'key',
      'sys',
      []
    )

    expect(result.ok).toBe(false)
    expect(result.message).toContain('invalid api key')
  })
})
