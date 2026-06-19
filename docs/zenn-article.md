---
title: "ローカルフォルダを NotebookLM に丸ごと同期する CLI ツール「nblm-putter」を作りました"
emoji: "📂"
type: "tech"
topics: ["notebooklm", "nodejs", "playwright", "googlecloud", "cli"]
published: false
---

Google NotebookLM は、自分でアップロードしたドキュメントを AI が読み込んで要約・Q&A・音声解説を生成してくれるサービスです。PDFや Word ファイル、ウェブページなどを「ソース」として登録しておくと、そのドキュメントに限定した精度の高い回答が得られるのが特徴です。

私は Dropbox に溜め込んだ数十〜数百のファイル（議事録・技術資料・契約書など）を NotebookLM で活用したかったのですが、**1ファイルずつ手動でアップロードするのが限界**でした。ファイルが増えるたびに「ソースを追加」ボタンを何十回もクリックするのはさすがにつらい。

そこで作ったのが **nblm-putter** です。

https://github.com/shinchit/nblm-putter

---

## できること

コマンド1行で、ローカルフォルダ以下のファイルを再帰的に走査し、NotebookLM のノートブックへ一括登録します。

まずノートブック ID を確認して……

![notebooks list コマンドの実行例](https://raw.githubusercontent.com/shinchit/nblm-putter/main/docs/screenshots/cli-notebooks-list.png)

あとは sync するだけです。

![sync コマンド初回実行](https://raw.githubusercontent.com/shinchit/nblm-putter/main/docs/screenshots/cli-sync-first.png)

**2回目以降は差分だけを追加します。** 既にアップロード済みのファイルは黄色の `SKIP` で表示されてスキップされ、新規ファイルのみが NotebookLM に追加されます。

![sync コマンド2回目（差分のみ）](https://raw.githubusercontent.com/shinchit/nblm-putter/main/docs/screenshots/cli-sync-diff.png)

### 主な機能

| 機能 | 説明 |
|---|---|
| **一括同期** | フォルダを再帰的に走査して全ファイルを登録 |
| **差分同期** | 同名ファイルが既に Drive にあればスキップ（重複追加なし） |
| **強制上書き** | `--force-overwrite` で既存ファイルも再アップロード |
| **除外パターン** | `.log` や `node_modules/` など gitignore 形式で指定可能 |
| **Web UI** | ブラウザから操作できるローカル管理画面 |
| **複数マシン対応** | AWS Secrets Manager でセッションを共有（オプション） |

---

## 仕組み

NotebookLM には**公式 API がありません**。そのためブラウザ自動操作で実現しています。

### 2フェーズ構成

**Phase 1 — Google Drive API でアップロード**

Google Drive API（googleapis）を使い、`nblm-putter/{notebook-id}/` というフォルダを自動作成してファイルをアップロードします。同名ファイルが既に存在する場合はスキップします。

**Phase 2 — Playwright で NotebookLM を自動操作**

ヘッドレス Chromium を起動し、NotebookLM の「ソースを追加 → ドライブ」フローを自動でクリックします。Drive ピッカーで新規ファイルだけを選択して「挿入」します。

```
NotebookLM
  └─ 「ソースを追加」ボタンをクリック
      └─ 「ドライブ」を選択
          └─ マイドライブ → nblm-putter → {notebook-id} フォルダへ移動
              └─ 新規ファイルのみ Ctrl+クリックで選択 → 挿入
```

Phase 2 で新規ファイルが0件の場合はブラウザすら起動しないため、差分なし時は高速に終わります。

---

## セットアップ

### 1. インストール

```bash
git clone https://github.com/shinchit/nblm-putter.git
cd nblm-putter
pnpm install && pnpm build
npx playwright install chromium

cd packages/cli
npm install -g .
```

### 2. Google Drive の準備（初回のみ）

[Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、**Google Drive API** を有効にします。「認証情報 → OAuth 2.0 クライアント ID」を**デスクトップアプリ**として作成し、`client_id` と `client_secret` を取得してください。

```bash
nblm-putter config init   # client_id / client_secret を入力
nblm-putter auth          # NotebookLM + Drive の認証（Chrome が開きます）
```

### 3. 同期実行

```bash
# ノートブック ID を確認
nblm-putter notebooks list

# 同期（初回）
nblm-putter sync ~/Documents/my-folder --notebook <ノートブックID>

# 2回目以降（差分のみ追加）
nblm-putter sync ~/Documents/my-folder --notebook <ノートブックID>

# 全ファイルを強制的に上書き再登録したい場合
nblm-putter sync ~/Documents/my-folder --notebook <ノートブックID> --force-overwrite
```

---

## Web UI

CLI だけでなく、ブラウザで使えるローカル管理画面も付属しています。

```bash
nblm-putter ui
# → http://localhost:3000 が開く
```

**Sync ページ** — ノートブックを選んでフォルダを指定するだけで実行できます。

![Web UI Sync ページ](https://raw.githubusercontent.com/shinchit/nblm-putter/main/docs/screenshots/ui-sync.png)

**History ページ** — 過去の同期ジョブが一覧で確認できます。

![Web UI History ページ](https://raw.githubusercontent.com/shinchit/nblm-putter/main/docs/screenshots/ui-history.png)

**Ignore ページ** — 除外パターンを GUI で管理できます。

![Web UI Ignore ページ](https://raw.githubusercontent.com/shinchit/nblm-putter/main/docs/screenshots/ui-ignore.png)

| ページ | できること |
|---|---|
| **Sync** | ノートブック選択・フォルダ指定・リアルタイム進捗表示・中止 |
| **History** | 過去の同期ジョブ一覧（日時・件数・エラー） |
| **Ignore** | 除外パターンの追加・削除 |
| **Session** | 別マシンで取得したセッションのアップロード |

---

## 技術スタック

- **Node.js 20 + TypeScript**（pnpm monorepo）
- **Playwright**（ヘッドレス Chromium でブラウザ自動操作）
- **googleapis**（Drive API v3 でファイルアップロード）
- **React + Vite**（Web UI）
- **better-sqlite3**（ジョブ履歴の管理）
- **Express**（Web UI のバックエンド API）

### 実装で苦労したところ

NotebookLM は Angular 製で、ダイアログが**シャドウ DOM** の中にレンダリングされます。通常の CSS セレクター（`:has-text()`）では要素が見つからず、Playwright の `getByRole()`（シャドウ DOM を透過）に切り替えることで解決しました。

また、Google Drive ピッカーの確定ボタンは日本語 UI だと「**挿入**」という名前で、「選択」「Select」では一切マッチしません。実際の DOM をデバッグしてセレクターを地道に特定する必要がありました。こういう非公式自動化の大変さがありますね。

---

## 注意事項

:::message alert
- 本ツールは**非公式**のサードパーティ製ソフトウェアです。Google LLC および NotebookLM とは無関係です
- Playwright によるブラウザ自動操作を使用しています。**NotebookLM の UI 変更により予告なく動作しなくなる**可能性があります
- Google の利用規約に従い、**自己責任**でご利用ください
:::

---

## おわりに

「NotebookLM にファイルを大量に放り込みたいけど手動は無理」という方にぴったりのツールです。Dropbox・OneDrive・ローカルの任意のフォルダを指定できるので、既存のファイル管理フローを変えることなく使えます。

Issue・PR もお待ちしています 🙏

https://github.com/shinchit/nblm-putter
