import { existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { SEALION_DEFAULT_MODEL, SEALION_SEED_ID } from '@shared/types'
import { stripScriptDirectives } from '@shared/chatDirectives'
import { chatTitleFromText } from '../ai/chatTitle'
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
  migrateChatMetadata(db)
  seedSealionProvider(db)
  return db
}

// One-time default-row seed, run at startup like the migration above — not
// as a side effect of a read path every listProviders() caller would pay for.
// INSERT OR IGNORE keyed on the fixed seed id is enough on its own to be
// idempotent; no extra existence check or in-process guard is needed.
function seedSealionProvider(database: Database.Database): void {
  const now = Date.now()
  database
    .prepare(
      `INSERT OR IGNORE INTO ai_providers (id, name, provider, model, base_url, encrypted_api_key, created_at, updated_at)
       VALUES (@id, @name, @provider, @model, NULL, NULL, @now, @now)`
    )
    .run({ id: SEALION_SEED_ID, name: 'SEA-LION', provider: 'sealion', model: SEALION_DEFAULT_MODEL, now })
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
  // One bulk aggregate query for every orphaned script instead of two SELECTs
  // per script, then the writes batched into a single transaction instead of
  // one fsync per script — this only runs once per script ever (a fresh
  // install has nothing to migrate), but a large existing library shouldn't
  // stall the single-threaded main process at startup proportional to its size.
  const orphans = database
    .prepare(
      `SELECT
         m.script_id AS script_id,
         (SELECT content FROM ea_chat_messages
          WHERE script_id = m.script_id AND role = 'user'
          ORDER BY created_at ASC, rowid ASC LIMIT 1) AS first_content,
         MIN(CASE WHEN m.role = 'user' THEN m.created_at END) AS first_created_at,
         MAX(m.created_at) AS last_updated_at
       FROM ea_chat_messages m
       WHERE m.thread_id IS NULL OR m.thread_id = ''
       GROUP BY m.script_id`
    )
    .all() as {
    script_id: string
    first_content: string | null
    first_created_at: number | null
    last_updated_at: number | null
  }[]
  if (orphans.length === 0) return
  const insertThread = database.prepare(
    `INSERT INTO ea_chat_threads (id, title, script_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
  const assign = database.prepare(
    `UPDATE ea_chat_messages SET thread_id = ?
     WHERE script_id = ? AND (thread_id IS NULL OR thread_id = '')`
  )
  const migrate = database.transaction((rows: typeof orphans) => {
    for (const row of rows) {
      const title = chatTitleFromText(row.first_content ?? 'Chat')
      const id = randomUUID()
      const created = row.first_created_at ?? Date.now()
      const updated = row.last_updated_at ?? created
      insertThread.run(id, title, row.script_id, created, updated)
      assign.run(id, row.script_id)
    }
  })
  migrate(orphans)
}

// Older rows encoded "thinking-only" as a literal `<!--ql-thinking-->\n`
// prefix baked into `content`, and could carry a `<!--ql-file:...-->` rename
// directive too — both now belong in a real column / get stripped before
// persisting (see ipc.ts's AI_SEND_CHAT_MESSAGE handler). Backfill existing
// rows once so old history renders and resends to the model the same way a
// freshly-saved message would.
const LEGACY_THINKING_MARK = '<!--ql-thinking-->\n'

function migrateChatMetadata(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(ea_chat_messages)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'thinking_only')) {
    database.exec('ALTER TABLE ea_chat_messages ADD COLUMN thinking_only INTEGER NOT NULL DEFAULT 0')
  }
  const rows = database
    .prepare(
      `SELECT id, content FROM ea_chat_messages
       WHERE role = 'assistant' AND (content LIKE ? OR content LIKE '%<!--ql-file:%')`
    )
    .all(`${LEGACY_THINKING_MARK}%`) as { id: string; content: string }[]
  if (rows.length === 0) return
  const update = database.prepare(
    'UPDATE ea_chat_messages SET content = ?, thinking_only = ? WHERE id = ?'
  )
  const migrate = database.transaction((items: typeof rows) => {
    for (const row of items) {
      const isThinking = row.content.startsWith(LEGACY_THINKING_MARK)
      const withoutMark = isThinking ? row.content.slice(LEGACY_THINKING_MARK.length) : row.content
      update.run(stripScriptDirectives(withoutMark), isThinking ? 1 : 0, row.id)
    }
  })
  migrate(rows)
}

export function databaseFileExists(): boolean {
  return existsSync(dbPath())
}

export function closeDb(): void {
  db?.close()
  db = null
}
