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
// NotebookLM sometimes shows banners on first load that cover the UI.
async function dismissOverlays(page: Page): Promise<void> {
  const backdrop = page.locator('.cdk-overlay-backdrop-showing')

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await backdrop.count() === 0) return

    // Try close buttons (force:true bypasses the backdrop z-index check)
    const closeBtn = page.locator('[aria-label="バナーを閉じる"], [aria-label="閉じる"]').first()
    if (await closeBtn.count() > 0) {
      await closeBtn.click({ force: true }).catch(() => {})
    } else {
      await page.keyboard.press('Escape')
    }

    // Wait for the backdrop to actually disappear (not just 500ms)
    await backdrop.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
  }

  // Last resort: forcibly remove the backdrop via JavaScript
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

export async function isSessionValid(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load', timeout: 30000 })
    const url = page.url()
    return !url.includes('accounts.google.com')
  } catch {
    return false
  } finally {
    await page.close()
  }
}

export async function loginWithGoogle(page: Page): Promise<void> {
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load' })

    // Poll until NotebookLM URL is reached or an unrecoverable Google error appears
    await page.waitForURL(
      url => {
        const s = url.toString()
        if (s.startsWith(NOTEBOOKLM_URL)) return true
        // Google's "browser not supported" or permanent rejection — surface early
        if (s.includes('accounts.google.com/v3/signin/rejected') && s.includes('rrk=46')) {
          throw new Error(
            'Google rejected this browser. Make sure Google Chrome is installed and try again.'
          )
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
    // NOTE: Selectors need verification against actual NotebookLM DOM
    try {
      await page.waitForSelector('[data-testid="notebook-card"], .notebook-card, mat-card', { timeout: 10000 })
    } catch {
      return []
    }
    const notebooks = await page.evaluate(() => {
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
  // Cap every Playwright operation at 30s so a hung upload doesn't block forever
  page.setDefaultTimeout(30000)
  try {
    await page.goto(`${NOTEBOOKLM_URL}/notebook/${notebookId}`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(2000)

    // NotebookLM shows an "add source" dialog automatically on empty notebooks.
    // For notebooks with existing sources the dialog is closed — open it explicitly.
    const uploadBtn = page.locator('button:has-text("ファイルをアップロード")')
    if (await uploadBtn.count() === 0) {
      const addSourceBtn = page.locator('[aria-label="ソースを追加"]')
      await addSourceBtn.waitFor({ state: 'visible', timeout: 10000 })
      await addSourceBtn.click()
      await uploadBtn.waitFor({ state: 'visible', timeout: 10000 })
    }

    // "ファイルをアップロード" triggers a native file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      uploadBtn.first().click(),
    ])
    await fileChooser.setFiles(filePath)

    // Wait until the source card appears (upload complete)
    await page.waitForSelector('div.source-item, [class*="source-card"], [class*="source-item"]', {
      timeout: 60000,
    }).catch(() => {
      // Selector may not match — fall back to time-based wait
    })
    await page.waitForTimeout(3000)

    onProgress?.(filePath)
    return { file: filePath, success: true }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    return { file: filePath, success: false, reason }
  } finally {
    await page.close()
  }
}
