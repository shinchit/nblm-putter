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
  if (await backdrop.count() === 0) return

  // Try close buttons inside overlays first
  const closeSelectors = [
    '[aria-label="バナーを閉じる"]',
    '[aria-label="閉じる"]',
    '.cdk-overlay-container button[aria-label*="閉じる"]',
    '.cdk-overlay-container button.close',
  ]
  for (const sel of closeSelectors) {
    const btn = page.locator(sel).first()
    if (await btn.count() > 0) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(500)
      if (await backdrop.count() === 0) return
    }
  }

  // Fallback: Escape key
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
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
  try {
    await page.goto(`${NOTEBOOKLM_URL}/notebook/${notebookId}`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Dismiss any CDK overlay (banners, welcome dialogs) that would block clicks
    await dismissOverlays(page)

    const addSourceBtn = page.locator('[aria-label="ソースを追加"]')
    await addSourceBtn.waitFor({ state: 'visible', timeout: 10000 })

    // Listen for filechooser BEFORE clicking — some NotebookLM versions open
    // the OS file dialog directly; others show an intermediate dialog first.
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null)
    await addSourceBtn.click()
    const directChooser = await chooserPromise

    if (directChooser) {
      // File chooser opened directly from "ソースを追加" click
      await directChooser.setFiles(filePath)
    } else {
      // A dialog appeared — find and click the upload/PDF option
      await page.waitForTimeout(1000)
      const uploadOption = page.locator([
        'button:has-text("PDF")',
        '[role="menuitem"]:has-text("PDF")',
        'mat-list-item:has-text("PDF")',
        'button:has-text("ファイルをアップロード")',
        'button:has-text("アップロード")',
        '[role="menuitem"]:has-text("アップロード")',
        '[role="option"]:has-text("アップロード")',
        'li:has-text("アップロード")',
      ].join(', ')).first()

      const [dialogChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        uploadOption.click({ timeout: 8000 }),
      ])
      await dialogChooser.setFiles(filePath)
    }

    // Wait for upload to complete (progress indicators disappear)
    await page.waitForFunction(
      () => document.querySelectorAll('mat-progress-bar, [class*="progress"], [class*="uploading"]').length === 0,
      { timeout: 60000 }
    )
    await page.waitForTimeout(1000)

    onProgress?.(filePath)
    return { file: filePath, success: true }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    return { file: filePath, success: false, reason }
  } finally {
    await page.close()
  }
}
