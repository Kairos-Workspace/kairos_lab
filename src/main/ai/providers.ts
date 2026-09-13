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
