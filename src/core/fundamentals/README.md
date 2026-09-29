# Fundamentals macro bundle

Offline US + USD macro history used for as-of snapshots during chart scrub / replay.

## Coverage

| Series | Id | Cadence | Approx. span |
|--------|----|---------|--------------|
| Fed funds target (upper) | `fed_funds` | FOMC changes | 2019-12 → 2025-12 |
| Unemployment U-3 | `unemployment` | Monthly print | 2019-12 → 2025-12 |
| CPI YoY | `cpi_yoy` | Monthly print | 2019-12 → 2025-12 |
| Nonfarm payrolls Δ | `nfp` | Monthly print | 2019-12 → 2025-12 |
| USD index (DXY) | `dxy` | Month-end close | 2019-12 → 2025-12 |

High-impact `events` (`fomc` / `cpi` / `nfp`) run roughly **2020-02 → 2026-01** (Dec 2025 prints land in early Jan 2026).

Intended scrub window: **2020-01-01 → 2025-12-31**.

## As-of rule

All `points[].ts` and `events[].ts` are **unix milliseconds UTC** stamped at **release / decision time**, not the reference period start.

- `resolveFundamentals(bundle, asOfTs)` returns the latest point with `ts <= asOfTs` per series (no look-ahead).
- Monthly labor / CPI rows use approximate BLS release days (first Friday / ~12th of the following month).
- Fed funds points use FOMC decision day (~18:00 UTC).
- DXY uses approximate month-end closes.

Values are curated public approximations (~1 decimal for rates) for v1 offline replay — not a live FRED feed.

## Sources

Approximate historical levels aligned with:

- Fed funds: FRED `DFEDTARU` (FOMC target range upper bound)
- Unemployment: FRED `UNRATE`
- CPI YoY: derived from FRED `CPIAUCSL` (year-over-year %)
- NFP: month-over-month change in FRED `PAYEMS` (thousands)
- DXY: ICE US Dollar Index month-end closes (public market prints; similar path to FRED `DTWEXBGS`)

Bundle file: `macro.json`. Loader: `bundle.ts` → `getFundamentalsBundle()`.
