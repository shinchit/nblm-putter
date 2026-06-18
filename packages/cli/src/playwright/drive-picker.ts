import { Page } from 'playwright'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

export async function addSourcesFromDrive(page: Page, notebookId: string): Promise<void> {
  // 1. Open "Add source" dialog
  await page.locator('[aria-label="ソースを追加"]').click({ timeout: 10000 })
  await page.waitForTimeout(500)

  // 2. Click "Google Drive" option
  await page.locator([
    'button:has-text("Google ドライブ")',
    'button:has-text("Google Drive")',
    '[data-source-type="DRIVE"]',
  ].join(', ')).first().click({ timeout: 5000 })

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
