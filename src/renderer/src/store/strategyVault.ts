import type { SavedStrategy } from '@shared/types'

const KEY = 'quantify.strategies'
const LEGACY_KEY = 'aureum.strategies'
const SEED_NOTES = new Set([
  'Close breaks the prior N-bar high or low, with volume confirmation.',
  'Fast SMA crossing the slow SMA.'
])

function isSeed(row: SavedStrategy): boolean {
  return row.id.startsWith('seed-') || SEED_NOTES.has(row.notes)
}

export function withoutSeeds(rows: SavedStrategy[]): SavedStrategy[] {
  return rows.filter((row) => !isSeed(row))
}

export function loadLocalStrategies(): SavedStrategy[] {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedStrategy[]
    return Array.isArray(parsed) ? withoutSeeds(parsed) : []
  } catch {
    return []
  }
}

export function writeLocalStrategies(strategies: SavedStrategy[]): SavedStrategy[] {
  const clean = withoutSeeds(strategies)
  localStorage.setItem(KEY, JSON.stringify(clean))
  localStorage.removeItem(LEGACY_KEY)
  return clean
}

export function upsertLocalStrategy(strategy: SavedStrategy): SavedStrategy[] {
  const current = loadLocalStrategies()
  const next = [strategy, ...current.filter((row) => row.id !== strategy.id)]
  return writeLocalStrategies(next)
}

export function removeLocalStrategy(id: string): SavedStrategy[] {
  return writeLocalStrategies(loadLocalStrategies().filter((row) => row.id !== id))
}

export function mergeStrategyLists(local: SavedStrategy[], remote: SavedStrategy[]): SavedStrategy[] {
  const byId = new Map<string, SavedStrategy>()
  for (const row of [...remote, ...local]) {
    if (isSeed(row)) continue
    const prev = byId.get(row.id)
    if (!prev || row.updatedAt >= prev.updatedAt) byId.set(row.id, row)
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function drainLocalStrategies(): SavedStrategy[] {
  const rows = loadLocalStrategies()
  localStorage.removeItem(KEY)
  localStorage.removeItem(LEGACY_KEY)
  return rows
}
