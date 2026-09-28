import type { Candle, Strategy, StrategyContext, StrategySignal } from '@shared/types'
import type { Program } from './ast'
import { createRuntime, runOnInit, runOnTick, type EaRuntimeState } from './runtime'
import type { EaInputParam } from './types'

export class EaSignalStrategy implements Strategy {
  readonly id: string
  readonly name: string
  readonly description = 'Kairos Signal DSL (bar-close)'
  private state: EaRuntimeState

  constructor(program: Program, opts: { id: string; name: string; inputs: EaInputParam[] }) {
    this.id = opts.id
    this.name = opts.name
    this.state = createRuntime(program, opts.name)
    this.state.inputs = opts.inputs.map((input) => ({ ...input }))
  }

  initialize(): void {
    runOnInit(this.state)
  }

  onCandle(candle: Candle, context: StrategyContext): StrategySignal | null {
    return runOnTick(this.state, context.candles, candle)
  }
}
