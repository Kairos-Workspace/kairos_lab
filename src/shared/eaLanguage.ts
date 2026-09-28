// Shared by the compiler and AI instructions so the supported functions stay aligned.
export const EA_BUILTINS: Record<string, {
  minArgs: number
  maxArgs: number
  inTickOnly?: boolean
  signature: string
}> = {
  SMA: { minArgs: 1, maxArgs: 2, signature: 'SMA(period, shift = 0): simple average of close prices' },
  EMA: { minArgs: 1, maxArgs: 2, signature: 'EMA(period, shift = 0): exponential average of close prices' },
  crossesAbove: { minArgs: 2, maxArgs: 2, signature: 'crossesAbove(a, b): crosses above since the previous successful evaluation' },
  crossesBelow: { minArgs: 2, maxArgs: 2, signature: 'crossesBelow(a, b): crosses below since the previous successful evaluation' },
  Buy: { minArgs: 0, maxArgs: 1, inTickOnly: true, signature: 'Buy("optional reason"): emit a long signal at the current close' },
  Sell: { minArgs: 0, maxArgs: 1, inTickOnly: true, signature: 'Sell("optional reason"): emit a short signal at the current close' }
}

export const EA_LOCAL_EXAMPLE = `input int Fast = 9;
input int Slow = 50;

void OnTick()
{
  double fast = SMA(Fast);
  double slow = SMA(Slow);
  bool up = crossesAbove(fast, slow);
  bool down = crossesBelow(fast, slow);
  if (up) Buy("Fast SMA crossed above slow SMA");
  if (down) Sell("Fast SMA crossed below slow SMA");
}`

export function eaChatInstructions(): string {
  return [
    'You help write strategies for Kairos local backtesting.',
    'By default, generate Kairos Signal DSL: a small MQL5-like language, not full MetaTrader MQL5.',
    'The editor uses mql5 code fences and .mq5 filenames for this subset; those labels do not guarantee MetaTrader compatibility.',
    'Required entry point: void OnTick(). Optional: void OnInit(). Both have no parameters and use return; without a value.',
    'Supported syntax: int/double/bool inputs with literal defaults; global and local int/double/bool variables; assignments; if/else; return; comments.',
    'Supported operators: + - * / < <= > >= == != && || ! and parentheses. Parenthesize mixed comparisons. Use x = x + 1, not ++ or +=.',
    'Available series: open[n], high[n], low[n], close[n], time[n]. Index 0 is the current closed bar; larger non-negative integers refer to older bars. time is Unix milliseconds.',
    'Only these built-in functions exist:',
    ...Object.values(EA_BUILTINS).map((builtin) => `- ${builtin.signature}${builtin.inTickOnly ? '; only inside OnTick' : ''}`),
    'Indicator periods must be positive integers; shifts must be non-negative integers. Insufficient loaded history skips that evaluation.',
    'Use OnInit only for variable initialization; evaluate series, indicators, and crossings in OnTick.',
    'Evaluate each crossover call consistently before conditional branches so it retains its previous values.',
    'Strings are supported only as signal reasons. No user-defined functions, loops, arrays other than the built-in series, classes, includes, preprocessor directives, or external APIs.',
    'Do not generate CTrade, OrderSend, iMA, CopyBuffer, PositionSelect, or MetaTrader order-management APIs for a local backtest.',
    'Signals use closed-bar prices. Position sizing, stop loss, take profit, and costs come from the backtest settings. The engine supports one open trade and evaluates new signals while flat.',
    'If a request requires an unsupported feature, explain the limitation and offer a supported approach instead of inventing APIs.',
    'If the user explicitly requests full MetaTrader MQL5/export, explain that it must be compiled and tested in MetaTrader and cannot run in the local engine. Do not imply saving a .mq5 file converts the DSL to full MQL5.',
    'Working local strategy example:',
    '```mql5',
    EA_LOCAL_EXAMPLE,
    '```'
  ].join('\n')
}
