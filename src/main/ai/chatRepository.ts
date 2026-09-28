import { randomUUID } from 'node:crypto'
import type { EaChatMessage, EaChatThread, ScriptKind } from '@shared/types'
import { chatTitleFromText } from './chatTitle'
import { getDb } from '../database/db'

interface EaChatMessageRow {
  id: string
  script_id: string
  thread_id: string | null
  role: string
  content: string
  provider_id: string | null
  created_at: number
  thinking_only: number
}

interface EaChatThreadRow {
  id: string
  title: string
  script_id: string | null
  created_at: number
  updated_at: number
}

function toMessage(row: EaChatMessageRow): EaChatMessage {
  return {
    id: row.id,
    scriptId: row.script_id,
    threadId: row.thread_id,
    role: row.role as EaChatMessage['role'],
    content: row.content,
    providerId: row.provider_id,
    createdAt: row.created_at,
    thinkingOnly: !!row.thinking_only
  }
}

function toThread(row: EaChatThreadRow): EaChatThread {
  return {
    id: row.id,
    title: row.title,
    scriptId: row.script_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listChatThreads(kind?: ScriptKind): EaChatThread[] {
  const rows = kind
    ? (getDb()
        .prepare(
          `SELECT t.* FROM ea_chat_threads t
           WHERE EXISTS (
             SELECT 1 FROM ea_chat_messages m
             INNER JOIN ea_scripts s ON s.id = m.script_id
             WHERE m.thread_id = t.id AND s.kind = ?
           )
           ORDER BY t.updated_at DESC`
        )
        .all(kind) as EaChatThreadRow[])
    : (getDb()
        .prepare(
          `SELECT t.* FROM ea_chat_threads t
           WHERE EXISTS (
             SELECT 1 FROM ea_chat_messages m WHERE m.thread_id = t.id
           )
           ORDER BY t.updated_at DESC`
        )
        .all() as EaChatThreadRow[])
  return rows.map(toThread)
}

export function getChatThread(id: string): EaChatThread | null {
  const row = getDb()
    .prepare('SELECT * FROM ea_chat_threads WHERE id = ?')
    .get(id) as EaChatThreadRow | undefined
  return row ? toThread(row) : null
}

export function createChatThread(scriptId: string | null, title: string): EaChatThread {
  const now = Date.now()
  const row: EaChatThreadRow = {
    id: randomUUID(),
    title: chatTitleFromText(title),
    script_id: scriptId,
    created_at: now,
    updated_at: now
  }
  getDb()
    .prepare(
      `INSERT INTO ea_chat_threads (id, title, script_id, created_at, updated_at)
       VALUES (@id, @title, @script_id, @created_at, @updated_at)`
    )
    .run(row)
  return toThread(row)
}

export function touchChatThread(id: string, scriptId?: string | null): void {
  getDb()
    .prepare(
      `UPDATE ea_chat_threads
       SET updated_at = ?, script_id = COALESCE(?, script_id)
       WHERE id = ?`
    )
    .run(Date.now(), scriptId ?? null, id)
}

export function listChatMessages(threadId: string): EaChatMessage[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM ea_chat_messages WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC'
    )
    .all(threadId) as EaChatMessageRow[]
  return rows.map(toMessage)
}

function insertMessageRow(message: {
  scriptId: string
  threadId: string
  role: EaChatMessage['role']
  content: string
  providerId: string | null
  thinkingOnly?: boolean
}): EaChatMessage {
  const row: EaChatMessageRow = {
    id: randomUUID(),
    script_id: message.scriptId,
    thread_id: message.threadId,
    role: message.role,
    content: message.content,
    provider_id: message.providerId,
    created_at: Date.now(),
    thinking_only: message.thinkingOnly ? 1 : 0
  }
  getDb()
    .prepare(
      `INSERT INTO ea_chat_messages (id, script_id, thread_id, role, content, provider_id, created_at, thinking_only)
       VALUES (@id, @script_id, @thread_id, @role, @content, @provider_id, @created_at, @thinking_only)`
    )
    .run(row)
  return toMessage(row)
}

// Inserts the user question and the assistant reply together, in one
// transaction, so a mid-exchange failure (e.g. the script gets deleted
// between the two writes) can never leave just the user's half persisted —
// which would otherwise let a retry with the same text insert it twice.
export function saveChatExchange(
  userMessage: { scriptId: string; threadId: string; content: string },
  assistantMessage: {
    scriptId: string
    threadId: string
    content: string
    providerId: string
    thinkingOnly: boolean
  }
): void {
  const db = getDb()
  const run = db.transaction(() => {
    insertMessageRow({ ...userMessage, role: 'user', providerId: null })
    insertMessageRow({ ...assistantMessage, role: 'assistant' })
  })
  run()
  touchChatThread(assistantMessage.threadId, assistantMessage.scriptId)
}

export function deleteChatThread(threadId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM ea_chat_messages WHERE thread_id = ?').run(threadId)
  db.prepare('DELETE FROM ea_chat_threads WHERE id = ?').run(threadId)
}

// A thread isn't owned by a single script (it can span several attached
// scripts over its lifetime), so deleting a script can't simply cascade the
// thread away — but the FK on ea_chat_messages.script_id does cascade-delete
// that script's messages, which can leave a thread with none left at all.
// Call this after anything that can delete ea_chat_messages rows so those
// now-empty threads don't linger in the table forever.
export function pruneEmptyChatThreads(): void {
  getDb()
    .prepare(
      `DELETE FROM ea_chat_threads
       WHERE NOT EXISTS (SELECT 1 FROM ea_chat_messages m WHERE m.thread_id = ea_chat_threads.id)`
    )
    .run()
}

export function ensureChatThread(threadId: string | null | undefined, scriptId: string, title: string): EaChatThread {
  if (threadId) {
    const existing = getChatThread(threadId)
    if (existing) {
      touchChatThread(existing.id, scriptId)
      // Re-fetch rather than returning `existing`, which was read before the
      // touch above and would otherwise carry a stale updated_at/script_id.
      return getChatThread(existing.id) ?? existing
    }
  }
  return createChatThread(scriptId, title)
}
