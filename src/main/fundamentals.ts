import { FUNDAMENTALS_BUNDLE } from '@core/fundamentals/bundle'
import {
  buildFundamentalsBundle,
  type FundamentalsFetchRange,
  upsertEvent,
  upsertSeriesPoint
} from '@core/fundamentals/fetchMacro'
import type { FundamentalBundle, FundamentalEvent, FundamentalPoint } from '@core/fundamentals/types'
import { loadLocalEnv } from './env'
import { getDb } from './database/db'

const PREF_KEY = 'fundamentals.bundle'
const SOURCE_KEY = 'fundamentals.source'

export type FundamentalsSource = 'bundled' | 'custom'

function readPref(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM prefs WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function writePref(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO prefs (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

function deletePref(key: string): void {
  getDb().prepare('DELETE FROM prefs WHERE key = ?').run(key)
}

function parseBundle(raw: string): FundamentalBundle | null {
  try {
    const parsed = JSON.parse(raw) as FundamentalBundle
    if (!parsed || !Array.isArray(parsed.series) || !Array.isArray(parsed.events)) return null
    return parsed
  } catch {
    return null
  }
}

export function getFundamentalsState(): {
  bundle: FundamentalBundle
  source: FundamentalsSource
  updatedAt: number | null
} {
  const raw = readPref(PREF_KEY)
  if (raw) {
    const bundle = parseBundle(raw)
    if (bundle) {
      const meta = readPref('fundamentals.updatedAt')
      return {
        bundle,
        source: 'custom',
        updatedAt: meta ? Number(meta) : null
      }
    }
  }
  return { bundle: FUNDAMENTALS_BUNDLE, source: 'bundled', updatedAt: null }
}

export function saveFundamentalsBundle(bundle: FundamentalBundle): {
  bundle: FundamentalBundle
  source: FundamentalsSource
  updatedAt: number
} {
  const updatedAt = Date.now()
  writePref(PREF_KEY, JSON.stringify(bundle))
  writePref(SOURCE_KEY, 'custom')
  writePref('fundamentals.updatedAt', String(updatedAt))
  return { bundle, source: 'custom', updatedAt }
}

export function resetFundamentalsBundle(): {
  bundle: FundamentalBundle
  source: FundamentalsSource
  updatedAt: null
} {
  deletePref(PREF_KEY)
  deletePref(SOURCE_KEY)
  deletePref('fundamentals.updatedAt')
  return { bundle: FUNDAMENTALS_BUNDLE, source: 'bundled', updatedAt: null }
}

export async function refreshFundamentalsFromFred(range?: FundamentalsFetchRange): Promise<{
  bundle: FundamentalBundle
  source: FundamentalsSource
  updatedAt: number
}> {
  loadLocalEnv()
  const key = process.env.FRED_API_KEY?.trim()
  if (!key) {
    throw new Error('Add FRED_API_KEY to your .env file, then try again.')
  }
  const bundle = await buildFundamentalsBundle(key, range)
  return saveFundamentalsBundle(bundle)
}

export function upsertFundamentalsPoint(
  seriesId: string,
  point: FundamentalPoint
): {
  bundle: FundamentalBundle
  source: FundamentalsSource
  updatedAt: number
} {
  const { bundle } = getFundamentalsState()
  return saveFundamentalsBundle(upsertSeriesPoint(bundle, seriesId, point))
}

export function upsertFundamentalsEvent(event: FundamentalEvent): {
  bundle: FundamentalBundle
  source: FundamentalsSource
  updatedAt: number
} {
  const { bundle } = getFundamentalsState()
  return saveFundamentalsBundle(upsertEvent(bundle, event))
}
