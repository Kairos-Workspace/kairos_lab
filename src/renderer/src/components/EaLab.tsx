import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { BrandMark } from './BrandMark'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { registerMql5Language } from '../lib/mql5Language'
import { useAppStore } from '../store/useAppStore'
import { useEaLabStore } from '../store/useEaLabStore'

export function EaLab(): React.JSX.Element {
  const goHome = useAppStore((s) => s.goHome)
  const enterAiSettings = useAppStore((s) => s.enterAiSettings)
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

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    void loadScripts()
  }, [loadScripts])

  function startRename(id: string, name: string): void {
    setRenamingId(id)
    setRenameValue(name)
  }

  function commitRename(id: string): void {
    void renameScript(id, renameValue)
    setRenamingId(null)
  }

  const activeScript = scripts.find((s) => s.id === activeScriptId)

  return (
    <div className="app" data-frame="ea-lab">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle="EA development" />
        </div>
        <div className="top-controls">
          <span className="chip">{scripts.length} scripts</span>
        </div>
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
            onClick={enterAiSettings}
            title="AI settings"
            aria-label="AI settings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <section className="ea-lab-body">
        <aside className="ea-lab-sidebar">
          {scripts.length === 0 ? (
            <p className="ea-lab-empty">No EA scripts yet. Create one to get started.</p>
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
                      onClick={() => selectScript(s.id)}
                    >
                      <strong>{s.name}</strong>
                      <span>{new Date(s.updatedAt).toLocaleString()}</span>
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
                  <ConfirmIconButton
                    icon="trash"
                    label="Delete script"
                    confirmLabel={`Click again to delete ${s.name}`}
                    onConfirm={() => void deleteScript(s.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="ea-lab-editor">
          <div className="ea-lab-editor-toolbar">
            <span className="stamp">{activeScript?.name ?? 'No script selected'}</span>
            <button
              type="button"
              className="primary icon-label"
              disabled={!activeScriptId || !dirty}
              onClick={() => void saveActiveScript()}
            >
              <Icon name="save" />
              Save
            </button>
          </div>
          <div className="ea-lab-editor-body">
            {activeScriptId ? (
              <Editor
                height="100%"
                language="mql5"
                theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                value={draftCode}
                onChange={(value) => updateDraftCode(value ?? '')}
                beforeMount={registerMql5Language}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  automaticLayout: true,
                  scrollBeyondLastLine: false
                }}
              />
            ) : (
              <p className="ea-lab-empty">Create a script to start editing.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
