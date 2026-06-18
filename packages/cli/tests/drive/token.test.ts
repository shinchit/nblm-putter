import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { loadDriveToken, saveDriveToken, isTokenExpired } from '../../src/drive/token'

const TEST_DIR = join(process.cwd(), 'test-config-token')

beforeEach(() => {
  process.env.NBLM_CONFIG_DIR = TEST_DIR
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  delete process.env.NBLM_CONFIG_DIR
})

describe('loadDriveToken', () => {
  it('returns null when no token file exists', () => {
    expect(loadDriveToken()).toBeNull()
  })
})

describe('saveDriveToken + loadDriveToken', () => {
  it('round-trips a token', () => {
    const token = { access_token: 'at', refresh_token: 'rt', expiry_date: 9999999999999 }
    saveDriveToken(token)
    expect(loadDriveToken()).toEqual(token)
  })
})

describe('isTokenExpired', () => {
  it('returns true when expiry_date is in the past', () => {
    expect(isTokenExpired({ access_token: 'a', refresh_token: 'r', expiry_date: Date.now() - 1000 })).toBe(true)
  })
  it('returns false when expiry_date is in the future', () => {
    expect(isTokenExpired({ access_token: 'a', refresh_token: 'r', expiry_date: Date.now() + 60000 })).toBe(false)
  })
})
