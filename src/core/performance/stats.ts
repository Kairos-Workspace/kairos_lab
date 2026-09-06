import type { PerformanceStats, Trade } from '@shared/types'

export function calculatePerformance(
  trades: Trade[],
  initialBalance: number,
  skipped: Trade[] = []
): PerformanceStats {
  const closed = trades.filter((t) => !t.skipped && t.result && t.pnl !== undefined)
  const wins = closed.filter((t) => t.result === 'WIN')
  const losses = closed.filter((t) => t.result === 'LOSS')
  const breakevens = closed.filter((t) => t.result === 'BREAKEVEN')

  const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0))
  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const rValues = closed.map((t) => t.rMultiple ?? 0)
  const averageR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0
  const averageWinR = wins.length
    ? wins.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / wins.length
    : 0
  const averageLossR = losses.length
    ? losses.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / losses.length
    : 0

  let maxConsecW = 0
  let maxConsecL = 0
  let runW = 0
  let runL = 0
  for (const t of closed) {
    if (t.result === 'WIN') {
      runW++
      runL = 0
      maxConsecW = Math.max(maxConsecW, runW)
    } else if (t.result === 'LOSS') {
      runL++
      runW = 0
      maxConsecL = Math.max(maxConsecL, runL)
    } else {
      runW = 0
      runL = 0
    }
  }

  const equityCurve: PerformanceStats['equityCurve'] = [
    { trade: 0, equity: initialBalance, timestamp: closed[0]?.openedAt ?? 0 }
  ]
  let equity = initialBalance
  let peak = initialBalance
  let maxDrawdownUsd = 0
  closed.forEach((t, i) => {
    equity += t.pnl ?? 0
    peak = Math.max(peak, equity)
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity)
    equityCurve.push({
      trade: i + 1,
      equity,
      timestamp: t.closedAt ?? t.openedAt
    })
  })

  const maxDrawdownPct = peak === 0 ? 0 : (maxDrawdownUsd / peak) * 100
  const taken = trades.filter((t) => !t.skipped)
  const skippedSetups = skipped.length

  return {
    totalTrades: closed.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: breakevens.length,
    skippedSetups,
    totalSetups: taken.length + skippedSetups,
    takenSetups: taken.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    lossRate: closed.length ? (losses.length / closed.length) * 100 : 0,
    netPnl,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
    averageWin: wins.length ? grossProfit / wins.length : 0,
    averageLoss: losses.length ? grossLoss / losses.length : 0,
    averageWinR,
    averageLossR,
    averageR,
    expectancy: averageR,
    maxDrawdownPct,
    maxDrawdownUsd,
    maxConsecutiveWins: maxConsecW,
    maxConsecutiveLosses: maxConsecL,
    equityCurve
  }
}
