import { safeStorage } from 'electron'
import type { AiSettings } from '@shared/types'
import { getDb } from '../database/db'

interface AiSettingsRow {
  id: number
  provider: string
  model: string
  base_url: string | null
  encrypted_api_key: string | null
  updated_at: number
}

function ensureRow(): AiSettingsRow {
  const existing = getDb().prepare('SELECT * FROM ai_settings WHERE id = 1').get() as
    | AiSettingsRow
    | undefined
  if (existing) return existing
  getDb()
    .prepare(
      `INSERT INTO ai_settings (id, provider, model, base_url, encrypted_api_key, updated_at)
       VALUES (1, 'openai', '', NULL, NULL, @updated)`
    )
    .run({ updated: Date.now() })
  return getDb().prepare('SELECT * FROM ai_settings WHERE id = 1').get() as AiSettingsRow
}

export function getAiSettings(): AiSettings {
  const row = ensureRow()
  return {
    provider: row.provider as AiSettings['provider'],
    model: row.model,
    baseUrl: row.base_url,
    hasApiKey: !!row.encrypted_api_key
  }
}

export function saveAiSettings(patch: {
  provider: AiSettings['provider']
  model: string
  baseUrl: string | null
}): AiSettings {
  ensureRow()
  getDb()
    .prepare(
      `UPDATE ai_settings SET provider = @provider, model = @model, base_url = @baseUrl, updated_at = @updated
       WHERE id = 1`
    )
    .run({
      provider: patch.provider,
      model: patch.model,
      baseUrl: patch.baseUrl,
      updated: Date.now()
    })
  return getAiSettings()
}

export function setAiApiKey(key: string): { ok: boolean; error?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error: "Secure storage isn't available on this system, so the API key can't be saved."
    }
  }
  ensureRow()
  const encrypted = safeStorage.encryptString(key).toString('base64')
  getDb()
    .prepare('UPDATE ai_settings SET encrypted_api_key = @key, updated_at = @updated WHERE id = 1')
    .run({ key: encrypted, updated: Date.now() })
  return { ok: true }
}

export function clearAiApiKey(): void {
  ensureRow()
  getDb()
    .prepare('UPDATE ai_settings SET encrypted_api_key = NULL, updated_at = @updated WHERE id = 1')
    .run({ updated: Date.now() })
}

export function getDecryptedApiKey(): string | null {
  const row = ensureRow()
  if (!row.encrypted_api_key) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.encrypted_api_key, 'base64'))
  } catch {
    return null
  }
}
