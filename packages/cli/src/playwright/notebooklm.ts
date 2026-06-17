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
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'networkidle' })
    await page.waitForURL(url => url.toString().startsWith(NOTEBOOKLM_URL), { timeout: 300000 })
    await page.waitForLoadState('networkidle')
  } catch (err) {
    await page.close()
    throw err
  }
}

export async function listNotebooks(context: BrowserContext): Promise<Notebook[]> {
  const page = await context.newPage()
  try {
    await page.goto(NOTEBOOKLM_URL, { waitUntil: 'networkidle' })
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
    await page.goto(`${NOTEBOOKLM_URL}/notebook/${notebookId}`, { waitUntil: 'networkidle' })

    // NOTE: Button selectors need verification against actual NotebookLM DOM
    const addSourceButton = page.locator('button:has-text("Add source"), button:has-text("ソースを追加"), [aria-label*="Add source"]').first()
    await addSourceButton.waitFor({ timeout: 10000 })
    await addSourceButton.click()

    const uploadOption = page.locator('button:has-text("Upload"), [role="menuitem"]:has-text("Upload"), button:has-text("アップロード")').first()
    await uploadOption.waitFor({ timeout: 5000 })
    await uploadOption.click()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    await page.waitForFunction(() => {
      const loaders = document.querySelectorAll('[class*="loading"], [class*="spinner"], mat-progress-bar')
      return loaders.length === 0
    }, { timeout: 60000 })

    onProgress?.(filePath)
    return { file: filePath, success: true }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    return { file: filePath, success: false, reason }
  } finally {
    await page.close()
  }
}
