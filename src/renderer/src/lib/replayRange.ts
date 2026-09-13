export function formatRange(startTs: number, endTs: number): string {
  if (!startTs || !endTs) return 'Range pending'
  const from = new Date(startTs).toISOString().slice(0, 10)
  const to = new Date(endTs).toISOString().slice(0, 10)
  return `${from} → ${to}`
}

export function toReplayInput(ts: number | null | undefined): string {
  if (ts == null) return ''
  const date = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromReplayInput(value: string): number | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : ts
}
