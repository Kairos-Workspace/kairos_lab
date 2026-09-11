import { useState } from 'react'
import type { ChartTool, DrawingTool } from '@shared/types'
import { Icon, type IconName } from './Icon'
import { ConfirmIconButton } from './ConfirmIconButton'
import { useAppStore } from '../store/useAppStore'

const LINE_TOOLS: { tool: DrawingTool; icon: IconName; label: string }[] = [
  { tool: 'trendline', icon: 'trendLine', label: 'Trend line' },
  { tool: 'horizontal', icon: 'horizontalLine', label: 'Horizontal line' },
  { tool: 'ray', icon: 'ray', label: 'Ray' },
  { tool: 'vertical', icon: 'verticalLine', label: 'Vertical line' }
]

const SHAPE_TOOLS: { tool: DrawingTool; icon: IconName; label: string }[] = [
  { tool: 'rectangle', icon: 'rectangle', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' }
]

export function DrawingToolbar(): React.JSX.Element {
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const clearDrawings = useAppStore((s) => s.clearDrawings)
  const drawingsHidden = useAppStore((s) => s.drawingsHidden)
  const setDrawingsHidden = useAppStore((s) => s.setDrawingsHidden)
  const undoDrawing = useAppStore((s) => s.undoDrawing)
  const redoDrawing = useAppStore((s) => s.redoDrawing)
  const canUndo = useAppStore((s) => s.drawingUndoStack.length > 0)
  const canRedo = useAppStore((s) => s.drawingRedoStack.length > 0)
  const [openFlyout, setOpenFlyout] = useState<'lines' | 'shapes' | null>(null)

  function pick(tool: ChartTool): void {
    setActiveTool(activeTool === tool ? null : tool)
    setOpenFlyout(null)
  }

  const activeLineTool = LINE_TOOLS.find((t) => t.tool === activeTool)
  const activeShapeTool = SHAPE_TOOLS.find((t) => t.tool === activeTool)

  return (
    <div className="drawing-toolbar">
      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === null}
        title="Cursor"
        aria-label="Cursor"
        onClick={() => setActiveTool(null)}
      >
        <Icon name="cursor" />
      </button>

      <div className="drawing-toolbar-group">
        <button
          type="button"
          className="icon-btn"
          data-active={activeLineTool != null}
          title={activeLineTool?.label ?? 'Line tools'}
          aria-label="Line tools"
          onClick={() => setOpenFlyout(openFlyout === 'lines' ? null : 'lines')}
        >
          <Icon name={activeLineTool?.icon ?? 'trendLine'} />
        </button>
        {openFlyout === 'lines' ? (
          <div className="drawing-flyout">
            {LINE_TOOLS.map(({ tool, icon, label }) => (
              <button
                key={tool}
                type="button"
                className="icon-btn"
                data-active={activeTool === tool}
                title={label}
                aria-label={label}
                onClick={() => pick(tool)}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="drawing-toolbar-group">
        <button
          type="button"
          className="icon-btn"
          data-active={activeShapeTool != null}
          title={activeShapeTool?.label ?? 'Shapes'}
          aria-label="Shapes"
          onClick={() => setOpenFlyout(openFlyout === 'shapes' ? null : 'shapes')}
        >
          <Icon name={activeShapeTool?.icon ?? 'rectangle'} />
        </button>
        {openFlyout === 'shapes' ? (
          <div className="drawing-flyout">
            {SHAPE_TOOLS.map(({ tool, icon, label }) => (
              <button
                key={tool}
                type="button"
                className="icon-btn"
                data-active={activeTool === tool}
                title={label}
                aria-label={label}
                onClick={() => pick(tool)}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'fib'}
        title="Fib retracement"
        aria-label="Fib retracement"
        onClick={() => pick('fib')}
      >
        <Icon name="fib" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'text'}
        title="Text"
        aria-label="Text"
        onClick={() => pick('text')}
      >
        <Icon name="text" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'brush'}
        title="Brush"
        aria-label="Brush"
        onClick={() => pick('brush')}
      >
        <Icon name="brush" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'measure'}
        title="Measure"
        aria-label="Measure"
        onClick={() => pick('measure')}
      >
        <Icon name="measure" />
      </button>

      <button
        type="button"
        className="icon-btn"
        disabled={!canUndo}
        title="Undo (Ctrl/Cmd+Z)"
        aria-label="Undo"
        onClick={undoDrawing}
      >
        <Icon name="undo" />
      </button>

      <button
        type="button"
        className="icon-btn"
        disabled={!canRedo}
        title="Redo (Ctrl/Cmd+Shift+Z)"
        aria-label="Redo"
        onClick={redoDrawing}
      >
        <Icon name="redo" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={drawingsHidden}
        title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
        aria-label={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
        onClick={() => setDrawingsHidden(!drawingsHidden)}
      >
        <Icon name={drawingsHidden ? 'eyeOff' : 'eye'} />
      </button>

      <ConfirmIconButton
        icon="trash"
        label="Clear all drawings"
        confirmLabel="Confirm clear"
        onConfirm={clearDrawings}
      />
    </div>
  )
}
