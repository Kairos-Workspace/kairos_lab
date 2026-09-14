import type { AiProviderProfile } from '@shared/types'

export interface TestConnectionResult {
  ok: boolean
  message: string
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
      return testOpenAiCompatible('https://api.openai.com/v1', apiKey)
    case 'anthropic':
      return testAnthropic(apiKey)
    case 'gemini':
      return testGemini(apiKey)
    case 'custom':
      if (!settings.baseUrl) return { ok: false, message: 'No base URL configured' }
      return testOpenAiCompatible(settings.baseUrl.replace(/\/$/, ''), apiKey)
    default:
      return { ok: false, message: 'Unknown provider' }
  }
}

export interface ChatResult {
  ok: boolean
  reply?: string
  message?: string
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

async function sendOpenAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
    if (!res.ok) return { ok: false, message: `Request failed (${res.status})` }
    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content
    if (typeof reply !== 'string') return { ok: false, message: 'No reply in response' }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function sendAnthropicChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[]
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
        system: systemPrompt,
        messages: history
      })
    })
    if (!res.ok) return { ok: false, message: `Request failed (${res.status})` }
    const data = await res.json()
    const reply = data.content?.[0]?.text
    if (typeof reply !== 'string') return { ok: false, message: 'No reply in response' }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function sendGeminiChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
    if (!res.ok) return { ok: false, message: `Request failed (${res.status})` }
    const data = await res.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof reply !== 'string') return { ok: false, message: 'No reply in response' }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function sendChatMessage(
  profile: Pick<AiProviderProfile, 'provider' | 'baseUrl' | 'model'>,
  apiKey: string | null,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  if (!apiKey) return { ok: false, message: 'No API key configured' }
  switch (profile.provider) {
    case 'openai':
      return sendOpenAiCompatibleChat(
        'https://api.openai.com/v1',
        apiKey,
        profile.model,
        systemPrompt,
        history
      )
    case 'anthropic':
      return sendAnthropicChat(apiKey, profile.model, systemPrompt, history)
    case 'gemini':
      return sendGeminiChat(apiKey, profile.model, systemPrompt, history)
    case 'custom':
      if (!profile.baseUrl) return { ok: false, message: 'No base URL configured' }
      return sendOpenAiCompatibleChat(
        profile.baseUrl.replace(/\/$/, ''),
        apiKey,
        profile.model,
        systemPrompt,
        history
      )
    default:
      return { ok: false, message: 'Unknown provider' }
  }
}
