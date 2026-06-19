import { Page } from 'playwright'
import * as fs from 'fs'

const PICKER_FRAME_SELECTORS = [
  'iframe[src*="drive.google.com"]',
  'iframe[src*="docs.google.com/picker"]',
  'iframe[src*="accounts.google.com"][src*="picker"]',
]

// filesToAdd: 新規アップロードしたファイル名のリスト。指定時はそのファイルのみ選択する。
export async function addSourcesFromDrive(
  page: Page,
  notebookId: string,
  filesToAdd?: string[],
): Promise<void> {
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

  // 4. 「マイドライブ」タブをクリック
  //    ピッカーは「最近使用したアイテム」タブで開くので明示的に切り替える
  //    タブは role="tab"、テキスト「マイドライブ」または id="1"
  const myDriveTab = pickerFrame.getByRole('tab', { name: 'マイドライブ' })
    .or(pickerFrame.getByRole('tab', { name: 'My Drive' }))
    .or(pickerFrame.locator('[role="tab"][id="1"]'))
  const myDriveTabVisible = await myDriveTab.first().isVisible({ timeout: 3000 }).catch(() => false)
  if (myDriveTabVisible) {
    await myDriveTab.first().click({ timeout: 5000 })
    await page.waitForTimeout(1500)
  }

  // 5. nblm-putter フォルダを開く
  //    ファイルアイテムは aria-label="<名前> <種別> 選択されていません" の形式
  const nblmFolder = pickerFrame.locator('[aria-label*="nblm-putter"]').first()
  await nblmFolder.waitFor({ state: 'visible', timeout: 10000 })
  await nblmFolder.dblclick({ timeout: 5000 })
  await page.waitForTimeout(1200)

  // 6. ノートブックサブフォルダを開く
  const notebookFolder = pickerFrame.locator(`[aria-label*="${notebookId}"]`).first()
  await notebookFolder.waitFor({ state: 'visible', timeout: 10000 })
  await notebookFolder.dblclick({ timeout: 5000 })
  await page.waitForTimeout(1200)

  // デバッグ用スクリーンショット＆HTML ダンプ（フォルダ内容確認）
  await page.screenshot({ path: `${debugDir}/nblm-picker-folder.png`, fullPage: true }).catch(() => {})
  const pickerHtmlAfter = await page.frames()
    .find(f => f.url().includes('docs.google.com') || f.url().includes('drive.google.com'))
    ?.evaluate(() => document.documentElement.outerHTML)
    .catch(() => '') ?? ''
  fs.writeFileSync(`${debugDir}/nblm-picker-folder.html`, pickerHtmlAfter)

  // 7. ファイルを選択
  if (filesToAdd && filesToAdd.length > 0) {
    // 新規アップロード分のみ Ctrl+クリックで個別選択
    let firstSelected = false
    for (const name of filesToAdd) {
      const item = pickerFrame.locator(`[aria-label*="${name}"]`).first()
      const visible = await item.isVisible({ timeout: 2000 }).catch(() => false)
      if (!visible) continue
      if (!firstSelected) {
        await item.click({ timeout: 5000 })
        firstSelected = true
      } else {
        await item.click({ modifiers: ['Control'], timeout: 5000 })
      }
    }
    if (!firstSelected) {
      throw new Error('新規アップロードファイルがピッカー内に見つかりませんでした。')
    }
  } else {
    // filesToAdd 未指定時はフォルダ内全件を Shift+クリックで選択
    const fileItems = pickerFrame.locator('[aria-label*="選択されていません"]')
    const fileCount = await fileItems.count().catch(() => 0)
    if (fileCount > 0) {
      await fileItems.first().click({ timeout: 5000 })
      if (fileCount > 1) {
        await fileItems.last().click({ modifiers: ['Shift'], timeout: 5000 })
      }
    }
  }
  await page.waitForTimeout(800)

  // 選択後のスクリーンショット
  await page.screenshot({ path: `${debugDir}/nblm-picker-selected.png`, fullPage: true }).catch(() => {})

  // 8. 「挿入」ボタンをクリック（ファイル選択後に右下に出現）
  //    実 DOM 確認: 日本語 UI は「挿入」、英語 UI は「Insert」
  const insertBtn = pickerFrame.getByRole('button', { name: '挿入' })
    .or(pickerFrame.getByRole('button', { name: 'Insert' }))
    .or(pickerFrame.locator('[jsname="d1dBrd"]'))
    .or(pickerFrame.locator('[aria-label="挿入"]'))
    .or(pickerFrame.locator('[aria-label="Insert"]'))
  await insertBtn.first().waitFor({ state: 'visible', timeout: 8000 })
  await insertBtn.first().click({ timeout: 5000 })

  // 9. ダイアログが閉じるのを待つ
  await page.waitForTimeout(2000)
}
