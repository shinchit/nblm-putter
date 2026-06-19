import { Page } from 'playwright'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

export async function addSourcesFromDrive(page: Page, notebookId: string): Promise<void> {
  // 1. Open "Add source" dialog
  const addSourceCandidates = [
    '[aria-label="ソースを追加"]',
    '[aria-label="Add source"]',
    'button:has-text("ソースを追加")',
    'button:has-text("Add source")',
  ]
  let addSourceClicked = false
  for (const sel of addSourceCandidates) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      await el.click({ timeout: 10000 })
      addSourceClicked = true
      break
    }
  }
  if (!addSourceClicked) {
    await page.screenshot({ path: '/tmp/nblm-drive-picker-debug.png', fullPage: true }).catch(() => {})
    throw new Error('「ソースを追加」ボタンが見つかりません。Screenshot: /tmp/nblm-drive-picker-debug.png')
  }
  await page.waitForTimeout(2000)

  // Save screenshot and HTML for debugging
  await page.screenshot({ path: '/tmp/nblm-add-source-dialog.png', fullPage: true }).catch(() => {})
  const bodyHtml = await page.evaluate(() => document.body.innerHTML).catch(() => '')
  require('fs').writeFileSync('/tmp/nblm-add-source-dialog.html', bodyHtml)

  // 2. Click "Google Drive" option — broad selectors to handle UI changes
  const driveOptionCandidates = [
    'button:has-text("Google ドライブ")',
    'button:has-text("Googleドライブ")',
    'button:has-text("Google Drive")',
    '[role="menuitem"]:has-text("Google ドライブ")',
    '[role="menuitem"]:has-text("Googleドライブ")',
    '[role="menuitem"]:has-text("Google Drive")',
    '[role="option"]:has-text("Google ドライブ")',
    '[role="option"]:has-text("Google Drive")',
    'li:has-text("Google ドライブ")',
    'li:has-text("Googleドライブ")',
    'li:has-text("Google Drive")',
    '[data-source-type="DRIVE"]',
    '[aria-label*="ドライブ"]',
    '[aria-label*="Drive"]',
    'span:has-text("Google ドライブ")',
    'div[role="button"]:has-text("ドライブ")',
  ]
  let driveClicked = false
  for (const sel of driveOptionCandidates) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      await el.click({ timeout: 5000 })
      driveClicked = true
      break
    }
  }
  if (!driveClicked) {
    await page.screenshot({ path: '/tmp/nblm-drive-picker-debug.png', fullPage: true }).catch(() => {})
    throw new Error(
      'Google Drive オプションが見つかりません。\n' +
      '  スクリーンショット: /tmp/nblm-add-source-dialog.png\n' +
      '  HTML ダンプ: /tmp/nblm-add-source-dialog.html'
    )
  }

  // 3. Wait for Drive picker iframe
  let pickerFrame = null
  for (const sel of PICKER_FRAME_SELECTORS) {
    try {
      await page.waitForSelector(sel, { timeout: 12000 })
      pickerFrame = page.frameLocator(sel)
      break
    } catch { /* try next selector */ }
  }
  if (!pickerFrame) {
    await page.screenshot({ path: '/tmp/nblm-drive-picker-debug.png', fullPage: true }).catch(() => {})
    throw new Error('Drive picker iframe did not appear. Screenshot: /tmp/nblm-drive-picker-debug.png')
  }

  // 4. Navigate to My Drive
  await pickerFrame.locator([
    'text=マイドライブ',
    'text=My Drive',
    '[data-view="2"]',
  ].join(', ')).first().click({ timeout: 10000 })
  await page.waitForTimeout(1000)

  // 5. Open nblm-putter folder
  await pickerFrame.locator(`[data-tooltip="nblm-putter"], text=nblm-putter`).first().dblclick({ timeout: 10000 })
  await page.waitForTimeout(800)

  // 6. Open notebook subfolder
  await pickerFrame.locator(`[data-tooltip="${notebookId}"], text=${notebookId}`).first().dblclick({ timeout: 10000 })
  await page.waitForTimeout(800)

  // 7. Select all files
  const firstFile = pickerFrame.locator('[data-id]').first()
  await firstFile.click({ timeout: 5000 })
  await page.keyboard.press('Control+A')
  await page.waitForTimeout(500)

  // 8. Click Select / 選択
  await pickerFrame.locator([
    'button:has-text("選択")',
    'button:has-text("Select")',
    '[jsname="d1dBrd"]',
  ].join(', ')).first().click({ timeout: 5000 })

  // 9. Wait for dialog to close
  await page.waitForTimeout(2000)
}
