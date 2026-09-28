# Kairos — Strategy Tester

Desktop market replay and manual strategy tester for **XAUUSD**. The workflow is:

**Load local history → replay candle by candle → detect a setup → take or skip → set entry / SL / TP → simulate the fill → update the book.**

Future candles stay hidden during replay. The strategy engine only sees bars up to the current replay timestamp.

## Requirements

- Node.js 22+
- npm 10+

## Local database

SQLite is stored **in this project**, not in a hidden user folder:

```text
data/strategy-tester.db
```

That file is created on first launch. It holds datasets, candles, gaps, sessions, and trades. You can copy or back up the `data/` folder like any other file.

Override the directory with `STRATEGY_DB_DIR` if needed.

## Development

```bash
npm install
npm test
npm run dev
```

`npm run dev` opens the Electron window.

## Production build

```bash
npm run build
npm run dist
```

Packaged apps write the database under the OS user-data directory so the install stays writable. Development always uses `./data`.

## First run

1. Open the **Data** tab.
2. Click **Generate local XAUUSD demo** (15 days of 1-minute gold-like tape), or import a CSV, or download Yahoo history.
3. Open **Strategy**, keep Breakout or switch to MA Crossover.
4. Click **Start replay from warmup** or **Random historical start**.
5. Press **Space** to play. When a setup prints, **Take trade** or **Skip**.

## CSV format

```text
timestamp,open,high,low,close,volume
2025-06-10T08:00:00.000Z,3342.5,3344,3341,3343,120
```

Unix milliseconds and `YYYY.MM.DD HH:MM` timestamps are also accepted. Header row is optional.

XAUUSD history is downloaded from Dukascopy (spot gold), not Yahoo:

```bash
npm run download:xauusd
```

That writes 5M, 15M, 1H, 4H, and daily into `data/strategy-tester.db`. Daily starts June 1999; the lower timeframes start May 2003. The command is resumable if it stops halfway.

The Data tab Download button uses the same Dukascopy source for XAUUSD. Other symbols still use Yahoo Finance.

## Database schema

`data/strategy-tester.db` contains:

| Table | Purpose |
| --- | --- |
| `datasets` | Symbol, timeframe, source, date range, candle count |
| `candles` | OHLCV rows keyed by dataset + timestamp |
| `data_gaps` | Missing-bar stretches found during import |
| `sessions` | Saved backtests (strategy, account, costs, replay cursor) |
| `trades` | Taken and skipped setups for a session |
| `annotations` | Reserved for chart notes |

Schema SQL lives in `src/main/database/schema.ts`.

## Architecture

```text
Electron main
  SQLite (data/strategy-tester.db)
  Market data import / Yahoo download
React renderer
  Chart · Replay · Strategy · Trade · Performance
src/core  (pure TypeScript, unit tested)
  resample · validate · replay · strategy · trade · performance
```

Business logic lives in `src/core`. React components do not compute P&L, R, or win/loss.

## Adding a strategy

### EA Lab local scripts

EA Lab's local compiler runs **Kairos Signal DSL**, an MQL5-like subset, on
closed candles. The `.mq5` extension and MQL5 editor highlighting do not mean
full MetaTrader compatibility. Full MQL5 must be compiled and tested in MetaTrader.

Local scripts support `void OnTick()`, optional `void OnInit()`, numeric/boolean
inputs and variables, `if/else`, and `return;`. Available functions are `SMA`,
`EMA`, `crossesAbove`, `crossesBelow`, `Buy`, and `Sell`. Prices are available as
`open[n]`, `high[n]`, `low[n]`, and `close[n]`; `time[n]` is Unix milliseconds.
Index zero is the current closed candle. Position sizing, SL/TP, and costs come
from the backtest settings, with one open position at a time.

EAs receive all loaded history through the replay cursor, independent of the
built-in strategy lookback setting. Indicators skip evaluation until enough
history is loaded. Runtime errors pause replay and report the script, candle
time, and cause. The AI prompt shares the compiler's supported function list
and includes a working SMA crossover example.

### Built-in TypeScript strategies

1. Create a class in `src/core/strategy/` that implements `Strategy`.
2. Register it in `src/core/strategy/registry.ts`.
3. `onCandle` must use only `context.candles` (already clipped to the replay cursor). Never import the full historical array from elsewhere.

```ts
onCandle(candle, context) {
  // context.candles === bars the trader can see
}
```

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause |
| → / ← | Next / previous candle |
| Shift + → / ← | ±10 candles |
| R | Reset replay |
| T / S | Take / skip setup |
| + / − | Replay speed |

## Tests

```bash
npm test
```

Covers resampling, data validation, replay look-ahead, position sizing, SL/TP simulation (including same-bar ambiguity), performance math, CSV parsing, and the example strategies.
