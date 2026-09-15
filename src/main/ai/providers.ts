import { SEALION_BASE_URL, type AiProviderProfile } from '@shared/types'

export interface TestConnectionResult {
  ok: boolean
  message: string
}

// Shared by testConnection/listModels/sendChatMessage, the three places that
// otherwise each re-derive which base URL an OpenAI-compatible provider
// (openai/sealion/custom) talks to.
export function openAiCompatibleBaseUrl(
  provider: 'openai' | 'sealion' | 'custom',
  baseUrl: string | null
): string | null {
  if (provider === 'openai') return 'https://api.openai.com/v1'
  if (provider === 'sealion') return SEALION_BASE_URL
  return baseUrl ? baseUrl.replace(/\/$/, '') : null
}

async function testOpenAiCompatible(baseUrl: string, apiKey: string): Promise<TestConnectionResult> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (res.ok) return { ok: true, message: 'Connected' }
    return { ok: false, message: `Request failed (${res.status})` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function testAnthropic(apiKey: string): Promise<TestConnectionResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (res.ok) return { ok: true, message: 'Connected' }
    return { ok: false, message: `Request failed (${res.status})` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function testGemini(apiKey: string): Promise<TestConnectionResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    )
    if (res.ok) return { ok: true, message: 'Connected' }
    return { ok: false, message: `Request failed (${res.status})` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function testConnection(
  settings: Pick<AiProviderProfile, 'provider' | 'baseUrl'>,
  apiKey: string | null
): Promise<TestConnectionResult> {
  if (!apiKey) return { ok: false, message: 'No API key configured' }
  switch (settings.provider) {
    case 'openai':
    case 'sealion':
    case 'custom': {
      const base = openAiCompatibleBaseUrl(settings.provider, settings.baseUrl)
      if (!base) return { ok: false, message: 'No base URL configured' }
      return testOpenAiCompatible(base, apiKey)
    }
    case 'anthropic':
      return testAnthropic(apiKey)
    case 'gemini':
      return testGemini(apiKey)
    default:
      return { ok: false, message: 'Unknown provider' }
  }
}

export interface ListModelsResult {
  ok: boolean
  models: string[]
  message?: string
}

function isChatModel(id: string): boolean {
  const name = id.toLowerCase()
  return !/(embed|rerank|guard|whisper|tts|dall-e|imagen|moderation|transcribe)/.test(name)
}

function uniqueModels(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed) || !isChatModel(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

export async function listModels(
  settings: Pick<AiProviderProfile, 'provider' | 'baseUrl'>,
  apiKey: string | null
): Promise<ListModelsResult> {
  if (!apiKey) return { ok: false, models: [], message: 'No API key configured' }
  try {
    switch (settings.provider) {
      case 'openai':
      case 'sealion':
      case 'custom': {
        const base = openAiCompatibleBaseUrl(settings.provider, settings.baseUrl)
        if (!base) return { ok: false, models: [], message: 'No base URL configured' }
        const res = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        })
        if (!res.ok) return { ok: false, models: [], message: `Request failed (${res.status})` }
        const json = (await res.json()) as { data?: Array<{ id?: unknown }> }
        const ids = (json.data ?? [])
          .map((row) => (typeof row.id === 'string' ? row.id : ''))
          .filter(Boolean)
        return { ok: true, models: uniqueModels(ids) }
      }
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        })
        if (!res.ok) return { ok: false, models: [], message: `Request failed (${res.status})` }
        const json = (await res.json()) as { data?: Array<{ id?: unknown }> }
        const ids = (json.data ?? [])
          .map((row) => (typeof row.id === 'string' ? row.id : ''))
          .filter(Boolean)
        return { ok: true, models: uniqueModels(ids) }
      }
      case 'gemini': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        )
        if (!res.ok) return { ok: false, models: [], message: `Request failed (${res.status})` }
        const json = (await res.json()) as {
          models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }>
        }
        const ids = (json.models ?? [])
          .filter((row) => {
            const methods = row.supportedGenerationMethods
            return !Array.isArray(methods) || methods.includes('generateContent')
          })
          .map((row) => {
            if (typeof row.name !== 'string') return ''
            return row.name.replace(/^models\//, '')
          })
          .filter(Boolean)
        return { ok: true, models: uniqueModels(ids) }
      }
      default:
        return { ok: false, models: [], message: 'Unknown provider' }
    }
  } catch (error) {
    return {
      ok: false,
      models: [],
      message: error instanceof Error ? error.message : 'Network error'
    }
  }
}

export interface ChatResult {
  ok: boolean
  reply?: string
  thinkingOnly?: boolean
  message?: string
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatChunk {
  text?: string
  thinking?: string
}

export type ChatChunkHandler = (chunk: ChatChunk) => void

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text
      }
      return ''
    })
    .join('')
}

function openAiMessageText(message: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } | undefined): ChatChunk {
  const text = asText(message?.content)
  const thinking = asText(message?.reasoning_content) || asText(message?.reasoning)
  return {
    text: text || undefined,
    thinking: thinking || undefined
  }
}

async function httpError(res: Response): Promise<ChatResult> {
  let detail = ''
  try {
    const body = await res.text()
    const json = JSON.parse(body) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof json.error === 'string') detail = json.error
    else if (json.error && typeof json.error.message === 'string') detail = json.error.message
    else if (typeof json.message === 'string') detail = json.message
  } catch {
    /* status-only fallback */
  }
  return {
    ok: false,
    message: detail ? `Request failed (${res.status}): ${detail}` : `Request failed (${res.status})`
  }
}

function openAiDelta(data: unknown): ChatChunk {
  const json = data as {
    choices?: Array<{
      delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }
      message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }
    }>
  }
  const choice = json.choices?.[0]
  if (choice?.delta) return openAiMessageText(choice.delta)
  return openAiMessageText(choice?.message)
}

function anthropicDelta(data: unknown): ChatChunk {
  const json = data as { type?: string; delta?: { text?: unknown }; content?: Array<{ text?: unknown }> }
  if (json.type === 'content_block_delta' && typeof json.delta?.text === 'string') {
    return { text: json.delta.text }
  }
  const block = json.content?.[0]?.text
  return typeof block === 'string' ? { text: block } : {}
}

function geminiDelta(data: unknown): ChatChunk {
  const json = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }
  const text = asText(json.candidates?.[0]?.content?.parts)
  return text ? { text } : {}
}

function consumeSseLine(
  line: string,
  pickDelta: (data: unknown) => ChatChunk,
  onChunk: ChatChunkHandler | undefined,
  acc: { reply: string; thinking: string }
): void {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return
  try {
    const delta = pickDelta(JSON.parse(payload) as unknown)
    if (delta.thinking) {
      acc.thinking += delta.thinking
      onChunk?.({ thinking: delta.thinking })
    }
    if (delta.text) {
      acc.reply += delta.text
      onChunk?.({ text: delta.text })
    }
  } catch {
    /* skip malformed SSE lines */
  }
}

function parseJsonCompletion(raw: string, pickDelta: (data: unknown) => ChatChunk): ChatChunk {
  try {
    return pickDelta(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

function chatResultFromChunk(chunk: ChatChunk, onChunk?: ChatChunkHandler): ChatResult {
  if (chunk.thinking) onChunk?.({ thinking: chunk.thinking })
  if (chunk.text) onChunk?.({ text: chunk.text })
  const reply = chunk.text || chunk.thinking
  if (!reply) return { ok: false, message: 'No reply in response' }
  return { ok: true, reply, thinkingOnly: !chunk.text && !!chunk.thinking }
}

async function readSseStream(
  res: Response,
  pickDelta: (data: unknown) => ChatChunk,
  onChunk?: ChatChunkHandler
): Promise<ChatResult> {
  const reader = res.body?.getReader()
  if (!reader) return { ok: false, message: 'No reply in response' }
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''
  const acc = { reply: '', thinking: '' }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const piece = decoder.decode(value, { stream: true })
    raw += piece
    buffer += piece
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consumeSseLine(line, pickDelta, onChunk, acc)
  }
  const tail = decoder.decode()
  raw += tail
  buffer += tail
  if (buffer.trim()) consumeSseLine(buffer, pickDelta, onChunk, acc)
  if (acc.reply || acc.thinking) {
    return { ok: true, reply: acc.reply || acc.thinking, thinkingOnly: !acc.reply && !!acc.thinking }
  }
  // Nothing arrived as SSE — the server may have ignored `stream: true` and
  // returned one plain JSON completion body instead.
  return chatResultFromChunk(parseJsonCompletion(raw, pickDelta), onChunk)
}

async function sendOpenAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
  onChunk?: ChatChunkHandler
): Promise<ChatResult> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 8192,
        messages: [{ role: 'system', content: systemPrompt }, ...history]
      })
    })
    if (res.ok) return readSseStream(res, openAiDelta, onChunk)
    // A user-configured "custom" OpenAI-compatible endpoint may reject the
    // stream/max_tokens parameters outright (400/422) instead of ignoring
    // them (unlike OpenAI/SEA-LION, which are known to support both) — retry
    // once as a plain, non-streaming request before giving up. Other statuses
    // (auth, rate limit, server error) would fail the retry the same way, so
    // don't spend an extra round-trip on those.
    if (res.status !== 400 && res.status !== 422) return httpError(res)
    const retryRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history]
      })
    })
    // The retry uses the request shape we actually expect the server to
    // accept, so if it still fails, its own error is the one worth
    // surfacing — not the streaming attempt's, which can be pure noise.
    if (!retryRes.ok) return httpError(retryRes)
    return chatResultFromChunk(parseJsonCompletion(await retryRes.text(), openAiDelta), onChunk)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function sendAnthropicChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
  onChunk?: ChatChunkHandler
): Promise<ChatResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: history
      })
    })
    if (!res.ok) return httpError(res)
    return readSseStream(res, anthropicDelta, onChunk)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function sendGeminiChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
  onChunk?: ChatChunkHandler
): Promise<ChatResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: history.map((entry) => ({
            role: entry.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: entry.content }]
          }))
        })
      }
    )
    if (!res.ok) return httpError(res)
    return readSseStream(res, geminiDelta, onChunk)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function sendChatMessage(
  profile: Pick<AiProviderProfile, 'provider' | 'baseUrl' | 'model'>,
  apiKey: string | null,
  systemPrompt: string,
  history: ChatHistoryEntry[],
  onChunk?: ChatChunkHandler
): Promise<ChatResult> {
  if (!apiKey) return { ok: false, message: 'No API key configured' }
  switch (profile.provider) {
    case 'openai':
    case 'sealion':
    case 'custom': {
      const base = openAiCompatibleBaseUrl(profile.provider, profile.baseUrl)
      if (!base) return { ok: false, message: 'No base URL configured' }
      return sendOpenAiCompatibleChat(base, apiKey, profile.model, systemPrompt, history, onChunk)
    }
    case 'anthropic':
      return sendAnthropicChat(apiKey, profile.model, systemPrompt, history, onChunk)
    case 'gemini':
      return sendGeminiChat(apiKey, profile.model, systemPrompt, history, onChunk)
    default:
      return { ok: false, message: 'Unknown provider' }
  }
}
