import { useEffect, useRef, useState } from 'react'
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

  const [selectedLineTool, setSelectedLineTool] = useState<DrawingTool>('trendline')
  const [selectedShapeTool, setSelectedShapeTool] = useState<DrawingTool>('rectangle')
  const [openFlyout, setOpenFlyout] = useState<'lines' | 'shapes' | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Sync selected sub-tool if activeTool changes externally
  useEffect(() => {
    if (!activeTool) return
    if (LINE_TOOLS.some((t) => t.tool === activeTool)) {
      setSelectedLineTool(activeTool as DrawingTool)
    } else if (SHAPE_TOOLS.some((t) => t.tool === activeTool)) {
      setSelectedShapeTool(activeTool as DrawingTool)
    }
  }, [activeTool])

  // Click outside to close flyouts
  useEffect(() => {
    if (!openFlyout) return
    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenFlyout(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openFlyout])

  function pick(tool: ChartTool): void {
    setActiveTool(activeTool === tool ? null : tool)
    setOpenFlyout(null)
  }

  const currentLineToolObj =
    LINE_TOOLS.find((t) => t.tool === (activeTool ?? selectedLineTool)) ?? LINE_TOOLS[0]
  const isLineActive = LINE_TOOLS.some((t) => t.tool === activeTool)

  const currentShapeToolObj =
    SHAPE_TOOLS.find((t) => t.tool === (activeTool ?? selectedShapeTool)) ?? SHAPE_TOOLS[0]
  const isShapeActive = SHAPE_TOOLS.some((t) => t.tool === activeTool)

  return (
    <div className="drawing-toolbar" ref={toolbarRef}>
      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === null}
        title="Cursor (Pan & Select)"
        aria-label="Cursor"
        onClick={() => {
          setActiveTool(null)
          setOpenFlyout(null)
        }}
      >
        <Icon name="cursor" />
      </button>

      {/* Line tools group (single 36x36 button with corner arrow) */}
      <div className="drawing-toolbar-item-wrap">
        <button
          type="button"
          className="icon-btn"
          data-active={isLineActive}
          title={`${currentLineToolObj.label} (click arrow to choose)`}
          aria-label={currentLineToolObj.label}
          onClick={() => {
            if (isLineActive) {
              setActiveTool(null)
            } else {
              setActiveTool(selectedLineTool)
            }
            setOpenFlyout(null)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setOpenFlyout(openFlyout === 'lines' ? null : 'lines')
          }}
        >
          <Icon name={currentLineToolObj.icon} />
          <span
            className="flyout-corner-arrow"
            title="Choose line tool"
            onClick={(e) => {
              e.stopPropagation()
              setOpenFlyout(openFlyout === 'lines' ? null : 'lines')
            }}
          />
        </button>

        {openFlyout === 'lines' ? (
          <div className="drawing-flyout">
            {LINE_TOOLS.map(({ tool, icon, label }) => (
              <button
                key={tool}
                type="button"
                className="drawing-flyout-item"
                data-active={activeTool === tool}
                onClick={() => {
                  setSelectedLineTool(tool)
                  pick(tool)
                }}
              >
                <Icon name={icon} size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Shape tools group (single 36x36 button with corner arrow) */}
      <div className="drawing-toolbar-item-wrap">
        <button
          type="button"
          className="icon-btn"
          data-active={isShapeActive}
          title={`${currentShapeToolObj.label} (click arrow to choose)`}
          aria-label={currentShapeToolObj.label}
          onClick={() => {
            if (isShapeActive) {
              setActiveTool(null)
            } else {
              setActiveTool(selectedShapeTool)
            }
            setOpenFlyout(null)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setOpenFlyout(openFlyout === 'shapes' ? null : 'shapes')
          }}
        >
          <Icon name={currentShapeToolObj.icon} />
          <span
            className="flyout-corner-arrow"
            title="Choose shape tool"
            onClick={(e) => {
              e.stopPropagation()
              setOpenFlyout(openFlyout === 'shapes' ? null : 'shapes')
            }}
          />
        </button>

        {openFlyout === 'shapes' ? (
          <div className="drawing-flyout">
            {SHAPE_TOOLS.map(({ tool, icon, label }) => (
              <button
                key={tool}
                type="button"
                className="drawing-flyout-item"
                data-active={activeTool === tool}
                onClick={() => {
                  setSelectedShapeTool(tool)
                  pick(tool)
                }}
              >
                <Icon name={icon} size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Direct tools */}
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

      <div className="drawing-toolbar-sep" />

      {/* Drawing controls */}
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
