import { Command } from 'commander'
import { join } from 'path'
import { getConfigDir } from '../config'
import { launchHeadless } from '../playwright/browser'
import { closeBrowser } from '../playwright/browser'

const NOTEBOOKLM_URL = 'https://notebooklm.google.com'

export function registerDebugCommand(program: Command): void {
  program
    .command('debug')
    .description('Inspect NotebookLM DOM to diagnose sync issues')
    .requiredOption('--notebook <id>', 'Notebook ID to inspect')
    .action(async (opts: { notebook: string }) => {
      const screenshotPath = join(getConfigDir(), 'debug-screenshot.png')
      const handle = await launchHeadless()

      try {
        const page = await handle.context.newPage()
        const url = `${NOTEBOOKLM_URL}/notebook/${opts.notebook}`
        console.log(`Navigating to ${url} ...`)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

        await page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`Screenshot saved: ${screenshotPath}`)

        // Collect all buttons and their identifying attributes
        const buttons = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button, [role="button"]')).map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 80) ?? '',
            ariaLabel: el.getAttribute('aria-label') ?? '',
            id: el.id ?? '',
            classes: el.className?.toString().slice(0, 80) ?? '',
            dataAttrs: Array.from(el.attributes)
              .filter(a => a.name.startsWith('data-'))
              .map(a => `${a.name}="${a.value}"`)
              .join(' '),
          }))
        })

        // Collect all input[type=file]
        const fileInputs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
            accept: el.getAttribute('accept') ?? '',
            name: el.getAttribute('name') ?? '',
            id: el.id ?? '',
          }))
        )

        // Check which of our current selectors match
        const selectorResults = await page.evaluate(() => {
          const selectors = [
            'button:has-text("Add source")',
            '[aria-label*="Add source"]',
            '[aria-label*="add source"]',
            'button:has-text("ソースを追加")',
            '[aria-label*="ソースを追加"]',
          ]
          // Use querySelectorAll for attribute-based ones; text matching needs different approach
          const attrSelectors = [
            '[aria-label*="Add source"]',
            '[aria-label*="add source"]',
            '[aria-label*="ソースを追加"]',
            'button[aria-label]',
          ]
          return attrSelectors.map(s => ({
            selector: s,
            count: document.querySelectorAll(s).length,
            texts: Array.from(document.querySelectorAll(s)).map(el =>
              (el.textContent?.trim().slice(0, 60) ?? '') + ' | aria=' + (el.getAttribute('aria-label') ?? '')
            ),
          }))
        })

        console.log('\n=== BUTTONS ON PAGE ===')
        buttons.slice(0, 30).forEach((b, i) => {
          const parts = [b.text && `text="${b.text}"`, b.ariaLabel && `aria-label="${b.ariaLabel}"`, b.id && `id="${b.id}"`].filter(Boolean)
          console.log(`  [${i}] ${b.tag} ${parts.join(', ')}`)
        })

        console.log('\n=== FILE INPUTS ===')
        if (fileInputs.length === 0) {
          console.log('  (none found)')
        } else {
          fileInputs.forEach((fi, i) => console.log(`  [${i}] accept="${fi.accept}" id="${fi.id}"`))
        }

        console.log('\n=== SELECTOR MATCHES ===')
        selectorResults.forEach(r => {
          console.log(`  "${r.selector}" → ${r.count} match(es)`)
          r.texts.forEach(t => console.log(`    ${t}`))
        })

        console.log('\nOpen the screenshot to see the current page state.')
        await page.close()
      } finally {
        await closeBrowser(handle)
      }
    })
}
