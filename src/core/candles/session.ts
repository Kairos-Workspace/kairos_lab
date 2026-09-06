import type { SessionName } from '@shared/types'

export function sessionAt(timestamp: number): SessionName {
  const hour = new Date(timestamp).getUTCHours()
  if (hour >= 7 && hour < 12) return 'London'
  if (hour >= 12 && hour < 21) return 'New York'
  return 'Asia'
}

export function formatReplayClock(timestamp: number): { date: string; time: string } {
  const d = new Date(timestamp)
  const date = d.toISOString().slice(0, 10)
  const time = d.toISOString().slice(11, 16)
  return { date, time }
}
