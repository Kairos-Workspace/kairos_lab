import { existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema'

let db: Database.Database | null = null
let resolvedPath = ''

export function projectDataDir(): string {
  if (process.env.STRATEGY_DB_DIR) return process.env.STRATEGY_DB_DIR
  if (app.isPackaged) return join(app.getPath('userData'), 'data')
  return join(process.cwd(), 'data')
}

export function dbPath(): string {
  return join(projectDataDir(), 'strategy-tester.db')
}

export function getDb(): Database.Database {
  if (db) return db
  resolvedPath = dbPath()
  mkdirSync(dirname(resolvedPath), { recursive: true })
  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  migrateChatThreads(db)
  return db
}

function migrateChatThreads(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ea_chat_threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      script_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  const columns = database.prepare('PRAGMA table_info(ea_chat_messages)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'thread_id')) {
    database.exec('ALTER TABLE ea_chat_messages ADD COLUMN thread_id TEXT')
  }
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_ea_chat_messages_thread ON ea_chat_messages(thread_id)'
  )
  const orphans = database
    .prepare(
      `SELECT DISTINCT script_id FROM ea_chat_messages
       WHERE thread_id IS NULL OR thread_id = ''`
    )
    .all() as { script_id: string }[]
  const insertThread = database.prepare(
    `INSERT INTO ea_chat_threads (id, title, script_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
  const firstUser = database.prepare(
    `SELECT content, created_at FROM ea_chat_messages
     WHERE script_id = ? AND role = 'user'
     ORDER BY created_at ASC, rowid ASC LIMIT 1`
  )
  const lastAt = database.prepare(
    `SELECT MAX(created_at) AS updated_at FROM ea_chat_messages WHERE script_id = ?`
  )
  const assign = database.prepare(
    `UPDATE ea_chat_messages SET thread_id = ?
     WHERE script_id = ? AND (thread_id IS NULL OR thread_id = '')`
  )
  for (const row of orphans) {
    const first = firstUser.get(row.script_id) as { content: string; created_at: number } | undefined
    const last = lastAt.get(row.script_id) as { updated_at: number | null }
    const title = chatTitleFromText(first?.content ?? 'Chat')
    const id = randomUUID()
    const created = first?.created_at ?? Date.now()
    const updated = last.updated_at ?? created
    insertThread.run(id, title, row.script_id, created, updated)
    assign.run(id, row.script_id)
  }
}

function chatTitleFromText(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return 'New chat'
  if (one.length <= 48) return one
  return `${one.slice(0, 48).trim()}...`
}

export function databaseFileExists(): boolean {
  return existsSync(dbPath())
}

export function closeDb(): void {
  db?.close()
  db = null
}
