import { existsSync, mkdirSync } from 'node:fs'
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
  return db
}

export function databaseFileExists(): boolean {
  return existsSync(dbPath())
}

export function closeDb(): void {
  db?.close()
  db = null
}
