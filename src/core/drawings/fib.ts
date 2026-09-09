export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

export interface FibLevel {
  ratio: number
  price: number
}

export function fibLevels(anchorPrice: number, targetPrice: number): FibLevel[] {
  return FIB_RATIOS.map((ratio) => ({
    ratio,
    price: anchorPrice + ratio * (targetPrice - anchorPrice)
  }))
}
