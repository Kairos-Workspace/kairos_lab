import { ema, sma } from '@core/indicators/math'
import type { Candle, StrategySignal } from '@shared/types'
import type { Expr, Program, Stmt } from './ast'
import type { EaInputParam } from './types'

type RuntimeValue = number | boolean | string

interface ExecutionContext {
  state: EaRuntimeState
  candles: Candle[]
  candle: Candle | null
  scopes: Array<Map<string, number | boolean>>
  signal: StrategySignal | null
}

class WarmupError extends Error {
  constructor() {
    super('Not enough candle history; evaluate series and indicators in OnTick')
  }
}

export interface EaRuntimeState {
  program: Program
  inputs: EaInputParam[]
  globals: Map<string, number | boolean>
  crossPrev: Map<number, { a: number; b: number }>
  strategyName: string
}

function defaultValue(type: 'int' | 'double' | 'bool'): number | boolean {
  return type === 'bool' ? false : 0
}

function getVariable(context: ExecutionContext, name: string): number | boolean {
  for (let i = context.scopes.length - 1; i >= 0; i--) {
    const value = context.scopes[i].get(name)
    if (value !== undefined) return value
  }
  const value = context.state.globals.get(name)
  if (value === undefined) throw new Error(`Unknown variable '${name}'`)
  return value
}

function setVariable(context: ExecutionContext, name: string, value: RuntimeValue): void {
  if (typeof value === 'string') throw new Error(`Cannot assign a string to '${name}'`)
  for (let i = context.scopes.length - 1; i >= 0; i--) {
    if (context.scopes[i].has(name)) {
      context.scopes[i].set(name, value)
      return
    }
  }
  if (!context.state.globals.has(name)) throw new Error(`Unknown variable '${name}'`)
  context.state.globals.set(name, value)
}

function asNumber(value: RuntimeValue): number {
  if (typeof value !== 'number') throw new Error('Expected a number')
  return value
}

function evaluateBinary(
  op: Extract<Expr, { kind: 'binary' }>['op'],
  left: RuntimeValue,
  right: RuntimeValue
): RuntimeValue {
  switch (op) {
    case '+':
      return asNumber(left) + asNumber(right)
    case '-':
      return asNumber(left) - asNumber(right)
    case '*':
      return asNumber(left) * asNumber(right)
    case '/':
      return asNumber(left) / asNumber(right)
    case '<':
      return asNumber(left) < asNumber(right)
    case '<=':
      return asNumber(left) <= asNumber(right)
    case '>':
      return asNumber(left) > asNumber(right)
    case '>=':
      return asNumber(left) >= asNumber(right)
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '&&':
    case '||':
      throw new Error(`Internal error evaluating '${op}'`)
  }
}

function evaluateCall(
  expression: Extract<Expr, { kind: 'call' }>,
  context: ExecutionContext
): RuntimeValue {
  if (expression.callee === 'Buy' || expression.callee === 'Sell') {
    if (context.signal) return false
    if (!context.candle) throw new Error(`${expression.callee} is unavailable during initialization`)
    const reasonValue = expression.args[0] ? evaluateExpr(expression.args[0], context) : undefined
    if (reasonValue !== undefined && typeof reasonValue !== 'string') {
      throw new Error(`${expression.callee} reason must be a string`)
    }
    context.signal = {
      type: expression.callee === 'Buy' ? 'LONG' : 'SHORT',
      timestamp: context.candle.timestamp,
      price: context.candle.close,
      reason: reasonValue ?? `${expression.callee} signal`,
      strategy: context.state.strategyName
    }
    return true
  }

  const args = expression.args.map((argument) => evaluateExpr(argument, context))

  if (expression.callee === 'SMA' || expression.callee === 'EMA') {
    const period = asNumber(args[0])
    const shift = args.length > 1 ? asNumber(args[1]) : 0
    if (!Number.isInteger(period) || period < 1) throw new Error('Indicator period must be positive')
    if (!Number.isInteger(shift) || shift < 0) throw new Error('Indicator shift must be non-negative')
    if (shift >= context.candles.length) throw new WarmupError()
    const bars = context.candles.slice(0, context.candles.length - shift)
    const value = expression.callee === 'SMA' ? sma(bars, period) : ema(bars, period)
    if (value === null) throw new WarmupError()
    return value
  }

  if (expression.callee === 'crossesAbove' || expression.callee === 'crossesBelow') {
    const a = asNumber(args[0])
    const b = asNumber(args[1])
    const previous = context.state.crossPrev.get(expression.callSiteId)
    context.state.crossPrev.set(expression.callSiteId, { a, b })
    if (!previous) return false
    return expression.callee === 'crossesAbove'
      ? previous.a <= previous.b && a > b
      : previous.a >= previous.b && a < b
  }

  throw new Error(`Unknown function '${expression.callee}'`)
}

function evaluateExpr(expression: Expr, context: ExecutionContext): RuntimeValue {
  switch (expression.kind) {
    case 'number':
    case 'bool':
    case 'string':
      return expression.value
    case 'ident':
      return getVariable(context, expression.name)
    case 'series': {
      const index = asNumber(evaluateExpr(expression.index, context))
      if (!Number.isInteger(index) || index < 0) {
        throw new Error('Series index must be a non-negative integer')
      }
      const bar = context.candles[context.candles.length - 1 - index]
      if (!bar) throw new WarmupError()
      return expression.series === 'time' ? bar.timestamp : bar[expression.series]
    }
    case 'call':
      return evaluateCall(expression, context)
    case 'unary': {
      const value = evaluateExpr(expression.arg, context)
      return expression.op === '-' ? -asNumber(value) : !value
    }
    case 'binary':
      if (expression.op === '&&') {
        return Boolean(evaluateExpr(expression.left, context)) &&
          Boolean(evaluateExpr(expression.right, context))
      }
      if (expression.op === '||') {
        return Boolean(evaluateExpr(expression.left, context)) ||
          Boolean(evaluateExpr(expression.right, context))
      }
      return evaluateBinary(
        expression.op,
        evaluateExpr(expression.left, context),
        evaluateExpr(expression.right, context)
      )
  }
}

function executeStatements(statements: Stmt[], context: ExecutionContext): boolean {
  for (const statement of statements) {
    switch (statement.kind) {
      case 'var': {
        const value = statement.init
          ? evaluateExpr(statement.init, context)
          : defaultValue(statement.type)
        if (typeof value === 'string') throw new Error(`Cannot initialize '${statement.name}'`)
        context.scopes[context.scopes.length - 1].set(statement.name, value)
        break
      }
      case 'assign':
        setVariable(context, statement.name, evaluateExpr(statement.value, context))
        break
      case 'if': {
        const branch = Boolean(evaluateExpr(statement.test, context))
          ? statement.consequent
          : statement.alternate
        if (branch) {
          context.scopes.push(new Map())
          const returned = executeStatements(branch, context)
          context.scopes.pop()
          if (returned) return true
        }
        break
      }
      case 'return':
        return true
      case 'expr':
        evaluateExpr(statement.expr, context)
        break
    }
  }
  return false
}

function initializeGlobals(state: EaRuntimeState): void {
  state.globals.clear()
  for (const input of state.inputs) state.globals.set(input.name, input.defaultValue)
  for (const variable of state.program.globals) {
    state.globals.set(variable.name, defaultValue(variable.type))
  }

  const context: ExecutionContext = {
    state,
    candles: [],
    candle: null,
    scopes: [],
    signal: null
  }
  for (const variable of state.program.globals) {
    if (!variable.init) continue
    const value = evaluateExpr(variable.init, context)
    if (typeof value === 'string') throw new Error(`Cannot initialize '${variable.name}'`)
    state.globals.set(variable.name, value)
  }
}

export function createRuntime(program: Program, strategyName: string): EaRuntimeState {
  const state: EaRuntimeState = {
    program,
    inputs: program.inputs.map(({ name, type, defaultValue: value }) => ({
      name,
      type,
      defaultValue: value
    })),
    globals: new Map(),
    crossPrev: new Map(),
    strategyName
  }
  initializeGlobals(state)
  state.crossPrev.clear()
  return state
}

export function runOnInit(state: EaRuntimeState): void {
  state.crossPrev.clear()
  initializeGlobals(state)
  if (state.program.onInit) {
    executeStatements(state.program.onInit.body, {
      state,
      candles: [],
      candle: null,
      scopes: [new Map()],
      signal: null
    })
  }
  state.crossPrev.clear()
}

export function runOnTick(
  state: EaRuntimeState,
  candles: Candle[],
  candle: Candle
): StrategySignal | null {
  // A failed tick must not leave cross memory or globals half-updated,
  // whether it needs more history or has a runtime error.
  const crossSnapshot = new Map(state.crossPrev)
  const globalsSnapshot = new Map(state.globals)
  const context: ExecutionContext = {
    state,
    candles,
    candle,
    scopes: [new Map()],
    signal: null
  }
  try {
    if (state.program.onTick) executeStatements(state.program.onTick.body, context)
    return context.signal
  } catch (error) {
    state.crossPrev = crossSnapshot
    state.globals = globalsSnapshot
    if (error instanceof WarmupError) {
      return null
    }
    throw error
  }
}
