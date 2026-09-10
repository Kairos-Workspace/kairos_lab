import type { Drawing, DrawingStyle } from '@shared/types'
import type { Point } from '@core/drawings/geometry'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'

const COLORS = ['#4a45d4', '#5dcec0', '#e07a5f', '#c9863a', '#e5e5f0']
const WIDTHS = [1, 2, 3, 4]

export function DrawingStyleMenu({
  drawing,
  anchor,
  onStyleChange,
  onDelete
}: {
  drawing: Drawing
  anchor: Point
  onStyleChange: (style: Partial<DrawingStyle>) => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div className="drawing-style-menu" style={{ left: anchor.x, top: anchor.y }}>
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className="drawing-color-swatch"
          data-active={drawing.style.color === color}
          style={{ background: color }}
          aria-label={`Color ${color}`}
          onClick={() => onStyleChange({ color })}
        />
      ))}
      <Dropdown
        value={drawing.style.lineWidth}
        onChange={(lineWidth) => onStyleChange({ lineWidth })}
        options={WIDTHS.map((w) => ({ value: w, label: `${w}px` }))}
        ariaLabel="Line width"
      />
      <button
        type="button"
        className="icon-btn"
        data-active={drawing.style.dashed}
        aria-label="Toggle dashed"
        title="Dashed"
        onClick={() => onStyleChange({ dashed: !drawing.style.dashed })}
      >
        <Icon name="dashed" size={12} />
      </button>
      <button
        type="button"
        className="icon-btn danger"
        aria-label="Delete drawing"
        title="Delete"
        onClick={onDelete}
      >
        <Icon name="trash" />
      </button>
    </div>
  )
}
