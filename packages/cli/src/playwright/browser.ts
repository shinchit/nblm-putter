import { chromium, Browser, BrowserContext } from 'playwright'
import { loadSession } from '../storage/index'

export interface BrowserHandle {
  browser: Browser
  context: BrowserContext
}

export async function launchHeaded(): Promise<BrowserHandle> {
  // Use system Chrome to avoid Google's bot detection on Playwright's bundled Chromium
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  })
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
