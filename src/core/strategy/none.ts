import type { Candle, Strategy, StrategyContext, StrategySignal } from '@shared/types'

export class NoneStrategy implements Strategy {
  readonly id = 'none'
  readonly name = 'None'
  readonly description = 'No automated signals — chart replay and manual trade entry only.'

  initialize(): void {}

  onCandle(_candle: Candle, _context: StrategyContext): StrategySignal | null {
    return null
  }
}
