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

// Dismiss Angular CDK overlays (banners, welcome dialogs) that block clicks.
async function dismissOverlays(page: Page): Promise<void> {
  const backdrop = page.locator('.cdk-overlay-backdrop-showing')

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await backdrop.count() === 0) return

    const closeBtn = page.locator('[aria-label="バナーを閉じる"], [aria-label="閉じる"]').first()
    if (await closeBtn.count() > 0) {
      await closeBtn.click({ force: true }).catch(() => {})
    } else {
      await page.keyboard.press('Escape')
    }
    await backdrop.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
  }

  if (await backdrop.count() > 0) {
    await page.evaluate(() => {
      document.querySelectorAll('.cdk-overlay-backdrop-showing').forEach(el => {
        el.classList.remove('cdk-overlay-backdrop-showing')
        ;(el as HTMLElement).style.pointerEvents = 'none'
      })
    })
    await page.waitForTimeout(300)
  }
}

const BUTTON_SELECTOR = '[aria-label="ソースを追加"]'

// Try to open the add-source dialog by clicking the button, regardless of disabled state.
// Returns true if the "ファイルをアップロード" button appeared (dialog opened).
async function tryClickAddSource(page: Page): Promise<boolean> {
  const uploadBtn = page.locator('button:has-text("ファイルをアップロード")')
  if (await uploadBtn.count() > 0) return true

  // force: true bypasses Playwright's enabled check and pointer-events: none CSS.
  // Angular Material may still block clicks on truly-disabled buttons, but it's worth trying
  // before falling back to a longer wait.
  await page.locator(BUTTON_SELECTOR).click({ force: true, timeout: 5000 }).catch(() => {})
  return uploadBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
}

// Open the add-source dialog.  Strategy:
//   1. Try force-click immediately (works when button is enabled or only CSS-disabled)
//   2. Poll every 15s for up to 5 min, reloading the page once at the 2-min mark
//      (page reload resets client-side disabled state set via WebSocket)
// Returns elapsed ms waiting for the dialog to open.
async function openAddSourceDialog(page: Page, notebookUrl: string): Promise<number> {
  const t0 = Date.now()

  // Fast path: dialog might already be open or button immediately clickable
  if (await tryClickAddSource(page)) return Date.now() - t0

  let reloaded = false
  const POLL_INTERVAL = 15000   // 15s between retries
  const RELOAD_AFTER  = 120000  // reload once if still blocked after 2 min
  const GIVE_UP_AFTER = 300000  // 5 min total

  while (Date.now() - t0 < GIVE_UP_AFTER) {
    await page.waitForTimeout(POLL_INTERVAL)

    if (!reloaded && Date.now() - t0 >= RELOAD_AFTER) {
      reloaded = true
      await page.goto(notebookUrl, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(1000)
      await dismissOverlays(page)
      // Try immediately after reload before the WebSocket re-disables the button
    }

    if (await tryClickAddSource(page)) return Date.now() - t0
  }

  throw new Error(`Could not open add-source dialog after ${Math.round((Date.now() - t0) / 1000)}s`)
}

export async function isSessionValid(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load', timeout: 30000 })
    return !page.url().includes('accounts.google.com')
  } catch {
    return false
  } finally {
    await page.close()
  }
}

export async function loginWithGoogle(page: Page): Promise<void> {
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load' })
    await page.waitForURL(
      url => {
        const s = url.toString()
        if (s.startsWith(NOTEBOOKLM_URL)) return true
        if (s.includes('accounts.google.com/v3/signin/rejected') && s.includes('rrk=46')) {
          throw new Error('Google rejected this browser. Make sure Google Chrome is installed and try again.')
        }
        return false
      },
      { timeout: 300000 }
    )
    await page.waitForLoadState('load')
  } catch (err) {
    await page.close()
    throw err
  }
}

export async function createNotebook(context: BrowserContext): Promise<Notebook> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load', timeout: 30000 })
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Session expired. Run `nblm-putter auth` to re-authenticate.')
    }
    // Click "New notebook" button (label varies by language)
    await page.locator([
      'button:has-text("新しいノートブック")',
      'button:has-text("New notebook")',
      '[aria-label="新しいノートブック"]',
      '[aria-label="New notebook"]',
    ].join(', ')).first().click({ timeout: 10000 })

    // If a creation dialog appears, confirm with default title
    const dialog = page.locator('mat-dialog-container, [role="dialog"]')
    if (await dialog.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await page.locator('button:has-text("作成"), button:has-text("Create")').click({ timeout: 5000 })
        .catch(() => page.keyboard.press('Enter'))
    }

    await page.waitForURL(/\/notebook\//, { timeout: 30000 })
    const notebookId = page.url().split('/notebook/').pop()?.split(/[/?#]/)[0] ?? ''
    if (!notebookId) throw new Error('Could not determine new notebook ID from URL')
    return { id: notebookId, title: '新しいノートブック' }
  } finally {
    await page.close()
  }
}

export async function listNotebooks(context: BrowserContext): Promise<Notebook[]> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load', timeout: 30000 })

    // Check authentication in the same navigation — avoids a second page open.
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Session expired or missing. Run `nblm-putter auth` to re-authenticate.')
    }

    try {
      await page.waitForSelector('[data-testid="notebook-card"], .notebook-card, mat-card', { timeout: 10000 })
    } catch {
      return []
    }
    return await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="notebook-card"], .notebook-card, mat-card')).map((card, i) => {
        const link = card.querySelector('a')
        const title = card.querySelector('h3, h2, [class*="title"]')?.textContent?.trim() ?? `Notebook ${i + 1}`
        const href = link?.getAttribute('href') ?? ''
        return { id: href.split('/').pop() ?? String(i), title }
      })
    )
  } finally {
    await page.close()
  }
}

// Open a long-lived page for a notebook. Reuse across multiple uploadFileOnPage calls
// to avoid re-navigation cost (2-3s per file).
export async function openNotebookPage(context: BrowserContext, notebookId: string): Promise<Page> {
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await page.goto(`${NOTEBOOKLM_URL}/notebook/${notebookId}`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(2000)
  await dismissOverlays(page)
  return page
}

export interface UploadPhase {
  phase: 'waiting-button' | 'uploading' | 'done'
  buttonWaitMs?: number
  uploadMs?: number
}

// Upload a single file on an already-open notebook page.
// onPhase: optional callback called at phase transitions for real-time status updates.
export async function uploadFileOnPage(
  page: Page,
  filePath: string,
  onPhase?: (p: UploadPhase) => void,
): Promise<RegisterResult> {
  try {
    onPhase?.({ phase: 'waiting-button' })
    const notebookUrl = page.url()
    const buttonWaitMs = await openAddSourceDialog(page, notebookUrl)

    onPhase?.({ phase: 'uploading', buttonWaitMs })
    const t1 = Date.now()

    const uploadBtn = page.locator('button:has-text("ファイルをアップロード")')
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      uploadBtn.first().click(),
    ])
    await fileChooser.setFiles(filePath)

    // Wait for the upload progress indicator to disappear.
    await page.waitForFunction(
      () => document.querySelectorAll('mat-progress-bar, [class*="uploading"]').length === 0,
      null,
      { timeout: 300000 }
    ).catch(() => {})
    await page.waitForTimeout(2000)

    const uploadMs = Date.now() - t1
    onPhase?.({ phase: 'done', buttonWaitMs, uploadMs })

    // Close the dialog so the next file can start fresh
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)

    const timing = `[button wait ${(buttonWaitMs / 1000).toFixed(1)}s, upload ${(uploadMs / 1000).toFixed(1)}s]`
    return { file: filePath, success: true, reason: timing }
  } catch (err: unknown) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
    return { file: filePath, success: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

// Convenience wrapper used by the Express server route (one file at a time, no page reuse).
export async function registerFile(
  context: BrowserContext,
  notebookId: string,
  filePath: string,
): Promise<RegisterResult> {
  const page = await openNotebookPage(context, notebookId)
  try {
    return await uploadFileOnPage(page, filePath)
  } finally {
    await page.close()
  }
}
