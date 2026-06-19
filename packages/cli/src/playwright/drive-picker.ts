import { Page } from 'playwright'
import * as fs from 'fs'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

export async function addSourcesFromDrive(page: Page, notebookId: string): Promise<void> {
  const debugDir = process.env.TMPDIR ?? '/tmp'

  // 1. 「ソースを追加」ボタンをクリック
  await page.locator('[aria-label="ソースを追加"], [aria-label="Add source"]')
    .first()
    .click({ force: true, timeout: 15000 })

  // 2. 「ドライブ」ボタンが出現するまで待ってクリック
  //    getByRole() / getByText() はシャドウ DOM を透過する。
  //    CSS の :has-text() は透過しない。
  //    旧コードの waitForSelector ループが偶然 24秒以上待っていたのを
  //    「ドライブ」ボタン自体の出現待ちに一本化する。
  const driveButton = page.getByRole('button', { name: 'ドライブ', exact: true })
    .or(page.getByRole('button', { name: 'Drive', exact: true }))
    .or(page.getByRole('menuitem', { name: 'ドライブ' }))
    .or(page.getByRole('menuitem', { name: 'Drive' }))

  let driveClicked = false

  // Strategy A: 出現を 15秒待ってクリック
  const appeared = await driveButton.first().waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true).catch(() => false)

  if (appeared) {
    await driveButton.first().click({ timeout: 5000 })
    driveClicked = true
  }

  // Strategy B: JS でシャドウ DOM を再帰探索してクリック
  if (!driveClicked) {
    driveClicked = await page.evaluate(() => {
      const TARGET = ['ドライブ', 'Drive', 'Google ドライブ', 'Google Drive']
      const EXCLUDE = ['ソースを追加', 'Add source']

      function tryClick(root: Element | ShadowRoot): boolean {
        for (const el of Array.from(root.querySelectorAll(
          'button, [role="button"], [role="menuitem"], [role="option"]'
        ))) {
          const t = (el.textContent ?? '').trim()
          if (TARGET.some(s => t === s || t.startsWith(s)) && !EXCLUDE.some(s => t.includes(s))) {
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
    await page.screenshot({ path: `${debugDir}/nblm-add-source-dialog.png`, fullPage: true }).catch(() => {})
    const html = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '')
    fs.writeFileSync(`${debugDir}/nblm-add-source-dialog.html`, html)
    throw new Error(
      'Google Drive の「ドライブ」ボタンが見つかりません（15秒待機後）。\n' +
      `  スクリーンショット: ${debugDir}/nblm-add-source-dialog.png\n` +
      `  HTML ダンプ: ${debugDir}/nblm-add-source-dialog.html`
    )
  }

  // 3. Drive ピッカー iframe を待つ
  let pickerFrame = null
  let pickerFrameSel = ''
  for (const sel of PICKER_FRAME_SELECTORS) {
    try {
      await page.waitForSelector(sel, { timeout: 12000 })
      pickerFrame = page.frameLocator(sel)
      pickerFrameSel = sel
      break
    } catch { /* 次を試す */ }
  }
  if (!pickerFrame) {
    await page.screenshot({ path: `${debugDir}/nblm-drive-picker-debug.png`, fullPage: true }).catch(() => {})
    throw new Error(`Drive ピッカー iframe が表示されませんでした。スクリーンショット: ${debugDir}/nblm-drive-picker-debug.png`)
  }

  // ピッカーが読み込まれるまで少し待ってからデバッグ情報を保存
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${debugDir}/nblm-picker-opened.png`, fullPage: true }).catch(() => {})
  const pickerHtml = await page.frames()
    .find(f => f.url().includes('docs.google.com') || f.url().includes('drive.google.com'))
    ?.evaluate(() => document.documentElement.outerHTML)
    .catch(() => '') ?? ''
  fs.writeFileSync(`${debugDir}/nblm-picker-frame.html`, pickerHtml)

  // 4. マイドライブへ移動（ピッカーが別ビューを開いている場合）
  const myDriveCandidates = [
    'text=マイドライブ',
    'text=My Drive',
    '[data-view="2"]',
    '[aria-label="マイドライブ"]',
    '[aria-label="My Drive"]',
    '[data-id="my_drive_item"]',
    '.a-d-Dc:has-text("マイドライブ")',
    '.a-d-Dc:has-text("My Drive")',
    '[role="treeitem"]:has-text("マイドライブ")',
    '[role="treeitem"]:has-text("My Drive")',
    '[role="listitem"]:has-text("マイドライブ")',
    '[role="listitem"]:has-text("My Drive")',
  ]
  for (const sel of myDriveCandidates) {
    const el = pickerFrame.locator(sel).first()
    const visible = await el.isVisible({ timeout: 1000 }).catch(() => false)
    if (visible) {
      await el.click({ timeout: 5000 })
      await page.waitForTimeout(1000)
      break
    }
  }

  // 5. nblm-putter フォルダを開く
  const nblmFolder = pickerFrame.locator([
    `[data-tooltip="nblm-putter"]`,
    `[aria-label="nblm-putter"]`,
    `text=nblm-putter`,
    `[title="nblm-putter"]`,
  ].join(', ')).first()
  await nblmFolder.waitFor({ state: 'visible', timeout: 10000 })
  await nblmFolder.dblclick({ timeout: 5000 })
  await page.waitForTimeout(1000)

  // 6. ノートブックサブフォルダを開く
  const notebookFolder = pickerFrame.locator([
    `[data-tooltip="${notebookId}"]`,
    `[aria-label="${notebookId}"]`,
    `text=${notebookId}`,
    `[title="${notebookId}"]`,
  ].join(', ')).first()
  await notebookFolder.waitFor({ state: 'visible', timeout: 10000 })
  await notebookFolder.dblclick({ timeout: 5000 })
  await page.waitForTimeout(1000)

  // 7. 全ファイルを選択
  await pickerFrame.locator('[data-id]').first().click({ timeout: 5000 })
  await page.keyboard.press('Control+A')
  await page.waitForTimeout(500)

  // 8. 「選択」ボタンをクリック
  await pickerFrame.locator([
    'button:has-text("選択")',
    'button:has-text("Select")',
    '[jsname="d1dBrd"]',
  ].join(', ')).first().click({ timeout: 5000 })

  // 9. ダイアログが閉じるのを待つ
  await page.waitForTimeout(2000)
}
