import { randomUUID } from 'crypto'
import { getDb } from './client'

export interface JobLog {
  file: string
  success: boolean
  reason?: string
  at: string
}

export interface Job {
  jobId: string
  status: 'pending' | 'running' | 'done' | 'failed'
  notebookId: string
  totalFiles: number
  doneFiles: number
  currentFile: string | null
  errors: Array<{ file: string; reason: string }>
  logs: JobLog[]
  createdAt: string
  updatedAt: string
}

interface JobRow {
  jobId: string
  status: string
  notebookId: string
  totalFiles: number
  doneFiles: number
  currentFile: string | null
  errors: string
  logs: string
  createdAt: string
  updatedAt: string
}

export function createJob(params: { notebookId: string; totalFiles: number }): string {
  const jobId = randomUUID()
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO jobs (jobId, notebookId, totalFiles, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobId, params.notebookId, params.totalFiles, now, now)
  return jobId
}

function parseRow(row: JobRow): Job {
  return {
    ...row,
    status: row.status as Job['status'],
    errors: JSON.parse(row.errors ?? '[]'),
    logs: JSON.parse(row.logs ?? '[]'),
  }
}

export function getJob(jobId: string): Job | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE jobId = ?').get(jobId) as JobRow | undefined
  if (!row) return null
  return parseRow(row)
}

export function updateJob(
  jobId: string,
  updates: Partial<Pick<Job, 'status' | 'doneFiles' | 'currentFile' | 'errors' | 'logs'>>,
): void {
  const now = new Date().toISOString()
  const sets: string[] = ['updatedAt = ?']
  const values: unknown[] = [now]
  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status) }
  if (updates.doneFiles !== undefined) { sets.push('doneFiles = ?'); values.push(updates.doneFiles) }
  if ('currentFile' in updates) { sets.push('currentFile = ?'); values.push(updates.currentFile ?? null) }
  if (updates.errors !== undefined) { sets.push('errors = ?'); values.push(JSON.stringify(updates.errors)) }
  if (updates.logs !== undefined) { sets.push('logs = ?'); values.push(JSON.stringify(updates.logs)) }
  values.push(jobId)
  getDb().prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE jobId = ?`).run(...values)
}

export function listJobs(): Job[] {
  const rows = getDb().prepare('SELECT * FROM jobs ORDER BY createdAt DESC, rowid DESC').all() as JobRow[]
  return rows.map(parseRow)
}
