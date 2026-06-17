import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { closeDb } from '../../src/db/client'
import { getIgnorePatterns, addIgnorePattern, removeIgnorePattern } from '../../src/db/settings'

const TEST_DIR = join(os.tmpdir(), 'nblm-settings-test-' + Date.now())

beforeEach(() => {
  process.env.NBLM_CONFIG_DIR = TEST_DIR
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  closeDb()
  rmSync(TEST_DIR, { recursive: true, force: true })
  delete process.env.NBLM_CONFIG_DIR
})

describe('settings', () => {
  it('returns empty array when no patterns set', () => {
    expect(getIgnorePatterns()).toEqual([])
  })

  it('adds and lists patterns', () => {
    addIgnorePattern('*.log')
    addIgnorePattern('node_modules/')
    expect(getIgnorePatterns()).toEqual(['*.log', 'node_modules/'])
  })

  it('removes a pattern', () => {
    addIgnorePattern('*.log')
    addIgnorePattern('*.tmp')
    removeIgnorePattern('*.log')
    expect(getIgnorePatterns()).toEqual(['*.tmp'])
  })
})
