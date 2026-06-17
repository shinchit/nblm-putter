# nblm-putter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NotebookLM への再帰的ファイル自動登録ツールを、CLI + ローカル Web UI として構築する。

**Architecture:** Node.js + TypeScript の monorepo 構成。CLI が Playwright でローカルから NotebookLM を直接操作し、設定と履歴は SQLite に保存。Secrets Manager は設定のマシン間共有に使うがオプショナルで、未設定でも完全動作する。

**Tech Stack:** Node.js 20+, TypeScript, pnpm (monorepo), commander, playwright (Chromium), better-sqlite3, @aws-sdk/client-secrets-manager, minimatch, cli-progress, express, React 18, Vite, TailwindCSS

---

## File Map

```
nblm-putter/
├─ package.json                          # root (scripts only)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages/
│   ├─ cli/
│   │   ├─ package.json
│   │   ├─ tsconfig.json
│   │   ├─ vitest.config.ts
│   │   └─ src/
│   │       ├─ index.ts                  # CLI entrypoint (commander setup)
│   │       ├─ config.ts                 # ~/.nblm-putter/config.json R/W
│   │       ├─ db/
│   │       │   ├─ client.ts             # SQLite connection singleton
│   │       │   ├─ jobs.ts               # jobs table CRUD
│   │       │   └─ settings.ts           # settings table CRUD (fallback)
│   │       ├─ aws/
│   │       │   └─ secrets.ts            # Secrets Manager get/put
│   │       ├─ storage/
│   │       │   └─ index.ts              # unified storage (SM + local fallback)
│   │       ├─ ignore/
│   │       │   └─ filter.ts             # minimatch-based file filtering
│   │       ├─ playwright/
│   │       │   ├─ browser.ts            # Playwright launch/teardown
│   │       │   ├─ session.ts            # storageState save/load
│   │       │   └─ notebooklm.ts         # NotebookLM DOM operations
│   │       ├─ commands/
│   │       │   ├─ config.ts             # config init
│   │       │   ├─ auth.ts               # auth (headed login)
│   │       │   ├─ notebooks.ts          # notebooks list
│   │       │   ├─ ignore.ts             # ignore add/list/remove
│   │       │   ├─ sync.ts               # sync <folder> --notebook
│   │       │   └─ ui.ts                 # ui (local server)
│   │       └─ server/
│   │           ├─ app.ts                # Express app factory
│   │           └─ routes/
│   │               ├─ jobs.ts           # GET /api/jobs
│   │               ├─ settings.ts       # GET/PUT /api/settings/ignore
│   │               ├─ notebooks.ts      # GET /api/notebooks
│   │               ├─ session.ts        # POST /api/session
│   │               └─ sync.ts           # POST /api/sync
│   │   └─ tests/
│   │       ├─ config.test.ts
│   │       ├─ db/
│   │       │   ├─ jobs.test.ts
│   │       │   └─ settings.test.ts
│   │       ├─ storage/
│   │       │   └─ index.test.ts
│   │       └─ ignore/
│   │           └─ filter.test.ts
│   └─ ui/
│       ├─ package.json
│       ├─ tsconfig.json
│       ├─ vite.config.ts
│       ├─ tailwind.config.js
│       ├─ index.html
│       └─ src/
│           ├─ main.tsx
│           ├─ App.tsx
│           ├─ api/
│           │   └─ client.ts             # fetch wrappers for Express routes
│           ├─ components/
│           │   ├─ Sidebar.tsx
│           │   └─ ProgressBar.tsx
│           └─ pages/
│               ├─ Sync.tsx
│               ├─ History.tsx
│               ├─ Ignore.tsx
│               └─ Session.tsx
```

---

## Task 1: Monorepo スキャフォールド

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vite.config.ts`

- [ ] **Step 1: pnpm をインストール（未インストールの場合）**

```bash
npm install -g pnpm
```

- [ ] **Step 2: root package.json を作成**

```json
{
  "name": "nblm-putter",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm --filter cli test",
    "dev:ui": "pnpm --filter ui dev"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 3: pnpm-workspace.yaml を作成**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: tsconfig.base.json を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 5: packages/cli/package.json を作成**

```json
{
  "name": "nblm-putter",
  "version": "0.1.0",
  "bin": { "nblm-putter": "./dist/index.js" },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.0.0",
    "better-sqlite3": "^9.0.0",
    "cli-progress": "^3.0.0",
    "commander": "^12.0.0",
    "express": "^4.18.0",
    "minimatch": "^9.0.0",
    "open": "^10.0.0",
    "playwright": "^1.44.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/cli-progress": "^3.0.0",
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 6: packages/cli/tsconfig.json を作成**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: packages/cli/vitest.config.ts を作成**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 8: packages/ui/package.json を作成**

```json
{
  "name": "@nblm-putter/ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 9: packages/ui/tsconfig.json を作成**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 10: packages/ui/vite.config.ts を作成**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../cli/dist/public',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 11: 依存関係をインストール**

```bash
cd /path/to/nblm-putter && pnpm install
```

- [ ] **Step 12: Playwright の Chromium をインストール**

```bash
pnpm --filter nblm-putter exec playwright install chromium
```

- [ ] **Step 13: コミット**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages/
git commit -m "feat: monorepo scaffold with cli and ui packages"
```

---

## Task 2: Config モジュール

**Files:**
- Create: `packages/cli/src/config.ts`
- Create: `packages/cli/tests/config.test.ts`

- [ ] **Step 1: テストを書く**

`packages/cli/tests/config.test.ts`:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd packages/cli && pnpm test
```

Expected: FAIL with "Cannot find module '../src/config'"

- [ ] **Step 3: 実装を書く**

`packages/cli/src/config.ts`:

```typescript
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd packages/cli && pnpm test
```

Expected: PASS (3 tests)

- [ ] **Step 5: コミット**

```bash
git add packages/cli/src/config.ts packages/cli/tests/config.test.ts
git commit -m "feat: config file read/write module"
```

---

## Task 3: SQLite データ層

**Files:**
- Create: `packages/cli/src/db/client.ts`
- Create: `packages/cli/src/db/jobs.ts`
- Create: `packages/cli/src/db/settings.ts`
- Create: `packages/cli/tests/db/jobs.test.ts`
- Create: `packages/cli/tests/db/settings.test.ts`

- [ ] **Step 1: jobs テストを書く**

`packages/cli/tests/db/jobs.test.ts`:

```typescript
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
```

- [ ] **Step 2: settings テストを書く**

`packages/cli/tests/db/settings.test.ts`:

```typescript
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
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
cd packages/cli && pnpm test
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 4: db/client.ts を実装**

`packages/cli/src/db/client.ts`:

```typescript
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getConfigDir } from '../config'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = getConfigDir()
    mkdirSync(dir, { recursive: true })
    db = new Database(join(dir, 'db.sqlite'))
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      jobId TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      notebookId TEXT NOT NULL,
      totalFiles INTEGER NOT NULL DEFAULT 0,
      doneFiles INTEGER NOT NULL DEFAULT 0,
      errors TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
```

- [ ] **Step 5: db/jobs.ts を実装**

`packages/cli/src/db/jobs.ts`:

```typescript
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
  const row = getDb().prepare('SELECT * FROM jobs WHERE jobId = ?').get(jobId) as any
  if (!row) return null
  return { ...row, errors: JSON.parse(row.errors) }
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
  const rows = getDb().prepare('SELECT * FROM jobs ORDER BY createdAt DESC').all() as any[]
  return rows.map(r => ({ ...r, errors: JSON.parse(r.errors) }))
}
```

- [ ] **Step 6: db/settings.ts を実装**

`packages/cli/src/db/settings.ts`:

```typescript
import { getDb } from './client'

export function getIgnorePatterns(): string[] {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('ignorePatterns') as any
  if (!row) return []
  return JSON.parse(row.value) as string[]
}

export function setIgnorePatterns(patterns: string[]): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run('ignorePatterns', JSON.stringify(patterns))
}

export function addIgnorePattern(pattern: string): void {
  const current = getIgnorePatterns()
  if (!current.includes(pattern)) setIgnorePatterns([...current, pattern])
}

export function removeIgnorePattern(pattern: string): void {
  setIgnorePatterns(getIgnorePatterns().filter(p => p !== pattern))
}
```

- [ ] **Step 7: テストが通ることを確認**

```bash
cd packages/cli && pnpm test
```

Expected: PASS (all tests)

- [ ] **Step 8: コミット**

```bash
git add packages/cli/src/db/ packages/cli/tests/db/
git commit -m "feat: SQLite data layer for jobs and settings"
```

---

## Task 4: ストレージ抽象層（Secrets Manager + ローカルフォールバック）

**Files:**
- Create: `packages/cli/src/aws/secrets.ts`
- Create: `packages/cli/src/storage/index.ts`
- Create: `packages/cli/tests/storage/index.test.ts`

- [ ] **Step 1: テストを書く**

`packages/cli/tests/storage/index.test.ts`:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd packages/cli && pnpm test
```

Expected: FAIL

- [ ] **Step 3: aws/secrets.ts を実装**

`packages/cli/src/aws/secrets.ts`:

```typescript
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand } from '@aws-sdk/client-secrets-manager'
import { readConfig } from '../config'

function getClient(): SecretsManagerClient {
  const config = readConfig()
  return new SecretsManagerClient({ region: config.aws.region })
}

export async function smGet(secretId: string): Promise<unknown> {
  const result = await getClient().send(new GetSecretValueCommand({ SecretId: secretId }))
  return JSON.parse(result.SecretString ?? '{}')
}

export async function smPut(secretId: string, value: unknown): Promise<void> {
  const client = getClient()
  const payload = JSON.stringify(value)
  try {
    await client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: payload }))
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      await client.send(new CreateSecretCommand({ Name: secretId, SecretString: payload }))
    } else {
      throw err
    }
  }
}
```

- [ ] **Step 4: storage/index.ts を実装**

`packages/cli/src/storage/index.ts`:

```typescript
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
    await smGet(SESSION_SECRET)
    smAvailable = true
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
    return smGet(SESSION_SECRET) as Promise<StorageState>
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
    const data = await smGet(SETTINGS_SECRET) as { ignorePatterns?: string[] }
    return data.ignorePatterns ?? []
  }
  return getIgnorePatterns()
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
cd packages/cli && pnpm test
```

Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/cli/src/aws/ packages/cli/src/storage/ packages/cli/tests/storage/
git commit -m "feat: storage abstraction with Secrets Manager and local fallback"
```

---

## Task 5: ignore フィルター

**Files:**
- Create: `packages/cli/src/ignore/filter.ts`
- Create: `packages/cli/tests/ignore/filter.test.ts`

- [ ] **Step 1: テストを書く**

`packages/cli/tests/ignore/filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { filterFiles } from '../../src/ignore/filter'

describe('filterFiles', () => {
  const files = [
    '/project/src/index.ts',
    '/project/node_modules/react/index.js',
    '/project/dist/bundle.js',
    '/project/logs/app.log',
    '/project/README.md',
    '/project/.git/config',
  ]

  it('returns all files when no patterns', () => {
    expect(filterFiles(files, '/project', [])).toEqual(files)
  })

  it('excludes node_modules/', () => {
    const result = filterFiles(files, '/project', ['node_modules/'])
    expect(result).not.toContain('/project/node_modules/react/index.js')
    expect(result).toContain('/project/src/index.ts')
  })

  it('excludes *.log pattern', () => {
    const result = filterFiles(files, '/project', ['*.log'])
    expect(result).not.toContain('/project/logs/app.log')
  })

  it('excludes dist/ directory', () => {
    const result = filterFiles(files, '/project', ['dist/'])
    expect(result).not.toContain('/project/dist/bundle.js')
  })

  it('applies multiple patterns', () => {
    const result = filterFiles(files, '/project', ['node_modules/', '*.log', '.git/'])
    expect(result).toHaveLength(3)
    expect(result).toContain('/project/src/index.ts')
    expect(result).toContain('/project/README.md')
    expect(result).toContain('/project/dist/bundle.js')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd packages/cli && pnpm test
```

Expected: FAIL

- [ ] **Step 3: 実装を書く**

`packages/cli/src/ignore/filter.ts`:

```typescript
import { minimatch } from 'minimatch'
import { relative } from 'path'

export function filterFiles(files: string[], baseDir: string, patterns: string[]): string[] {
  if (patterns.length === 0) return files
  return files.filter(file => {
    const rel = relative(baseDir, file).replace(/\\/g, '/')
    return !patterns.some(pattern => {
      const p = pattern.endsWith('/') ? pattern + '**' : pattern
      return minimatch(rel, p, { dot: true }) || minimatch(rel, '**/' + p, { dot: true })
    })
  })
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd packages/cli && pnpm test
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/cli/src/ignore/ packages/cli/tests/ignore/
git commit -m "feat: ignore pattern filtering with minimatch"
```

---

## Task 6: Playwright ブラウザ・セッションモジュール

**Files:**
- Create: `packages/cli/src/playwright/browser.ts`
- Create: `packages/cli/src/playwright/session.ts`

> ユニットテストは Playwright の DOM 操作に依存するため、このタスクは実装のみ。実際の動作確認は Task 8（auth コマンド）で行う。

- [ ] **Step 1: browser.ts を実装**

`packages/cli/src/playwright/browser.ts`:

```typescript
import { chromium, Browser, BrowserContext } from 'playwright'
import { loadSession } from '../storage/index'

export interface BrowserHandle {
  browser: Browser
  context: BrowserContext
}

export async function launchHeaded(): Promise<BrowserHandle> {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  return { browser, context }
}

export async function launchHeadless(): Promise<BrowserHandle> {
  const session = await loadSession()
  if (!session) throw new Error('No session found. Run `nblm-putter auth` first.')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: session })
  return { browser, context }
}

export async function closeBrowser(handle: BrowserHandle): Promise<void> {
  await handle.context.close()
  await handle.browser.close()
}
```

- [ ] **Step 2: session.ts を実装**

`packages/cli/src/playwright/session.ts`:

```typescript
import { BrowserContext } from 'playwright'
import { saveSession } from '../storage/index'

export async function captureAndSaveSession(context: BrowserContext): Promise<void> {
  const state = await context.storageState()
  await saveSession(state)
}
```

- [ ] **Step 3: コミット**

```bash
git add packages/cli/src/playwright/browser.ts packages/cli/src/playwright/session.ts
git commit -m "feat: Playwright browser launch and session capture"
```

---

## Task 7: NotebookLM 操作モジュール

**Files:**
- Create: `packages/cli/src/playwright/notebooklm.ts`

> **重要:** NotebookLM（notebooklm.google.com）の実際の DOM を確認してセレクターを調整する必要がある。以下のセレクターはベストエフォートで記述しているが、実際のページ構造に合わせて修正すること。

- [ ] **Step 1: notebooklm.ts を実装**

`packages/cli/src/playwright/notebooklm.ts`:

```typescript
import { BrowserContext, Page } from 'playwright'

const NOTEBOOKLM_URL = 'https://notebooklm.google.com'

export interface Notebook {
  id: string
  title: string
}

export interface RegisterResult {
  file: string
  success: boolean
  reason?: string
}

export async function isSessionValid(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'networkidle', timeout: 30000 })
    // Google login page が表示されたらセッション切れ
    const url = page.url()
    return !url.includes('accounts.google.com')
  } finally {
    await page.close()
  }
}

export async function loginWithGoogle(page: Page): Promise<void> {
  await page.goto(NOTEBOOKLM_URL, { waitUntil: 'networkidle' })
  // Google OAuth ページへリダイレクトされるのを待つ
  // ユーザーが手動でログインするまで待機（最大5分）
  await page.waitForURL(url => url.startsWith(NOTEBOOKLM_URL), { timeout: 300000 })
  // ログイン後のページ読み込みを待つ
  await page.waitForLoadState('networkidle')
}

export async function listNotebooks(context: BrowserContext): Promise<Notebook[]> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'networkidle' })
    // NOTE: 実際のセレクターは NotebookLM の DOM を確認して調整する
    // ノートブックカードを取得
    await page.waitForSelector('[data-testid="notebook-card"], .notebook-card, mat-card', { timeout: 10000 })
    const notebooks = await page.evaluate(() => {
      // ノートブックのタイトルとIDを取得
      // IDはURLに含まれるケースが多い（/notebook/{id}）
      const cards = document.querySelectorAll('[data-testid="notebook-card"], .notebook-card, mat-card')
      return Array.from(cards).map((card, i) => {
        const link = card.querySelector('a')
        const title = card.querySelector('h3, h2, [class*="title"]')?.textContent?.trim() ?? `Notebook ${i + 1}`
        const href = link?.getAttribute('href') ?? ''
        const id = href.split('/').pop() ?? String(i)
        return { id, title }
      })
    })
    return notebooks
  } finally {
    await page.close()
  }
}

export async function registerFile(
  context: BrowserContext,
  notebookId: string,
  filePath: string,
  onProgress?: (file: string) => void
): Promise<RegisterResult> {
  const page = await context.newPage()
  try {
    await page.goto(`${NOTEBOOKLM_URL}/notebook/${notebookId}`, { waitUntil: 'networkidle' })

    // NOTE: 実際のボタンセレクターは DOM を確認して調整する
    // 「ソースを追加」ボタンをクリック
    const addSourceButton = page.locator('button:has-text("Add source"), button:has-text("ソースを追加"), [aria-label*="Add source"]').first()
    await addSourceButton.waitFor({ timeout: 10000 })
    await addSourceButton.click()

    // ファイルアップロードを選択
    const uploadOption = page.locator('button:has-text("Upload"), [role="menuitem"]:has-text("Upload"), button:has-text("アップロード")').first()
    await uploadOption.waitFor({ timeout: 5000 })
    await uploadOption.click()

    // ファイル選択ダイアログへファイルをセット
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    // アップロード完了を待つ（ローディングインジケーターが消えるまで）
    await page.waitForFunction(() => {
      const loaders = document.querySelectorAll('[class*="loading"], [class*="spinner"], mat-progress-bar')
      return loaders.length === 0
    }, { timeout: 60000 })

    onProgress?.(filePath)
    return { file: filePath, success: true }
  } catch (err: any) {
    return { file: filePath, success: false, reason: err.message }
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add packages/cli/src/playwright/notebooklm.ts
git commit -m "feat: NotebookLM Playwright operations module"
```

---

## Task 8: CLI エントリポイント + config init コマンド

**Files:**
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/config.ts`

- [ ] **Step 1: index.ts を実装**

`packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import { registerConfigCommand } from './commands/config'
import { registerAuthCommand } from './commands/auth'
import { registerNotebooksCommand } from './commands/notebooks'
import { registerIgnoreCommand } from './commands/ignore'
import { registerSyncCommand } from './commands/sync'
import { registerUiCommand } from './commands/ui'

const program = new Command()

program
  .name('nblm-putter')
  .description('Automatically register local files into NotebookLM')
  .version('0.1.0')

registerConfigCommand(program)
registerAuthCommand(program)
registerNotebooksCommand(program)
registerIgnoreCommand(program)
registerSyncCommand(program)
registerUiCommand(program)

program.parse()
```

- [ ] **Step 2: commands/config.ts を実装**

`packages/cli/src/commands/config.ts`:

```typescript
import { Command } from 'commander'
import * as readline from 'readline'
import { readConfig, writeConfig } from '../config'

function prompt(question: string, defaultVal: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(`${question} (${defaultVal}): `, answer => {
      rl.close()
      resolve(answer.trim() || defaultVal)
    })
  })
}

export function registerConfigCommand(program: Command): void {
  const config = program.command('config')

  config
    .command('init')
    .description('Initialize nblm-putter configuration')
    .action(async () => {
      const current = readConfig()
      const region = await prompt('AWS region', current.aws.region)
      const profile = await prompt('AWS profile', current.aws.profile)
      const smInput = await prompt('Use Secrets Manager for cross-machine sync? (y/n)', current.useSecretsManager ? 'y' : 'n')
      writeConfig({
        useSecretsManager: smInput.toLowerCase() === 'y',
        aws: { region, profile },
      })
      console.log('✓ Configuration saved.')
    })
}
```

- [ ] **Step 3: 動作確認（手動）**

```bash
cd packages/cli && npx tsx src/index.ts --help
```

Expected: コマンド一覧が表示される（auth, notebooks 等は未実装エラーが出ても可）

- [ ] **Step 4: コミット**

```bash
git add packages/cli/src/index.ts packages/cli/src/commands/config.ts
git commit -m "feat: CLI entrypoint and config init command"
```

---

## Task 9: auth コマンド

**Files:**
- Create: `packages/cli/src/commands/auth.ts`

- [ ] **Step 1: 実装を書く**

`packages/cli/src/commands/auth.ts`:

```typescript
import { Command } from 'commander'
import { launchHeaded, closeBrowser } from '../playwright/browser'
import { loginWithGoogle } from '../playwright/notebooklm'
import { captureAndSaveSession } from '../playwright/session'

export function registerAuthCommand(program: Command): void {
  program
    .command('auth')
    .description('Authenticate with Google and save session')
    .action(async () => {
      console.log('Opening browser for Google login...')
      const handle = await launchHeaded()
      try {
        await loginWithGoogle(await handle.context.newPage())
        await captureAndSaveSession(handle.context)
        console.log('✓ Session saved successfully.')
      } finally {
        await closeBrowser(handle)
      }
    })
}
```

- [ ] **Step 2: 手動で動作確認**

```bash
cd packages/cli && npx tsx src/index.ts auth
```

Expected:
1. ブラウザが起動して NotebookLM → Google ログイン画面が開く
2. 手動でログインすると NotebookLM トップに遷移
3. "✓ Session saved successfully." が表示される
4. `~/.nblm-putter/session.json` が作成される

> ここで実際の Google ログインが必要。Playwright のヘッドブラウザで操作する。

- [ ] **Step 3: セッション切れ時の動作確認**

```bash
cd packages/cli && npx tsx src/index.ts auth
# ブラウザが開いたらログインせずに閉じる（タイムアウトを確認）
```

- [ ] **Step 4: コミット**

```bash
git add packages/cli/src/commands/auth.ts
git commit -m "feat: auth command for Google login and session capture"
```

---

## Task 10: notebooks コマンド

**Files:**
- Create: `packages/cli/src/commands/notebooks.ts`

- [ ] **Step 1: 実装を書く**

`packages/cli/src/commands/notebooks.ts`:

```typescript
import { Command } from 'commander'
import { launchHeadless, closeBrowser } from '../playwright/browser'
import { isSessionValid, listNotebooks } from '../playwright/notebooklm'

export function registerNotebooksCommand(program: Command): void {
  const notebooks = program.command('notebooks')

  notebooks
    .command('list')
    .description('List all notebooks in NotebookLM')
    .action(async () => {
      const handle = await launchHeadless()
      try {
        if (!await isSessionValid(handle.context)) {
          console.error('✗ Session expired. Run `nblm-putter auth` to re-authenticate.')
          process.exit(1)
        }
        console.log('Fetching notebooks...')
        const notebooks = await listNotebooks(handle.context)
        if (notebooks.length === 0) {
          console.log('No notebooks found.')
          return
        }
        console.log('\nNotebooks:')
        notebooks.forEach(nb => console.log(`  ${nb.id}  ${nb.title}`))
      } finally {
        await closeBrowser(handle)
      }
    })
}
```

- [ ] **Step 2: 手動で動作確認**

```bash
cd packages/cli && npx tsx src/index.ts notebooks list
```

Expected: ノートブック一覧がテーブル表示される

> **NOTE:** `notebooklm.ts` の `listNotebooks` のセレクターが実際の DOM と合わない場合は、ブラウザの DevTools で確認して `notebooklm.ts` を修正する。

- [ ] **Step 3: コミット**

```bash
git add packages/cli/src/commands/notebooks.ts
git commit -m "feat: notebooks list command"
```

---

## Task 11: ignore コマンド

**Files:**
- Create: `packages/cli/src/commands/ignore.ts`

- [ ] **Step 1: 実装を書く**

`packages/cli/src/commands/ignore.ts`:

```typescript
import { Command } from 'commander'
import { loadIgnorePatterns, saveIgnorePatterns } from '../storage/index'

export function registerIgnoreCommand(program: Command): void {
  const ignore = program.command('ignore')

  ignore
    .command('list')
    .description('List ignore patterns')
    .action(async () => {
      const patterns = await loadIgnorePatterns()
      if (patterns.length === 0) {
        console.log('No ignore patterns set.')
        return
      }
      patterns.forEach(p => console.log(`  ${p}`))
    })

  ignore
    .command('add <pattern>')
    .description('Add an ignore pattern (e.g. "*.log", "node_modules/")')
    .action(async (pattern: string) => {
      const patterns = await loadIgnorePatterns()
      if (patterns.includes(pattern)) {
        console.log(`Pattern already exists: ${pattern}`)
        return
      }
      await saveIgnorePatterns([...patterns, pattern])
      console.log(`✓ Added: ${pattern}`)
    })

  ignore
    .command('remove <pattern>')
    .description('Remove an ignore pattern')
    .action(async (pattern: string) => {
      const patterns = await loadIgnorePatterns()
      if (!patterns.includes(pattern)) {
        console.log(`Pattern not found: ${pattern}`)
        return
      }
      await saveIgnorePatterns(patterns.filter(p => p !== pattern))
      console.log(`✓ Removed: ${pattern}`)
    })
}
```

- [ ] **Step 2: 手動で動作確認**

```bash
cd packages/cli && npx tsx src/index.ts ignore add "*.log"
npx tsx src/index.ts ignore add "node_modules/"
npx tsx src/index.ts ignore list
npx tsx src/index.ts ignore remove "*.log"
npx tsx src/index.ts ignore list
```

Expected: 追加・一覧・削除が正常動作する

- [ ] **Step 3: コミット**

```bash
git add packages/cli/src/commands/ignore.ts
git commit -m "feat: ignore pattern management commands"
```

---

## Task 12: sync コマンド

**Files:**
- Create: `packages/cli/src/commands/sync.ts`

- [ ] **Step 1: 実装を書く**

`packages/cli/src/commands/sync.ts`:

```typescript
import { Command } from 'commander'
import { readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { SingleBar, Presets } from 'cli-progress'
import { launchHeadless, closeBrowser } from '../playwright/browser'
import { isSessionValid, registerFile } from '../playwright/notebooklm'
import { loadIgnorePatterns } from '../storage/index'
import { filterFiles } from '../ignore/filter'
import { createJob, updateJob } from '../db/jobs'

function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkDir(fullPath))
    else results.push(fullPath)
  }
  return results
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync <folder>')
    .description('Sync files from a folder to NotebookLM')
    .requiredOption('--notebook <id>', 'Target notebook ID (from `notebooks list`)')
    .action(async (folder: string, opts: { notebook: string }) => {
      const absFolder = resolve(folder)
      const handle = await launchHeadless()

      try {
        if (!await isSessionValid(handle.context)) {
          console.error('✗ Session expired. Run `nblm-putter auth` to re-authenticate.')
          process.exit(1)
        }

        const ignorePatterns = await loadIgnorePatterns()
        const allFiles = walkDir(absFolder)
        const files = filterFiles(allFiles, absFolder, ignorePatterns)

        if (files.length === 0) {
          console.log('No files to sync.')
          return
        }

        console.log(`Syncing ${files.length} files to notebook ${opts.notebook}...`)
        const jobId = createJob({ notebookId: opts.notebook, totalFiles: files.length })
        updateJob(jobId, { status: 'running' })

        const bar = new SingleBar({ format: '{bar} {percentage}% | {value}/{total} | {filename}' }, Presets.shades_classic)
        bar.start(files.length, 0, { filename: '' })

        const errors: Array<{ file: string; reason: string }> = []
        let done = 0

        for (const file of files) {
          const result = await registerFile(handle.context, opts.notebook, file)
          done++
          if (!result.success) errors.push({ file: result.file, reason: result.reason ?? 'unknown' })
          updateJob(jobId, { doneFiles: done, errors })
          bar.update(done, { filename: file.split('/').pop() })
        }

        bar.stop()
        updateJob(jobId, { status: 'done' })

        if (errors.length > 0) {
          console.warn(`\n⚠ ${errors.length} file(s) failed:`)
          errors.forEach(e => console.warn(`  ${e.file}: ${e.reason}`))
        } else {
          console.log(`\n✓ All ${files.length} files registered successfully. (Job ID: ${jobId})`)
        }
      } catch (err) {
        console.error('✗ Sync failed:', err)
        process.exit(1)
      } finally {
        await closeBrowser(handle)
      }
    })
}
```

- [ ] **Step 2: 手動で動作確認（小さいフォルダで）**

```bash
mkdir /tmp/test-sync && echo "hello" > /tmp/test-sync/test.txt
cd packages/cli && npx tsx src/index.ts notebooks list
# 表示されたノートブックIDをコピーして使う
npx tsx src/index.ts sync /tmp/test-sync --notebook <notebook-id>
```

Expected:
- プログレスバーが表示される
- 完了後 "✓ All 1 files registered successfully." が表示される
- NotebookLM のノートブックに test.txt が追加されている

- [ ] **Step 3: ignore パターンの動作確認**

```bash
echo "ignored" > /tmp/test-sync/test.log
npx tsx src/index.ts ignore add "*.log"
npx tsx src/index.ts sync /tmp/test-sync --notebook <notebook-id>
```

Expected: test.log がスキップされ、test.txt のみ登録される

- [ ] **Step 4: コミット**

```bash
git add packages/cli/src/commands/sync.ts
git commit -m "feat: sync command with progress bar and ignore filtering"
```

---

## Task 13: Express サーバー

**Files:**
- Create: `packages/cli/src/server/app.ts`
- Create: `packages/cli/src/server/routes/jobs.ts`
- Create: `packages/cli/src/server/routes/settings.ts`
- Create: `packages/cli/src/server/routes/notebooks.ts`
- Create: `packages/cli/src/server/routes/session.ts`
- Create: `packages/cli/src/server/routes/sync.ts`

- [ ] **Step 1: server/app.ts を実装**

`packages/cli/src/server/app.ts`:

```typescript
import express from 'express'
import { join } from 'path'
import { existsSync } from 'fs'
import { jobsRouter } from './routes/jobs'
import { settingsRouter } from './routes/settings'
import { notebooksRouter } from './routes/notebooks'
import { sessionRouter } from './routes/session'
import { syncRouter } from './routes/sync'

export function createApp(): express.Application {
  const app = express()
  app.use(express.json())

  app.use('/api/jobs', jobsRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/notebooks', notebooksRouter)
  app.use('/api/session', sessionRouter)
  app.use('/api/sync', syncRouter)

  // UI の静的ファイルを配信（ビルド済み）
  const publicDir = join(__dirname, 'public')
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir))
    app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')))
  }

  return app
}
```

- [ ] **Step 2: routes/jobs.ts を実装**

`packages/cli/src/server/routes/jobs.ts`:

```typescript
import { Router } from 'express'
import { listJobs, getJob } from '../../db/jobs'

export const jobsRouter = Router()

jobsRouter.get('/', (_req, res) => {
  res.json(listJobs())
})

jobsRouter.get('/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Not found' })
  res.json(job)
})
```

- [ ] **Step 3: routes/settings.ts を実装**

`packages/cli/src/server/routes/settings.ts`:

```typescript
import { Router } from 'express'
import { loadIgnorePatterns, saveIgnorePatterns } from '../../storage/index'

export const settingsRouter = Router()

settingsRouter.get('/ignore', async (_req, res) => {
  res.json(await loadIgnorePatterns())
})

settingsRouter.put('/ignore', async (req, res) => {
  const { patterns } = req.body as { patterns: string[] }
  if (!Array.isArray(patterns)) return res.status(400).json({ error: 'patterns must be array' })
  await saveIgnorePatterns(patterns)
  res.json({ ok: true })
})
```

- [ ] **Step 4: routes/notebooks.ts を実装**

`packages/cli/src/server/routes/notebooks.ts`:

```typescript
import { Router } from 'express'
import { launchHeadless, closeBrowser } from '../../playwright/browser'
import { listNotebooks } from '../../playwright/notebooklm'

export const notebooksRouter = Router()

notebooksRouter.get('/', async (_req, res) => {
  const handle = await launchHeadless()
  try {
    const notebooks = await listNotebooks(handle.context)
    res.json(notebooks)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  } finally {
    await closeBrowser(handle)
  }
})
```

- [ ] **Step 5: routes/session.ts を実装**

`packages/cli/src/server/routes/session.ts`:

```typescript
import { Router } from 'express'
import { saveSession } from '../../storage/index'

export const sessionRouter = Router()

sessionRouter.post('/', async (req, res) => {
  try {
    await saveSession(req.body)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 6: routes/sync.ts を実装**

`packages/cli/src/server/routes/sync.ts`:

```typescript
import { Router } from 'express'
import { readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { launchHeadless, closeBrowser } from '../../playwright/browser'
import { isSessionValid, registerFile } from '../../playwright/notebooklm'
import { loadIgnorePatterns } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { createJob, updateJob } from '../../db/jobs'

function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkDir(fullPath))
    else results.push(fullPath)
  }
  return results
}

export const syncRouter = Router()

syncRouter.post('/', async (req, res) => {
  const { folder, notebookId } = req.body as { folder: string; notebookId: string }
  if (!folder || !notebookId) return res.status(400).json({ error: 'folder and notebookId required' })

  const absFolder = resolve(folder)
  const jobId = createJob({ notebookId, totalFiles: 0 })
  res.json({ jobId })

  // バックグラウンドで実行
  setImmediate(async () => {
    const handle = await launchHeadless()
    try {
      if (!await isSessionValid(handle.context)) {
        updateJob(jobId, { status: 'failed' })
        return
      }
      const ignorePatterns = await loadIgnorePatterns()
      const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)
      updateJob(jobId, { status: 'running' })

      const errors: Array<{ file: string; reason: string }> = []
      let done = 0
      for (const file of files) {
        const result = await registerFile(handle.context, notebookId, file)
        done++
        if (!result.success) errors.push({ file: result.file, reason: result.reason ?? 'unknown' })
        updateJob(jobId, { doneFiles: done, errors })
      }
      updateJob(jobId, { status: 'done' })
    } catch {
      updateJob(jobId, { status: 'failed' })
    } finally {
      await closeBrowser(handle)
    }
  })
})
```

- [ ] **Step 7: コミット**

```bash
git add packages/cli/src/server/
git commit -m "feat: Express API server with jobs, settings, notebooks, session, sync routes"
```

---

## Task 14: ui コマンド

**Files:**
- Create: `packages/cli/src/commands/ui.ts`

- [ ] **Step 1: 実装を書く**

`packages/cli/src/commands/ui.ts`:

```typescript
import { Command } from 'commander'
import { createApp } from '../server/app'
import open from 'open'

export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Start local web UI at http://localhost:3000')
    .option('-p, --port <port>', 'Port number', '3000')
    .action((opts: { port: string }) => {
      const port = parseInt(opts.port, 10)
      const app = createApp()
      app.listen(port, () => {
        const url = `http://localhost:${port}`
        console.log(`✓ Web UI running at ${url}`)
        open(url)
      })
    })
}
```

- [ ] **Step 2: コミット**

```bash
git add packages/cli/src/commands/ui.ts
git commit -m "feat: ui command to start local web server"
```

---

## Task 15: React UI — スキャフォールド + レイアウト

**Files:**
- Create: `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`
- Create: `packages/ui/src/App.tsx`
- Create: `packages/ui/src/components/Sidebar.tsx`
- Create: `packages/ui/tailwind.config.js`
- Create: `packages/ui/postcss.config.js`
- Create: `packages/ui/src/index.css`

- [ ] **Step 1: TailwindCSS を設定**

`packages/ui/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`packages/ui/postcss.config.js`:

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

`packages/ui/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: index.html を作成**

`packages/ui/index.html`:

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>nblm-putter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: main.tsx を作成**

`packages/ui/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 4: Sidebar.tsx を作成**

`packages/ui/src/components/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Sync' },
  { to: '/history', label: 'History' },
  { to: '/ignore', label: 'Ignore' },
  { to: '/session', label: 'Session' },
]

export function Sidebar() {
  return (
    <nav className="w-48 bg-gray-900 text-white min-h-screen p-4 flex flex-col gap-2">
      <h1 className="text-lg font-bold mb-6 text-blue-400">nblm-putter</h1>
      {links.map(link => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) =>
            `px-3 py-2 rounded text-sm ${isActive ? 'bg-blue-600' : 'hover:bg-gray-700'}`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 5: App.tsx を作成**

`packages/ui/src/App.tsx`:

```tsx
import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Sync } from './pages/Sync'
import { History } from './pages/History'
import { Ignore } from './pages/Ignore'
import { Session } from './pages/Session'

export default function App() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <Routes>
          <Route path="/" element={<Sync />} />
          <Route path="/history" element={<History />} />
          <Route path="/ignore" element={<Ignore />} />
          <Route path="/session" element={<Session />} />
        </Routes>
      </main>
    </div>
  )
}
```

- [ ] **Step 6: 動作確認**

```bash
cd packages/ui && pnpm dev
```

Expected: `http://localhost:5173` でサイドバー付きのレイアウトが表示される

- [ ] **Step 7: コミット**

```bash
git add packages/ui/
git commit -m "feat: React UI scaffold with sidebar layout and routing"
```

---

## Task 16: UI — API クライアント + Sync ページ

**Files:**
- Create: `packages/ui/src/api/client.ts`
- Create: `packages/ui/src/components/ProgressBar.tsx`
- Create: `packages/ui/src/pages/Sync.tsx`

- [ ] **Step 1: API クライアントを実装**

`packages/ui/src/api/client.ts`:

```typescript
const BASE = '/api'

export async function getNotebooks(): Promise<{ id: string; title: string }[]> {
  const res = await fetch(`${BASE}/notebooks`)
  if (!res.ok) throw new Error('Failed to fetch notebooks')
  return res.json()
}

export async function startSync(folder: string, notebookId: string): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, notebookId }),
  })
  if (!res.ok) throw new Error('Failed to start sync')
  return res.json()
}

export async function getJob(jobId: string): Promise<any> {
  const res = await fetch(`${BASE}/jobs/${jobId}`)
  if (!res.ok) throw new Error('Failed to get job')
  return res.json()
}

export async function listJobs(): Promise<any[]> {
  const res = await fetch(`${BASE}/jobs`)
  if (!res.ok) throw new Error('Failed to list jobs')
  return res.json()
}

export async function getIgnorePatterns(): Promise<string[]> {
  const res = await fetch(`${BASE}/settings/ignore`)
  if (!res.ok) throw new Error('Failed to get patterns')
  return res.json()
}

export async function saveIgnorePatterns(patterns: string[]): Promise<void> {
  const res = await fetch(`${BASE}/settings/ignore`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patterns }),
  })
  if (!res.ok) throw new Error('Failed to save patterns')
}

export async function uploadSession(sessionJson: unknown): Promise<void> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionJson),
  })
  if (!res.ok) throw new Error('Failed to upload session')
}
```

- [ ] **Step 2: ProgressBar コンポーネントを実装**

`packages/ui/src/components/ProgressBar.tsx`:

```tsx
interface Props {
  value: number
  total: number
}

export function ProgressBar({ value, total }: Props) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{pct}%</span>
        <span>{value} / {total} files</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Sync ページを実装**

`packages/ui/src/pages/Sync.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react'
import { getNotebooks, startSync, getJob } from '../api/client'
import { ProgressBar } from '../components/ProgressBar'

export function Sync() {
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([])
  const [notebookId, setNotebookId] = useState('')
  const [folder, setFolder] = useState('')
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    getNotebooks().then(setNotebooks).catch(() => setError('Failed to load notebooks. Is your session valid?'))
    return () => clearInterval(pollRef.current)
  }, [])

  async function handleSync() {
    if (!notebookId || !folder) return
    setError('')
    setLoading(true)
    try {
      const { jobId } = await startSync(folder, notebookId)
      pollRef.current = setInterval(async () => {
        const j = await getJob(jobId)
        setJob(j)
        if (j.status === 'done' || j.status === 'failed') {
          clearInterval(pollRef.current)
          setLoading(false)
        }
      }, 1000)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-6">Sync Files</h2>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Notebook</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={notebookId}
            onChange={e => setNotebookId(e.target.value)}
          >
            <option value="">Select a notebook...</option>
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.id}>{nb.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Folder Path</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 font-mono text-sm"
            placeholder="/path/to/your/folder"
            value={folder}
            onChange={e => setFolder(e.target.value)}
          />
        </div>

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleSync}
          disabled={loading || !notebookId || !folder}
        >
          {loading ? 'Syncing...' : 'Sync'}
        </button>

        {job && (
          <div className="mt-4">
            <ProgressBar value={job.doneFiles} total={job.totalFiles} />
            {job.status === 'done' && (
              <p className="text-green-600 mt-2">✓ Sync complete!</p>
            )}
            {job.status === 'failed' && (
              <p className="text-red-600 mt-2">✗ Sync failed. Check session.</p>
            )}
            {job.errors?.length > 0 && (
              <details className="mt-2">
                <summary className="text-yellow-600 cursor-pointer">{job.errors.length} error(s)</summary>
                <ul className="text-sm text-gray-600 mt-1">
                  {job.errors.map((e: any, i: number) => (
                    <li key={i}>{e.file}: {e.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 動作確認**

```bash
# Terminal 1: UIをdev起動
cd packages/ui && pnpm dev

# Terminal 2: APIサーバーを起動
cd packages/cli && npx tsx src/index.ts ui --port 3001
```

ブラウザで `http://localhost:5173` を開き、ノートブック一覧が表示されることを確認。

- [ ] **Step 5: コミット**

```bash
git add packages/ui/src/api/ packages/ui/src/components/ProgressBar.tsx packages/ui/src/pages/Sync.tsx
git commit -m "feat: Sync page with notebook selector and real-time progress"
```

---

## Task 17: UI — History / Ignore / Session ページ

**Files:**
- Create: `packages/ui/src/pages/History.tsx`
- Create: `packages/ui/src/pages/Ignore.tsx`
- Create: `packages/ui/src/pages/Session.tsx`

- [ ] **Step 1: History ページを実装**

`packages/ui/src/pages/History.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { listJobs } from '../api/client'

export function History() {
  const [jobs, setJobs] = useState<any[]>([])

  useEffect(() => { listJobs().then(setJobs) }, [])

  const statusColor: Record<string, string> = {
    done: 'text-green-600', failed: 'text-red-600',
    running: 'text-blue-600', pending: 'text-gray-500',
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Job History</h2>
      {jobs.length === 0 && <p className="text-gray-500">No jobs yet.</p>}
      <div className="flex flex-col gap-3">
        {jobs.map(job => (
          <div key={job.jobId} className="border rounded p-4 bg-white">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-mono text-xs text-gray-400">{job.jobId}</p>
                <p className="text-sm mt-1">Notebook: {job.notebookId}</p>
                <p className="text-sm">{job.doneFiles} / {job.totalFiles} files</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-medium ${statusColor[job.status]}`}>{job.status}</span>
                <p className="text-xs text-gray-400 mt-1">{new Date(job.createdAt).toLocaleString('ja-JP')}</p>
              </div>
            </div>
            {job.errors?.length > 0 && (
              <details className="mt-2">
                <summary className="text-yellow-600 text-sm cursor-pointer">{job.errors.length} error(s)</summary>
                <ul className="text-xs text-gray-500 mt-1">
                  {job.errors.map((e: any, i: number) => <li key={i}>{e.file}</li>)}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ignore ページを実装**

`packages/ui/src/pages/Ignore.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { getIgnorePatterns, saveIgnorePatterns } from '../api/client'

export function Ignore() {
  const [patterns, setPatterns] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { getIgnorePatterns().then(setPatterns) }, [])

  async function addPattern() {
    const trimmed = input.trim()
    if (!trimmed || patterns.includes(trimmed)) return
    const next = [...patterns, trimmed]
    setSaving(true)
    await saveIgnorePatterns(next)
    setPatterns(next)
    setInput('')
    setSaving(false)
  }

  async function removePattern(pattern: string) {
    const next = patterns.filter(p => p !== pattern)
    setSaving(true)
    await saveIgnorePatterns(next)
    setPatterns(next)
    setSaving(false)
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-6">Ignore Patterns</h2>
      <p className="text-sm text-gray-500 mb-4">Glob patterns to exclude from sync (e.g. <code>*.log</code>, <code>node_modules/</code>)</p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 border rounded px-3 py-2 font-mono text-sm"
          placeholder="*.log"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addPattern()}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={addPattern}
          disabled={saving}
        >
          Add
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {patterns.map(p => (
          <li key={p} className="flex justify-between items-center border rounded px-3 py-2 bg-white">
            <code className="text-sm">{p}</code>
            <button
              className="text-red-500 hover:text-red-700 text-sm"
              onClick={() => removePattern(p)}
              disabled={saving}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Session ページを実装**

`packages/ui/src/pages/Session.tsx`:

```tsx
import { useState } from 'react'
import { uploadSession } from '../api/client'

export function Session() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('idle')
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      await uploadSession(json)
      setStatus('success')
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-6">Session</h2>
      <p className="text-sm text-gray-600 mb-2">
        To refresh the session, run <code className="bg-gray-100 px-1 rounded">nblm-putter auth</code> locally,
        then upload the generated <code className="bg-gray-100 px-1 rounded">session.json</code> file.
      </p>
      <p className="text-xs text-gray-400 mb-6">
        File location: <code>~/.nblm-putter/session.json</code>
      </p>

      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 bg-white">
        <span className="text-gray-500 text-sm">Click to upload session.json</span>
        <input type="file" accept=".json" className="hidden" onChange={handleFileChange} />
      </label>

      {status === 'success' && <p className="text-green-600 mt-4">✓ Session updated successfully.</p>}
      {status === 'error' && <p className="text-red-600 mt-4">✗ {error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: 動作確認**

```bash
cd packages/ui && pnpm dev
```

各ページを開いて動作確認:
- `/history` → ジョブ履歴が表示される
- `/ignore` → パターン追加・削除ができる
- `/session` → JSON ファイルアップロードができる

- [ ] **Step 5: コミット**

```bash
git add packages/ui/src/pages/
git commit -m "feat: History, Ignore, and Session pages"
```

---

## Task 18: ビルド + パッケージング

**Files:**
- Modify: `packages/cli/src/server/app.ts` (public dir パスを dist 相対に調整済み)
- Modify: `packages/cli/package.json` (build スクリプトに UI ビルドを追加)

- [ ] **Step 1: ルート build スクリプトを更新**

`package.json` の `scripts.build` を以下に更新:

```json
{
  "scripts": {
    "build": "pnpm --filter @nblm-putter/ui build && pnpm --filter nblm-putter build",
    "test": "pnpm --filter nblm-putter test"
  }
}
```

- [ ] **Step 2: ビルドを実行**

```bash
pnpm build
```

Expected: `packages/cli/dist/` に JS ファイルが、`packages/cli/dist/public/` に React のビルド成果物が生成される。

- [ ] **Step 3: ビルド済みバイナリの動作確認**

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js ui
```

Expected: ブラウザが開き、UI が正常に表示される

- [ ] **Step 4: グローバルインストールの確認（オプション）**

```bash
cd packages/cli && npm link
nblm-putter --help
nblm-putter ui
```

- [ ] **Step 5: コミット**

```bash
git add package.json
git commit -m "feat: unified build script packaging CLI and UI together"
```

---

## 完了チェックリスト

- [ ] `nblm-putter config init` で設定ファイルが作成される
- [ ] `nblm-putter auth` でブラウザが開き Google ログイン後にセッションが保存される
- [ ] `nblm-putter notebooks list` でノートブック一覧が表示される
- [ ] `nblm-putter ignore add/list/remove` が正常動作する
- [ ] `nblm-putter sync <folder> --notebook <id>` でファイルが NotebookLM に登録される
- [ ] `nblm-putter ui` でブラウザが開き全ページが動作する
- [ ] Secrets Manager なしでも全機能が動作する（ローカルモード警告のみ）
- [ ] Windows PowerShell でも全コマンドが動作する
- [ ] `pnpm test` が全て PASS する
