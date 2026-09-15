import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { EaChatAttachedFile, EaChatMessage, EaScript } from '@shared/types'
import { stripScriptDirectives } from '@shared/chatDirectives'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { modelLabel, pickValidProviderId } from '../lib/aiProviders'
import { MarkdownBlocks } from '../lib/chatMarkdown'
import { extractCodeBlocks, extractScriptName, isFullMql5Script, latestCodeBlock, sanitizeScriptName, shouldLiveApplyBlock } from '../lib/extractCodeBlocks'
import { notifySuccess } from '../lib/notify'
import { useAiProvidersStore } from '../store/useAiProvidersStore'
import { useEaChatStore } from '../store/useEaChatStore'
import { useEaLabStore } from '../store/useEaLabStore'

function mentionAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const match = before.match(/(^|\s)@([^\s]*)$/)
  if (!match) return null
  return { start: before.length - match[2].length - 1, query: match[2] }
}

// Memoized so a finished historical message doesn't re-parse its markdown and
// code fences on every streaming tick of an unrelated, still-in-flight reply.
const AssistantBody = memo(function AssistantBody({
  content,
  targetName,
  showCaret
}: {
  content: string
  targetName: string
  showCaret?: boolean
}): React.JSX.Element {
  return (
    <div className="ea-chat-md">
      {extractCodeBlocks(content, { allowOpenFence: Boolean(showCaret) }).map((segment, i) =>
        segment.type === 'code' ? (
          <CodeWriteCard
            key={i}
            code={segment.content}
            language={segment.language}
            targetName={sanitizeScriptName(segment.filename ?? '') ?? targetName}
            streaming={Boolean(showCaret)}
          />
        ) : segment.type === 'text' && segment.content.trim() ? (
          <MarkdownBlocks key={i} text={stripScriptDirectives(segment.content)} />
        ) : null
      )}
      {showCaret ? <span className="ea-chat-caret" aria-hidden="true" /> : null}
    </div>
  )
})

function CodeWriteCard({
  code,
  language,
  targetName,
  streaming
}: {
  code: string
  language?: string
  targetName: string
  streaming?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const lines = code.split('\n').length
  return (
    <div className="ea-chat-write" data-streaming={streaming ? 'true' : 'false'}>
      <button
        type="button"
        className="ea-chat-write-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ea-chat-code-lang">{language || 'mql5'}</span>
        <span className="ea-chat-write-label">
          {streaming ? `Writing ${targetName}` : targetName}
        </span>
        <span className="ea-chat-write-meta">{lines} lines</span>
      </button>
      {open ? <pre>{code}</pre> : null}
    </div>
  )
}

function UserBubble({ message }: { message: EaChatMessage }): React.JSX.Element {
  return (
    <div className="ea-chat-msg-user">
      <p>{message.content}</p>
    </div>
  )
}

export function EaChatPanel(): React.JSX.Element {
  const scripts = useEaLabStore((s) => s.scripts)
  const activeScriptId = useEaLabStore((s) => s.activeScriptId)
  const draftCode = useEaLabStore((s) => s.draftCode)
  const selectScript = useEaLabStore((s) => s.selectScript)
  const applyCodeToScript = useEaLabStore((s) => s.applyCodeToScript)
  const saveActiveScript = useEaLabStore((s) => s.saveActiveScript)
  const renameScript = useEaLabStore((s) => s.renameScript)

  const providers = useAiProvidersStore((s) => s.providers)
  const loadProviders = useAiProvidersStore((s) => s.loadProviders)
  const loadModels = useAiProvidersStore((s) => s.loadModels)
  const modelsById = useAiProvidersStore((s) => s.modelsById)
  const setProviderModel = useAiProvidersStore((s) => s.setProviderModel)

  const messages = useEaChatStore((s) => s.messages)
  const threads = useEaChatStore((s) => s.threads)
  const currentThreadId = useEaChatStore((s) => s.currentThreadId)
  const sending = useEaChatStore((s) => s.sending)
  const thinking = useEaChatStore((s) => s.thinking)
  const streamText = useEaChatStore((s) => s.streamText)
  const streamBlock = useEaChatStore((s) => s.streamBlock)
  const streamThinking = useEaChatStore((s) => s.streamThinking)
  const error = useEaChatStore((s) => s.error)
  const selectedProviderId = useEaChatStore((s) => s.selectedProviderId)
  const loadHistory = useEaChatStore((s) => s.loadHistory)
  const openThread = useEaChatStore((s) => s.openThread)
  const newChat = useEaChatStore((s) => s.newChat)
  const deleteThread = useEaChatStore((s) => s.deleteThread)
  const setCurrentScriptId = useEaChatStore((s) => s.setCurrentScriptId)
  const setSelectedProviderId = useEaChatStore((s) => s.setSelectedProviderId)
  const sendMessage = useEaChatStore((s) => s.sendMessage)

  const [input, setInput] = useState('')
  const [attachedIds, setAttachedIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [pendingDeleteThread, setPendingDeleteThread] = useState<{
    id: string
    title: string
  } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wasSending = useRef(false)
  const writeTargetId = useRef<string | null>(null)
  const lastRenamed = useRef<string | null>(null)

  useEffect(() => {
    void loadProviders()
    void loadHistory()
  }, [loadProviders, loadHistory])

  // Cancels any pending live-apply/finalize for whatever script an abandoned
  // request was writing to. Called from the navigation actions below (not
  // keyed off `currentThreadId`, since a brand-new chat's first reply also
  // sets `currentThreadId` as part of its own legitimate completion, and
  // that case must still finalize normally).
  function cancelPendingWrite(): void {
    writeTargetId.current = null
    wasSending.current = false
  }

  useEffect(() => {
    setCurrentScriptId(activeScriptId)
  }, [activeScriptId, setCurrentScriptId])

  useEffect(() => {
    if (!activeScriptId) {
      setAttachedIds([])
      return
    }
    setAttachedIds((ids) => (ids.includes(activeScriptId) ? ids : [activeScriptId, ...ids]))
  }, [activeScriptId])

  useEffect(() => {
    if (providers.length === 0) return
    const validId = pickValidProviderId(selectedProviderId, providers)
    if (validId !== null && validId !== selectedProviderId) setSelectedProviderId(validId)
  }, [providers, selectedProviderId, setSelectedProviderId])

  useEffect(() => {
    if (selectedProviderId) void loadModels(selectedProviderId)
  }, [selectedProviderId, loadModels])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, thinking, streamText, streamThinking])

  useEffect(() => {
    if (sending && writeTargetId.current === null && activeScriptId) {
      writeTargetId.current = activeScriptId
      lastRenamed.current = null
    }
  }, [sending, activeScriptId])

  useEffect(() => {
    if (!sending || !streamText) return
    const target = writeTargetId.current
    if (!target) return
    const frame = requestAnimationFrame(() => {
      // Reuses the block already parsed once per chunk in the store instead
      // of re-scanning the whole accumulated reply here, and only live-writes
      // once it's an actual EA rewrite — a short conversational snippet must
      // never overwrite the script that's open in the editor.
      const block = streamBlock
      if (block && shouldLiveApplyBlock(block.content) && useEaLabStore.getState().activeScriptId === target) {
        applyCodeToScript(target, block.content)
      }
      const nextName = extractScriptName(streamText, block)
      if (!nextName || lastRenamed.current === nextName) return
      const currentName = useEaLabStore.getState().scripts.find((s) => s.id === target)?.name
      if (currentName === nextName) {
        lastRenamed.current = nextName
        return
      }
      lastRenamed.current = nextName
      void renameScript(target, nextName)
    })
    return () => cancelAnimationFrame(frame)
  }, [sending, streamText, streamBlock, applyCodeToScript, renameScript])

  useEffect(() => {
    if (sending) {
      wasSending.current = true
      return
    }
    if (!wasSending.current) return
    wasSending.current = false
    const target = writeTargetId.current
    writeTargetId.current = null
    if (!target) return
    if (useEaChatStore.getState().error) return
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    const source = last?.content ?? ''
    const nextName = extractScriptName(source)
    const block = latestCodeBlock(source)
    void (async () => {
      if (nextName) await renameScript(target, nextName)
      if (block && isFullMql5Script(block.content)) {
        applyCodeToScript(target, block.content, { quiet: true })
        if (useEaLabStore.getState().activeScriptId === target) {
          await saveActiveScript({ quiet: true })
        }
      }
      const name = useEaLabStore.getState().scripts.find((s) => s.id === target)?.name
      if (nextName || (block && isFullMql5Script(block.content))) {
        notifySuccess(`Updated ${name ?? 'script'}`)
      }
    })()
  }, [sending, messages, applyCodeToScript, saveActiveScript, renameScript])

  const attachedScripts = useMemo(
    () =>
      attachedIds
        .map((id) => scripts.find((s) => s.id === id))
        .filter((s): s is EaScript => Boolean(s)),
    [attachedIds, scripts]
  )

  const pickerOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    return scripts.filter((s) => {
      if (attachedIds.includes(s.id)) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q)
    })
  }, [scripts, attachedIds, pickerQuery])

  useEffect(() => {
    setPickerIndex(0)
  }, [pickerQuery, pickerOpen])

  function attachFile(id: string, replaceMention?: { start: number; end: number }): void {
    setAttachedIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
    if (replaceMention) {
      setInput((value) => value.slice(0, replaceMention.start) + value.slice(replaceMention.end))
    }
    setPickerOpen(false)
    setPickerQuery('')
    inputRef.current?.focus()
  }

  function detachFile(id: string): void {
    setAttachedIds((ids) => ids.filter((item) => item !== id))
  }

  function buildFiles(): EaChatAttachedFile[] {
    return attachedScripts.map((script) => ({
      name: script.name,
      code: script.id === activeScriptId ? draftCode : script.code,
      current: script.id === activeScriptId
    }))
  }

  async function handleSend(): Promise<void> {
    const text = input.trim()
    if (!text || !activeScriptId) return
    setInput('')
    setPickerOpen(false)
    await sendMessage(activeScriptId, buildFiles(), text)
  }

  function onInputChange(value: string, caret: number): void {
    setInput(value)
    const mention = mentionAt(value, caret)
    if (mention) {
      setPickerOpen(true)
      setPickerQuery(mention.query)
      return
    }
    if (pickerOpen && pickerQuery !== '') {
      setPickerOpen(false)
      setPickerQuery('')
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (pickerOpen && pickerOptions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPickerIndex((i) => Math.min(pickerOptions.length - 1, i + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPickerIndex((i) => Math.max(0, i - 1))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const picked = pickerOptions[pickerIndex]
        if (!picked) return
        const caret = event.currentTarget.selectionStart
        const mention = mentionAt(input, caret)
        attachFile(
          picked.id,
          mention ? { start: mention.start, end: caret } : undefined
        )
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setPickerOpen(false)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const providerOptions = providers.map((p) => ({ value: p.id, label: p.name }))
  const workingFile = scripts.find((s) => s.id === activeScriptId)
  const applyTargetName = workingFile?.name ?? 'editor'
  const activeProvider =
    providers.find((p) => p.id === (selectedProviderId ?? providers[0]?.id)) ?? null
  const fetchedModels = activeProvider ? (modelsById[activeProvider.id] ?? []) : []
  const currentModel = activeProvider?.model ?? ''
  const modelOptions = (
    currentModel && !fetchedModels.includes(currentModel)
      ? [currentModel, ...fetchedModels]
      : fetchedModels
  ).map((value) => ({ value, label: modelLabel(value) }))

  const currentThread = threads.find((thread) => thread.id === currentThreadId) ?? null

  return (
    <div className="ea-chat-panel">
      <div className="ea-chat-header">
        <span className="stamp ea-chat-title">
          {showHistory ? 'History' : currentThread?.title ?? 'Assistant'}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-active={showHistory}
          title="Chat history"
          aria-label="Chat history"
          onClick={() => setShowHistory((open) => !open)}
        >
          <Icon name="history" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="New chat"
          aria-label="New chat"
          onClick={() => {
            setShowHistory(false)
            cancelPendingWrite()
            newChat()
          }}
        >
          <Icon name="plus" />
        </button>
      </div>

      {providers.length === 0 ? (
        <p className="ea-chat-empty">Add an AI provider in Settings to start chatting.</p>
      ) : (
        <>
          {showHistory ? (
            <div className="ea-chat-history">
              {threads.length === 0 ? (
                <p className="ea-chat-empty">No saved chats yet. Send a message to start one.</p>
              ) : (
                <ul>
                  {threads.map((thread) => (
                    <li key={thread.id} data-active={thread.id === currentThreadId}>
                      <button
                        type="button"
                        className="ea-chat-history-item"
                        onClick={() => {
                          cancelPendingWrite()
                          void openThread(thread.id)
                          setShowHistory(false)
                        }}
                      >
                        {thread.title}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Delete chat"
                        aria-label={`Delete ${thread.title}`}
                        onClick={() =>
                          setPendingDeleteThread({ id: thread.id, title: thread.title })
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
            <div className="ea-chat-messages" ref={listRef}>
              {messages.length === 0 && !thinking && !streamText && !streamThinking ? (
                <p className="ea-chat-empty">Start a conversation. Chats are saved automatically.</p>
              ) : null}
            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} message={m} />
              ) : m.thinkingOnly ? (
                <details key={m.id} className="ea-chat-reasoning" open>
                  <summary>Thinking</summary>
                  <p>{m.content}</p>
                </details>
              ) : (
                <div key={m.id} className="ea-chat-msg-assistant">
                  <AssistantBody
                    content={m.content}
                    targetName={applyTargetName}
                  />
                </div>
              )
            )}
            {thinking && !streamThinking && !streamText ? (
              <p className="ea-chat-thinking">Thinking…</p>
            ) : null}
            {streamThinking ? (
              <details className="ea-chat-reasoning" open={!streamText}>
                <summary>Thinking</summary>
                <p>
                  {streamThinking}
                  {!streamText ? <span className="ea-chat-caret" aria-hidden="true" /> : null}
                </p>
              </details>
            ) : null}
            {streamText ? (
              <div className="ea-chat-msg-assistant" data-streaming="true">
                <AssistantBody
                  content={streamText}
                  targetName={applyTargetName}
                  showCaret
                />
              </div>
            ) : null}
            </div>

          {error ? (
            <p className="composer-hint" data-ok="false">
              {error}
            </p>
          ) : null}

          <form
            className="ea-chat-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSend()
            }}
          >
            <div className="ea-chat-chips">
              {attachedScripts.map((script) => (
                <span
                  key={script.id}
                  className="ea-chat-chip"
                  data-current={script.id === activeScriptId}
                >
                  <button
                    type="button"
                    className="ea-chat-chip-name"
                    title={
                      script.id === activeScriptId
                        ? 'Currently editing'
                        : `Open ${script.name}`
                    }
                    onClick={() => void selectScript(script.id)}
                  >
                    {script.name}
                  </button>
                  <button
                    type="button"
                    className="ea-chat-chip-remove"
                    aria-label={`Remove ${script.name}`}
                    onClick={() => detachFile(script.id)}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="ea-chat-attach"
                title="Add a file with @"
                aria-label="Add a file"
                disabled={!activeScriptId}
                onClick={() => {
                  setPickerOpen((open) => !open)
                  setPickerQuery('')
                  inputRef.current?.focus()
                }}
              >
                @
              </button>
            </div>
            {pickerOpen ? (
              <ul className="ea-chat-file-picker" role="listbox" aria-label="Attach a file">
                {pickerOptions.length === 0 ? (
                  <li className="ea-chat-file-empty">No other files to add</li>
                ) : (
                  pickerOptions.map((script, index) => (
                    <li key={script.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === pickerIndex}
                        data-active={index === pickerIndex}
                        onMouseEnter={() => setPickerIndex(index)}
                        onClick={() => {
                          const caret = inputRef.current?.selectionStart ?? input.length
                          const mention = mentionAt(input, caret)
                          attachFile(
                            script.id,
                            mention ? { start: mention.start, end: caret } : undefined
                          )
                        }}
                      >
                        {script.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
            <textarea
              ref={inputRef}
              value={input}
              rows={3}
              onChange={(e) => onInputChange(e.target.value, e.target.selectionStart)}
              onKeyDown={onComposerKeyDown}
              placeholder={
                activeScriptId
                  ? 'Ask the AI to write or edit this EA. Type @ to add a file.'
                  : 'Open a script to start chatting.'
              }
              disabled={sending || !activeScriptId}
            />
            <div className="ea-chat-composer-bar">
              <Dropdown
                ariaLabel="AI provider"
                className="ea-chat-llm-select"
                placement="top"
                menuMinWidth={180}
                value={selectedProviderId ?? providers[0].id}
                onChange={setSelectedProviderId}
                options={providerOptions}
              />
              {modelOptions.length > 0 && activeProvider ? (
                <Dropdown
                  ariaLabel="Model"
                  className="ea-chat-llm-select"
                  placement="top"
                  menuMinWidth={220}
                  value={currentModel || modelOptions[0].value}
                  onChange={(next) => void setProviderModel(activeProvider.id, next)}
                  options={modelOptions}
                />
              ) : null}
              <button
                type="submit"
                className="icon-btn ea-chat-send"
                disabled={sending || !activeScriptId || !input.trim()}
                title={sending ? 'Sending' : 'Send'}
                aria-label={sending ? 'Sending' : 'Send'}
              >
                <Icon name="send" />
              </button>
            </div>
          </form>
            </>
          )}
        </>
      )}

      {pendingDeleteThread ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ea-chat-delete-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDeleteThread(null)
          }}
        >
          <div className="composer">
            <header>
              <div>
                <span className="stamp">History</span>
                <h2 id="ea-chat-delete-title">Delete chat</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPendingDeleteThread(null)}
                title="Close"
                aria-label="Close"
              >
                <Icon name="close" />
              </button>
            </header>
            <p className="composer-hint">
              Delete "{pendingDeleteThread.title}"? This cannot be undone.
            </p>
            <div className="composer-actions">
              <button type="button" className="ghost" onClick={() => setPendingDeleteThread(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const id = pendingDeleteThread.id
                  setPendingDeleteThread(null)
                  cancelPendingWrite()
                  void deleteThread(id)
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
