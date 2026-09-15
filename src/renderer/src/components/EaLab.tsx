import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { BrandMark } from './BrandMark'
import { EaChatPanel } from './EaChatPanel'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { shouldLiveApplyBlock } from '../lib/extractCodeBlocks'
import { registerMql5Language } from '../lib/mql5Language'
import { useAppStore } from '../store/useAppStore'
import { useEaChatStore } from '../store/useEaChatStore'
import { useEaLabStore } from '../store/useEaLabStore'

function revealWriteHead(instance: MonacoEditor.IStandaloneCodeEditor): number {
  const model = instance.getModel()
  if (!model) return 1
  const line = model.getLineCount()
  const column = model.getLineMaxColumn(line)
  instance.setPosition({ lineNumber: line, column })
  instance.revealPositionInCenterIfOutsideViewport({ lineNumber: line, column })
  return line
}

export function EaLab(): React.JSX.Element {
  const goHome = useAppStore((s) => s.goHome)
  const enterSettings = useAppStore((s) => s.enterSettings)
  const theme = useAppStore((s) => s.theme)
  const scripts = useEaLabStore((s) => s.scripts)
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
  const sending = useEaChatStore((s) => s.sending)
  const streamBlock = useEaChatStore((s) => s.streamBlock)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decoRef = useRef<string[]>([])
  const writing = sending && Boolean(streamBlock && shouldLiveApplyBlock(streamBlock.content))

  useEffect(() => {
    void loadScripts()
  }, [loadScripts])

  useEffect(() => {
    if (!dirty || !activeScriptId || sending) return
    const timer = window.setTimeout(() => {
      void saveActiveScript({ quiet: true })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [draftCode, dirty, activeScriptId, sending, saveActiveScript])

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

  const activeScript = scripts.find((s) => s.id === activeScriptId)
  const monacoTheme = theme === 'dark' ? 'quantify-dark' : 'quantify-light'
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
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      glyphMargin: false,
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
          <BrandMark subtitle="EA development" />
        </div>
        <div className="top-controls" />
        <div className="session-chip">
          <button type="button" className="icon-btn" onClick={goHome} title="Home" aria-label="Home">
            <Icon name="home" />
          </button>
          <ThemeToggle />
          <button
            type="button"
            className="icon-btn"
            onClick={() => void createScript()}
            title="New script"
            aria-label="New script"
          >
            <Icon name="plus" />
          </button>
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
          <div className="ea-lab-sidebar-head">
            <span className="stamp">Explorer</span>
            <span className="ea-lab-sidebar-count">{scripts.length}</span>
          </div>
          {scripts.length === 0 ? (
            <p className="ea-lab-empty">No scripts yet. Create one to open the editor.</p>
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
                          <em>.mq5</em>
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
                    onClick={() => setPendingDelete({ id: s.id, name: s.name })}
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
                    <em>.mq5</em>
                  </span>
                  {dirty ? <span className="ea-lab-tab-dot" aria-label="Unsaved changes" /> : null}
                </div>
              ) : (
                <span className="ea-lab-tab-empty">No file open</span>
              )}
            </div>
            <div className="ea-lab-editor-actions">
              {writing ? <span className="ea-lab-writing-stamp">Writing</span> : null}
            </div>
          </div>
          <div className="ea-lab-editor-body">
            {activeScriptId ? (
              <Editor
                height="100%"
                language="mql5"
                theme={monacoTheme}
                value={draftCode}
                onChange={(value) => {
                  if (useEaChatStore.getState().sending) return
                  updateDraftCode(value ?? '')
                }}
                beforeMount={registerMql5Language}
                onMount={(instance, monacoApi) => {
                  registerMql5Language(monacoApi)
                  editorRef.current = instance
                  instance.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => {
                    const state = useEaLabStore.getState()
                    if (!state.activeScriptId || !state.dirty || useEaChatStore.getState().sending) {
                      return
                    }
                    void state.saveActiveScript({ quiet: true })
                  })
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
                <p>Create a script to start editing.</p>
                <button type="button" className="primary icon-label" onClick={() => void createScript()}>
                  <Icon name="plus" />
                  New script
                </button>
              </div>
            )}
          </div>
          <div className="ea-lab-status">
            <span>
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span>MQL5</span>
            <span>UTF-8</span>
            <span className="ea-lab-status-end">{dirty ? 'Unsaved' : 'Saved'}</span>
          </div>
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
                <h2 id="ea-lab-delete-title">Delete script</h2>
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
              Delete {pendingDelete.name}.mq5? This cannot be undone.
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
                  void deleteScript(id)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
