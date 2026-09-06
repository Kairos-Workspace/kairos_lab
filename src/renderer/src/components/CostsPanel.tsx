import { PRODUCT_NAME } from '@shared/constants'
import type { AmbiguityRule } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

export function CostsPanel(): React.JSX.Element {
  const costs = useAppStore((s) => s.costs)
  const setCosts = useAppStore((s) => s.setCosts)
  const rule = useAppStore((s) => s.ambiguityRule)
  const setRule = useAppStore((s) => s.setAmbiguityRule)
  const account = useAppStore((s) => s.account)

  return (
    <>
      <h3>Execution assumptions</h3>
      <p className="muted">
        These are applied when a trade closes. They are never silently assumed.
      </p>
      {(
        [
          ['spread', 'Spread (price)'],
          ['commission', 'Commission (USD)'],
          ['slippage', 'Slippage (price)'],
          ['minLot', 'Min lot'],
          ['lotStep', 'Lot step'],
          ['contractSize', 'Contract size'],
          ['tickSize', 'Tick size']
        ] as const
      ).map(([key, label]) => (
        <label className="field" key={key}>
          {label}
          <input
            type="number"
            step="0.01"
            value={costs[key]}
            onChange={(e) => setCosts({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="field">
        Same-bar SL and TP
        <select value={rule} onChange={(e) => setRule(e.target.value as AmbiguityRule)}>
          <option value="ambiguous">Mark ambiguous</option>
          <option value="sl-first">Assume stop first</option>
          <option value="tp-first">Assume target first</option>
          <option value="random">Random</option>
        </select>
      </label>
      <p className="muted">
        If 1-minute data is stored, {PRODUCT_NAME} walks that path first. Starting balance $
        {account.initialBalance.toLocaleString()}.
      </p>
    </>
  )
}
