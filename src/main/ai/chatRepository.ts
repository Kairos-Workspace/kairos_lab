import { randomUUID } from 'node:crypto'
import type { EaChatMessage, EaChatThread } from '@shared/types'
import { getDb } from '../database/db'

interface EaChatMessageRow {
  id: string
  script_id: string
  thread_id: string | null
  role: string
  content: string
  provider_id: string | null
  created_at: number
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
    createdAt: row.created_at
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

export function chatTitleFromText(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return 'New chat'
  if (one.length <= 48) return one
  return `${one.slice(0, 48).trim()}...`
}

export function listChatThreads(): EaChatThread[] {
  const rows = getDb()
    .prepare(
      `SELECT t.* FROM ea_chat_threads t
       WHERE EXISTS (
         SELECT 1 FROM ea_chat_messages m WHERE m.thread_id = t.id
       )
       ORDER BY t.updated_at DESC`
    )
    .all() as EaChatThreadRow[]
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

export function saveChatMessage(message: {
  scriptId: string
  threadId: string
  role: EaChatMessage['role']
  content: string
  providerId: string | null
}): EaChatMessage {
  const row: EaChatMessageRow = {
    id: randomUUID(),
    script_id: message.scriptId,
    thread_id: message.threadId,
    role: message.role,
    content: message.content,
    provider_id: message.providerId,
    created_at: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO ea_chat_messages (id, script_id, thread_id, role, content, provider_id, created_at)
       VALUES (@id, @script_id, @thread_id, @role, @content, @provider_id, @created_at)`
    )
    .run(row)
  touchChatThread(message.threadId, message.scriptId)
  return toMessage(row)
}

export function deleteChatThread(threadId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM ea_chat_messages WHERE thread_id = ?').run(threadId)
  db.prepare('DELETE FROM ea_chat_threads WHERE id = ?').run(threadId)
}

export function ensureChatThread(threadId: string | null | undefined, scriptId: string, title: string): EaChatThread {
  if (threadId) {
    const existing = getChatThread(threadId)
    if (existing) {
      touchChatThread(existing.id, scriptId)
      return existing
    }
  }
  return createChatThread(scriptId, title)
}
