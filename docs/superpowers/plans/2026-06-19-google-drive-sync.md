# Google Drive Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct file upload to NotebookLM with a Google Drive–based flow that uploads all files to Drive first, then adds them as sources in NotebookLM via the Drive picker in a single batch, eliminating the per-file button-disable bottleneck.

**Architecture:** Files are uploaded to Google Drive (`nblm-putter/{notebook-id}/`) via the Drive API v3, then Playwright opens NotebookLM's Drive picker iframe, navigates to that folder, selects all files at once, and confirms. NotebookLM processes them in parallel without disabling the button between files.

**Tech Stack:** `googleapis` npm package (Drive API v3), Playwright (existing), Google Cloud OAuth2 (user-supplied client_id + client_secret), vitest (existing).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/cli/src/config.ts` | Add `drive: { clientId, clientSecret }` to Config type |
| Modify | `packages/cli/src/commands/config.ts` | Prompt for Drive client_id / client_secret |
| Create | `packages/cli/src/drive/token.ts` | Save / load / expiry-check Drive OAuth2 tokens |
| Modify | `packages/cli/src/commands/auth.ts` | Add Drive OAuth2 flow after NotebookLM session save |
| Create | `packages/cli/src/drive/client.ts` | Drive API: create folder, upload file, check existing |
| Create | `packages/cli/src/playwright/drive-picker.ts` | Navigate Drive picker iframe, select all, confirm |
| Create | `packages/cli/src/server/routes/drive-sync.ts` | `POST /api/drive-sync` — orchestrate upload + picker |
| Modify | `packages/cli/src/server/app.ts` | Register `/api/drive-sync` route |
| Modify | `packages/cli/src/commands/sync.ts` | Invoke Drive upload + picker instead of direct upload |
| Modify | `packages/ui/src/api/client.ts` | Add `startDriveSync()` |
| Modify | `packages/ui/src/pages/Sync.tsx` | Change "Sync" button to "Sync via Drive", 2-phase progress |
| Test | `packages/cli/src/drive/token.test.ts` | Unit tests for token save/load/expiry |

---

## Task 1: Add `googleapis` dependency + extend Config type

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/config.ts`

- [ ] **Step 1: Install googleapis**

```bash
cd packages/cli
pnpm add googleapis
```

Expected: `googleapis` appears in `packages/cli/package.json` dependencies.

- [ ] **Step 2: Extend the Config type in `packages/cli/src/config.ts`**

Replace the entire file with:

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
  drive: {
    clientId: string
    clientSecret: string
  }
}

const DEFAULT_CONFIG: Config = {
  useSecretsManager: false,
  aws: { region: 'ap-northeast-1', profile: 'default' },
  drive: { clientId: '', clientSecret: '' },
}

export function getConfigDir(): string {
  return process.env.NBLM_CONFIG_DIR ?? join(os.homedir(), '.nblm-putter')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export function readConfig(): Config {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG, aws: { ...DEFAULT_CONFIG.aws }, drive: { ...DEFAULT_CONFIG.drive } }
  const saved = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    aws: { ...DEFAULT_CONFIG.aws, ...saved.aws },
    drive: { ...DEFAULT_CONFIG.drive, ...saved.drive },
  }
}

export function writeConfig(config: Config): void {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd ../..
pnpm build
```

Expected: `packages/cli build: Done` with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json packages/cli/src/config.ts pnpm-lock.yaml
git commit -m "feat: add googleapis dep + drive config type"
```

---

## Task 2: Drive token management

**Files:**
- Create: `packages/cli/src/drive/token.ts`
- Create: `packages/cli/src/drive/token.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/drive/token.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { loadDriveToken, saveDriveToken, isTokenExpired } from './token'

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
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/cli
pnpm test src/drive/token.test.ts
```

Expected: FAIL with "Cannot find module './token'"

- [ ] **Step 3: Implement `packages/cli/src/drive/token.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test src/drive/token.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Build**

```bash
cd ../..
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/drive/token.ts packages/cli/src/drive/token.test.ts
git commit -m "feat: Drive token save/load/expiry"
```

---

## Task 3: Extend `config init` with Drive credentials

**Files:**
- Modify: `packages/cli/src/commands/config.ts`

- [ ] **Step 1: Update `packages/cli/src/commands/config.ts`**

```typescript
import { Command } from 'commander'
import * as readline from 'readline'
import { readConfig, writeConfig } from '../config'

function prompt(question: string, defaultVal: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.on('error', () => { rl.close(); resolve(defaultVal) })
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
      const clientId = await prompt('Google Cloud OAuth2 Client ID (for Drive sync, Enter to skip)', current.drive.clientId)
      const clientSecret = await prompt('Google Cloud OAuth2 Client Secret (for Drive sync, Enter to skip)', current.drive.clientSecret)
      writeConfig({
        useSecretsManager: smInput.toLowerCase() === 'y',
        aws: { region, profile },
        drive: { clientId, clientSecret },
      })
      console.log('✓ Configuration saved.')
    })
}
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/config.ts
git commit -m "feat: config init - add Drive client_id / client_secret prompts"
```

---

## Task 4: Drive OAuth2 auth flow

**Files:**
- Modify: `packages/cli/src/commands/auth.ts`

- [ ] **Step 1: Update `packages/cli/src/commands/auth.ts`**

```typescript
import { Command } from 'commander'
import { createServer } from 'http'
import { google } from 'googleapis'
import { launchHeaded, closeBrowser } from '../playwright/browser'
import { loginWithGoogle } from '../playwright/notebooklm'
import { captureAndSaveSession } from '../playwright/session'
import { readConfig } from '../config'
import { saveDriveToken } from '../drive/token'

async function authDrive(): Promise<void> {
  const { drive } = readConfig()
  if (!drive.clientId || !drive.clientSecret) {
    console.log('⚠ Drive credentials not set. Skipping Drive auth. Run `nblm-putter config init` to configure.')
    return
  }

  const oauth2 = new google.auth.OAuth2(
    drive.clientId,
    drive.clientSecret,
    'http://localhost:3001/callback'
  )

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  })

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost:3001')
      const c = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body>Drive 認証完了。このタブを閉じてください。</body></html>')
      server.close()
      if (c) resolve(c)
      else reject(new Error('No authorization code in callback'))
    })
    server.listen(3001, () => {
      console.log('Drive 認証ページを開いています...')
      import('open').then(({ default: open }) => open(authUrl)).catch(() => {
        console.log(`ブラウザで以下の URL を開いてください:\n${authUrl}`)
      })
    })
    server.on('error', reject)
  })

  const { tokens } = await oauth2.getToken(code)
  saveDriveToken({
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date!,
  })
  console.log('✓ Drive authorization saved.')
}

export function registerAuthCommand(program: Command): void {
  program
    .command('auth')
    .description('Authenticate with Google (NotebookLM session + Drive OAuth2)')
    .action(async () => {
      console.log('Opening browser for Google login...')
      const handle = await launchHeaded()
      try {
        const page = await handle.context.newPage()
        await loginWithGoogle(page)
        await captureAndSaveSession(handle.context)
        console.log('✓ Session saved successfully.')
      } finally {
        await closeBrowser(handle)
      }
      await authDrive()
    })
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/auth.ts
git commit -m "feat: auth - add Drive OAuth2 flow after NotebookLM session"
```

---

## Task 5: Drive API client

**Files:**
- Create: `packages/cli/src/drive/client.ts`

- [ ] **Step 1: Create `packages/cli/src/drive/client.ts`**

```typescript
import { google } from 'googleapis'
import { createReadStream } from 'fs'
import { basename } from 'path'
import { readConfig } from '../config'
import { loadDriveToken, saveDriveToken, isTokenExpired, DriveToken } from './token'

function getOAuth2Client() {
  const { drive } = readConfig()
  if (!drive.clientId || !drive.clientSecret) {
    throw new Error('Drive credentials not configured. Run `nblm-putter config init`.')
  }
  const token = loadDriveToken()
  if (!token) {
    throw new Error('Drive token not found. Run `nblm-putter auth` first.')
  }
  const auth = new google.auth.OAuth2(
    drive.clientId,
    drive.clientSecret,
    'http://localhost:3001/callback'
  )
  auth.setCredentials(token)
  auth.on('tokens', (tokens) => {
    saveDriveToken({ ...token, ...tokens } as DriveToken)
  })
  return auth
}

async function refreshIfNeeded(): Promise<void> {
  const token = loadDriveToken()
  if (!token) throw new Error('Drive token not found. Run `nblm-putter auth` first.')
  if (isTokenExpired(token)) {
    const { drive } = readConfig()
    const auth = new google.auth.OAuth2(drive.clientId, drive.clientSecret, 'http://localhost:3001/callback')
    auth.setCredentials(token)
    const { credentials } = await auth.refreshAccessToken()
    saveDriveToken({ ...token, ...credentials } as DriveToken)
  }
}

export async function getOrCreateFolder(parentId: string | null, name: string): Promise<string> {
  await refreshIfNeeded()
  const driveApi = google.drive({ version: 'v3', auth: getOAuth2Client() })
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`
  const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentClause}`
  const list = await driveApi.files.list({ q, fields: 'files(id)', pageSize: 1 })
  if (list.data.files?.length) return list.data.files[0].id!

  const folder = await driveApi.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : ['root'],
    },
    fields: 'id',
  })
  return folder.data.id!
}

export async function uploadFile(filePath: string, folderId: string): Promise<string> {
  await refreshIfNeeded()
  const driveApi = google.drive({ version: 'v3', auth: getOAuth2Client() })
  const name = basename(filePath)
  const existing = await driveApi.files.list({
    q: `name = '${name}' and '${folderId}' in parents and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  const media = { body: createReadStream(filePath) }
  if (existing.data.files?.length) {
    const fileId = existing.data.files[0].id!
    await driveApi.files.update({ fileId, media })
    return fileId
  }
  const res = await driveApi.files.create({
    requestBody: { name, parents: [folderId] },
    media,
    fields: 'id',
  })
  return res.data.id!
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/drive/client.ts
git commit -m "feat: Drive API client - folder create + file upload"
```

---

## Task 6: Drive picker Playwright automation

**Files:**
- Create: `packages/cli/src/playwright/drive-picker.ts`

> **Note:** The Google Drive picker is a Google-hosted UI loaded in an iframe. The exact selectors below are best-effort based on the known structure. If they fail at runtime, open `/tmp/nblm-drive-picker-debug.png` (saved on error) and adjust selectors to match the actual DOM.

- [ ] **Step 1: Create `packages/cli/src/playwright/drive-picker.ts`**

```typescript
import { Page } from 'playwright'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

export async function addSourcesFromDrive(page: Page, notebookId: string): Promise<void> {
  // 1. Open "Add source" dialog
  await page.locator('[aria-label="ソースを追加"]').click({ timeout: 10000 })
  await page.waitForTimeout(500)

  // 2. Click "Google Drive" option
  await page.locator([
    'button:has-text("Google ドライブ")',
    'button:has-text("Google Drive")',
    '[data-source-type="DRIVE"]',
  ].join(', ')).first().click({ timeout: 5000 })

  // 3. Wait for Drive picker iframe
  let pickerFrame = null
  for (const sel of PICKER_FRAME_SELECTORS) {
    try {
      await page.waitForSelector(sel, { timeout: 12000 })
      pickerFrame = page.frameLocator(sel)
      break
    } catch { /* try next selector */ }
  }
  if (!pickerFrame) {
    await page.screenshot({ path: '/tmp/nblm-drive-picker-debug.png', fullPage: true }).catch(() => {})
    throw new Error('Drive picker iframe did not appear. Screenshot: /tmp/nblm-drive-picker-debug.png')
  }

  // 4. Navigate to My Drive
  await pickerFrame.locator([
    'text=マイドライブ',
    'text=My Drive',
    '[data-view="2"]',
  ].join(', ')).first().click({ timeout: 10000 })
  await page.waitForTimeout(1000)

  // 5. Open nblm-putter folder
  await pickerFrame.locator(`[data-tooltip="nblm-putter"], text=nblm-putter`).first().dblclick({ timeout: 10000 })
  await page.waitForTimeout(800)

  // 6. Open notebook subfolder
  await pickerFrame.locator(`[data-tooltip="${notebookId}"], text=${notebookId}`).first().dblclick({ timeout: 10000 })
  await page.waitForTimeout(800)

  // 7. Select all files
  const firstFile = pickerFrame.locator('[data-id]').first()
  await firstFile.click({ timeout: 5000 })
  await page.keyboard.press('Control+A')
  await page.waitForTimeout(500)

  // 8. Click Select / 選択
  await pickerFrame.locator([
    'button:has-text("選択")',
    'button:has-text("Select")',
    '[jsname="d1dBrd"]',
  ].join(', ')).first().click({ timeout: 5000 })

  // 9. Wait for dialog to close
  await page.waitForTimeout(2000)
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/playwright/drive-picker.ts
git commit -m "feat: Drive picker Playwright automation"
```

---

## Task 7: Drive sync server route + app wiring

**Files:**
- Create: `packages/cli/src/server/routes/drive-sync.ts`
- Modify: `packages/cli/src/server/app.ts`

- [ ] **Step 1: Create `packages/cli/src/server/routes/drive-sync.ts`**

```typescript
import { Router, Request, Response, IRouter } from 'express'
import { existsSync } from 'fs'
import { resolve, basename } from 'path'
import { createJob, updateJob, isCancelled, Job, JobLog } from '../../db/jobs'
import { loadIgnorePatterns, saveSession } from '../../storage/index'
import { filterFiles } from '../../ignore/filter'
import { walkDir } from '../../utils/files'
import { getOrCreateFolder, uploadFile } from '../../drive/client'
import { launchHeadlessBrowser, createHeadlessContext } from '../../playwright/browser'
import { openNotebookPage } from '../../playwright/notebooklm'
import { addSourcesFromDrive } from '../../playwright/drive-picker'

export const driveSyncRouter: IRouter = Router()

driveSyncRouter.post('/', async (req: Request, res: Response) => {
  const { folder, notebookId } = req.body as { folder: string; notebookId: string }
  if (!folder || !notebookId) {
    res.status(400).json({ error: 'folder and notebookId required' })
    return
  }
  const absFolder = resolve(folder)
  if (!existsSync(absFolder)) {
    res.status(400).json({ error: `Folder not found: ${folder}` })
    return
  }

  const ignorePatterns = await loadIgnorePatterns()
  const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)
  const jobId = createJob({ notebookId, totalFiles: files.length })
  res.json({ jobId })

  setImmediate(async () => {
    const browser = await launchHeadlessBrowser()
    try {
      const ctx = await createHeadlessContext(browser)
      updateJob(jobId, { status: 'running' })

      // Phase 1: Upload files to Drive
      let notebookFolderId: string
      try {
        const rootId = await getOrCreateFolder(null, 'nblm-putter')
        notebookFolderId = await getOrCreateFolder(rootId, notebookId)
      } catch (err) {
        console.error(`[drive-sync ${jobId}] Drive folder setup failed:`, err instanceof Error ? err.message : err)
        updateJob(jobId, { status: 'failed' })
        await browser.close().catch(() => {})
        return
      }

      const logs: JobLog[] = []
      const errors: Array<{ file: string; reason: string }> = []
      let done = 0

      for (const file of files) {
        if (isCancelled(jobId)) {
          updateJob(jobId, { status: 'cancelled' as Job['status'], currentFile: null })
          await browser.close().catch(() => {})
          return
        }
        const name = basename(file)
        updateJob(jobId, { currentFile: `[Drive] ${name} をアップロード中...` })
        try {
          await uploadFile(file, notebookFolderId)
          done++
          logs.push({ file: name, success: true, at: new Date().toISOString() })
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          errors.push({ file, reason })
          logs.push({ file: name, success: false, reason, at: new Date().toISOString() })
          done++
        }
        updateJob(jobId, { doneFiles: done, errors, logs })
      }

      // Phase 2: Add to NotebookLM via Drive picker
      updateJob(jobId, { currentFile: 'NotebookLM に追加中...' })
      try {
        const page = await openNotebookPage(ctx, notebookId)
        ctx.storageState().then(state => saveSession(state)).catch(() => {})
        await addSourcesFromDrive(page, notebookId)
        await page.close()
      } catch (err) {
        console.error(`[drive-sync ${jobId}] Drive picker failed:`, err instanceof Error ? err.message : err)
        updateJob(jobId, { status: 'failed', currentFile: null })
        await ctx.close().catch(() => {})
        await browser.close().catch(() => {})
        return
      }

      await ctx.close().catch(() => {})
      updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done', currentFile: null })
    } catch (err) {
      console.error(`[drive-sync ${jobId}] failed:`, err instanceof Error ? err.message : err)
      updateJob(jobId, { status: 'failed', currentFile: null })
    } finally {
      await browser.close().catch(() => {})
    }
  })
})
```

- [ ] **Step 2: Register route in `packages/cli/src/server/app.ts`**

Add the import and route registration:

```typescript
import express from 'express'
import { join } from 'path'
import { existsSync } from 'fs'
import { jobsRouter } from './routes/jobs'
import { settingsRouter } from './routes/settings'
import { notebooksRouter } from './routes/notebooks'
import { sessionRouter } from './routes/session'
import { syncRouter } from './routes/sync'
import { folderRouter } from './routes/folder'
import { driveSyncRouter } from './routes/drive-sync'

export function createApp(): express.Application {
  const app = express()
  app.use(express.json())

  app.use('/api/jobs', jobsRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/notebooks', notebooksRouter)
  app.use('/api/session', sessionRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/drive-sync', driveSyncRouter)
  app.use('/api/folder', folderRouter)

  const publicDir = join(__dirname, '..', 'public')
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir))
    app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')))
  }

  return app
}
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/server/routes/drive-sync.ts packages/cli/src/server/app.ts
git commit -m "feat: POST /api/drive-sync route — Drive upload + picker orchestration"
```

---

## Task 8: CLI sync command update

**Files:**
- Modify: `packages/cli/src/commands/sync.ts`

- [ ] **Step 1: Update `packages/cli/src/commands/sync.ts`**

```typescript
import { Command } from 'commander'
import { resolve, basename } from 'path'
import { SingleBar, Presets } from 'cli-progress'
import { launchHeadlessBrowser, createHeadlessContext } from '../playwright/browser'
import { openNotebookPage } from '../playwright/notebooklm'
import { addSourcesFromDrive } from '../playwright/drive-picker'
import { loadIgnorePatterns } from '../storage/index'
import { filterFiles } from '../ignore/filter'
import { createJob, updateJob } from '../db/jobs'
import { walkDir } from '../utils/files'
import { getOrCreateFolder, uploadFile } from '../drive/client'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync <folder>')
    .description('Sync files from a folder to NotebookLM via Google Drive')
    .requiredOption('--notebook <id>', 'Target notebook ID (from `notebooks list`)')
    .action(async (folder: string, opts: { notebook: string }) => {
      const absFolder = resolve(folder)
      const ignorePatterns = await loadIgnorePatterns()
      const files = filterFiles(walkDir(absFolder), absFolder, ignorePatterns)

      if (files.length === 0) {
        console.log('No files to sync.')
        return
      }

      console.log(`Phase 1: Uploading ${files.length} files to Google Drive...`)
      const jobId = createJob({ notebookId: opts.notebook, totalFiles: files.length })
      updateJob(jobId, { status: 'running' })

      let rootFolderId: string
      let notebookFolderId: string
      try {
        rootFolderId = await getOrCreateFolder(null, 'nblm-putter')
        notebookFolderId = await getOrCreateFolder(rootFolderId, opts.notebook)
      } catch (err) {
        console.error('✗ Drive folder setup failed:', err instanceof Error ? err.message : err)
        process.exit(1)
      }

      const bar = new SingleBar(
        { format: '{bar} {percentage}% | {value}/{total} | ETA: {eta}s' },
        Presets.shades_classic
      )
      bar.start(files.length, 0)

      const errors: Array<{ file: string; reason: string }> = []
      let done = 0

      for (const file of files) {
        const name = basename(file)
        process.stderr.write(`\r\x1b[2K  → ${name}`)
        try {
          await uploadFile(file, notebookFolderId)
        } catch (err) {
          errors.push({ file, reason: err instanceof Error ? err.message : String(err) })
        }
        done++
        updateJob(jobId, { doneFiles: done, errors })
        bar.update(done)
      }

      process.stderr.write('\r\x1b[2K')
      bar.stop()

      if (errors.length > 0) {
        console.warn(`\n⚠ ${errors.length} file(s) failed to upload to Drive:`)
        errors.forEach(e => console.warn(`  ${basename(e.file)}: ${e.reason}`))
      }

      console.log(`\nPhase 2: Adding sources to NotebookLM via Drive picker...`)

      const browser = await launchHeadlessBrowser()
      try {
        const ctx = await createHeadlessContext(browser)
        const page = await openNotebookPage(ctx, opts.notebook)
        await addSourcesFromDrive(page, opts.notebook)
        await page.close()
        await ctx.close().catch(() => {})
      } catch (err) {
        console.error('✗ Drive picker failed:', err instanceof Error ? err.message : err)
        updateJob(jobId, { status: 'failed' })
        process.exit(1)
      } finally {
        await browser.close().catch(() => {})
      }

      updateJob(jobId, { status: errors.length === files.length ? 'failed' : 'done' })
      console.log(`✓ Done. ${done - errors.length} files uploaded, added to NotebookLM. (Job ID: ${jobId})`)
    })
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/sync.ts
git commit -m "feat: CLI sync - Drive upload + picker instead of direct upload"
```

---

## Task 9: UI — API client + Sync page update

**Files:**
- Modify: `packages/ui/src/api/client.ts`
- Modify: `packages/ui/src/pages/Sync.tsx`

- [ ] **Step 1: Add `startDriveSync` to `packages/ui/src/api/client.ts`**

Add after the existing `startSync` function:

```typescript
export async function startDriveSync(folder: string, notebookId: string): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/drive-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, notebookId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Failed to start drive sync')
  }
  return res.json() as Promise<{ jobId: string }>
}
```

- [ ] **Step 2: Update `packages/ui/src/pages/Sync.tsx`**

Replace the import line and `handleSync` function, and update the button label:

Replace:
```typescript
import { getNotebooks, startSync, getJob, pickFolder, cancelJob, createNotebook } from '../api/client'
```
With:
```typescript
import { getNotebooks, startDriveSync, getJob, pickFolder, cancelJob, createNotebook } from '../api/client'
```

Replace the `handleSync` function body:
```typescript
  async function handleSync() {
    if (!notebookId || !folder) return
    setError('')
    setLoading(true)
    setJob(null)
    setJobId(null)
    setCancelling(false)
    try {
      const { jobId: id } = await startDriveSync(folder, notebookId)
      setJobId(id)
      pollRef.current = setInterval(async () => {
        try {
          const j = await getJob(id)
          setJob(j as Job)
          if (TERMINAL_STATUSES.includes(j.status)) {
            clearInterval(pollRef.current)
            setLoading(false)
            setCancelling(false)
          }
        } catch {
          clearInterval(pollRef.current)
          setLoading(false)
        }
      }, 1000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setLoading(false)
    }
  }
```

Replace the Sync button label:
```typescript
            {loading ? 'Syncing...' : 'Sync via Drive'}
```

Replace the progress status display to show Drive phase:
```typescript
                  {job.status === 'running' && job.currentFile
                    ? job.currentFile.startsWith('[Drive]')
                      ? <><span className="text-blue-500">⬆</span> {job.currentFile.replace('[Drive] ', '')}</>
                      : <>{job.currentFile}</>
                    : job.status === 'running' ? 'ブラウザを起動中...' : null}
```

- [ ] **Step 3: Build**

```bash
cd ../..
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/api/client.ts packages/ui/src/pages/Sync.tsx
git commit -m "feat: UI - Sync via Drive button + 2-phase progress display"
```

---

## Task 10: README update + final push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Drive sync setup section to README.md**

Add after "ステップ 2: Google 認証" and before "ステップ 3":

```markdown
## ステップ 2.5: Google Drive 連携（初回のみ）

### Google Cloud プロジェクトの準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」→ **Google Drive API** を有効化
3. 「認証情報」→「OAuth 2.0 クライアント ID」を作成
   - アプリケーションの種類: **デスクトップアプリ**
   - リダイレクト URI: `http://localhost:3001/callback`
4. `client_id` と `client_secret` を取得

### 設定と認証

```bash
nblm-putter config init   # client_id / client_secret を入力
nblm-putter auth          # NotebookLM ログイン後に Drive 認証も実施
```

Drive の認証が完了すると `~/.nblm-putter/drive-token.json` が生成される。
```

- [ ] **Step 2: Update sync description in README**

「ステップ 3: ファイルを同期（CLI）」の説明を Drive 経由であることを明記するよう更新:

```markdown
ファイルは一度 Google Drive の `nblm-putter/{notebook-id}/` フォルダにアップロードされ、
その後 NotebookLM の Drive ピッカーで一括追加される。
1ファイルずつのボタン待ち不要で、並列処理される。
```

- [ ] **Step 3: Build + commit + push**

```bash
pnpm build
git add README.md
git commit -m "docs: add Drive sync setup instructions to README"
git push
```

---

## Self-Review Checklist (completed)

- ✅ Spec coverage: all sections covered (auth, token, Drive client, picker, server route, CLI, UI)
- ✅ No placeholders: all code is complete
- ✅ Type consistency: `DriveToken` defined in Task 2, used in Tasks 4/5; `getOrCreateFolder`/`uploadFile` defined in Task 5, used in Tasks 7/8
- ✅ `googleapis` installed in Task 1 before use in Tasks 4/5
- ✅ Config type extended in Task 1 before use in Tasks 3/4/5
