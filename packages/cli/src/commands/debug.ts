import { Command } from 'commander'
import { join } from 'path'
import { getConfigDir } from '../config'
import { launchHeadless, closeBrowser } from '../playwright/browser'

const NOTEBOOKLM_URL = 'https://notebooklm.google.com'

export function registerDebugCommand(program: Command): void {
  program
    .command('debug')
    .description('Inspect NotebookLM DOM to diagnose sync issues')
    .requiredOption('--notebook <id>', 'Notebook ID to inspect')
    .action(async (opts: { notebook: string }) => {
      const handle = await launchHeadless()
      const page = await handle.context.newPage()
      page.setDefaultTimeout(10000)

      try {
        const url = `${NOTEBOOKLM_URL}/notebook/${opts.notebook}`
        console.log(`Navigating to ${url} ...`)
        await page.goto(url, { waitUntil: 'load', timeout: 30000 })
        await page.waitForTimeout(3000)

        const shot1 = join(getConfigDir(), 'debug-1-initial.png')
        await page.screenshot({ path: shot1, fullPage: true })
        console.log(`Screenshot 1 (initial): ${shot1}`)

        const buttons = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button, [role="button"]')).map(el => ({
            text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '',
            aria: el.getAttribute('aria-label') ?? '',
          })).filter(b => b.text || b.aria)
        )
        console.log('\n=== BUTTONS ===')
        buttons.slice(0, 30).forEach((b, i) =>
          console.log(`  [${i}] text="${b.text}" aria="${b.aria}"`)
        )

        // Phase 2: listen for filechooser BEFORE clicking, then click
        console.log('\n=== CLICKING "ソースを追加" (listening for filechooser) ===')
        let fileChooserOpened = false
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 })
          .then(fc => { fileChooserOpened = true; fc.setFiles([]); return fc })
          .catch(() => null)

        await page.locator('[aria-label="ソースを追加"]').click()
        await chooserPromise

        if (fileChooserOpened) {
          console.log('  → File chooser opened DIRECTLY on "ソースを追加" click!')
          console.log('    (registerFile should use waitForEvent filechooser + click)')
        } else {
          console.log('  → No file chooser — a dialog appeared instead')
        }

        await page.waitForTimeout(2000)
        const shot2 = join(getConfigDir(), 'debug-2-after-click.png')
        await page.screenshot({ path: shot2, fullPage: true })
        console.log(`Screenshot 2 (after click): ${shot2}`)

        // Capture dialog contents
        const dialogItems = await page.evaluate(() =>
          Array.from(document.querySelectorAll([
            '[role="dialog"] button',
            '[role="menu"] [role="menuitem"]',
            'mat-bottom-sheet-container button',
            'mat-bottom-sheet-container mat-list-item',
            '[cdkdialog] button',
            '.cdk-overlay-container button',
            '.cdk-overlay-container [role="option"]',
            '.cdk-overlay-container [role="menuitem"]',
            '.cdk-overlay-container mat-list-item',
          ].join(', '))).map(el => ({
            tag: el.tagName,
            text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
            aria: el.getAttribute('aria-label') ?? '',
          }))
        )
        console.log('\n=== DIALOG / OVERLAY ITEMS ===')
        if (dialogItems.length === 0) {
          console.log('  (none found via dialog selectors)')
          // Fallback: show all new buttons not in initial list
          const allButtons2 = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button, [role="menuitem"], [role="option"], mat-list-item')).map(el => ({
              text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
              aria: el.getAttribute('aria-label') ?? '',
            })).filter(b => b.text || b.aria)
          )
          console.log('  All interactive elements after click:')
          allButtons2.slice(0, 40).forEach((b, i) =>
            console.log(`    [${i}] text="${b.text}" aria="${b.aria}"`)
          )
        } else {
          dialogItems.forEach((b, i) =>
            console.log(`  [${i}] ${b.tag}: text="${b.text}" aria="${b.aria}"`)
          )
        }

        const fileInputs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
            accept: el.getAttribute('accept') ?? '',
            id: el.id,
          }))
        )
        console.log('\n=== FILE INPUTS (after click) ===')
        if (fileInputs.length === 0) {
          console.log('  (none — need to click an option in the dialog)')
        } else {
          fileInputs.forEach((fi, i) => console.log(`  [${i}] accept="${fi.accept}" id="${fi.id}"`))
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
      } finally {
        await page.close()
        await closeBrowser(handle)
      }
    })
}
