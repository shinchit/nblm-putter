import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getConfigDir } from '../config'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = getConfigDir()
    mkdirSync(dir, { recursive: true })
    db = new Database(join(dir, 'db.sqlite'))
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      jobId TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      notebookId TEXT NOT NULL,
      totalFiles INTEGER NOT NULL DEFAULT 0,
      doneFiles INTEGER NOT NULL DEFAULT 0,
      errors TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
