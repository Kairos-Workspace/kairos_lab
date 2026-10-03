import type { HeadlessBacktestResult } from '@core/ea/headlessBacktest'
import { Button, Modal } from './ui'

function money(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

export function BotBacktestResultModal({
  scriptName,
  symbol,
  result,
  onClose,
  onOpenVisual
}: {
  scriptName: string
  symbol: string
  result: HeadlessBacktestResult
  onClose: () => void
  onOpenVisual?: () => void
}): React.JSX.Element {
  const { stats, account, barsPlayed } = result
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Bars', value: String(barsPlayed) },
    { label: 'Trades', value: String(stats.totalTrades) },
    { label: 'Win rate', value: pct(stats.winRate) },
    { label: 'Net PnL', value: money(stats.netPnl) },
    { label: 'Profit factor', value: Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞' },
    { label: 'Avg R', value: stats.averageR.toFixed(2) },
    { label: 'Max DD', value: `${money(-Math.abs(stats.maxDrawdownUsd))} (${pct(stats.maxDrawdownPct)})` },
    { label: 'Ending equity', value: account.equity.toLocaleString(undefined, { maximumFractionDigits: 2 }) }
  ]

  return (
    <Modal
      open={true}
      onClose={onClose}
      stamp="Results"
      title="Background backtest"
      subtitle={`${scriptName} · ${symbol}`}
      size="md"
      footer={
        <>
          {onOpenVisual ? (
            <Button variant="ghost" type="button" onClick={onOpenVisual}>
              Open in tester
            </Button>
          ) : null}
          <Button variant="primary" type="button" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <dl className="bot-backtest-results">
        {rows.map((row) => (
          <div key={row.label} className="bot-backtest-results-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
