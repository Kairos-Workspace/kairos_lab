import { randomUUID } from 'node:crypto'
import type { EaChatMessage } from '@shared/types'
import { getDb } from '../database/db'

interface EaChatMessageRow {
  id: string
  script_id: string
  role: string
  content: string
  provider_id: string | null
  created_at: number
}

function toMessage(row: EaChatMessageRow): EaChatMessage {
  return {
    id: row.id,
    scriptId: row.script_id,
    role: row.role as EaChatMessage['role'],
    content: row.content,
    providerId: row.provider_id,
    createdAt: row.created_at
  }
}

export function listChatMessages(scriptId: string): EaChatMessage[] {
  const rows = getDb()
    .prepare('SELECT * FROM ea_chat_messages WHERE script_id = ? ORDER BY created_at ASC')
    .all(scriptId) as EaChatMessageRow[]
  return rows.map(toMessage)
}

export function saveChatMessage(message: {
  scriptId: string
  role: EaChatMessage['role']
  content: string
  providerId: string | null
}): EaChatMessage {
  const row: EaChatMessageRow = {
    id: randomUUID(),
    script_id: message.scriptId,
    role: message.role,
    content: message.content,
    provider_id: message.providerId,
    created_at: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO ea_chat_messages (id, script_id, role, content, provider_id, created_at)
       VALUES (@id, @script_id, @role, @content, @provider_id, @created_at)`
    )
    .run(row)
  return toMessage(row)
}

export function clearChat(scriptId: string): void {
  getDb().prepare('DELETE FROM ea_chat_messages WHERE script_id = ?').run(scriptId)
}
