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
        await page.goto(url, { waitUntil: 'load', timeout: 30000 })
        // Wait for Angular/React to render after initial load
        await page.waitForTimeout(3000)

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

        // Phase 2: click "ソースを追加" and capture the resulting dialog
        const addSourceBtn = page.locator('[aria-label="ソースを追加"]').first()
        const addSourceExists = await addSourceBtn.count() > 0
        if (addSourceExists) {
          console.log('\n=== CLICKING "ソースを追加" ===')
          await addSourceBtn.click()
          await page.waitForTimeout(2000)

          const screenshot2 = join(getConfigDir(), 'debug-screenshot-dialog.png')
          await page.screenshot({ path: screenshot2, fullPage: true })
          console.log(`Dialog screenshot saved: ${screenshot2}`)

          const dialogButtons = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button, [role="menuitem"], [role="option"], mat-list-item, [role="listitem"]')).map(el => ({
              text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '',
              ariaLabel: el.getAttribute('aria-label') ?? '',
              role: el.getAttribute('role') ?? el.tagName,
            }))
          )
          console.log('\n=== DIALOG ELEMENTS ===')
          dialogButtons.slice(0, 40).forEach((b, i) => {
            if (b.text || b.ariaLabel) {
              console.log(`  [${i}] ${b.role}: text="${b.text}" aria="${b.ariaLabel}"`)
            }
          })

          // Check for file inputs that appeared after click
          const fileInputs2 = await page.evaluate(() =>
            Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
              accept: el.getAttribute('accept') ?? '',
              id: el.id,
              name: el.getAttribute('name') ?? '',
            }))
          )
          console.log('\n=== FILE INPUTS (after click) ===')
          if (fileInputs2.length === 0) {
            console.log('  (none found — need to click upload option first)')
          } else {
            fileInputs2.forEach((fi, i) => console.log(`  [${i}] accept="${fi.accept}" id="${fi.id}"`))
          }
        } else {
          console.log('\n"ソースを追加" button not found — check screenshot.')
        }

        console.log('\nOpen the screenshots to see the page state.')
        await page.close()
      } finally {
        await closeBrowser(handle)
      }
    })
}
