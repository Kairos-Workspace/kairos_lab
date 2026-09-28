# EA Lab — Signal DSL Compile + Backtest (Sub-projects B + C)

## Context

Sub-project A shipped the EA Lab editor and SQLite storage for named scripts
(`docs/superpowers/specs/2026-09-13-ea-lab-editor-storage-design.md`). Real
MQL5 only compiles inside MetaTrader 5 (no public/embeddable compiler), so
this app cannot ship true `.mq5 → .ex5` compilation.

This spec covers **B + C together** as one shippable slice:

- **B:** a small **Quantify Signal DSL** (MQL5-*inspired* look) with parse →
  check → `Strategy` adapter (“compile”).
- **C:** wire that `Strategy` into the existing workspace replay / trade
  simulation path (“backtest”).

Approach chosen in brainstorming: **Signal DSL (thinnest)** — scripts emit
long/short signals; they do not model `OrderSend` / multi-position broker
state. Trade entry, SL/TP, costs, and exits stay in the existing engine
(`Strategy.onCandle` → auto-entry → `evaluateTradeOnCandle`), same as
built-in strategies like MA crossover.

Deferred alternatives (not this spec): full Order API interpreter; transpile
to JS + sandbox; shell-out / export to real MT5.

## Goals

- Users can **Compile** an EA script in EA Lab and see line-accurate
  diagnostics (or a clear success state).
- Users can **Run backtest** to open the existing workspace with the compiled
  script as the active `Strategy`, then play/step the tape and take trades
  via the same auto-entry path as catalog strategies.
- Core pipeline lives under `src/core/ea/` and is unit-testable without
  Electron.
- Indicator Lab scripts (`kind: 'indicator'`) are out of this compile/run
  path.

## Non-goals

- Real MQL5 / MetaEditor / `.ex5` / MT5 Strategy Tester integration.
- `OrderSend`, positions, trailing stops, multi-order EA semantics.
- Tick-level execution — **bar-close only**, matching today’s strategies.
- Language server / IntelliSense (Monarch highlighting stays as-is).
- Persisting compiled bytecode or a new SQLite table for compile artifacts.
- Cloning EAs into Strategy Library cards.
- Workspace UI for editing `input` parameters (defaults only in v1).
- Compiling or running Indicator Lab scripts.
- Guaranteeing Save Session works for EA-backed runs if that needs awkward
  FK / `strategyId` changes — defer; catalog strategies keep current save
  behavior.

## Design

### 1. Language surface (v1)

MQL5-*looking* subset that only decides when to go long/short.

**Allowed**

| Area | Support |
|------|---------|
| Lifecycle | `OnInit()` optional; `OnTick()` required (runs once per bar close) |
| Types | `int`, `double`, `bool` locals and top-level vars |
| Control | `if` / `else`, `return` |
| Bar series | `close[i]`, `open[i]`, `high[i]`, `low[i]`, `time[i]` — `i=0` current bar |
| Indicators | `SMA(period, shift?)`, `EMA(period, shift?)` on close |
| Helpers | `crossesAbove(a, b)`, `crossesBelow(a, b)` — see semantics below |
| Actions | `Buy("reason?")`, `Sell("reason?")` — at most one signal per bar |
| Inputs | `input double Fast = 9;` (parsed into `EaInputParam`; UI edit later) |

**`crossesAbove` / `crossesBelow` semantics (explicit):** each call site is
stateful across bars. On bar *n*, the runtime remembers the `(a, b)` values
from the previous successful evaluation of that same call site.  
`crossesAbove(a, b)` is true iff previous `a <= b` and current `a > b`.  
`crossesBelow(a, b)` is true iff previous `a >= b` and current `a < b`.  
First bar after `OnInit` / `initialize()` never crosses (no previous pair).

**Out of v1:** `for` / `while` / `switch` / arrays / structs / classes;
`OrderSend` and position APIs; indicators beyond SMA/EMA; real MT5
`#property` / includes / session APIs.

**Example**

```c
input int Fast = 9;
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
```

**Compile-time rules:** missing `OnTick`, unknown identifiers, wrong arity,
`Buy`/`Sell` outside `OnTick` → errors with line/column.

**Runtime rules:** indicator warmup → no signal (`null`); second action on
the same bar → first wins, second ignored (no warning UI in v1).

### 2. Compile pipeline

“Compile” means parse → check → produce a `Strategy`, not emit `.ex5`.

```
script.code
  → Lexer/Parser → AST
  → Semantic check → Diagnostic[]
  → Bind builtins
  → EaSignalStrategy implements Strategy
       initialize() → OnInit once, reset locals
       onCandle()   → OnTick vs StrategyContext → StrategySignal | null
```

**Module layout**

| Piece | Path |
|-------|------|
| AST types | `src/core/ea/ast.ts` |
| Parser | `src/core/ea/parse.ts` |
| Checker | `src/core/ea/check.ts` |
| Runtime / builtins | `src/core/ea/runtime.ts` |
| Strategy adapter | `src/core/ea/strategyAdapter.ts` |
| Public API | `src/core/ea/compile.ts` → `compileEaScript(code): CompileResult` |

No main-process / IPC compile for v1 — shared `src/core` path for renderer
and tests.

**Types**

```ts
interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number   // 1-based
  column: number // 1-based
  length?: number
}

interface EaInputParam {
  name: string
  type: 'int' | 'double' | 'bool'
  defaultValue: number | boolean
}

type CompileResult =
  | { ok: true; strategy: Strategy; inputs: EaInputParam[]; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }
```

Interpreter walks the AST (no `eval`). Interpreter bugs caught in the
adapter: return `null` signal and surface a diagnostic so the tester does
not crash.

### 3. Backtest UX

Reuse the existing workspace tester — no separate EA results screen.

**Compile** (EA Lab toolbar): validate only; stay in EA Lab; Problems panel
lists diagnostics; click jumps Monaco to line; success → status
“Compiled · ready to backtest”.

**Run backtest** (toolbar + Cmd/Ctrl+Enter):

1. If dirty → save first.
2. `compileEaScript(code)`.
3. On failure → Problems panel; stay in EA Lab.
4. On success → `openEaBacktest({ scriptId, scriptName, strategy })` on
   `useAppStore`:
   - `screen: 'workspace'`
   - set module-level `strategy` to the compiled `EaSignalStrategy`
     (bypass `createStrategy` / `STRATEGY_CATALOG`)
   - `strategy.initialize()`
   - `activeStrategyId: null` (not a Strategy Library row); track
     `activeEaScriptId: scriptId` (new nullable field) for TopBar / status
   - session name from script (e.g. `MyCross · EA`)
   - symbol / timeframe / costs from current desk prefs
   - **force `settings.autoEntry = true`** for this run so signals become
     trades without a separate toggle; leave other settings as-is
   - status: `{name} · EA ready to backtest`
   - TopBar subtitle includes `EA · {scriptName}` when `activeEaScriptId`
     is set

EA script row remains source of truth — no `SavedStrategy` clone. Re-run
recompiles from script code. Edits in EA Lab while workspace holds an old
compiled instance do not hot-reload until Run again. Opening a catalog
strategy clears `activeEaScriptId`.

**Indicator Lab:** no Compile / Run for `kind === 'indicator'`.

### 4. Data model & errors

**SQLite:** no schema change. `ea_scripts.code` is the only persisted
artifact. `language` stays `'mql5'` for highlighter continuity.

**Ephemeral UI / app state (not SQLite):**

`useEaLabStore`:

```ts
diagnostics: Diagnostic[]
compileStatus: 'idle' | 'ok' | 'error'
lastCompiledAt: number | null
```

Invalidate / reset `compileStatus` when `draftCode` changes.

`useAppStore`: `activeEaScriptId: string | null` — set by `openEaBacktest`,
cleared when opening a catalog strategy or leaving workspace for Home if
desired (clearing on `openStrategy` is enough for v1).

**Error taxonomy**

| Kind | Behavior |
|------|----------|
| Lex/parse / semantic | Problems panel + Monaco markers |
| Soft runtime (warmup, second Buy) | Skip / ignore |
| Hard runtime | Catch → `null` signal + diagnostic |
| Run with compile failure | Stay in EA Lab |

**Sessions:** do not block this spec on EA-backed Save Session FK design;
catalog strategies keep current behavior.

### 5. Testing

Unit tests under `tests/` for parse, check, compile, and `onCandle` golden
cases (e.g. SMA cross behavior aligned with `MaCrossoverStrategy`). Core
package only — no new Electron E2E requirement for v1.

## Risks

- Scope creep toward “real MQL5” — keep the allow-list rigid; reject unknown
  syntax with clear errors rather than silently ignoring.
- Workspace `strategy` is a module-level binding in `useAppStore` today —
  `openEaBacktest` must follow the same pattern as `openStrategy` so replay
  steps keep calling the EA adapter.
- Users may expect MT5 parity; copy in empty/help states should say
  “Quantify Signal DSL” / “bar-close signals,” not “MQL5 compiler.”

## Verification

- Compile invalid script → diagnostics with correct lines; no navigation.
- Compile valid SMA-cross sample → success chip.
- Run backtest → workspace opens; play/step produces entries on crosses
  when auto-entry is on (same desk data as Strategy Lab).
- Dirty edit after compile → status idle until Compile/Run again.
- Indicator Lab unchanged (no Compile/Run).
- Unit tests for parser/checker/adapter pass via existing test runner.
