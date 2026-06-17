import { chromium, Browser, BrowserContext } from 'playwright'
import { loadSession } from '../storage/index'

export interface BrowserHandle {
  browser: Browser
  context: BrowserContext
}

const HEADLESS_ARGS = ['--disable-blink-features=AutomationControlled']

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

// Launch a headless browser without creating a context.
// Use createHeadlessContext() to create per-worker contexts.
export async function launchHeadlessBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: HEADLESS_ARGS })
}

// Create a context from an existing browser with the saved session.
export async function createHeadlessContext(browser: Browser): Promise<BrowserContext> {
  const session = await loadSession()
  if (!session) throw new Error('No session found. Run `nblm-putter auth` first.')
  return browser.newContext({ storageState: session })
}

// Convenience wrapper: one browser + one context (used by non-sync commands).
export async function launchHeadless(): Promise<BrowserHandle> {
  const browser = await launchHeadlessBrowser()
  const context = await createHeadlessContext(browser)
  return { browser, context }
}

export async function closeBrowser(handle: BrowserHandle): Promise<void> {
  await handle.context.close()
  await handle.browser.close()
}
