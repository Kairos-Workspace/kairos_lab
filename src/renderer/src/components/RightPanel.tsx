import { useAppStore, type RightTab } from '../store/useAppStore'
import { Icon, type IconName } from './Icon'
import { StrategyPanel } from './StrategyPanel'
import { TradePanel } from './TradePanel'
import { CostsPanel } from './CostsPanel'

const TABS: Array<{ id: RightTab; label: string; icon: IconName }> = [
  { id: 'strategy', label: 'Strategy', icon: 'strategy' },
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
            <span className="icon-label">
              <Icon name={t.icon} />
              <span className="tab-label">{t.label}</span>
            </span>
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === 'strategy' ? <StrategyPanel /> : null}
        {tab === 'trade' ? <TradePanel /> : null}
        {tab === 'costs' ? <CostsPanel /> : null}
      </div>
    </aside>
  )
}
