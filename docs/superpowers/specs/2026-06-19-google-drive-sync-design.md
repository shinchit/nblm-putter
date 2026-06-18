# Google Drive Sync Design

## Goal

ローカルファイルを Google Drive 経由で NotebookLM に登録する。直接アップロード方式を置き換え、NotebookLM の「Googleドライブ」ソース追加機能を使って全ファイルを一括追加することで、サーバー側の per-notebook ボタン無効化ブロックを回避し、並列処理を実現する。

## Architecture

```
[ローカルファイル群]
      ↓ googleapis (Drive API)
[Drive: nblm-putter/{notebook-id}/]
      ↓ Playwright
[NotebookLM: ソースを追加 → Googleドライブ]
      ↓ Drive ピッカー iframe 操作（全ファイル一括選択）
      ↓
[NotebookLM サーバー側で並列処理（ボタン無効化なし）]
```

## Tech Stack

- `googleapis` npm パッケージ（Drive API v3）
- Playwright（既存）— Drive ピッカー iframe 操作
- Google Cloud OAuth2（client_id + client_secret）

---

## 認証・設定

### Google Cloud プロジェクト要件（ユーザーがセットアップ）

1. Google Cloud Console で OAuth2 クレデンシャルを作成
2. スコープ: `https://www.googleapis.com/auth/drive.file`
3. リダイレクト URI: `http://localhost:3001/callback`
4. `client_id` と `client_secret` を取得

### `config init` への追加

```
Google Cloud OAuth2 Client ID: <client_id>
Google Cloud OAuth2 Client Secret: <client_secret>
```

`~/.nblm-putter/config.json` に保存。

### `nblm-putter auth` フロー拡張

既存の NotebookLM セッション取得の後に Drive OAuth2 フローを追加する。

1. ローカル HTTP サーバーを `http://localhost:3001/callback` で起動
2. Drive スコープ付き OAuth2 認可 URL をブラウザで開く
3. ユーザーが「許可」→ 認可コード受信
4. 認可コードを `access_token` + `refresh_token` に交換
5. `~/.nblm-putter/drive-token.json`（および Secrets Manager）に保存

`access_token` は 1 時間で失効。ツール起動時に期限を確認し、`refresh_token` で自動更新する。

### トークン保存形式

```json
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "expiry_date": 1719000000000
}
```

---

## Drive フォルダ構成

```
マイドライブ/
  nblm-putter/
    {notebook-id}/       ← ノートブックごとにサブフォルダ
      document1.pdf
      document2.docx
      ...
```

- `nblm-putter/` フォルダが存在しない場合は自動作成
- `{notebook-id}/` サブフォルダが存在しない場合は自動作成
- 同名ファイルが既に存在する場合は上書き更新（重複ファイルを作らない）
- ファイルの MIME タイプは拡張子から自動判定

---

## データフロー詳細

### Phase 1: Drive アップロード

1. `loadIgnorePatterns()` で ignore パターンを取得
2. `walkDir()` + `filterFiles()` でアップロード対象ファイルを列挙
3. `drive.files.create()` / `drive.files.update()` で各ファイルを `nblm-putter/{notebook-id}/` にアップロード
4. アップロード済みファイルの Drive ファイル ID リストを保持

### Phase 2: NotebookLM Drive ピッカー操作

1. Playwright でノートブックページを開く
2. 「ソースを追加」ボタンをクリック
3. 「Googleドライブ」を選択
4. Drive ピッカー iframe が開くのを待つ
5. iframe 内で `nblm-putter/{notebook-id}/` フォルダへナビゲート
6. 全ファイルを Ctrl+A または Ctrl+クリックで選択
7. 「選択」ボタンをクリック
8. 処理開始を確認して完了

---

## 新規コンポーネント

| ファイル | 役割 |
|---|---|
| `src/drive/client.ts` | Drive API ラッパー（フォルダ作成・ファイルアップロード・ファイル ID 取得） |
| `src/drive/token.ts` | トークンの保存・読み込み・自動リフレッシュ |
| `src/playwright/drive-picker.ts` | Drive ピッカー iframe 操作（ナビゲート・全選択・確定） |
| `src/server/routes/drive-sync.ts` | `POST /api/drive-sync` エンドポイント |

### 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `src/commands/auth.ts` | Drive OAuth2 フローを追加 |
| `src/commands/config.ts` | `client_id` / `client_secret` の入力・保存を追加 |
| `src/commands/sync.ts` | Drive 経由に変更 |
| `src/config.ts` | `Config` 型に `drive: { clientId, clientSecret }` を追加 |
| `src/server/app.ts` | `/api/drive-sync` ルートを登録 |
| `packages/ui/src/pages/Sync.tsx` | Sync ボタンを「Sync via Drive」に変更、進捗表示を2フェーズ（Drive アップロード / NotebookLM 追加）に更新 |
| `packages/ui/src/api/client.ts` | `startDriveSync()` を追加 |

---

## Drive ピッカー操作詳細

```typescript
// iframe への入り方
const picker = page.frameLocator('iframe[src*="drive.google.com"]')

// フォルダナビゲート
await picker.locator('text=マイドライブ').click()
await picker.locator(`text=nblm-putter`).dblclick()
await picker.locator(`text=${notebookId}`).dblclick()

// 全ファイル選択
await picker.locator('[data-item]').first().click()
await page.keyboard.press('Control+A')

// 確定
await picker.locator('button:has-text("選択"), button:has-text("Select")').click()
```

### フォールバック戦略

Drive ピッカーの UI が変更されて自動操作が失敗した場合:

1. Drive API で取得済みのファイル ID を使い、NotebookLM の内部 gRPC-web API を直接呼ぶ（最終手段）
2. エラーメッセージにデバッグスクリーンショットのパスを表示

---

## エラーハンドリング

| エラー | 対応 |
|---|---|
| Drive トークン期限切れ | `refresh_token` で自動更新。更新失敗なら `nblm-putter auth` を促す |
| Drive アップロード失敗 | 失敗ファイルをログに記録し、成功分のみ NotebookLM に追加 |
| Drive ピッカーが開かない | スクリーンショットを `/tmp/` に保存してエラー表示 |
| Drive ピッカーのセレクタが変わった | スクリーンショット + フォールバック（gRPC-web API）へ移行 |
| client_id / client_secret 未設定 | `nblm-putter config init` を促すエラーメッセージ |

---

## UI 変更（Web UI Sync ページ）

**変更前:**
```
[Notebook セレクト] [+ 新規作成]
[Folder Path 入力] [Browse...]
[Sync ボタン]
```

**変更後:**
```
[Notebook セレクト] [+ 新規作成]
[Folder Path 入力] [Browse...]   ← フォルダ選択（Drive アップロード元）
[Sync via Drive ボタン]

実行中:
  ① Drive にアップロード中... (3/12)
  ② NotebookLM に追加中...
  ③ ✓ 完了 — 12件
```

フォルダ選択 UI は残す（どのフォルダを Drive にアップロードするかの指定に引き続き必要）。

---

## CLI 変更

```bash
# 変更後の sync コマンド（Drive 経由）
nblm-putter sync /path/to/folder --notebook <id>

# 新しい auth フロー（Drive OAuth2 も実施）
nblm-putter auth
```

---

## 未解決事項

- Drive ピッカーの具体的なセレクタは実装時に実際の UI を確認して決定する
- Drive ピッカーの言語（日本語/英語）によりセレクタが変わる可能性があるため、両言語対応のセレクタを用意する
