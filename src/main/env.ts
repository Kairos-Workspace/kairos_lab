import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let loaded = false

export function applyLine(raw: string): void {
  const line = raw.trim()
  if (!line || line.startsWith('#')) return
  const eq = line.indexOf('=')
  if (eq === -1) {
    if (line.startsWith('sk-') && !process.env.SEA_LION_API_KEY) {
      process.env.SEA_LION_API_KEY = line
    }
    return
  }
  const key = line.slice(0, eq).trim()
  let value = line.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (key && process.env[key] == null) process.env[key] = value
}

export function loadLocalEnv(): void {
  if (loaded) return
  loaded = true
  const file = join(process.cwd(), '.env')
  if (!existsSync(file)) return
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) applyLine(line)
  } catch {
    /* ignore unreadable env file */
  }
}

export function envApiKeyForProvider(provider: string): string | null {
  if (provider === 'sealion') {
    const key = process.env.SEA_LION_API_KEY?.trim()
    return key || null
  }
  return null
}
