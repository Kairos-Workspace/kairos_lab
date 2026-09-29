import raw from './macro.json'
import type { FundamentalBundle } from './types'

export const FUNDAMENTALS_BUNDLE = raw as FundamentalBundle

export function getFundamentalsBundle(): FundamentalBundle {
  return FUNDAMENTALS_BUNDLE
}
