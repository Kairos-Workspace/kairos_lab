import { safeStorage } from 'electron'
import {
  SEALION_DEFAULT_MODEL,
  SEALION_SEED_ID,
  type AiProviderProfile
} from '@shared/types'
import { envApiKeyForProvider, loadLocalEnv } from '../env'
import { getDb } from '../database/db'

interface AiProviderRow {
  id: string
  name: string
  provider: string
  model: string
  base_url: string | null
  encrypted_api_key: string | null
  created_at: number
  updated_at: number
}

function toProfile(row: AiProviderRow): AiProviderProfile {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as AiProviderProfile['provider'],
    model: row.model,
    baseUrl: row.base_url,
    hasApiKey: !!row.encrypted_api_key
  }
}

let didSeedSealion = false

function seedSealionBrother(): void {
  if (didSeedSealion) return
  didSeedSealion = true
  const existing = getDb()
    .prepare(
      `SELECT id FROM ai_providers
       WHERE id = @id OR provider = 'sealion' OR lower(name) = 'sea-lion'
       LIMIT 1`
    )
    .get({ id: SEALION_SEED_ID }) as { id: string } | undefined
  if (existing) return
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO ai_providers (id, name, provider, model, base_url, encrypted_api_key, created_at, updated_at)
       VALUES (@id, @name, @provider, @model, NULL, NULL, @now, @now)`
    )
    .run({
      id: SEALION_SEED_ID,
      name: 'SEA-LION',
      provider: 'sealion',
      model: SEALION_DEFAULT_MODEL,
      now
    })
}

export function listProviders(): AiProviderProfile[] {
  seedSealionBrother()
  const rows = getDb()
    .prepare('SELECT * FROM ai_providers ORDER BY updated_at DESC')
    .all() as AiProviderRow[]
  return rows.map(toProfile)
}

export function saveProvider(profile: {
  id: string
  name: string
  provider: AiProviderProfile['provider']
  model: string
  baseUrl: string | null
}): AiProviderProfile[] {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO ai_providers (id, name, provider, model, base_url, encrypted_api_key, created_at, updated_at)
       VALUES (@id, @name, @provider, @model, @baseUrl, NULL, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         provider = excluded.provider,
         model = excluded.model,
         base_url = excluded.base_url,
         updated_at = excluded.updated_at`
    )
    .run({
      id: profile.id,
      name: profile.name.trim() || 'Untitled profile',
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.baseUrl,
      now
    })
  return listProviders()
}

export function deleteProvider(id: string): AiProviderProfile[] {
  getDb().prepare('DELETE FROM ai_providers WHERE id = ?').run(id)
  return listProviders()
}

export function setProviderApiKey(id: string, key: string): { ok: boolean; error?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error: "Secure storage isn't available on this system, so the API key can't be saved."
    }
  }
  const encrypted = safeStorage.encryptString(key).toString('base64')
  getDb()
    .prepare('UPDATE ai_providers SET encrypted_api_key = @key, updated_at = @updated WHERE id = @id')
    .run({ id, key: encrypted, updated: Date.now() })
  return { ok: true }
}

export function clearProviderApiKey(id: string): void {
  getDb()
    .prepare('UPDATE ai_providers SET encrypted_api_key = NULL, updated_at = @updated WHERE id = @id')
    .run({ id, updated: Date.now() })
}

export function getDecryptedApiKey(id: string): string | null {
  loadLocalEnv()
  const row = getDb().prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as
    | AiProviderRow
    | undefined
  const stored = decryptStoredKey(row)
  if (stored) return stored
  const envKey = row ? envApiKeyForProvider(row.provider) : null
  if (!envKey) return null
  setProviderApiKey(id, envKey)
  return envKey
}

function decryptStoredKey(row: AiProviderRow | undefined): string | null {
  if (!row?.encrypted_api_key) return null
  if (row.encrypted_api_key.startsWith('sk-')) return row.encrypted_api_key
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.encrypted_api_key, 'base64'))
  } catch {
    return null
  }
}
