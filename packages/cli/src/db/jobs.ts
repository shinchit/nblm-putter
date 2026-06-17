import { randomUUID } from 'crypto'
import { getDb } from './client'

export interface Job {
  jobId: string
  status: 'pending' | 'running' | 'done' | 'failed'
  notebookId: string
  totalFiles: number
  doneFiles: number
  errors: Array<{ file: string; reason: string }>
  createdAt: string
  updatedAt: string
}

interface JobRow {
  jobId: string
  status: string
  notebookId: string
  totalFiles: number
  doneFiles: number
  errors: string
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

export function getJob(jobId: string): Job | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE jobId = ?').get(jobId) as JobRow | undefined
  if (!row) return null
  return { ...row, status: row.status as Job['status'], errors: JSON.parse(row.errors) }
}

export function updateJob(jobId: string, updates: Partial<Pick<Job, 'status' | 'doneFiles' | 'errors'>>): void {
  const now = new Date().toISOString()
  const sets: string[] = ['updatedAt = ?']
  const values: unknown[] = [now]
  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status) }
  if (updates.doneFiles !== undefined) { sets.push('doneFiles = ?'); values.push(updates.doneFiles) }
  if (updates.errors !== undefined) { sets.push('errors = ?'); values.push(JSON.stringify(updates.errors)) }
  values.push(jobId)
  getDb().prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE jobId = ?`).run(...values)
}

export function listJobs(): Job[] {
  const rows = getDb().prepare('SELECT * FROM jobs ORDER BY createdAt DESC, rowid DESC').all() as JobRow[]
  return rows.map(r => ({ ...r, status: r.status as Job['status'], errors: JSON.parse(r.errors) }))
}
