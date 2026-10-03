// Shared by the compiler and AI instructions so the supported functions stay aligned.
export const EA_BUILTINS: Record<
  string,
  {
    minArgs: number
    maxArgs: number
    inTickOnly?: boolean
    signature: string
  }
> = {
  SMA: { minArgs: 1, maxArgs: 2, signature: 'SMA(period, shift = 0): simple average of close prices' },
  EMA: { minArgs: 1, maxArgs: 2, signature: 'EMA(period, shift = 0): exponential average of close prices' },
  crossesAbove: {
    minArgs: 2,
    maxArgs: 2,
    signature: 'crossesAbove(a, b): crosses above since the previous successful evaluation'
  },
  crossesBelow: {
    minArgs: 2,
    maxArgs: 2,
    signature: 'crossesBelow(a, b): crosses below since the previous successful evaluation'
  },
  Buy: {
    minArgs: 0,
    maxArgs: 1,
    inTickOnly: true,
    signature: 'Buy("optional reason"): emit a long signal at the current close'
  },
  Sell: {
    minArgs: 0,
    maxArgs: 1,
    inTickOnly: true,
    signature: 'Sell("optional reason"): emit a short signal at the current close'
  }
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
    'HARD RULE — LANGUAGE: You write Kairos Bot Rules ONLY (also called Kairos Signal DSL).',
    'This is the language for building and backtesting bots inside Kairos. It is NOT MetaTrader MQL5.',
    'Workflow: user describes a strategy → you write Bot Rules → they Check + Run backtest in Kairos.',
    'Never generate full MetaTrader MQL5 unless the user explicitly asks for MetaTrader export only — and then warn it cannot compile or run in Kairos yet.',
    '',
    'FORBIDDEN in every code fence (these break the Kairos compiler):',
    '- Preprocessor: #include, #property, #define, #ifdef, or any line starting with #',
    '- Classes / objects: CTrade, CPositionInfo, class, new, delete',
    '- MT5 trade APIs: OrderSend, PositionSelect, PositionGet*, trade.Buy, trade.Sell, SetDeviationInPoints, SetTypeFilling',
    '- MT5 indicators/APIs: iMA, iATR, iRSI, CopyBuffer, SymbolInfo*, AccountInfo*, TimeCurrent',
    '- Includes, arrays (except built-in series), loops (for/while), structs, enums, templates',
    '- OnCalculate, indicator buffers, plot directives',
    '',
    'REQUIRED shape:',
    '- Entry point: void OnTick() (required). Optional: void OnInit(). No parameters. Use return; with no value.',
    '- Inputs: input int/double/bool Name = literal;',
    '- Locals/globals: int/double/bool only; assignments; if/else; return; // comments',
    '- Operators: + - * / < <= > >= == != && || ! and parentheses. No ++ -- += -=.',
    '- Series: open[n], high[n], low[n], close[n], time[n] (0 = current closed bar; larger = older). time is Unix ms.',
    '- Built-ins ONLY:',
    ...Object.values(EA_BUILTINS).map(
      (builtin) => `  - ${builtin.signature}${builtin.inTickOnly ? '; only inside OnTick' : ''}`
    ),
    '',
    'Signals: Buy("reason?") / Sell("reason?") emit entries. SL/TP, lots, and costs come from Kairos backtest settings — do not code them.',
    'Put strategy logic in OnTick. Use OnInit only for simple variable init.',
    'Evaluate crossesAbove/crossesBelow before if-branches so crossover state stays consistent.',
    'If the user pastes full MQL5, rewrite it into Kairos Bot Rules (drop # lines and CTrade; map ideas to SMA/EMA/crosses/Buy/Sell). Explain briefly what was dropped.',
    'If a feature cannot be expressed in Bot Rules, say so and offer the closest supported approach — do not invent fake MT5 APIs.',
    '',
    'CODE FENCES: Output bot code in a ```kairos fence. Body must be Bot Rules with zero # / CTrade / OrderSend.',
    'Example of valid Kairos Bot Rules:',
    '```kairos',
    EA_LOCAL_EXAMPLE,
    '```'
  ].join('\n')
}
