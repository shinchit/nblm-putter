import { Page } from 'playwright'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

export async function addSourcesFromDrive(page: Page, notebookId: string): Promise<void> {
  const debugDir = process.env.TMPDIR ?? '/tmp'
  const { writeFileSync } = require('fs') as typeof import('fs')

  // 1. Click "ソースを追加" — use force:true so invisible overlays don't block
  await page.locator('[aria-label="ソースを追加"], [aria-label="Add source"]')
    .first()
    .click({ force: true, timeout: 15000 })

  // 2. Wait for the source-type selection panel to appear.
  //    NotebookLM renders this either as a CDK dialog or inline within source-picker.
  //    We try every likely indicator and proceed as soon as one appears.
  const DIALOG_SELECTORS = [
    'mat-dialog-container',
    '.mat-mdc-dialog-container',
    '[role="dialog"]',
    '[role="menu"]',
    'mat-menu-content',
    // inline expansion inside source-picker: look for any button mentioning Drive / Docs / PDF
    'source-picker button:has-text("Drive")',
    'source-picker button:has-text("ドライブ")',
    'source-picker button:has-text("PDF")',
    // generic: any element with "Google Drive" or "Google ドライブ" that wasn't there before
    ':has-text("Google ドライブ"):not(body):not(html)',
    ':has-text("Google Drive"):not(body):not(html)',
  ]

  let dialogFound = false
  for (const sel of DIALOG_SELECTORS) {
    const appeared = await page.waitForSelector(sel, { timeout: 3000 })
      .then(() => true).catch(() => false)
    if (appeared) { dialogFound = true; break }
  }

  // Capture state for debugging whether or not dialog was found
  await page.screenshot({ path: `${debugDir}/nblm-add-source-dialog.png`, fullPage: true }).catch(() => {})
  const html = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '')
  writeFileSync(`${debugDir}/nblm-add-source-dialog.html`, html)

  if (!dialogFound) {
    throw new Error(
      '「ソースを追加」ダイアログが開きませんでした。\n' +
      `  スクリーンショット: ${debugDir}/nblm-add-source-dialog.png\n` +
      `  HTML ダンプ: ${debugDir}/nblm-add-source-dialog.html`
    )
  }

  // 3. Click "Drive / ドライブ" button inside the dialog/panel
  //    NotebookLM shows short labels: "ドライブ" (not "Google ドライブ")
  const driveOptionCandidates = [
    'button:has-text("ドライブ")',          // Japanese short label
    'button:has-text("Drive")',              // English short label
    'button:has-text("Google ドライブ")',
    'button:has-text("Googleドライブ")',
    'button:has-text("Google Drive")',
    '[role="menuitem"]:has-text("ドライブ")',
    '[role="menuitem"]:has-text("Drive")',
    '[role="option"]:has-text("ドライブ")',
    '[role="option"]:has-text("Drive")',
    '[data-source-type="DRIVE"]',
    '[aria-label*="ドライブ"]',
    '[aria-label*="Drive"]',
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
    await page.screenshot({ path: `${debugDir}/nblm-drive-picker-debug.png`, fullPage: true }).catch(() => {})
    throw new Error(
      'Google Drive オプションが見つかりません。ダイアログは開きましたが Drive ボタンのセレクタが外れています。\n' +
      `  スクリーンショット: ${debugDir}/nblm-add-source-dialog.png\n` +
      `  HTML ダンプ: ${debugDir}/nblm-add-source-dialog.html`
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
