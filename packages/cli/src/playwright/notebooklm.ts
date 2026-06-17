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

function isAddSourceButtonEnabled(): boolean {
  const btn = document.querySelector('[aria-label="ソースを追加"]') as HTMLButtonElement | null
  return btn !== null && !btn.disabled && !btn.classList.contains('mat-mdc-button-disabled')
}

// Wait for "ソースを追加" to become enabled, then click it to open the dialog.
// If the button stays disabled for 2 min, reloads the page (page load resets the disabled state).
// Returns how many ms we waited for the button to become enabled.
async function openAddSourceDialog(page: Page, notebookUrl: string): Promise<number> {
  const uploadBtn = page.locator('button:has-text("ファイルをアップロード")')

  // If the dialog is already open (auto-opened for empty notebooks), nothing to do.
  if (await uploadBtn.count() > 0) return 0

  const t0 = Date.now()

  // First attempt: wait up to 2 minutes
  const enabled = await page.waitForFunction(isAddSourceButtonEnabled, null, { timeout: 120000 })
    .then(() => true).catch(() => false)

  if (!enabled) {
    // Button is still disabled after 2 min — reload the page.
    // On fresh load, NotebookLM shows the button as enabled regardless of server-side queue state.
    await page.goto(notebookUrl, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(2000)
    await dismissOverlays(page)
    // Wait up to 3 more minutes after reload
    await page.waitForFunction(isAddSourceButtonEnabled, null, { timeout: 180000 })
  }

  const buttonWaitMs = Date.now() - t0
  await page.locator(BUTTON_SELECTOR).click()
  await uploadBtn.waitFor({ state: 'visible', timeout: 15000 })
  return buttonWaitMs
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
