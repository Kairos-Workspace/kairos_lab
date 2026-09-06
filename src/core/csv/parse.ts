import type { Candle } from '@shared/types'

function parseIsoFast(raw: string): number {
  return Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(5, 7)) - 1,
    Number(raw.slice(8, 10)),
    Number(raw.slice(11, 13)),
    Number(raw.slice(14, 16)),
    Number(raw.slice(17, 19) || 0)
  )
}

function parseTimestamp(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed.length >= 19 && trimmed.charCodeAt(4) === 45 && trimmed.charCodeAt(10) === 84) {
    return parseIsoFast(trimmed)
  }
  if (/^\d{13}$/.test(trimmed)) return Number(trimmed)
  if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000
  const iso = Date.parse(trimmed.replace(' ', 'T'))
  if (!Number.isNaN(iso)) return iso
  const dotted = trimmed.match(
    /^(\d{4})[./-](\d{2})[./-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  )
  if (dotted) {
    return Date.UTC(
      Number(dotted[1]),
      Number(dotted[2]) - 1,
      Number(dotted[3]),
      Number(dotted[4]),
      Number(dotted[5]),
      Number(dotted[6] ?? 0)
    )
  }
  throw new Error(`Unrecognized timestamp: ${raw}`)
}

export function parseCandleCsv(text: string): Candle[] {
  const candles: Candle[] = []
  let cursor = 0
  const n = text.length
  const firstBreak = text.indexOf('\n')
  const header = (firstBreak === -1 ? text : text.slice(0, firstBreak)).toLowerCase()
  if (header.includes('open') && header.includes('close')) {
    if (firstBreak === -1) return candles
    cursor = firstBreak + 1
  }

  let prev = -1
  let sorted = true
  while (cursor < n) {
    let end = text.indexOf('\n', cursor)
    if (end === -1) end = n
    let line = text.slice(cursor, end)
    cursor = end + 1
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1)
    if (line.length < 8) continue

    const c1 = line.indexOf(',')
    const c2 = line.indexOf(',', c1 + 1)
    const c3 = line.indexOf(',', c2 + 1)
    const c4 = line.indexOf(',', c3 + 1)
    if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) continue
    const c5 = line.indexOf(',', c4 + 1)

    const timestamp = parseTimestamp(line.slice(0, c1))
    const open = Number(line.slice(c1 + 1, c2))
    const high = Number(line.slice(c2 + 1, c3))
    const low = Number(line.slice(c3 + 1, c4))
    const close = Number(line.slice(c4 + 1, c5 === -1 ? line.length : c5))
    const volume =
      c5 === -1 || c5 === line.length - 1 ? undefined : Number(line.slice(c5 + 1))
    if (![timestamp, open, high, low, close].every(Number.isFinite)) continue
    if (timestamp < prev) sorted = false
    prev = timestamp
    candles.push({ timestamp, open, high, low, close, volume })
  }
  if (!sorted) candles.sort((a, b) => a.timestamp - b.timestamp)
  return candles
}
