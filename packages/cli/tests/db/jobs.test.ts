import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { closeDb } from '../../src/db/client'
import { createJob, getJob, updateJob, listJobs } from '../../src/db/jobs'

const TEST_DIR = join(os.tmpdir(), 'nblm-db-test-' + Date.now())

beforeEach(() => {
  process.env.NBLM_CONFIG_DIR = TEST_DIR
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  closeDb()
  rmSync(TEST_DIR, { recursive: true, force: true })
  delete process.env.NBLM_CONFIG_DIR
})

describe('jobs', () => {
  it('creates a job and retrieves it', () => {
    const jobId = createJob({ notebookId: 'nb-123', totalFiles: 10 })
    const job = getJob(jobId)
    expect(job).not.toBeNull()
    expect(job!.notebookId).toBe('nb-123')
    expect(job!.status).toBe('pending')
    expect(job!.totalFiles).toBe(10)
    expect(job!.doneFiles).toBe(0)
  })

  it('updates job progress', () => {
    const jobId = createJob({ notebookId: 'nb-123', totalFiles: 10 })
    updateJob(jobId, { status: 'running', doneFiles: 5 })
    const job = getJob(jobId)
    expect(job!.status).toBe('running')
    expect(job!.doneFiles).toBe(5)
  })

  it('lists all jobs sorted by createdAt desc', () => {
    createJob({ notebookId: 'nb-1', totalFiles: 1 })
    createJob({ notebookId: 'nb-2', totalFiles: 2 })
    const jobs = listJobs()
    expect(jobs).toHaveLength(2)
    expect(jobs[0].notebookId).toBe('nb-2')
  })
})
