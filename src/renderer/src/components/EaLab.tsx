import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { editor as MonacoEditor } from 'monaco-editor'
import { diagnosePineScript, type PineDiagnostic } from '@core/indicators/pinePreview'
import {
  fileExtension,
  labCopy,
  languageLabel,
  monacoLanguage,
  scriptLanguage,
  type ScriptKind,
  type ScriptLanguage
} from '@shared/scriptLab'
import type { HeadlessBacktestResult } from '@core/ea/headlessBacktest'
import { BrandMark } from './BrandMark'
import { BotBacktestModal, type BotBacktestConfig } from './BotBacktestModal'
import { BotBacktestResultModal } from './BotBacktestResultModal'
import { EaChatPanel } from './EaChatPanel'
import { Icon } from './Icon'
import { IndicatorChart } from './IndicatorChart'
import { ThemeToggle } from './ThemeToggle'
import { shouldLiveApplyBlock } from '../lib/extractCodeBlocks'
import { registerLabLanguages } from '../lib/mql5Language'
import { useAppStore } from '../store/useAppStore'
import { useEaChatStore } from '../store/useEaChatStore'
import { useEaLabStore } from '../store/useEaLabStore'

function scriptExt(script: { kind: ScriptKind; language?: ScriptLanguage }): string {
  return fileExtension(scriptLanguage(script.kind, script.language), script.kind)
}

function NewIndicatorMenu({
  onCreate
}: {
  onCreate: (language: ScriptLanguage) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent): void {
      if (wrapRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="ea-lab-new-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        data-active={open}
        onClick={() => setOpen((value) => !value)}
        title="New indicator"
        aria-label="New indicator"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon name="plus" />
      </button>
      {open ? (
        <div className="ea-lab-new-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onCreate('mql5')
            }}
          >
            <strong>MQL5</strong>
            <span>MetaTrader indicator</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onCreate('pinescript')
            }}
          >
            <strong>Pine Script</strong>
            <span>TradingView indicator</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function revealWriteHead(instance: MonacoEditor.IStandaloneCodeEditor): number {
  const model = instance.getModel()
  if (!model) return 1
  const line = model.getLineCount()
  const column = model.getLineMaxColumn(line)
  instance.setPosition({ lineNumber: line, column })
  instance.revealPositionInCenterIfOutsideViewport({ lineNumber: line, column })
  return line
}

export function EaLab({ kind }: { kind: ScriptKind }): React.JSX.Element {
  const goHome = useAppStore((s) => s.goHome)
  const enterSettings = useAppStore((s) => s.enterSettings)
  const theme = useAppStore((s) => s.theme)
  const setKind = useEaLabStore((s) => s.setKind)
  const allScripts = useEaLabStore((s) => s.scripts)
  const scripts = useMemo(() => allScripts.filter((s) => s.kind === kind), [allScripts, kind])
  const activeScriptId = useEaLabStore((s) => s.activeScriptId)
  const draftCode = useEaLabStore((s) => s.draftCode)
  const dirty = useEaLabStore((s) => s.dirty)
  const loadScripts = useEaLabStore((s) => s.loadScripts)
  const createScript = useEaLabStore((s) => s.createScript)
  const selectScript = useEaLabStore((s) => s.selectScript)
  const updateDraftCode = useEaLabStore((s) => s.updateDraftCode)
  const saveActiveScript = useEaLabStore((s) => s.saveActiveScript)
  const renameScript = useEaLabStore((s) => s.renameScript)
  const deleteScript = useEaLabStore((s) => s.deleteScript)
  const eaDiagnostics = useEaLabStore((s) => s.diagnostics)
  const compileStatus = useEaLabStore((s) => s.compileStatus)
  const compileActive = useEaLabStore((s) => s.compileActive)
  const runBacktest = useEaLabStore((s) => s.runBacktest)
  const sending = useEaChatStore((s) => s.sending)
  const streamBlock = useEaChatStore((s) => s.streamBlock)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [labPage, setLabPage] = useState<'editor' | 'chart'>('editor')
  const [overlayId, setOverlayId] = useState<string | null>(null)
  const [pineDiagnostics, setPineDiagnostics] = useState<PineDiagnostic[]>([])
  const [editorEpoch, setEditorEpoch] = useState(0)
  const pendingJump = useRef<{ line: number; column: number } | null>(null)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    name: string
    language: ScriptLanguage
  } | null>(null)
  const [backtestOpen, setBacktestOpen] = useState(false)
  const [backtestBusy, setBacktestBusy] = useState(false)
  const [backtestResult, setBacktestResult] = useState<{
    scriptName: string
    symbol: string
    config: BotBacktestConfig
    result: HeadlessBacktestResult
  } | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const decoRef = useRef<string[]>([])
  const writing = sending && Boolean(streamBlock && shouldLiveApplyBlock(streamBlock.content))
  const copy = labCopy(kind)

  function openBacktestModal(): void {
    if (kind !== 'ea' || !activeScriptId || sending) return
    setBacktestOpen(true)
  }

  async function confirmBacktest(config: BotBacktestConfig): Promise<void> {
    setBacktestBusy(true)
    try {
      const outcome = await runBacktest(config)
      if (!outcome.ok) return
      if (outcome.mode === 'visual') {
        setBacktestOpen(false)
        return
      }
      const name =
        useEaLabStore.getState().scripts.find((s) => s.id === useEaLabStore.getState().activeScriptId)
          ?.name ?? 'Bot'
      setBacktestOpen(false)
      setBacktestResult({
        scriptName: name,
        symbol: config.symbol,
        config,
        result: outcome.result
      })
    } finally {
      setBacktestBusy(false)
    }
  }

  useEffect(() => {
    setKind(kind)
    void loadScripts()
    if (kind !== 'indicator') setLabPage('editor')
  }, [kind, setKind, loadScripts])

  useEffect(() => {
    if (!overlayId) return
    if (scripts.some((script) => script.id === overlayId)) return
    setOverlayId(null)
  }, [scripts, overlayId])

  useEffect(() => {
    if (!dirty || !activeScriptId || sending) return
    const timer = window.setTimeout(() => {
      void saveActiveScript({ quiet: true })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [draftCode, dirty, activeScriptId, sending, saveActiveScript])

  useEffect(() => {
    const language = scriptLanguage(kind, scripts.find((s) => s.id === activeScriptId)?.language)
    if (kind !== 'indicator' || language !== 'pinescript') {
      setPineDiagnostics([])
      return
    }
    if (labPage === 'chart') return
    const timer = window.setTimeout(() => {
      setPineDiagnostics(diagnosePineScript(draftCode))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [kind, scripts, activeScriptId, draftCode, labPage])

  useEffect(() => {
    const instance = editorRef.current
    const model = instance?.getModel()
    const monacoApi = monacoRef.current
    if (!model || !monacoApi) return
    monacoApi.editor.setModelMarkers(
      model,
      'quantify-pine',
      pineDiagnostics.map((row) => ({
        startLineNumber: row.line,
        startColumn: Math.max(1, row.column),
        endLineNumber: row.line,
        endColumn: Math.max(row.column + row.length, row.column + 1),
        message: row.message,
        severity:
          row.severity === 'error'
            ? monacoApi.MarkerSeverity.Error
            : monacoApi.MarkerSeverity.Warning
      }))
    )
    return () => monacoApi.editor.setModelMarkers(model, 'quantify-pine', [])
  }, [pineDiagnostics, activeScriptId, labPage, editorEpoch])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    const monacoApi = monacoRef.current
    if (!model || !monacoApi) return
    monacoApi.editor.setModelMarkers(
      model,
      'ea-dsl',
      kind === 'ea'
        ? eaDiagnostics.map((row) => ({
            startLineNumber: row.line,
            startColumn: Math.max(1, row.column),
            endLineNumber: row.line,
            endColumn: Math.max(row.column + (row.length ?? 1), row.column + 1),
            message: row.message,
            severity:
              row.severity === 'error'
                ? monacoApi.MarkerSeverity.Error
                : monacoApi.MarkerSeverity.Warning
          }))
        : []
    )
    return () => monacoApi.editor.setModelMarkers(model, 'ea-dsl', [])
  }, [kind, eaDiagnostics, activeScriptId, editorEpoch])

  useEffect(() => {
    if (!pendingDelete) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setPendingDelete(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingDelete])

  useEffect(() => {
    return () => {
      const state = useEaLabStore.getState()
      // Don't persist a half-streamed AI draft just because the user
      // navigated away from EA Lab while a reply was still writing to it.
      if (state.dirty && state.activeScriptId && !useEaChatStore.getState().sending) {
        void state.saveActiveScript({ quiet: true })
      }
    }
  }, [])

  useEffect(() => {
    const instance = editorRef.current
    if (!instance) return
    if (!writing) {
      decoRef.current = instance.deltaDecorations(decoRef.current, [])
      return
    }
    const line = revealWriteHead(instance)
    decoRef.current = instance.deltaDecorations(decoRef.current, [
      {
        range: {
          startLineNumber: Math.max(1, line - 1),
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          className: 'ea-lab-stream-line',
          linesDecorationsClassName: 'ea-lab-stream-gutter'
        }
      }
    ])
    setCursor({ line, column: instance.getModel()?.getLineMaxColumn(line) ?? 1 })
  }, [draftCode, writing])

  function startRename(id: string, name: string): void {
    setRenamingId(id)
    setRenameValue(name)
  }

  function commitRename(id: string): void {
    void renameScript(id, renameValue)
    setRenamingId(null)
  }

  function goToDiagnostic(row: PineDiagnostic): void {
    pendingJump.current = { line: row.line, column: row.column }
    if (labPage !== 'editor') {
      setLabPage('editor')
      return
    }
    const instance = editorRef.current
    if (!instance) return
    pendingJump.current = null
    instance.revealLineInCenter(row.line)
    instance.setPosition({ lineNumber: row.line, column: Math.max(1, row.column) })
    instance.focus()
    setCursor({ line: row.line, column: Math.max(1, row.column) })
  }

  const activeScript = scripts.find((s) => s.id === activeScriptId)
  const activeLanguage = scriptLanguage(kind, activeScript?.language)
  const pineErrorCount = pineDiagnostics.filter((row) => row.severity === 'error').length
  const eaErrorCount = eaDiagnostics.filter((row) => row.severity === 'error').length
  const diagLabel =
    kind !== 'indicator'
      ? null
      : activeLanguage === 'pinescript'
        ? pineErrorCount
          ? `${pineErrorCount} error${pineErrorCount === 1 ? '' : 's'}`
          : 'No issues'
        : 'MQL5 not checked'
  const compileLabel =
    kind !== 'ea' || compileStatus === 'idle'
      ? null
      : compileStatus === 'ok'
        ? 'Bot rules OK · ready to backtest'
        : `${eaErrorCount} error${eaErrorCount === 1 ? '' : 's'}`
  const monacoTheme = theme === 'dark' ? 'kairos-dark' : 'kairos-light'
  const editorOptions = useMemo<MonacoEditor.IStandaloneEditorConstructionOptions>(
    () => ({
      fontFamily: "'IBM Plex Mono', Menlo, Monaco, monospace",
      fontSize: 13,
      fontLigatures: false,
      lineHeight: 22,
      letterSpacing: 0.2,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      readOnly: sending,
      cursorBlinking: writing ? 'phase' : 'smooth',
      renderLineHighlight: 'all',
      padding: { top: 12, bottom: 18 },
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false
      },
      overviewRulerLanes: 2,
      hideCursorInOverviewRuler: true,
      glyphMargin: true,
      folding: true,
      lineNumbersMinChars: 3,
      renderWhitespace: 'selection',
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'off',
      matchBrackets: 'always',
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: true },
      stickyScroll: { enabled: true }
    }),
    [sending, writing]
  )

  return (
    <div className="app" data-frame="ea-lab">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle={copy.brandSubtitle} />
        </div>
        <div className="top-controls" />
        <div className="session-chip">
          <button type="button" className="icon-btn" onClick={goHome} title="Home" aria-label="Home">
            <Icon name="home" />
          </button>
          <ThemeToggle />
          {kind === 'indicator' ? (
            <NewIndicatorMenu onCreate={(language) => void createScript(language)} />
          ) : (
            <button
              type="button"
              className="icon-btn"
              onClick={() => void createScript('mql5')}
              title={copy.newFileTitle}
              aria-label={copy.newFileTitle}
            >
              <Icon name="plus" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            data-active={showChat}
            onClick={() => setShowChat((v) => !v)}
            title="AI chat"
            aria-label="AI chat"
          >
            <Icon name="chat" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={enterSettings}
            title="Settings"
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <section className="ea-lab-body" data-chat-open={showChat}>
        <aside className="ea-lab-sidebar">
          <div className="ea-lab-sidebar-head" data-pages={kind === 'indicator'}>
            {kind === 'indicator' ? (
              <div className="ea-lab-page-tabs" role="tablist" aria-label="Indicator Lab views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={labPage === 'editor'}
                  data-active={labPage === 'editor'}
                  onClick={() => setLabPage('editor')}
                >
                  Editor
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={labPage === 'chart'}
                  data-active={labPage === 'chart'}
                  onClick={() => setLabPage('chart')}
                >
                  Chart
                </button>
              </div>
            ) : (
              <>
                <span className="stamp">Explorer</span>
                <span className="ea-lab-sidebar-count">{scripts.length}</span>
              </>
            )}
          </div>
          {kind === 'ea' ? (
            <p className="ea-lab-empty">
              Write bot rules here (or ask AI). Check, then Run backtest. MQL5 export comes later.
            </p>
          ) : null}
          {scripts.length === 0 ? (
            <p className="ea-lab-empty">{copy.emptyExplorer}</p>
          ) : (
            <ul className="ea-lab-script-list">
              {scripts.map((s) => (
                <li key={s.id} className="ea-lab-script-item" data-active={s.id === activeScriptId}>
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      className="ea-lab-rename-input"
                      aria-label={`Rename ${s.name}`}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(s.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="ea-lab-script-button"
                      onClick={() => void selectScript(s.id)}
                    >
                      <Icon name="file" size={13} />
                      <span className="ea-lab-script-copy">
                        <strong>
                          {s.name}
                          <em>{scriptExt(s)}</em>
                        </strong>
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    title="Rename"
                    aria-label={`Rename ${s.name}`}
                    onClick={() => startRename(s.id, s.name)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Delete"
                    aria-label={`Delete ${s.name}`}
                    onClick={() =>
                      setPendingDelete({
                        id: s.id,
                        name: s.name,
                        language: scriptLanguage(s.kind, s.language)
                      })
                    }
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="ea-lab-editor" data-writing={writing ? 'true' : 'false'}>
          <div className="ea-lab-editor-toolbar">
            <div className="ea-lab-tabs">
              {activeScript ? (
                <div className="ea-lab-tab" data-active="true" data-dirty={dirty}>
                  <Icon name="file" size={12} />
                  <span>
                    {activeScript.name}
                    <em>{scriptExt(activeScript)}</em>
                  </span>
                  {dirty ? <span className="ea-lab-tab-dot" aria-label="Unsaved changes" /> : null}
                </div>
              ) : (
                <span className="ea-lab-tab-empty">No file open</span>
              )}
            </div>
            <div className="ea-lab-editor-actions">
              {writing ? <span className="ea-lab-writing-stamp">Writing</span> : null}
              {kind === 'ea' && activeScriptId ? (
                <>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Check bot rules"
                    aria-label="Check bot rules"
                    disabled={sending}
                    onClick={() => void compileActive()}
                  >
                    <Icon name="check" />
                  </button>
                  <button
                    type="button"
                    className="primary icon-label"
                    title="Run backtest in Kairos"
                    disabled={sending}
                    onClick={openBacktestModal}
                  >
                    <Icon name="play" />
                    Run backtest
                  </button>
                  <button
                    type="button"
                    className="ghost icon-label"
                    title="Export to MetaTrader MQL5 — coming soon"
                    aria-label="Export to MQL5 coming soon"
                    disabled
                  >
                    Export MQL5
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="ea-lab-editor-body">
            {kind === 'indicator' && labPage === 'chart' ? (
              <IndicatorChart
                scripts={scripts}
                activeScriptId={activeScriptId}
                draftCode={draftCode}
                overlayId={overlayId}
                onOverlayChange={setOverlayId}
              />
            ) : activeScriptId ? (
              <Editor
                height="100%"
                language={monacoLanguage(scriptLanguage(kind, activeScript?.language))}
                theme={monacoTheme}
                value={draftCode}
                onChange={(value) => {
                  if (useEaChatStore.getState().sending) return
                  updateDraftCode(value ?? '')
                }}
                beforeMount={registerLabLanguages}
                onMount={(instance, monacoApi) => {
                  registerLabLanguages(monacoApi)
                  editorRef.current = instance
                  monacoRef.current = monacoApi
                  setEditorEpoch((value) => value + 1)
                  const jump = pendingJump.current
                  if (jump) {
                    pendingJump.current = null
                    instance.revealLineInCenter(jump.line)
                    instance.setPosition({
                      lineNumber: jump.line,
                      column: Math.max(1, jump.column)
                    })
                    instance.focus()
                    setCursor({ line: jump.line, column: Math.max(1, jump.column) })
                  }
                  instance.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => {
                    const state = useEaLabStore.getState()
                    if (!state.activeScriptId || !state.dirty || useEaChatStore.getState().sending) {
                      return
                    }
                    void state.saveActiveScript({ quiet: true })
                  })
                  instance.addCommand(
                    monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter,
                    () => {
                      if (useEaLabStore.getState().kind !== 'ea') return
                      if (useEaChatStore.getState().sending) return
                      setBacktestOpen(true)
                    }
                  )
                  instance.onDidChangeCursorPosition((event) => {
                    setCursor({
                      line: event.position.lineNumber,
                      column: event.position.column
                    })
                  })
                }}
                options={editorOptions}
              />
            ) : (
              <div className="ea-lab-editor-empty">
                <p>{copy.emptyEditor}</p>
                {kind === 'indicator' ? (
                  <div className="ea-lab-empty-actions">
                    <button
                      type="button"
                      className="primary icon-label"
                      onClick={() => void createScript('mql5')}
                    >
                      <Icon name="plus" />
                      New MQL5
                    </button>
                    <button
                      type="button"
                      className="primary icon-label"
                      onClick={() => void createScript('pinescript')}
                    >
                      <Icon name="plus" />
                      New Pine Script
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="primary icon-label"
                    onClick={() => void createScript('mql5')}
                  >
                    <Icon name="plus" />
                    {copy.newFile}
                  </button>
                )}
              </div>
            )}
          </div>
          {kind === 'ea' && eaDiagnostics.length > 0 ? (
            <div className="ea-lab-problems" role="list">
              {eaDiagnostics.map((row, index) => (
                <button
                  key={`${row.line}:${row.column}:${index}`}
                  type="button"
                  className="ea-lab-problem"
                  data-severity={row.severity}
                  role="listitem"
                  onClick={() => {
                    const instance = editorRef.current
                    if (!instance) return
                    const column = Math.max(1, row.column)
                    instance.setPosition({ lineNumber: row.line, column })
                    instance.revealLineInCenter(row.line)
                    instance.focus()
                    setCursor({ line: row.line, column })
                  }}
                >
                  <strong>
                    Ln {row.line}:{row.column}
                  </strong>
                  <span>{row.message}</span>
                </button>
              ))}
            </div>
          ) : null}
          {kind === 'indicator' && pineDiagnostics.length > 0 ? (
            <div className="ea-lab-problems" role="status">
              {pineDiagnostics.map((row, index) => (
                <button
                  key={`${row.line}-${row.column}-${index}`}
                  type="button"
                  className="ea-lab-problem"
                  data-severity={row.severity}
                  onClick={() => goToDiagnostic(row)}
                >
                  <strong>Ln {row.line}</strong>
                  <span>{row.message}</span>
                </button>
              ))}
            </div>
          ) : null}
          {labPage === 'chart' && kind === 'indicator' ? (
            <div className="ea-lab-status">
              <span>Chart</span>
              <span>{overlayId ? scripts.find((s) => s.id === overlayId)?.name ?? 'Overlay' : 'No overlay'}</span>
              {diagLabel ? (
                <span className="ea-lab-diag" data-kind={pineErrorCount ? 'error' : 'ok'}>
                  {diagLabel}
                </span>
              ) : null}
              <span className="ea-lab-status-end">{dirty ? 'Unsaved' : 'Saved'}</span>
            </div>
          ) : (
            <div className="ea-lab-status">
              <span>
                Ln {cursor.line}, Col {cursor.column}
              </span>
              <span>{languageLabel(activeLanguage, kind)}</span>
              <span>UTF-8</span>
              {diagLabel ? (
                <span className="ea-lab-diag" data-kind={pineErrorCount ? 'error' : 'ok'}>
                  {diagLabel}
                </span>
              ) : null}
              {compileLabel ? (
                <span
                  className="ea-lab-diag"
                  data-kind={compileStatus === 'error' ? 'error' : 'ok'}
                >
                  {compileLabel}
                </span>
              ) : null}
              <span className="ea-lab-status-end">{dirty ? 'Unsaved' : 'Saved'}</span>
            </div>
          )}
        </div>

        {showChat ? <EaChatPanel /> : null}
      </section>

      {pendingDelete ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ea-lab-delete-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null)
          }}
        >
          <div className="composer">
            <header>
              <div>
                <span className="stamp">Explorer</span>
                <h2 id="ea-lab-delete-title">{copy.deleteTitle}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPendingDelete(null)}
                title="Close"
                aria-label="Close"
              >
                <Icon name="close" />
              </button>
            </header>
            <p className="composer-hint">
              Delete {pendingDelete.name}
              {fileExtension(pendingDelete.language, kind)}? This cannot be undone.
            </p>
            <div className="composer-actions">
              <button type="button" className="ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const id = pendingDelete.id
                  setPendingDelete(null)
                  if (overlayId === id) setOverlayId(null)
                  void deleteScript(id)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {backtestOpen && kind === 'ea' ? (
        <BotBacktestModal
          scriptName={activeScript?.name ?? 'Bot'}
          busy={backtestBusy}
          onClose={() => {
            if (backtestBusy) return
            setBacktestOpen(false)
          }}
          onConfirm={confirmBacktest}
        />
      ) : null}

      {backtestResult ? (
        <BotBacktestResultModal
          scriptName={backtestResult.scriptName}
          symbol={backtestResult.symbol}
          result={backtestResult.result}
          onClose={() => setBacktestResult(null)}
          onOpenVisual={() => {
            const { config } = backtestResult
            setBacktestResult(null)
            void runBacktest({ ...config, visualize: true })
          }}
        />
      ) : null}
    </div>
  )
}
