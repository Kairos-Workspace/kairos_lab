# Electron XAUUSD Strategy Tester

You are a senior desktop application developer, quantitative trading software engineer, and UI/UX engineer.

I want you to build a **desktop Strategy Tester and Market Replay application** using **Electron**.

The application is designed for traders who want to manually test their trading strategies on historical **XAUUSD (Gold/USD)** market data.

The core experience should be:

**Download historical market data → Select timeframe → Replay historical candles → Detect strategy setup → Ask user whether to enter → User configures Entry/SL/TP → Simulate the trade → Track results → Display performance statistics.**

---

# 1. Main Objective

Build a professional desktop application that allows a trader to:

1. Download/import historical XAUUSD market data.
2. Store the data locally.
3. Select different timeframes.
4. Display the market as an interactive candlestick chart.
5. Replay historical market data candle-by-candle.
6. Pause, resume, speed up, slow down, and step through candles.
7. Define a trading strategy.
8. Detect when a strategy setup occurs.
9. Display a popup asking the trader whether they want to take the trade.
10. If the trader accepts the setup, allow them to configure:

* Entry price
* Stop Loss
* Take Profit
* Risk
* Position size
* Buy/Sell direction

11. Simulate the trade using historical price movement.
12. Determine whether the trade hits SL or TP.
13. Record every trade.
14. Display detailed strategy performance statistics.
15. Allow the trader to review previous trades.

The application should feel like a **professional TradingView-style chart combined with a manual backtesting platform**.

---

# 2. Technology Stack

Use:

### Desktop

* Electron
* TypeScript

### Frontend

* React
* TypeScript
* Modern component architecture

### Chart

Use the **TradingView Lightweight Charts library** for the candlestick chart.

The chart should support:

* Candlesticks
* Multiple timeframes
* Zoom
* Pan
* Crosshair
* Price scale
* Time scale
* Volume if available
* Trade markers
* Entry lines
* SL lines
* TP lines

Do NOT simply embed the TradingView website.

Use the charting library directly inside the application.

### Local Storage / Database

Use a local database such as:

* SQLite

The application should be able to work offline after historical market data has been downloaded.

---

# 3. Application Layout

Create a professional trading-terminal-style interface.

The main screen should contain:

```text
┌─────────────────────────────────────────────────────────────┐
│ TOP BAR                                                      │
│ Symbol | Timeframe | Date | Replay | Speed | Data Status    │
├───────────────────────────────┬─────────────────────────────┤
│                               │                             │
│                               │                             │
│        CANDLESTICK            │       STRATEGY / TRADE      │
│           CHART               │           PANEL             │
│                               │                             │
│                               │                             │
│                               │                             │
├───────────────────────────────┴─────────────────────────────┤
│                                                             │
│                    PERFORMANCE PANEL                        │
│ Win Rate | Trades | Profit | Loss | RR | Drawdown | etc.  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The UI should be clean, modern, responsive, and suitable for long trading sessions.

---

# 4. Market Data

The application must support historical XAUUSD data.

Initially support:

**XAUUSD**

The architecture should be designed so additional instruments can be added later.

Examples:

* XAUUSD
* EURUSD
* GBPUSD
* USDJPY
* NAS100
* US30
* SPX500

But XAUUSD is the initial priority.

---

# 5. Data Download System

Create a dedicated **Market Data Manager**.

The user should be able to:

* Select symbol
* Select timeframe
* Select start date
* Select end date
* Download historical data
* View download progress
* Cancel download
* See how much data has been downloaded
* See existing local datasets

Example:

```text
Market Data

Symbol:
[XAUUSD ▼]

Timeframe:
[1 Minute ▼]

Start:
[2020-01-01]

End:
[2026-09-01]

[ Download Data ]

Status:
██████████████████░░ 90%

Downloaded:
1,245,320 candles
```

---

# 6. Data Architecture

Do not store only the currently displayed timeframe if the application can avoid it.

Prefer storing high-resolution historical data and generating/resampling higher timeframes locally.

For example:

```text
1 Minute
   ↓
5 Minute
   ↓
15 Minute
   ↓
30 Minute
   ↓
1 Hour
   ↓
4 Hour
   ↓
Daily
```

This allows the replay engine to maintain a consistent source of truth.

Each candle should contain at minimum:

```typescript
interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
```

Make sure timestamps and timezone handling are consistent.

---

# 7. Timeframes

Initially support:

* 1M
* 5M
* 15M
* 30M
* 1H
* 4H
* 1D

The user should be able to switch timeframe from the chart toolbar.

When changing timeframe during normal chart viewing, update the displayed candles accordingly.

During replay, timeframe switching must be handled carefully so that the replay state remains deterministic.

---

# 8. Market Replay Engine

This is one of the most important features.

The application should allow the user to replay historical price action as if it were happening live.

Example:

```text
Replay Date:
2025-06-10 08:00

Visible candles:
Only candles up to the current replay timestamp
```

Future candles must remain hidden.

The trader should not be able to see future price action.

Controls:

```text
|◀  Previous Candle
▶  Play
⏸ Pause
▶| Next Candle
⏩ Speed
```

Replay speed options:

* 0.25x
* 0.5x
* 1x
* 2x
* 5x
* 10x
* 20x

Also allow:

* Step forward 1 candle
* Step forward 5 candles
* Step forward 10 candles
* Jump to specific date/time
* Reset replay

---

# 9. Replay Randomization

Include an option to start replay from a random historical location.

Example:

```text
[ Random Replay ]

Randomly select a historical starting point from the available dataset.

The user should not know what date is being tested until the replay begins, if this option is enabled.
```

This helps prevent traders from memorizing historical price action.

---

# 10. Strategy System

The application must have a modular strategy system.

A strategy should be able to define conditions that produce a:

```text
SETUP DETECTED
```

event.

For example:

```text
Strategy:
Breakout Strategy

Condition:
Price breaks previous high
AND
Volume condition is satisfied
AND
Trend condition is satisfied
```

The architecture should NOT hard-code one specific strategy.

Instead, create a strategy interface.

Example concept:

```typescript
interface Strategy {
    name: string;

    initialize(): void;

    onCandle(candle: Candle, context: StrategyContext): StrategySignal | null;
}
```

Where:

```typescript
interface StrategySignal {
    type: "LONG" | "SHORT";
    timestamp: number;
    price: number;
    reason?: string;
}
```

This will allow additional strategies to be added later.

---

# 11. Strategy Setup Detection

Whenever the strategy detects a valid setup during replay:

```text
SETUP DETECTED
```

The application should immediately pause the replay.

Display a prominent popup.

Example:

```text
┌─────────────────────────────────────┐
│         SETUP DETECTED              │
│                                     │
│ Strategy: Breakout Strategy         │
│ Direction: LONG                     │
│ Price: 3,342.50                     │
│                                     │
│ Reason: Breakout + Confirmation     │
│                                     │
│ [ TAKE TRADE ]     [ SKIP ]         │
└─────────────────────────────────────┘
```

The replay should remain paused until the user chooses:

**TAKE TRADE**

or

**SKIP**

---

# 12. Trade Entry

If the user selects:

**TAKE TRADE**

open the trade configuration interface.

Example:

```text
Trade Setup

Direction:
● BUY
○ SELL

Entry:
[3342.50]

Stop Loss:
[3337.50]

Take Profit:
[3357.50]

Risk:
[1.0%]

Position Size:
[Auto Calculate]

Risk/Reward:
1 : 3

[ CONFIRM TRADE ]
```

Allow the user to manually configure:

* Entry
* SL
* TP
* Risk %
* Risk USD
* Lot size

Provide an option to automatically calculate position size from:

```text
Account Balance
+
Risk %
+
Entry Price
+
Stop Loss
```

---

# 13. Trade Visualization

Once a trade is opened, display it directly on the chart.

For a BUY:

```text
TP ─────────────────
        ↑
        │
ENTRY ──────────────
        │
        ↓
SL ─────────────────
```

For a SELL:

```text
SL ─────────────────
        ↑
ENTRY ──────────────
        │
        ↓
TP ─────────────────
```

Show:

* Entry marker
* Entry price
* SL line
* TP line
* Trade direction
* Risk/Reward

The user should be able to visually understand the trade directly on the chart.

---

# 14. Trade Simulation

After the trade is confirmed, replay continues.

The application must evaluate every new candle against the active trade.

For a BUY:

```text
if candle.low <= SL:
    Trade = LOSS

if candle.high >= TP:
    Trade = WIN
```

For a SELL:

```text
if candle.high >= SL:
    Trade = LOSS

if candle.low <= TP:
    Trade = WIN
```

Handle situations where both SL and TP could theoretically be touched within the same candle.

The application must have a clearly defined execution rule for this situation.

Preferably:

* Use lower-timeframe data when available to determine the actual sequence.
* If lower-timeframe data is unavailable, allow the user to configure a conservative assumption such as:

  * SL first
  * TP first
  * Random
  * Mark as ambiguous

Do not silently assume an outcome.

---

# 15. Trade Management

Initially support:

* Entry
* SL
* TP

The architecture should be prepared for future features:

* Move SL
* Break Even
* Partial Take Profit
* Trailing Stop
* Scale In
* Scale Out
* Multiple positions

These do not necessarily need to be implemented in version 1.

---

# 16. Account Simulation

Create a virtual trading account.

Example:

```text
Initial Balance:
$10,000

Current Balance:
$10,450

Equity:
$10,450

Risk Per Trade:
1%
```

Each trade should affect the virtual account.

For example:

Winning trade:

```text
+3R
```

Losing trade:

```text
-1R
```

Track both:

* USD P&L
* R multiple

---

# 17. Performance Dashboard

Create a performance panel that updates automatically.

At minimum display:

```text
Performance

Total Trades       120
Winning Trades      72
Losing Trades       48

Win Rate           60%

Net Profit        +$1,850

Profit Factor       1.82

Average Win       +2.4R
Average Loss      -1.0R

Average R          +0.85R

Max Drawdown       -8.4%

Expectancy         +0.52R
```

Also calculate:

* Win rate
* Loss rate
* Total trades
* Winning trades
* Losing trades
* Net P&L
* Gross profit
* Gross loss
* Profit factor
* Average win
* Average loss
* Average R
* Expectancy
* Maximum drawdown
* Maximum consecutive wins
* Maximum consecutive losses
* Risk/reward distribution

---

# 18. Equity Curve

Create an equity curve below or inside the performance dashboard.

Example:

```text
Equity
$12K |                         /
     |                      __/
$11K |                 ____/
     |            ____/
$10K |___________/
     |
     └────────────────────────────
              Trades
```

The equity curve should update as replayed trades are completed.

---

# 19. Trade History

Create a trade history table.

Columns:

```text
Trade #
Date
Time
Direction
Entry
SL
TP
Result
P&L
R
Strategy
Reason
```

Example:

```text
#001 | 2025-06-10 | BUY  | 3342 | 3337 | 3357 | WIN  | +$300 | +3R
#002 | 2025-06-11 | SELL | 3358 | 3363 | 3348 | LOSS | -$100 | -1R
```

Allow sorting and filtering.

Filters:

* WIN
* LOSS
* BUY
* SELL
* Strategy
* Date range

---

# 20. Trade Review

The user should be able to click a historical trade.

When clicked:

1. Move the chart to the trade.
2. Display the entry.
3. Display SL.
4. Display TP.
5. Show the candles around the trade.
6. Show trade information.
7. Show the result.

This should make it easy to review mistakes.

---

# 21. Skip Setup

If a setup is detected and the user selects:

**SKIP**

record it as a skipped setup.

Keep statistics such as:

```text
Total Setups: 150
Taken: 120
Skipped: 30
```

Optionally allow the user to review skipped setups later.

This is useful because the trader can evaluate whether they correctly filtered setups.

---

# 22. Strategy Configuration

Create a strategy configuration area.

Example:

```text
Strategy Settings

Strategy:
[ Breakout Strategy ]

Risk:
[ 1.0 % ]

Default RR:
[ 3.0 ]

Auto Entry:
[ OFF ]

Pause on Setup:
[ ON ]
```

Strategies should be configurable without modifying the core replay engine.

---

# 23. Chart Interaction

The chart should support:

* Zoom
* Pan
* Crosshair
* OHLC information
* Price levels
* Horizontal lines
* Trendlines if practical
* Entry markers
* SL/TP markers
* Trade annotations

The trader should be able to draw manually on the chart if possible.

Potential drawing tools:

* Horizontal line
* Trendline
* Rectangle
* Text/annotation

---

# 24. Keyboard Shortcuts

Implement useful shortcuts.

Example:

```text
Space       Play / Pause
→           Next candle
←           Previous candle
R           Reset replay
T           Take trade
S           Skip setup
+           Increase replay speed
-           Decrease replay speed
```

Allow these to be configurable later.

---

# 25. Session / Trading Information

Display the current replay information:

```text
XAUUSD
15M

Date:
2025-06-10

Time:
14:35

Session:
New York

Price:
3342.50
```

Prepare the architecture so future features can include:

* London session
* New York session
* Asia session
* Session statistics

---

# 26. Save Backtest Sessions

The user should be able to save a backtest session.

Example:

```text
Backtest Sessions

Gold Breakout Test
Created: 2026-09-06
Strategy: Breakout
Trades: 120
Win Rate: 60%
Net Profit: +$1,850

[ OPEN ]
[ DELETE ]
```

A saved session should preserve:

* Dataset
* Strategy
* Replay position
* Account settings
* Trades
* Results
* User annotations

---

# 27. Data Integrity

This application is for backtesting, so data accuracy is extremely important.

Implement:

* Duplicate candle detection
* Missing candle detection
* Invalid OHLC validation
* Timestamp validation
* Data source metadata
* Dataset versioning if practical

Display a warning when historical data contains gaps.

Example:

```text
⚠ Data Gap Detected

XAUUSD 15M
2025-06-10 08:15 → 09:45

Some historical candles are missing.
```

---

# 28. Architecture

Separate the application into clear modules.

Suggested architecture:

```text
Electron Main Process
│
├── Market Data Manager
│
├── SQLite Database
│
├── Replay Engine
│
├── Strategy Engine
│
├── Trade Engine
│
└── Backtest Engine
        │
        ↓
React Renderer
│
├── Chart
├── Replay Controls
├── Strategy Panel
├── Trade Panel
├── Performance Dashboard
└── Trade History
```

Keep business logic outside React components.

The replay engine, strategy engine, and trade engine should be independently testable.

---

# 29. Core State

Create a centralized application state containing concepts such as:

```typescript
interface ReplayState {
    symbol: string;
    timeframe: Timeframe;
    currentTimestamp: number;
    isPlaying: boolean;
    playbackSpeed: number;
}

interface AccountState {
    initialBalance: number;
    balance: number;
    equity: number;
    riskPerTrade: number;
}

interface Trade {
    id: string;
    symbol: string;
    direction: "BUY" | "SELL";
    entry: number;
    stopLoss: number;
    takeProfit: number;
    positionSize: number;
    riskAmount: number;
    result?: "WIN" | "LOSS" | "BREAKEVEN";
    pnl?: number;
    rMultiple?: number;
    openedAt: number;
    closedAt?: number;
}
```

Use strong TypeScript types throughout the application.

---

# 30. Important Replay Rule

The replay engine must prevent look-ahead bias.

The strategy must ONLY receive information available at the current replay timestamp.

It must NEVER have access to future candles.

For example:

```text
Historical data:

Candle 1
Candle 2
Candle 3
Candle 4
Candle 5
Candle 6
Candle 7
Candle 8
Candle 9
Candle 10
```

If replay is currently at Candle 5:

```text
Strategy can see:

Candle 1
Candle 2
Candle 3
Candle 4
Candle 5
```

It must NOT see:

```text
Candle 6
Candle 7
Candle 8
Candle 9
Candle 10
```

This rule is critical.

---

# 31. Backtesting Rules

Make all important execution assumptions explicit and configurable.

Examples:

* Spread
* Commission
* Slippage
* Minimum lot size
* Lot step
* Contract size
* Tick size
* Tick value

Do not hard-code assumptions that could produce misleading results.

Create a configuration panel where these values can be adjusted.

---

# 32. UX Requirements

The application should feel like a real trading platform rather than a generic data dashboard.

Prioritize:

* Fast chart rendering
* Smooth replay
* Minimal UI clutter
* Clear trade decisions
* Clear visual feedback
* Keyboard shortcuts
* Dark mode
* Professional typography
* Responsive panels
* Easy navigation

The trader should be able to spend hours testing a strategy without the UI becoming frustrating.

---

# 33. Version 1 Scope

Build Version 1 with these core features first:

### Must Have

* Electron desktop app
* React + TypeScript
* TradingView Lightweight Charts
* XAUUSD historical data
* Local SQLite storage
* Data import/download
* Multiple timeframes
* Candlestick chart
* Market replay
* Play/Pause
* Step candle
* Replay speed control
* Strategy engine
* Setup detection
* Setup popup
* Take/Skip decision
* Entry configuration
* SL
* TP
* Trade simulation
* Win/Loss detection
* Virtual account
* Trade history
* Win rate
* Net P&L
* R multiple
* Profit factor
* Maximum drawdown
* Equity curve
* Save backtest sessions

---

# 34. Future Features

Design the architecture so these can be added later:

### Advanced Strategy Builder

Allow users to create strategies visually:

```text
IF
Market Structure Break
AND
Liquidity Sweep
AND
FVG Created
AND
Price Returns to FVG

THEN
Generate Setup
```

### Multi-Timeframe Analysis

Example:

```text
4H → Bias
1H → Structure
15M → Setup
5M → Entry
```

### Advanced Trade Management

* Break-even
* Trailing stop
* Partial TP
* Scaling
* Multiple positions

### Statistics

* Session performance
* Day-of-week performance
* Time-of-day performance
* Long vs Short
* Setup type
* Market regime
* Consecutive losses
* Monte Carlo analysis

### Journaling

Allow the trader to add:

* Screenshot
* Notes
* Emotions
* Reason for entry
* Reason for exit
* Mistakes

---

# 35. Development Approach

Do NOT attempt to build the entire application in one huge file.

Build it incrementally.

Recommended order:

### Phase 1

Create Electron + React + TypeScript project.

### Phase 2

Implement SQLite database.

### Phase 3

Implement historical data import/download.

### Phase 4

Implement TradingView Lightweight Charts.

### Phase 5

Implement timeframe conversion.

### Phase 6

Implement replay engine.

### Phase 7

Implement strategy interface and setup detection.

### Phase 8

Implement trade entry popup.

### Phase 9

Implement trade simulation.

### Phase 10

Implement performance statistics.

### Phase 11

Implement trade history and review.

### Phase 12

Implement save/load backtest sessions.

### Phase 13

Polish UI and performance.

---

# 36. Code Quality

Follow these principles:

* TypeScript strict mode
* Clean architecture
* Modular components
* Reusable React components
* Strong type definitions
* Unit tests for trading calculations
* Unit tests for replay engine
* Unit tests for trade engine
* Error handling
* Logging
* No unnecessary global state
* No hard-coded trading calculations
* No duplicated business logic

Trading calculations must be deterministic and testable.

---

# 37. Critical Requirement

The most important thing is to make the application behave like a **real historical market replay**.

The trader must feel that they are seeing the market unfold one candle at a time.

The application must NOT reveal future candles.

When a strategy setup appears:

```text
MARKET
   ↓
STRATEGY DETECTS SETUP
   ↓
PAUSE REPLAY
   ↓
┌─────────────────────┐
│  SETUP DETECTED     │
│                     │
│  BUY / SELL         │
│                     │
│  TAKE / SKIP        │
└─────────────────────┘
   ↓
TAKE TRADE
   ↓
SET ENTRY / SL / TP
   ↓
CONTINUE REPLAY
   ↓
SL / TP HIT
   ↓
CALCULATE RESULT
   ↓
UPDATE STATISTICS
```

This workflow should be the central experience of the application.

---

# 38. Deliverables

Produce:

1. Complete Electron application.
2. Clean project structure.
3. Installation instructions.
4. Development instructions.
5. Production build instructions.
6. Database schema.
7. Data import/download implementation.
8. Replay engine.
9. Strategy engine.
10. Trade engine.
11. Performance calculation engine.
12. Unit tests.
13. Example strategy for demonstration.
14. README explaining the architecture and how to add new strategies.

Before implementing advanced features, make sure the **basic replay → setup → decision → trade → result → statistics** workflow works correctly end-to-end.

Do not sacrifice trading/backtesting correctness for visual features.
