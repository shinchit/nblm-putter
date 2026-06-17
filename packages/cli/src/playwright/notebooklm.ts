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

// Wait for "ソースを追加" to become enabled, then click it to open the dialog.
async function openAddSourceDialog(page: Page): Promise<void> {
  const uploadBtn = page.locator('button:has-text("ファイルをアップロード")')

  // If the dialog is already open (auto-opened for empty notebooks), nothing to do.
  if (await uploadBtn.count() > 0) return

  // Wait for the button to be enabled. NotebookLM disables it during initialization
  // and while a previous upload is processing server-side.
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[aria-label="ソースを追加"]') as HTMLButtonElement | null
      return btn !== null && !btn.disabled && !btn.classList.contains('mat-mdc-button-disabled')
    },
    null,
    { timeout: 60000 }
  )

  await page.locator('[aria-label="ソースを追加"]').click()
  await uploadBtn.waitFor({ state: 'visible', timeout: 15000 })
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
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load' })
    try {
      await page.waitForSelector('[data-testid="notebook-card"], .notebook-card, mat-card', { timeout: 10000 })
    } catch {
      return []
    }
    return page.evaluate(() =>
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

// Upload a single file on an already-open notebook page.
// The page stays open after this call — call page.close() when all uploads are done.
export async function uploadFileOnPage(page: Page, filePath: string): Promise<RegisterResult> {
  try {
    await openAddSourceDialog(page)

    const uploadBtn = page.locator('button:has-text("ファイルをアップロード")')
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      uploadBtn.first().click(),
    ])
    await fileChooser.setFiles(filePath)

    // Wait for upload to complete
    await page.waitForFunction(
      () => document.querySelectorAll('mat-progress-bar, [class*="uploading"]').length === 0,
      null,
      { timeout: 90000 }
    ).catch(() => {})
    await page.waitForTimeout(3000)

    // Close the dialog if it's still open (ready for the next file)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(500)

    return { file: filePath, success: true }
  } catch (err: unknown) {
    // Try to recover: close any open dialogs before the next file
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(500)
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
