import { describe, expect, it } from 'vitest'
import { DEFAULT_COSTS } from '@shared/constants'
import { calculatePositionSize, riskReward, roundLot } from '@core/trade/sizing'

describe('position sizing', () => {
  it('sizes a long from balance, risk percent, and stop distance', () => {
    const size = calculatePositionSize({
      balance: 10_000,
      riskPercent: 1,
      entry: 3342.5,
      stopLoss: 3337.5,
      costs: DEFAULT_COSTS
    })
    // $100 risk / ($5 * 100 oz) = 0.20 lots
    expect(size.riskAmount).toBe(100)
    expect(size.positionSize).toBe(0.2)
    expect(size.stopDistance).toBe(5)
  })

  it('returns 1:3 when take profit is three times the stop', () => {
    expect(riskReward(3342.5, 3337.5, 3357.5)).toBeCloseTo(3)
  })

  it('rounds lots down to the configured step', () => {
    expect(roundLot(0.237, 0.01, 0.01)).toBe(0.23)
    expect(roundLot(0.004, 0.01, 0.01)).toBe(0.01)
  })
})
