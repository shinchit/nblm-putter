import { Page } from 'playwright'
import * as fs from 'fs'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

export async function addSourcesFromDrive(page: Page, notebookId: string): Promise<void> {
  const debugDir = process.env.TMPDIR ?? '/tmp'

  // 1. Click "ソースを追加"
  await page.locator('[aria-label="ソースを追加"], [aria-label="Add source"]')
    .first()
    .click({ force: true, timeout: 15000 })

  // 2. Fixed wait for the add-source dialog to fully render.
  //    Selector-based detection falsely matches empty-state text ("Google ドライブからファイルを...")
  //    before the actual dialog appears, so we use a flat wait instead.
  await page.waitForTimeout(3000)

  await page.screenshot({ path: `${debugDir}/nblm-add-source-dialog.png`, fullPage: true }).catch(() => {})

  // 3. Click the Drive / ドライブ button.
  //    getByRole() and getByText() pierce shadow DOM; CSS :has-text() does not.
  //    The dialog shows: "ウェブサイト" | "ドライブ" | "コピーしたテキスト"
  let driveClicked = false

  // Strategy A: Playwright role-based locators (shadow-DOM-aware)
  const roleLocators = [
    () => page.getByRole('button', { name: 'ドライブ', exact: true }),
    () => page.getByRole('button', { name: 'Drive', exact: true }),
    () => page.getByRole('menuitem', { name: 'ドライブ' }),
    () => page.getByRole('menuitem', { name: 'Drive' }),
    () => page.getByRole('option', { name: 'ドライブ' }),
    () => page.getByRole('option', { name: 'Drive' }),
    // Partial name match in case icon text is included in accessible name
    () => page.getByRole('button', { name: /^ドライブ$/u }),
    () => page.getByRole('button', { name: /^Drive$/i }),
  ]

  for (const build of roleLocators) {
    const loc = build()
    const n = await loc.count().catch(() => 0)
    if (n > 0) {
      await loc.first().click({ timeout: 5000 })
      driveClicked = true
      break
    }
  }

  // Strategy B: JavaScript shadow DOM traversal
  if (!driveClicked) {
    driveClicked = await page.evaluate(() => {
      const TARGET_TEXTS = ['ドライブ', 'Drive', 'Google ドライブ', 'Google Drive']
      const EXCLUDE_TEXTS = ['ソースを追加', 'Add source']

      function tryClick(root: Element | ShadowRoot): boolean {
        const candidates = Array.from(
          root.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"]')
        )
        for (const el of candidates) {
          const text = (el.textContent ?? '').trim()
          if (
            TARGET_TEXTS.some(t => text === t || text.startsWith(t)) &&
            !EXCLUDE_TEXTS.some(t => text.includes(t))
          ) {
            ;(el as HTMLElement).click()
            return true
          }
        }
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const sr = (el as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
          if (sr && tryClick(sr)) return true
        }
        return false
      }
      return tryClick(document.body)
    }).catch(() => false)
  }

  if (!driveClicked) {
    const html = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '')
    fs.writeFileSync(`${debugDir}/nblm-add-source-dialog.html`, html)
    throw new Error(
      'Google Drive オプションが見つかりません。\n' +
      `  スクリーンショット: ${debugDir}/nblm-add-source-dialog.png\n` +
      `  HTML ダンプ: ${debugDir}/nblm-add-source-dialog.html`
    )
  }

  // 4. Wait for Drive picker iframe
  let pickerFrame = null
  for (const sel of PICKER_FRAME_SELECTORS) {
    try {
      await page.waitForSelector(sel, { timeout: 12000 })
      pickerFrame = page.frameLocator(sel)
      break
    } catch { /* try next */ }
  }
  if (!pickerFrame) {
    await page.screenshot({ path: `${debugDir}/nblm-drive-picker-debug.png`, fullPage: true }).catch(() => {})
    throw new Error(`Drive picker iframe did not appear. Screenshot: ${debugDir}/nblm-drive-picker-debug.png`)
  }

  // 5. Navigate to My Drive
  await pickerFrame.locator([
    'text=マイドライブ',
    'text=My Drive',
    '[data-view="2"]',
  ].join(', ')).first().click({ timeout: 10000 })
  await page.waitForTimeout(1000)

  // 6. Open nblm-putter folder
  await pickerFrame.locator(`[data-tooltip="nblm-putter"], text=nblm-putter`).first().dblclick({ timeout: 10000 })
  await page.waitForTimeout(800)

  // 7. Open notebook subfolder
  await pickerFrame.locator(`[data-tooltip="${notebookId}"], text=${notebookId}`).first().dblclick({ timeout: 10000 })
  await page.waitForTimeout(800)

  // 8. Select all files
  const firstFile = pickerFrame.locator('[data-id]').first()
  await firstFile.click({ timeout: 5000 })
  await page.keyboard.press('Control+A')
  await page.waitForTimeout(500)

  // 9. Click Select / 選択
  await pickerFrame.locator([
    'button:has-text("選択")',
    'button:has-text("Select")',
    '[jsname="d1dBrd"]',
  ].join(', ')).first().click({ timeout: 5000 })

  // 10. Wait for dialog to close
  await page.waitForTimeout(2000)
}
