# Fundamentals macro bundle

Offline US + USD macro history used for as-of snapshots during chart scrub / replay.

## Coverage

| Series | Id | Source |
|--------|----|--------|
| Fed target upper | `fed_funds` | FRED `DFEDTARU` (change days) |
| Fed target lower | `fed_funds_lower` | FRED `DFEDTARL` (change days) |
| Unemployment U-3 | `unemployment` | FRED `UNRATE` |
| Headline CPI YoY | `cpi_yoy` | FRED `CPIAUCSL` (`units=pc1`) |
| Core CPI YoY | `cpi_core` | FRED `CPILFESL` (`units=pc1`) |
| Nonfarm payrolls Δ | `nfp` | MoM Δ FRED `PAYEMS` (thousands) |
| DXY | `dxy` | Yahoo `DX-Y.NYB` daily closes |

Points are stamped at **release / decision time** (not period start). Monthly labor/CPI use first Friday / ~12th of the following month; each point may include a `period` label (e.g. `"Aug 2026"`).

## Rebuild

```bash
node scripts/rebuild-fundamentals.mjs   # needs FRED_API_KEY in .env
```

Loader: `bundle.ts` → `getFundamentalsBundle()`.
