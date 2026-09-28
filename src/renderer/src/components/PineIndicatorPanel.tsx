import { useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore, type PineIndicatorInstance } from '../store/useAppStore'
import { diagnosePineScript, type PineDiagnostic } from '@core/indicators/pinePreview'
import { registerLabLanguages } from '../lib/mql5Language'
import { Button, Badge, Modal, FormField } from './ui'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'

const BLANK_CODE = `//@version=5
indicator("Custom Indicator", overlay=true)

plot(ta.ema(close, 20), "EMA 20", color=color.yellow, linewidth=2)
`

const PRESETS: Array<{ name: string; label: string; code: string }> = [
  {
    name: 'ema_cross',
    label: 'EMA 20/50 Cross',
    code: `//@version=5
indicator("EMA Cross", overlay=true)

emaFast = ta.ema(close, 20)
emaSlow = ta.ema(close, 50)

plot(emaFast, "EMA 20", color=color.yellow, linewidth=2)
plot(emaSlow, "EMA 50", color=color.blue, linewidth=2)

longCond = ta.crossover(emaFast, emaSlow)
shortCond = ta.crossunder(emaFast, emaSlow)

plotshape(longCond, title="Buy Signal", style=shape.triangleup, location=location.belowbar, color=color.green, size=size.small)
plotshape(shortCond, title="Sell Signal", style=shape.triangledown, location=location.abovebar, color=color.red, size=size.small)
`
  },
  {
    name: 'bollinger',
    label: 'Bollinger Bands',
    code: `//@version=5
indicator("Bollinger Bands", overlay=true)

length = 20
mult = 2.0
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
upper = basis + dev
lower = basis - dev

p1 = plot(upper, "Upper", color=color.teal)
p2 = plot(lower, "Lower", color=color.teal)
plot(basis, "Basis", color=color.orange)
fill(p1, p2, color=color.new(color.teal, 90))
`
  },
  {
    name: 'rsi',
    label: 'RSI (14)',
    code: `//@version=5
indicator("RSI", overlay=false)

rsiValue = ta.rsi(close, 14)
plot(rsiValue, "RSI", color=color.purple, linewidth=2)
hline(70, "Overbought", color=color.red, linestyle=hline.style_dashed)
hline(30, "Oversold", color=color.green, linestyle=hline.style_dashed)
`
  },
  {
    name: 'supertrend',
    label: 'Supertrend',
    code: `//@version=5
indicator("Supertrend", overlay=true)

atrPeriod = 10
factor = 3.0

[superTrend, direction] = ta.supertrend(factor, atrPeriod)
upTrend = plot(direction < 0 ? superTrend : na, "Up Trend", color=color.green, style=plot.style_linebr, linewidth=2)
downTrend = plot(direction < 0 ? na : superTrend, "Down Trend", color=color.red, style=plot.style_linebr, linewidth=2)
`
  },
  {
    name: 'macd',
    label: 'MACD',
    code: `//@version=5
indicator("MACD", overlay=false)

[macdLine, signalLine, histLine] = ta.macd(close, 12, 26, 9)
plot(macdLine, color=color.blue, title="MACD", linewidth=2)
plot(signalLine, color=color.orange, title="Signal", linewidth=2)
plot(histLine, style=plot.style_columns, color=histLine >= 0 ? color.green : color.red, title="Histogram")
`
  }
]

type ModalMode = { kind: 'create' } | { kind: 'edit'; id: string }

function indicatorErrorCount(code: string): number {
  if (!code.trim()) return 0
  return diagnosePineScript(code).filter((d) => d.severity === 'error').length
}

export function PineIndicatorPanel(): React.JSX.Element {
  const pineIndicators = useAppStore((s) => s.pineIndicators)
  const addPineIndicator = useAppStore((s) => s.addPineIndicator)
  const removePineIndicator = useAppStore((s) => s.removePineIndicator)
  const updatePineIndicator = useAppStore((s) => s.updatePineIndicator)
  const togglePineIndicator = useAppStore((s) => s.togglePineIndicator)
  const duplicatePineIndicator = useAppStore((s) => s.duplicatePineIndicator)
  const setActivePineIndicatorId = useAppStore((s) => s.setActivePineIndicatorId)
  const theme = useAppStore((s) => s.theme)

  const [modal, setModal] = useState<ModalMode | null>(null)
  const [draftName, setDraftName] = useState('Custom Indicator')
  const [draftCode, setDraftCode] = useState(BLANK_CODE)
  const [compiledOk, setCompiledOk] = useState(false)
  const [compileAttempted, setCompileAttempted] = useState(false)

  const monacoTheme = theme === 'dark' ? 'kairos-dark' : 'kairos-light'

  const diagnostics: PineDiagnostic[] = useMemo(() => {
    if (!draftCode.trim()) return []
    return diagnosePineScript(draftCode)
  }, [draftCode])

  const errors = useMemo(() => diagnostics.filter((d) => d.severity === 'error'), [diagnostics])
  const warnings = useMemo(() => diagnostics.filter((d) => d.severity === 'warning'), [diagnostics])
  const canAttach = compiledOk && errors.length === 0 && draftCode.trim().length > 0

  const invalidateCompile = () => {
    setCompiledOk(false)
  }

  const openCreate = () => {
    setDraftName('Custom Indicator')
    setDraftCode(BLANK_CODE)
    setCompiledOk(false)
    setCompileAttempted(false)
    setModal({ kind: 'create' })
  }

  const openEdit = (ind: PineIndicatorInstance) => {
    setActivePineIndicatorId(ind.id)
    setDraftName(ind.name)
    setDraftCode(ind.code)
    const clean = indicatorErrorCount(ind.code) === 0 && ind.code.trim().length > 0
    setCompiledOk(clean)
    setCompileAttempted(clean)
    setModal({ kind: 'edit', id: ind.id })
  }

  const closeModal = () => {
    setModal(null)
    setCompileAttempted(false)
    setCompiledOk(false)
  }

  const handleCompile = () => {
    setCompileAttempted(true)
    setCompiledOk(errors.length === 0 && draftCode.trim().length > 0)
  }

  const handlePreset = (val: string) => {
    const found = PRESETS.find((p) => p.name === val)
    if (!found) return
    setDraftName(found.label)
    setDraftCode(found.code)
    setCompiledOk(false)
    setCompileAttempted(false)
  }

  const handleCodeChange = (value: string | undefined) => {
    setDraftCode(value ?? '')
    invalidateCompile()
  }

  const persistDraft = (attach: boolean): string | null => {
    if (!draftCode.trim()) return null
    if (attach && !canAttach) return null

    if (modal?.kind === 'edit') {
      updatePineIndicator(modal.id, {
        name: draftName.trim() || 'Custom Indicator',
        code: draftCode,
        ...(attach ? { enabled: true } : {})
      })
      setActivePineIndicatorId(modal.id)
      return modal.id
    }

    const id = addPineIndicator({
      name: draftName.trim() || 'Custom Indicator',
      code: draftCode
    })
    if (attach) {
      updatePineIndicator(id, { enabled: true })
    }
    return id
  }

  const handleSave = () => {
    if (errors.length > 0) {
      setCompileAttempted(true)
      setCompiledOk(false)
      return
    }
    persistDraft(false)
    closeModal()
  }

  const handleSaveAndAttach = () => {
    if (!canAttach) {
      setCompileAttempted(true)
      setCompiledOk(errors.length === 0 && draftCode.trim().length > 0)
      return
    }
    persistDraft(true)
    closeModal()
  }

  const handleAttachToggle = (ind: PineIndicatorInstance) => {
    if (ind.enabled) {
      togglePineIndicator(ind.id)
      return
    }
    if (indicatorErrorCount(ind.code) > 0) return
    togglePineIndicator(ind.id)
  }

  const attachedCount = pineIndicators.filter((ind) => ind.enabled).length

  const statusById = useMemo(() => {
    const map = new Map<string, { errorCount: number; isValid: boolean }>()
    for (const ind of pineIndicators) {
      const errorCount = indicatorErrorCount(ind.code)
      map.set(ind.id, {
        errorCount,
        isValid: errorCount === 0 && ind.code.trim().length > 0
      })
    }
    return map
  }, [pineIndicators])

  return (
    <>
      <div className="pine-title-row">
        <div>
          <h3>Pine Script Indicators</h3>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            Manage your library, then attach clean scripts to the chart.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Icon name="plus" size={13} />
          Add Indicator
        </Button>
      </div>

      <div className="pine-stack-container">
        <div className="pine-stack-toolbar">
          <div className="pine-stack-heading">
            <span className="pine-stack-label">Library</span>
            <span className="pine-stack-count">{pineIndicators.length}</span>
            {attachedCount > 0 ? (
              <span className="pine-stack-attached">{attachedCount} on chart</span>
            ) : null}
          </div>
        </div>

        {pineIndicators.length === 0 ? (
          <div className="pine-empty-state">
            <p>No indicators yet.</p>
            <Button variant="secondary" size="sm" onClick={openCreate}>
              Add Indicator
            </Button>
          </div>
        ) : (
          <div className="pine-stack-list">
            {pineIndicators.map((ind) => {
              const status = statusById.get(ind.id)
              const errorCount = status?.errorCount ?? 0
              const isValid = status?.isValid ?? false
              return (
                <div
                  key={ind.id}
                  className="pine-stack-item"
                  data-enabled={ind.enabled}
                  data-valid={isValid}
                  onDoubleClick={() => openEdit(ind)}
                >
                  <button
                    type="button"
                    className="pine-eye-toggle"
                    data-visible={ind.enabled}
                    disabled={!ind.enabled && !isValid}
                    onClick={() => handleAttachToggle(ind)}
                    title={
                      ind.enabled
                        ? 'Detach from chart'
                        : isValid
                          ? 'Attach to chart'
                          : 'Fix compile errors before attaching'
                    }
                    aria-label={ind.enabled ? 'Detach from chart' : 'Attach to chart'}
                  >
                    <Icon name={ind.enabled ? 'eye' : 'eyeOff'} size={14} />
                  </button>

                  <div className="pine-item-main">
                    <span className="pine-item-name">{ind.name}</span>
                    <span className="pine-item-meta">
                      {ind.enabled ? 'Attached' : 'Library only'}
                    </span>
                  </div>

                  {isValid ? (
                    <Badge variant="bull" size="sm">
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="bear" size="sm">
                      {errorCount || 1} {errorCount === 1 ? 'error' : 'errors'}
                    </Badge>
                  )}

                  <div className="pine-item-actions">
                    <button
                      type="button"
                      className="pine-item-btn"
                      onClick={() => openEdit(ind)}
                      title="Edit indicator"
                      aria-label="Edit indicator"
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    <button
                      type="button"
                      className="pine-item-btn"
                      onClick={() => duplicatePineIndicator(ind.id)}
                      title="Duplicate indicator"
                      aria-label="Duplicate indicator"
                    >
                      <Icon name="copy" size={13} />
                    </button>
                    <button
                      type="button"
                      className="pine-item-btn danger"
                      onClick={() => removePineIndicator(ind.id)}
                      title="Delete indicator"
                      aria-label="Delete indicator"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal ? (
        <Modal
          title={modal.kind === 'create' ? 'New Indicator' : `Edit: ${draftName || 'Indicator'}`}
          stamp="Pine Script"
          subtitle="Write Pine, compile it, then choose whether to attach it to the chart."
          open
          onClose={closeModal}
          size="lg"
          footer={
            <div className="pine-modal-footer">
              <div className="pine-modal-footer-status">
                {!compileAttempted ? (
                  <Badge variant="stamp">Not compiled yet</Badge>
                ) : errors.length > 0 ? (
                  <Badge variant="bear">
                    {errors.length} {errors.length === 1 ? 'error' : 'errors'}
                  </Badge>
                ) : warnings.length > 0 ? (
                  <Badge variant="stamp">
                    Compiled · {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
                  </Badge>
                ) : (
                  <Badge variant="bull">Compiled successfully</Badge>
                )}
              </div>
              <div className="pine-modal-footer-actions">
                <Button variant="ghost" onClick={closeModal}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={handleCompile}>
                  Compile
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSave}
                  disabled={errors.length > 0 || !draftCode.trim()}
                >
                  Save
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveAndAttach}
                  disabled={!canAttach}
                  title={canAttach ? 'Save and attach to chart' : 'Compile with no errors first'}
                >
                  Save & Attach
                </Button>
              </div>
            </div>
          }
        >
          <div className="pine-modal-form">
            <div className="pine-modal-fields">
              <FormField label="Name" className="field">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Indicator name"
                />
              </FormField>
              <FormField label="Preset" className="field">
                <Dropdown
                  ariaLabel="Preset Template"
                  options={[
                    { value: '', label: 'Load preset…' },
                    ...PRESETS.map((p) => ({ value: p.name, label: p.label }))
                  ]}
                  value=""
                  onChange={handlePreset}
                />
              </FormField>
            </div>

            <div className="pine-editor-header-bar">
              <span className="field-title">Script Source</span>
              <div className="pine-status-pill-box">
                {errors.length > 0 ? (
                  <Badge variant="bear" size="sm">
                    {errors.length} {errors.length === 1 ? 'error' : 'errors'}
                  </Badge>
                ) : draftCode.trim() ? (
                  <Badge variant="bull" size="sm">
                    Syntax clean
                  </Badge>
                ) : (
                  <Badge variant="stamp" size="sm">
                    Empty
                  </Badge>
                )}
              </div>
            </div>

            <div className="pine-modal-editor">
              <Editor
                height="420px"
                language="pinescript"
                theme={monacoTheme}
                value={draftCode}
                onChange={handleCodeChange}
                beforeMount={registerLabLanguages}
                options={{
                  minimap: { enabled: true },
                  lineNumbers: 'on',
                  lineNumbersMinChars: 4,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Mono, monospace',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  tabSize: 2
                }}
              />
            </div>

            {diagnostics.length > 0 ? (
              <div className="pine-diagnostics-list modal-diagnostics">
                {diagnostics.slice(0, 30).map((diag, idx) => (
                  <div key={idx} className={`pine-diagnostic-item ${diag.severity}`}>
                    <span className="diag-line">
                      L{diag.line}:{diag.column}
                    </span>
                    <span className="diag-msg">{diag.message}</span>
                  </div>
                ))}
                {diagnostics.length > 30 ? (
                  <div className="pine-diagnostics-more">
                    …and {diagnostics.length - 30} more
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
