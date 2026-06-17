import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import os from 'os'

export interface Config {
  useSecretsManager: boolean
  aws: {
    region: string
    profile: string
  }
}

const DEFAULT_CONFIG: Config = {
  useSecretsManager: false,
  aws: { region: 'ap-northeast-1', profile: 'default' },
}

export function getConfigDir(): string {
  return process.env.NBLM_CONFIG_DIR ?? join(os.homedir(), '.nblm-putter')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export function readConfig(): Config {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG, aws: { ...DEFAULT_CONFIG.aws } }
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(path, 'utf8')) }
}

export function writeConfig(config: Config): void {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
}
