export interface LogicalRange {
  from: number
  to: number
}

/**
 * True once the visible range's left edge has scrolled within `threshold`
 * bars of the start of what's currently loaded — the signal to fetch an
 * older page before the user actually hits the wall.
 */
export function shouldLoadOlder(range: LogicalRange | null, threshold: number): boolean {
  if (!range) return false
  return range.from < threshold
}

/**
 * Prepending `addedCount` older bars shifts every existing bar's logical
 * index forward by that amount — shift the visible range to match so the
 * chart doesn't visually jump when older history loads in.
 */
export function shiftedVisibleRange(range: LogicalRange, addedCount: number): LogicalRange {
  return { from: range.from + addedCount, to: range.to + addedCount }
}
