import { PRODUCT_NAME } from '@shared/constants'
import { Dropdown } from './Dropdown'
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
        <Dropdown
          ariaLabel="Same-bar SL and TP"
          value={rule}
          onChange={setRule}
          options={[
            { value: 'ambiguous', label: 'Mark ambiguous' },
            { value: 'sl-first', label: 'Assume stop first' },
            { value: 'tp-first', label: 'Assume target first' },
            { value: 'random', label: 'Random' }
          ]}
        />
      </label>
      <p className="muted">
        If 1-minute data is stored, {PRODUCT_NAME} walks that path first. Starting balance $
        {account.initialBalance.toLocaleString()}.
      </p>
    </>
  )
}
