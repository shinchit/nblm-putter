import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readConfig, writeConfig, getConfigDir } from '../src/config'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'

const TEST_DIR = join(os.tmpdir(), 'nblm-putter-test-' + Date.now())

beforeEach(() => {
  process.env.NBLM_CONFIG_DIR = TEST_DIR
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  delete process.env.NBLM_CONFIG_DIR
})

describe('config', () => {
  it('returns defaults when config file does not exist', () => {
    const config = readConfig()
    expect(config.useSecretsManager).toBe(false)
    expect(config.aws.region).toBe('ap-northeast-1')
  })

  it('writes and reads config', () => {
    writeConfig({ useSecretsManager: true, aws: { region: 'us-east-1', profile: 'myprofile' } })
    const config = readConfig()
    expect(config.useSecretsManager).toBe(true)
    expect(config.aws.region).toBe('us-east-1')
    expect(config.aws.profile).toBe('myprofile')
  })

  it('getConfigDir returns NBLM_CONFIG_DIR when set', () => {
    expect(getConfigDir()).toBe(TEST_DIR)
  })
})
