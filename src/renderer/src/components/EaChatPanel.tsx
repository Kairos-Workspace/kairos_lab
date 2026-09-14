import { useEffect, useRef, useState } from 'react'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { extractCodeBlocks } from '../lib/extractCodeBlocks'
import { useAiProvidersStore } from '../store/useAiProvidersStore'
import { useEaChatStore } from '../store/useEaChatStore'
import { useEaLabStore } from '../store/useEaLabStore'

export function EaChatPanel(): React.JSX.Element {
  const activeScriptId = useEaLabStore((s) => s.activeScriptId)
  const draftCode = useEaLabStore((s) => s.draftCode)
  const updateDraftCode = useEaLabStore((s) => s.updateDraftCode)

  const providers = useAiProvidersStore((s) => s.providers)
  const loadProviders = useAiProvidersStore((s) => s.loadProviders)

  const messages = useEaChatStore((s) => s.messages)
  const sending = useEaChatStore((s) => s.sending)
  const error = useEaChatStore((s) => s.error)
  const selectedProviderId = useEaChatStore((s) => s.selectedProviderId)
  const loadMessages = useEaChatStore((s) => s.loadMessages)
  const setSelectedProviderId = useEaChatStore((s) => s.setSelectedProviderId)
  const sendMessage = useEaChatStore((s) => s.sendMessage)
  const clearChat = useEaChatStore((s) => s.clearChat)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    if (activeScriptId) void loadMessages(activeScriptId)
  }, [activeScriptId, loadMessages])

  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id)
    }
  }, [providers, selectedProviderId, setSelectedProviderId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  async function handleSend(): Promise<void> {
    const text = input.trim()
    if (!text || !activeScriptId) return
    setInput('')
    await sendMessage(activeScriptId, draftCode, text)
  }

  const providerOptions = providers.map((p) => ({ value: p.id, label: p.name }))

  return (
    <div className="ea-chat-panel">
      <div className="ea-chat-header">
        <span className="stamp">AI Chat</span>
        {providers.length > 0 ? (
          <Dropdown
            ariaLabel="AI provider"
            value={selectedProviderId ?? providers[0].id}
            onChange={setSelectedProviderId}
            options={providerOptions}
          />
        ) : null}
        <button
          type="button"
          className="icon-btn"
          title="New chat"
          aria-label="New chat"
          disabled={!activeScriptId}
          onClick={() => activeScriptId && void clearChat(activeScriptId)}
        >
          <Icon name="reset" />
        </button>
      </div>

      {providers.length === 0 ? (
        <p className="ea-chat-empty">Add an AI provider in Settings to start chatting.</p>
      ) : (
        <>
          <div className="ea-chat-messages" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === 'user' ? 'ea-chat-msg-user' : 'ea-chat-msg-assistant'}
              >
                {extractCodeBlocks(m.content).map((segment, i) =>
                  segment.type === 'code' && segment.content.trim() ? (
                    <div key={i} className="ea-chat-code-block">
                      <pre>{segment.content}</pre>
                      <div className="ea-chat-code-actions">
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(segment.content)}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="ea-chat-apply-btn"
                          onClick={() => updateDraftCode(segment.content)}
                        >
                          Apply to editor
                        </button>
                      </div>
                    </div>
                  ) : segment.type === 'text' && segment.content.trim() ? (
                    <p key={i}>{segment.content}</p>
                  ) : null
                )}
              </div>
            ))}
          </div>

          {error ? (
            <p className="composer-hint" data-ok="false">
              {error}
            </p>
          ) : null}

          <form
            className="ea-chat-input-row"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSend()
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI to write or edit this EA…"
              disabled={sending || !activeScriptId}
            />
            <button
              type="submit"
              className="primary"
              disabled={sending || !activeScriptId || !input.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
