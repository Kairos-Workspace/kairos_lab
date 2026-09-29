# Fundamentals macro bundle

Offline US + USD macro history used for as-of snapshots during chart scrub / replay.

## Coverage

| Series | Id | Cadence | Source |
|--------|----|---------|--------|
| Fed funds target (upper) | `fed_funds` | FOMC changes | FRED `DFEDTARU` |
| Unemployment U-3 | `unemployment` | Monthly print | FRED `UNRATE` |
| CPI YoY | `cpi_yoy` | Monthly print | YoY from FRED `CPIAUCSL` |
| Nonfarm payrolls Δ | `nfp` | Monthly print | MoM Δ FRED `PAYEMS` (thousands) |
| USD index (DXY) | `dxy` | Month-end close | Yahoo `DX-Y.NYB` |

High-impact `events` (`fomc` / `cpi` / `nfp`) track the same release/decision timestamps, plus scheduled upcoming FOMC meetings (no `actual` until decided).

## As-of rule

All `points[].ts` and `events[].ts` are **unix milliseconds UTC** stamped at **release / decision time**, not the reference period start.

- `resolveFundamentals(bundle, asOfTs)` returns the latest point with `ts <= asOfTs` per series (no look-ahead).
- Monthly labor / CPI rows use approximate BLS release days (first Friday / ~12th of the following month).
- Fed funds points use the FRED target-change date (~18:00 UTC).
- DXY uses Yahoo monthly bars stamped at month-end.

Rebuild (requires `FRED_API_KEY` in `.env`):

```bash
# see conversation / scripts — fetch FRED + Yahoo and rewrite macro.json
```

Bundle file: `macro.json`. Loader: `bundle.ts` → `getFundamentalsBundle()`.
