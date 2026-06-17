import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { BrowserContextOptions } from 'playwright'
import { smGet, smPut } from '../aws/secrets'
import { getConfigDir } from '../config'
import { getIgnorePatterns, setIgnorePatterns } from '../db/settings'

const SESSION_SECRET = 'nblm-putter/session'
const SETTINGS_SECRET = 'nblm-putter/settings'

type StorageState = NonNullable<BrowserContextOptions['storageState']>

let smAvailable: boolean | null = null

async function isSmAvailable(): Promise<boolean> {
  if (smAvailable !== null) return smAvailable
  try {
    const result = await smGet(SESSION_SECRET)
    smAvailable = result !== undefined && result !== null
    if (!smAvailable) {
      console.warn('⚠ Secrets Manager unavailable. Running in local-only mode.\n  (cross-machine sync disabled)')
    }
  } catch {
    smAvailable = false
    console.warn('⚠ Secrets Manager unavailable. Running in local-only mode.\n  (cross-machine sync disabled)')
  }
  return smAvailable
}

function localSessionPath(): string {
  return join(getConfigDir(), 'session.json')
}

export async function saveSession(state: StorageState): Promise<void> {
  if (await isSmAvailable()) {
    await smPut(SESSION_SECRET, state)
  }
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(localSessionPath(), JSON.stringify(state))
}

export async function loadSession(): Promise<StorageState | null> {
  if (await isSmAvailable()) {
    return (await smGet(SESSION_SECRET)) as StorageState
  }
  const path = localSessionPath()
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as StorageState
}

export async function saveIgnorePatterns(patterns: string[]): Promise<void> {
  if (await isSmAvailable()) {
    await smPut(SETTINGS_SECRET, { ignorePatterns: patterns })
  }
  setIgnorePatterns(patterns)
}

export async function loadIgnorePatterns(): Promise<string[]> {
  if (await isSmAvailable()) {
    const data = await smGet(SETTINGS_SECRET) as { ignorePatterns?: string[] } | null | undefined
    return data?.ignorePatterns ?? []
  }
  return getIgnorePatterns()
}
