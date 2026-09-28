import { useAppStore, type RightTab } from '../store/useAppStore'
import { Icon, type IconName } from './Icon'
import { StrategyPanel } from './StrategyPanel'
import { PineIndicatorPanel } from './PineIndicatorPanel'
import { TradePanel } from './TradePanel'
import { CostsPanel } from './CostsPanel'

const TABS: Array<{ id: RightTab; label: string; icon: IconName }> = [
  { id: 'strategy', label: 'Strategy', icon: 'strategy' },
  { id: 'indicators', label: 'Indicators', icon: 'indicators' },
  { id: 'trade', label: 'Trade', icon: 'trade' },
  { id: 'costs', label: 'Costs', icon: 'costs' }
]

export function RightPanel(): React.JSX.Element {
  const tab = useAppStore((s) => s.rightTab)
  const setTab = useAppStore((s) => s.setRightTab)

  return (
    <aside className="right-panel">
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="tab"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
            title={t.label}
            aria-label={t.label}
          >
            <Icon name={t.icon} size={16} />
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === 'strategy' ? <StrategyPanel /> : null}
        {tab === 'indicators' ? <PineIndicatorPanel /> : null}
        {tab === 'trade' ? <TradePanel /> : null}
        {tab === 'costs' ? <CostsPanel /> : null}
      </div>
    </aside>
  )
}
