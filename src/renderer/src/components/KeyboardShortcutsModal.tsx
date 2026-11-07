import { Modal } from './ui'

interface Props {
  onClose: () => void
}

interface ShortcutItem {
  keys: string[]
  desc: string
}

interface ShortcutCategory {
  title: string
  items: ShortcutItem[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Replay & Playback',
    items: [
      { keys: ['Space'], desc: 'Play / Pause replay' },
      { keys: ['→'], desc: 'Step forward 1 candle' },
      { keys: ['←'], desc: 'Step backward 1 candle' },
      { keys: ['Shift', '→'], desc: 'Step forward 10 candles' },
      { keys: ['Shift', '←'], desc: 'Step backward 10 candles' },
      { keys: ['+'], desc: 'Increase speed' },
      { keys: ['-'], desc: 'Decrease speed' },
      { keys: ['R'], desc: 'Reset replay to start' }
    ]
  },
  {
    title: 'Strategy & Trading',
    items: [
      { keys: ['T'], desc: 'Take pending setup' },
      { keys: ['S'], desc: 'Skip pending setup' },
      { keys: ['B'], desc: 'Move Stop Loss to Break-Even (BE)' },
      { keys: ['C'], desc: 'Close open position at market' },
      { keys: ['1'], desc: 'Strategy panel tab' },
      { keys: ['2'], desc: 'Indicators panel tab' },
      { keys: ['3'], desc: 'Trade panel tab' },
      { keys: ['4'], desc: 'Costs panel tab' }
    ]
  },
  {
    title: 'Chart & Layout',
    items: [
      { keys: ['F'], desc: 'Toggle Fullscreen chart vs Desk layout' },
      { keys: ['Alt', '1-4'], desc: 'Switch 1, 2 (Dual), 3, or 4 (Quad) chart layout' },
      { keys: ['Esc'], desc: 'Clear tool / Close modal / Exit fullscreen' },
      { keys: ['?'], desc: 'Open / close this shortcuts help' }
    ]
  },
  {
    title: 'Chart Drawings',
    items: [
      { keys: ['Del'], desc: 'Delete selected drawing' },
      { keys: ['Ctrl/Cmd', 'Z'], desc: 'Undo drawing' },
      { keys: ['Ctrl/Cmd', 'Shift', 'Z'], desc: 'Redo drawing' }
    ]
  }
]

export function KeyboardShortcutsModal({ onClose }: Props): React.JSX.Element {
  return (
    <Modal
      open={true}
      onClose={onClose}
      stamp="Shortcuts"
      title="Keyboard Shortcuts"
      subtitle="Quick keys to navigate, replay, and manage trades with speed."
      size="lg"
    >
      <div className="shortcuts-grid">
        {SHORTCUT_CATEGORIES.map((cat) => (
          <div key={cat.title} className="shortcuts-group">
            <h4 className="shortcuts-group-title">{cat.title}</h4>
            {cat.items.map((item, idx) => (
              <div key={idx} className="shortcut-row">
                <span className="shortcut-desc">{item.desc}</span>
                <span className="shortcut-keys">
                  {item.keys.map((k, kidx) => (
                    <kbd key={kidx} className="kbd-badge">
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
