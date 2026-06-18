import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getConfigDir } from '../config'

export interface DriveToken {
  access_token: string
  refresh_token: string
  expiry_date: number
}

function tokenPath(): string {
  return join(getConfigDir(), 'drive-token.json')
}

export function loadDriveToken(): DriveToken | null {
  const p = tokenPath()
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as DriveToken
}

export function saveDriveToken(token: DriveToken): void {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(tokenPath(), JSON.stringify(token, null, 2))
}

export function isTokenExpired(token: DriveToken): boolean {
  return Date.now() >= token.expiry_date
}
