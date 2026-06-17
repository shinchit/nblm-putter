import { getDb } from './client'

interface SettingRow {
  value: string
}

export function getIgnorePatterns(): string[] {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('ignorePatterns') as SettingRow | undefined
  if (!row) return []
  return JSON.parse(row.value) as string[]
}

export function setIgnorePatterns(patterns: string[]): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run('ignorePatterns', JSON.stringify(patterns))
}

export function addIgnorePattern(pattern: string): void {
  const current = getIgnorePatterns()
  if (!current.includes(pattern)) setIgnorePatterns([...current, pattern])
}

export function removeIgnorePattern(pattern: string): void {
  setIgnorePatterns(getIgnorePatterns().filter(p => p !== pattern))
}
