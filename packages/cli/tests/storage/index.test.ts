import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'

const TEST_DIR = join(os.tmpdir(), 'nblm-storage-test-' + Date.now())

beforeEach(() => {
  process.env.NBLM_CONFIG_DIR = TEST_DIR
  mkdirSync(TEST_DIR, { recursive: true })
  vi.resetModules()
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  delete process.env.NBLM_CONFIG_DIR
  vi.restoreAllMocks()
})

describe('storage (local-only mode)', () => {
  it('saves and loads session locally when SM unavailable', async () => {
    vi.mock('../../src/aws/secrets', () => ({
      smGet: vi.fn().mockRejectedValue(new Error('no credentials')),
      smPut: vi.fn().mockRejectedValue(new Error('no credentials')),
    }))
    const { saveSession, loadSession } = await import('../../src/storage/index')
    const session = { cookies: [{ name: 'test', value: 'val' }] }
    await saveSession(session as any)
    const loaded = await loadSession()
    expect(loaded).toEqual(session)
  })

  it('saves and loads ignore patterns locally when SM unavailable', async () => {
    vi.mock('../../src/aws/secrets', () => ({
      smGet: vi.fn().mockRejectedValue(new Error('no credentials')),
      smPut: vi.fn().mockRejectedValue(new Error('no credentials')),
    }))
    const { saveIgnorePatterns, loadIgnorePatterns } = await import('../../src/storage/index')
    const { closeDb } = await import('../../src/db/client')
    await saveIgnorePatterns(['*.log', 'dist/'])
    const loaded = await loadIgnorePatterns()
    expect(loaded).toEqual(['*.log', 'dist/'])
    closeDb()
  })
})
