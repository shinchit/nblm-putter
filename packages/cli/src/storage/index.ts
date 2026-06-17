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
    // smGet returns null (not throws) when secret doesn't exist yet — that still means SM is reachable.
    await smGet(SESSION_SECRET)
    smAvailable = true
  } catch (err: unknown) {
    smAvailable = false
    const detail = err instanceof Error ? err.message : String(err)
    console.warn(`⚠ Secrets Manager unavailable. Running in local-only mode.\n  (${detail})`)
  }
  return smAvailable
}

function localSessionPath(): string {
  return join(getConfigDir(), 'session.json')
}

export async function saveSession(state: StorageState): Promise<void> {
  if (await isSmAvailable()) {
    try {
      await smPut(SESSION_SECRET, state)
    } catch (err) {
      console.warn('⚠ Failed to save session to Secrets Manager:', err instanceof Error ? err.message : err)
    }
  }
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(localSessionPath(), JSON.stringify(state))
}

export async function loadSession(): Promise<StorageState | null> {
  if (await isSmAvailable()) {
    try {
      const state = (await smGet(SESSION_SECRET)) as StorageState | null
      if (state) return state
      // Secret not created yet — fall through to local file
    } catch (err) {
      console.warn('⚠ Failed to load session from Secrets Manager:', err instanceof Error ? err.message : err)
    }
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
