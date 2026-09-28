# EA Signal DSL Compile + Backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Quantify Signal DSL compile (parse → check → `Strategy`) and Run backtest from EA Lab into the existing workspace tester.

**Architecture:** Hand-rolled lexer/parser/checker/interpreter under `src/core/ea/` produces an `EaSignalStrategy` that implements the existing `Strategy` interface. EA Lab Compile/Run call `compileEaScript`; Run hands the strategy to a new `openEaBacktest` action on `useAppStore` (same module-level `strategy` binding as catalog strategies). No SQLite schema changes; no MT5.

**Tech Stack:** TypeScript, Vitest, Zustand, Monaco (`@monaco-editor/react`), existing replay/`onCandle` path in `useAppStore`.

**Spec:** `docs/superpowers/specs/2026-09-15-ea-signal-dsl-backtest-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| Create `src/core/ea/types.ts` | `Diagnostic`, `EaInputParam`, `CompileResult` |
| Create `src/core/ea/ast.ts` | AST node types + source spans |
| Create `src/core/ea/lex.ts` | Tokenizer |
| Create `src/core/ea/parse.ts` | Recursive-descent parser → `Program` AST or diagnostics |
| Create `src/core/ea/check.ts` | Semantic check (OnTick required, builtins, types light) |
| Create `src/core/ea/runtime.ts` | Execute OnInit/OnTick; SMA/EMA/series/cross/Buy/Sell |
| Create `src/core/ea/strategyAdapter.ts` | `EaSignalStrategy` implements `Strategy` |
| Create `src/core/ea/compile.ts` | `compileEaScript(code)` public API |
| Modify `src/core/indicators/math.ts` | Add `ema` (missing today; SMA already exists) |
| Modify `src/renderer/src/store/useEaLabStore.ts` | diagnostics / compileStatus / compileActive / runBacktest |
| Modify `src/renderer/src/components/EaLab.tsx` | Compile + Run buttons, Problems panel, markers, shortcut (EA only) |
| Modify `src/renderer/src/store/useAppStore.ts` | `activeEaScriptId`, `openEaBacktest`, clear on `openStrategy` |
| Modify `src/renderer/src/components/TopBar.tsx` | Subtitle when EA backtest active |
| Modify `src/renderer/src/styles/global.css` | Problems panel + toolbar button styles |
| Create `tests/eaParse.test.ts` | Parser/checker tests |
| Create `tests/eaCompile.test.ts` | Compile + `onCandle` golden (SMA cross) |
| Modify `tests/useEaLabStore.test.ts` | compile status reset on draft change |

---

### Task 1: EA shared types + AST

**Files:**
- Create: `src/core/ea/types.ts`
- Create: `src/core/ea/ast.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
import type { Strategy } from '@shared/types'

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
  length?: number
}

export interface EaInputParam {
  name: string
  type: 'int' | 'double' | 'bool'
  defaultValue: number | boolean
}

export type CompileResult =
  | { ok: true; strategy: Strategy; inputs: EaInputParam[]; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }
```

- [ ] **Step 2: Write `ast.ts`**

```ts
export interface Span {
  line: number
  column: number
  length: number
}

export type EaType = 'int' | 'double' | 'bool' | 'void' | 'string'

export interface Program {
  inputs: InputDecl[]
  globals: VarDecl[]
  onInit: FunctionDecl | null
  onTick: FunctionDecl | null
}

export interface InputDecl {
  kind: 'input'
  name: string
  type: 'int' | 'double' | 'bool'
  defaultValue: number | boolean
  span: Span
}

export interface VarDecl {
  kind: 'var'
  name: string
  type: 'int' | 'double' | 'bool'
  init: Expr | null
  span: Span
}

export interface FunctionDecl {
  name: 'OnInit' | 'OnTick'
  body: Stmt[]
  span: Span
}

export type Stmt =
  | { kind: 'var'; name: string; type: 'int' | 'double' | 'bool'; init: Expr | null; span: Span }
  | { kind: 'assign'; name: string; value: Expr; span: Span }
  | { kind: 'if'; test: Expr; consequent: Stmt[]; alternate: Stmt[] | null; span: Span }
  | { kind: 'return'; span: Span }
  | { kind: 'expr'; expr: Expr; span: Span }

export type Expr =
  | { kind: 'number'; value: number; span: Span }
  | { kind: 'bool'; value: boolean; span: Span }
  | { kind: 'string'; value: string; span: Span }
  | { kind: 'ident'; name: string; span: Span }
  | { kind: 'series'; series: 'open' | 'high' | 'low' | 'close' | 'time'; index: Expr; span: Span }
  | { kind: 'call'; callee: string; args: Expr[]; span: Span; callSiteId: number }
  | { kind: 'unary'; op: '-' | '!'; arg: Expr; span: Span }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; span: Span }

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||'
```

Assign `callSiteId` monotonically during parse (for stateful `crossesAbove`/`crossesBelow`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`  
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/core/ea/types.ts src/core/ea/ast.ts
git commit -m "Add EA Signal DSL types and AST"
```

---

### Task 2: Lexer + parser (TDD)

**Files:**
- Create: `src/core/ea/lex.ts`
- Create: `src/core/ea/parse.ts`
- Create: `tests/eaParse.test.ts`

- [ ] **Step 1: Write failing parser tests**

```ts
import { describe, expect, it } from 'vitest'
import { parseEaScript } from '@core/ea/parse'

const SAMPLE = `input int Fast = 9;
input int Slow = 21;

void OnInit()
{
}

void OnTick()
{
  double f = SMA(Fast, 0);
  double s = SMA(Slow, 0);
  if (crossesAbove(f, s))
    Buy("SMA cross up");
  if (crossesBelow(f, s))
    Sell("SMA cross down");
}
`

describe('parseEaScript', () => {
  it('parses the SMA-cross sample', () => {
    const result = parseEaScript(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.program.inputs).toHaveLength(2)
    expect(result.program.onTick).not.toBeNull()
    expect(result.program.onInit).not.toBeNull()
  })

  it('reports a syntax error with line/column', () => {
    const result = parseEaScript('void OnTick() { double x = ; }')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics[0].line).toBeGreaterThanOrEqual(1)
    expect(result.diagnostics[0].message.length).toBeGreaterThan(0)
  })

  it('rejects unknown top-level junk', () => {
    const result = parseEaScript('class Foo {}')
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/eaParse.test.ts`  
Expected: FAIL (module not found / `parseEaScript` missing).

- [ ] **Step 3: Implement `lex.ts`**

Token kinds needed: identifiers, numbers, strings, keywords (`void`, `int`, `double`, `bool`, `input`, `if`, `else`, `return`, `true`, `false`), punctuation (`( ) { } [ ] , ; =`), operators (`+ - * / < <= > >= == != && || !`).

Track 1-based `line`/`column` on every token. Skip `//` line comments and `/* */` block comments. Skip whitespace.

Export:

```ts
export type TokenKind =
  | 'ident'
  | 'number'
  | 'string'
  | 'keyword'
  | 'punct'
  | 'op'
  | 'eof'

export interface Token {
  kind: TokenKind
  value: string
  line: number
  column: number
  length: number
}

export function lex(source: string): Token[]
```

- [ ] **Step 4: Implement `parse.ts`**

```ts
import type { Program } from './ast'
import type { Diagnostic } from './types'
import { lex } from './lex'

export type ParseResult =
  | { ok: true; program: Program }
  | { ok: false; diagnostics: Diagnostic[] }

export function parseEaScript(source: string): ParseResult
```

Recursive descent covering:

- Top level: `input` decls, global `int|double|bool` decls, `void OnInit() { ... }`, `void OnTick() { ... }`
- Statements: local var decl, assign, `if`/`else`, `return`, expression stmt (calls)
- Expressions: precedence `||` < `&&` < comparisons < `+ -` < `* /` < unary < primary
- Primary: number, bool, string, ident, `ident[expr]` only when ident is `open|high|low|close|time`, call `ident(args)`
- Single-statement `if` bodies without braces allowed (like C)
- On parse error: push one diagnostic and return `{ ok: false }` (stop at first error is fine for v1)

Increment a `nextCallSiteId` counter for every `call` node.

Reject keywords/forms outside the allow-list with a clear message (e.g. `for`, `while`, `class`, `OrderSend` as unknown if they appear as calls — checker can also catch unknown calls).

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test -- tests/eaParse.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/ea/lex.ts src/core/ea/parse.ts tests/eaParse.test.ts
git commit -m "Add EA Signal DSL lexer and parser"
```

---

### Task 3: Semantic checker (TDD)

**Files:**
- Create: `src/core/ea/check.ts`
- Modify: `tests/eaParse.test.ts` (add check cases) or Create: `tests/eaCheck.test.ts`

- [ ] **Step 1: Write failing check tests**

```ts
import { describe, expect, it } from 'vitest'
import { parseEaScript } from '@core/ea/parse'
import { checkProgram } from '@core/ea/check'

describe('checkProgram', () => {
  it('requires OnTick', () => {
    const parsed = parseEaScript('void OnInit() {}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /OnTick/i.test(d.message))).toBe(true)
  })

  it('rejects unknown identifiers', () => {
    const parsed = parseEaScript('void OnTick() { Buy(foo); }')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /foo/i.test(d.message))).toBe(true)
  })

  it('rejects Buy outside OnTick', () => {
    const parsed = parseEaScript('void OnInit() { Buy(); }\nvoid OnTick() {}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /Buy/i.test(d.message))).toBe(true)
  })

  it('accepts the SMA-cross sample', () => {
    const code = `input int Fast = 9;
input int Slow = 21;
void OnTick() {
  double f = SMA(Fast, 0);
  double s = SMA(Slow, 0);
  if (crossesAbove(f, s)) Buy("up");
  if (crossesBelow(f, s)) Sell("down");
}`
    const parsed = parseEaScript(code)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(checkProgram(parsed.program)).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/eaCheck.test.ts`  
Expected: FAIL (missing module).

- [ ] **Step 3: Implement `check.ts`**

```ts
import type { Program, Stmt, Expr } from './ast'
import type { Diagnostic } from './types'

const BUILTINS: Record<string, { minArgs: number; maxArgs: number; inTickOnly?: boolean }> = {
  SMA: { minArgs: 1, maxArgs: 2 },
  EMA: { minArgs: 1, maxArgs: 2 },
  crossesAbove: { minArgs: 2, maxArgs: 2 },
  crossesBelow: { minArgs: 2, maxArgs: 2 },
  Buy: { minArgs: 0, maxArgs: 1, inTickOnly: true },
  Sell: { minArgs: 0, maxArgs: 1, inTickOnly: true }
}

export function checkProgram(program: Program): Diagnostic[]
```

Rules:

1. If `program.onTick === null` → error “Missing OnTick()”.
2. Scope: inputs + globals always visible; locals per function/block; `OnInit`/`OnTick` params none.
3. Assignments only to known vars.
4. Calls must be in `BUILTINS` with arity in range.
5. `Buy`/`Sell` only while walking `onTick` body (`inTickOnly`).
6. Series names only `open|high|low|close|time`.

Return all diagnostics found (collect, don’t stop at first) when cheap; stopping at first is OK if simpler — tests only require at least the relevant error.

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tests/eaCheck.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ea/check.ts tests/eaCheck.test.ts
git commit -m "Add EA Signal DSL semantic checker"
```

---

### Task 4: `ema` helper + runtime interpreter (TDD)

**Files:**
- Modify: `src/core/indicators/math.ts`
- Create: `src/core/ea/runtime.ts`
- Create: `tests/eaCompile.test.ts` (partial — runtime via compile in Task 5; here test runtime helpers if exported, or wait and put golden in Task 5)

Prefer putting golden `onCandle` tests in Task 5 after adapter exists. This task implements runtime + ema.

- [ ] **Step 1: Add `ema` to `math.ts`**

After `sma`:

```ts
export function ema(bars: Candle[], period: number): number | null {
  if (period < 1 || bars.length < period) return null
  const k = 2 / (period + 1)
  let value = bars.slice(0, period).reduce((sum, bar) => sum + bar.close, 0) / period
  for (let i = period; i < bars.length; i++) {
    value = bars[i].close * k + value * (1 - k)
  }
  return value
}
```

Support shift in runtime by slicing candles: `bars.slice(0, bars.length - shift)` before calling `sma`/`ema`.

- [ ] **Step 2: Implement `runtime.ts`**

```ts
import { ema, sma } from '@core/indicators/math'
import type { Candle, StrategySignal } from '@shared/types'
import type { Program, Expr, Stmt } from './ast'
import type { EaInputParam } from './types'

export interface EaRuntimeState {
  program: Program
  inputs: EaInputParam[]
  globals: Map<string, number | boolean>
  crossPrev: Map<number, { a: number; b: number }>
  strategyName: string
}

export function createRuntime(program: Program, strategyName: string): EaRuntimeState
export function runOnInit(state: EaRuntimeState): void
export function runOnTick(
  state: EaRuntimeState,
  candles: Candle[],
  candle: Candle
): StrategySignal | null
```

Semantics:

- `createRuntime`: init `globals` from input defaults + global decls (0/false if no init); empty `crossPrev`.
- `runOnInit`: reset `crossPrev`; re-init globals from defaults; execute `onInit` body if present.
- `runOnTick`:
  - Env = globals + locals map for the function.
  - Evaluate statements.
  - `Buy`/`Sell`: if no signal yet this tick, set pending `StrategySignal` (`LONG`/`SHORT`, price=`candle.close`, reason=arg or default, strategy=`strategyName`). Second call ignored.
  - `SMA(period, shift=0)` / `EMA(...)`: if null (warmup), treat as soft failure — abort tick with `null` signal (do not throw). Easiest: throw a private `WarmupError` caught at start of `runOnTick` → return null.
  - `crossesAbove`/`crossesBelow`: use `expr.callSiteId`; read/write `crossPrev`; first visit returns false and stores pair.
  - Series: `close[i]` → `candles[candles.length - 1 - i]` field (i=0 current). Out of range → warmup/null path.
  - Numbers are JS numbers; bools are boolean; no string ops except Buy/Sell reason.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`  
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/core/indicators/math.ts src/core/ea/runtime.ts
git commit -m "Add EA Signal DSL runtime and EMA helper"
```

---

### Task 5: Strategy adapter + `compileEaScript` (TDD)

**Files:**
- Create: `src/core/ea/strategyAdapter.ts`
- Create: `src/core/ea/compile.ts`
- Create: `tests/eaCompile.test.ts`

- [ ] **Step 1: Write failing compile / onCandle tests**

```ts
import { describe, expect, it } from 'vitest'
import { compileEaScript } from '@core/ea/compile'
import type { Candle } from '@shared/types'

function candle(i: number, close: number): Candle {
  return {
    timestamp: i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1
  }
}

const SAMPLE = `input int Fast = 2;
input int Slow = 4;
void OnTick() {
  double f = SMA(Fast, 0);
  double s = SMA(Slow, 0);
  if (crossesAbove(f, s)) Buy("up");
  if (crossesBelow(f, s)) Sell("down");
}`

describe('compileEaScript', () => {
  it('returns diagnostics for bad code', () => {
    const result = compileEaScript('void OnInit() {}')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('emits LONG after fast crosses above slow', () => {
    const result = compileEaScript(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const strategy = result.strategy
    strategy.initialize()
    // Build a series where slow > fast, then fast rises through slow.
    const closes = [1, 1, 1, 1, 2, 3, 4, 5]
    let signal = null
    for (let i = 0; i < closes.length; i++) {
      const tape = closes.slice(0, i + 1).map((c, idx) => candle(idx, c))
      signal = strategy.onCandle(tape[tape.length - 1], {
        candles: tape,
        symbol: 'XAUUSD',
        timeframe: '1M'
      })
      if (signal) break
    }
    expect(signal).not.toBeNull()
    expect(signal?.type).toBe('LONG')
  })
})
```

Adjust the close series if needed so a cross actually occurs given SMA(2)/SMA(4); keep the test intent: after warmup, a clear cross produces `LONG`.

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/eaCompile.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement adapter + compile**

`strategyAdapter.ts`:

```ts
import type { Candle, Strategy, StrategyContext, StrategySignal } from '@shared/types'
import type { Program } from './ast'
import type { EaInputParam } from './types'
import { createRuntime, runOnInit, runOnTick, type EaRuntimeState } from './runtime'

export class EaSignalStrategy implements Strategy {
  readonly id: string
  readonly name: string
  readonly description = 'Quantify Signal DSL (bar-close)'
  private state: EaRuntimeState

  constructor(program: Program, opts: { id: string; name: string; inputs: EaInputParam[] }) {
    this.id = opts.id
    this.name = opts.name
    this.state = createRuntime(program, opts.name)
    // ensure inputs on state match opts.inputs defaults
  }

  initialize(): void {
    runOnInit(this.state)
  }

  onCandle(candle: Candle, context: StrategyContext): StrategySignal | null {
    try {
      return runOnTick(this.state, context.candles, candle)
    } catch {
      return null
    }
  }
}
```

`compile.ts`:

```ts
import { parseEaScript } from './parse'
import { checkProgram } from './check'
import { EaSignalStrategy } from './strategyAdapter'
import type { CompileResult, EaInputParam } from './types'

export function compileEaScript(
  code: string,
  opts?: { id?: string; name?: string }
): CompileResult {
  const parsed = parseEaScript(code)
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics }
  const diagnostics = checkProgram(parsed.program)
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, diagnostics }
  }
  const inputs: EaInputParam[] = parsed.program.inputs.map((i) => ({
    name: i.name,
    type: i.type,
    defaultValue: i.defaultValue
  }))
  const strategy = new EaSignalStrategy(parsed.program, {
    id: opts?.id ?? 'ea-signal',
    name: opts?.name ?? 'EA',
    inputs
  })
  return {
    ok: true,
    strategy,
    inputs,
    warnings: diagnostics.filter((d) => d.severity === 'warning')
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tests/eaCompile.test.ts`  
Expected: PASS. Tweak candle series if the cross assertion is flaky.

- [ ] **Step 5: Commit**

```bash
git add src/core/ea/strategyAdapter.ts src/core/ea/compile.ts tests/eaCompile.test.ts
git commit -m "Add EA compile API and Strategy adapter"
```

---

### Task 6: Lab store — compile state + actions

**Files:**
- Modify: `src/renderer/src/store/useEaLabStore.ts`
- Modify: `tests/useEaLabStore.test.ts`

- [ ] **Step 1: Extend store interface**

Add to `EaLabState`:

```ts
import type { Diagnostic } from '@core/ea/types'
import { compileEaScript } from '@core/ea/compile'
import { useAppStore } from './useAppStore'

// fields:
diagnostics: Diagnostic[]
compileStatus: 'idle' | 'ok' | 'error'
lastCompiledAt: number | null
compileActive: () => boolean  // returns ok
runBacktest: () => Promise<boolean>
```

Initial: `diagnostics: []`, `compileStatus: 'idle'`, `lastCompiledAt: null`.

In `updateDraftCode`:

```ts
updateDraftCode: (code) => {
  set({
    draftCode: code,
    dirty: true,
    compileStatus: 'idle',
    diagnostics: [],
    lastCompiledAt: null
  })
},
```

Also reset compile fields in `selectScript` / `setKind` when switching.

`compileActive`:

```ts
compileActive: () => {
  const { kind, draftCode, activeScriptId, scripts } = get()
  if (kind !== 'ea' || !activeScriptId) {
    set({ compileStatus: 'idle', diagnostics: [] })
    return false
  }
  const name = scripts.find((s) => s.id === activeScriptId)?.name ?? 'EA'
  const result = compileEaScript(draftCode, { id: activeScriptId, name })
  if (!result.ok) {
    set({
      compileStatus: 'error',
      diagnostics: result.diagnostics,
      lastCompiledAt: Date.now()
    })
    return false
  }
  set({
    compileStatus: 'ok',
    diagnostics: result.warnings,
    lastCompiledAt: Date.now()
  })
  return true
},
```

`runBacktest`:

```ts
runBacktest: async () => {
  const { kind, dirty, activeScriptId, draftCode, scripts } = get()
  if (kind !== 'ea' || !activeScriptId) return false
  if (dirty) await get().saveActiveScript({ quiet: true })
  const name = scripts.find((s) => s.id === activeScriptId)?.name ?? 'EA'
  const result = compileEaScript(draftCode, { id: activeScriptId, name })
  if (!result.ok) {
    set({
      compileStatus: 'error',
      diagnostics: result.diagnostics,
      lastCompiledAt: Date.now()
    })
    notifyError('Compile failed')
    return false
  }
  set({
    compileStatus: 'ok',
    diagnostics: result.warnings,
    lastCompiledAt: Date.now()
  })
  await useAppStore.getState().openEaBacktest({
    scriptId: activeScriptId,
    scriptName: name,
    strategy: result.strategy
  })
  return true
},
```

- [ ] **Step 2: Add store test**

```ts
it('resets compileStatus when draft changes', () => {
  useEaLabStore.setState({
    kind: 'ea',
    activeScriptId: 'a',
    draftCode: 'void OnTick() {}',
    compileStatus: 'ok',
    diagnostics: [{ severity: 'warning', message: 'x', line: 1, column: 1 }],
    dirty: false
  })
  useEaLabStore.getState().updateDraftCode('void OnTick() { Buy(); }')
  expect(useEaLabStore.getState().compileStatus).toBe('idle')
  expect(useEaLabStore.getState().diagnostics).toEqual([])
})
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/useEaLabStore.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/useEaLabStore.ts tests/useEaLabStore.test.ts
git commit -m "Wire EA Lab store compile and run-backtest actions"
```

---

### Task 7: `openEaBacktest` + TopBar

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`
- Modify: `src/renderer/src/components/TopBar.tsx`

- [ ] **Step 1: Add state + action**

Near `activeStrategyId`, add `activeEaScriptId: string | null` (initial `null`).

Add to interface:

```ts
activeEaScriptId: string | null
openEaBacktest: (input: {
  scriptId: string
  scriptName: string
  strategy: Strategy
}) => Promise<void>
```

Import `Strategy` from `@shared/types` if not already.

Implementation (mirror the non-resume branch of `openStrategy`):

```ts
openEaBacktest: async ({ scriptId, scriptName, strategy: eaStrategy }) => {
  clearTimer()
  strategy = eaStrategy
  strategy.initialize()
  const settings = { ...get().settings, autoEntry: true }
  set({
    screen: 'workspace',
    activeStrategyId: null,
    activeEaScriptId: scriptId,
    settings,
    sessionName: `${scriptName} · EA`,
    sessionId: newId(),
    rightTab: 'strategy',
    mode: 'view',
    isPlaying: false,
    pendingSetup: null,
    draft: null,
    activeTrade: null,
    trades: [],
    skipped: [],
    selectedTradeId: null,
    chartFull: false,
    status: `${scriptName} · EA ready to backtest`
  })
  if (get().displayCandles.length === 0) await get().selectSymbol(DEFAULT_SYMBOL)
  persistDesk()
},
```

In `openStrategy`, at the start of successful open paths (both resume and fresh), set `activeEaScriptId: null` in the `set({...})` payloads.

Note: `autosaveProgress` gates on `activeStrategyId` — EA runs won’t autosave sessions (matches spec deferral). Do not change that gate in v1.

- [ ] **Step 2: Update TopBar subtitle**

```ts
const activeEaScriptId = useAppStore((s) => s.activeEaScriptId)
const sessionName = useAppStore((s) => s.sessionName)
const activeName = strategies.find((s) => s.id === activeStrategyId)?.name
const subtitle = activeEaScriptId
  ? `${sessionName.replace(/ · EA$/, '')} · EA · tester`
  : activeName
    ? `${activeName} · tester`
    : 'Strategy tester'
```

Use `subtitle` in `<BrandMark subtitle={subtitle} />`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`  
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts src/renderer/src/components/TopBar.tsx
git commit -m "Open workspace backtest from compiled EA script"
```

---

### Task 8: EA Lab UI — Compile, Run, Problems panel

**Files:**
- Modify: `src/renderer/src/components/EaLab.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Wire toolbar actions (EA kind only)**

In `EaLab`, subscribe:

```ts
const diagnostics = useEaLabStore((s) => s.diagnostics)
const compileStatus = useEaLabStore((s) => s.compileStatus)
const compileActive = useEaLabStore((s) => s.compileActive)
const runBacktest = useEaLabStore((s) => s.runBacktest)
```

In `.ea-lab-editor-actions`, when `kind === 'ea' && activeScriptId`:

```tsx
<button
  type="button"
  className="icon-btn"
  title="Compile"
  aria-label="Compile"
  disabled={sending}
  onClick={() => {
    const ok = compileActive()
    // status chip handled via compileStatus
    void ok
  }}
>
  <Icon name="check" />
</button>
<button
  type="button"
  className="primary icon-label"
  title="Run backtest"
  disabled={sending}
  onClick={() => void runBacktest()}
>
  <Icon name="play" />
  Run backtest
</button>
```

Status bar: show `Compiled · ready to backtest` when `compileStatus === 'ok'`, or `N errors` when `error`.

- [ ] **Step 2: Problems panel**

Below `.ea-lab-editor-body` (above status), when `kind === 'ea' && diagnostics.length > 0`:

```tsx
<div className="ea-lab-problems" role="list">
  {diagnostics.map((d, i) => (
    <button
      key={`${d.line}:${d.column}:${i}`}
      type="button"
      className="ea-lab-problem"
      data-severity={d.severity}
      role="listitem"
      onClick={() => {
        const ed = editorRef.current
        if (!ed) return
        ed.setPosition({ lineNumber: d.line, column: d.column })
        ed.revealLineInCenter(d.line)
        ed.focus()
      }}
    >
      <strong>
        Ln {d.line}:{d.column}
      </strong>
      <span>{d.message}</span>
    </button>
  ))}
</div>
```

- [ ] **Step 3: Monaco markers + Run shortcut**

In `onMount`, after Ctrl+S command, add:

```ts
instance.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter, () => {
  if (useEaLabStore.getState().kind !== 'ea') return
  if (useEaChatStore.getState().sending) return
  void useEaLabStore.getState().runBacktest()
})
```

`useEffect` when `diagnostics` / editor model change:

```ts
useEffect(() => {
  const ed = editorRef.current
  const model = ed?.getModel()
  if (!model || !editorRef.current) return
  const monacoApi = (window as unknown as { monaco?: typeof import('monaco-editor') }).monaco
  // Prefer getting monaco from onMount ref instead:
}, [diagnostics])
```

Store `monacoRef` from `onMount` second arg. Then:

```ts
monacoRef.current?.editor.setModelMarkers(
  model,
  'ea-dsl',
  diagnostics.map((d) => ({
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: d.line,
    endColumn: d.column + (d.length ?? 1),
    message: d.message,
    severity:
      d.severity === 'error'
        ? monacoRef.current!.MarkerSeverity.Error
        : monacoRef.current!.MarkerSeverity.Warning
  }))
)
```

Clear markers when diagnostics empty.

- [ ] **Step 4: CSS**

```css
.ea-lab-problems {
  border-top: 1px solid var(--rule);
  max-height: 140px;
  overflow: auto;
  background: var(--vault);
}

.ea-lab-problem {
  display: flex;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  border: 0;
  background: transparent;
  color: var(--parchment);
  font: inherit;
  cursor: pointer;
}

.ea-lab-problem:hover {
  background: var(--steel);
}

.ea-lab-problem[data-severity='error'] strong {
  color: var(--bear);
}

.ea-lab-problem[data-severity='warning'] strong {
  color: var(--warn);
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`  
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/EaLab.tsx src/renderer/src/styles/global.css
git commit -m "Add EA Lab Compile, Run backtest, and Problems panel"
```

---

### Task 9: Manual verification checklist + final test sweep

**Files:** none required unless fixes.

- [ ] **Step 1: Run full unit suite**

Run: `npm test`  
Expected: all PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: passes.

- [ ] **Step 3: Manual smoke (dev app)**

1. Open EA Lab → create/open script with the SMA-cross sample from the spec.
2. Compile → success chip; break syntax → Problems + markers; click problem → cursor jumps.
3. Run backtest → workspace opens; TopBar shows EA cue; play/step with auto-entry produces trades after warmup/cross.
4. Edit script in Lab → compileStatus idle; Indicator Lab has no Compile/Run.

- [ ] **Step 4: Commit any fixes** (if needed)

```bash
git add -A
git commit -m "Fix EA Signal DSL edge cases from smoke test"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Language surface (inputs, OnInit/OnTick, series, SMA/EMA, cross, Buy/Sell) | 2–4 |
| crossesAbove stateful per callSiteId | 4 |
| compile pipeline modules | 1–5 |
| CompileResult / diagnostics | 1, 5, 6 |
| No SQLite change | — (none) |
| useEaLabStore compile fields | 6 |
| Compile + Run UX, Problems, Cmd+Enter | 8 |
| openEaBacktest, autoEntry true, activeEaScriptId | 7 |
| TopBar EA subtitle | 7 |
| Indicator Lab excluded | 6–8 (`kind !== 'ea'`) |
| Unit tests parse/check/compile | 2, 3, 5 |
| Session save deferred for EA | 7 (autosave still gated on activeStrategyId) |

## Placeholder / consistency notes

- Types `Diagnostic` / `EaInputParam` / `CompileResult` live in `src/core/ea/types.ts` (not `src/shared`) — renderer imports via `@core/ea/types`.
- `callSiteId` assigned at parse time; runtime keys `crossPrev` by that id.
- `ema` added to `math.ts` because it did not exist before this plan.
