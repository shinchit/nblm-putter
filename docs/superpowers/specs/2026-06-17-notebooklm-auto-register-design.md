# nblm-putter Design Spec

**Date:** 2026-06-17
**Status:** Approved

## Overview

`nblm-putter` は、指定したローカルフォルダ配下のファイルを NotebookLM へ再帰的に自動登録するツール。CLI が主役で、ローカル Web UI はその操作補助として提供する。個人利用が前提で、クロスプラットフォーム（Windows PowerShell / macOS / Linux）対応。

---

## Architecture

### 全体構成

```
[ ローカル (Node.js + TypeScript) ]
  CLI
    nblm-putter auth          → Playwright(headed) + Google login
                              → session → Secrets Manager (or local fallback)
    nblm-putter sync <folder> → Playwright(headless) + session
      --notebook <id>         → NotebookLM へ直接登録
                              → 履歴 → SQLite
    nblm-putter notebooks list
    nblm-putter ignore add/list/remove → Secrets Manager (or local fallback)
    nblm-putter ui            → ローカル Web サーバー起動

  Web UI (localhost:3000)
    → ignore 設定
    → ジョブ履歴閲覧
    → セッション更新（session.json アップロード）
    → ノートブック一覧・sync 実行

[ AWS ]
  Secrets Manager のみ（オプショナル）
    nblm-putter/session     → NotebookLM セッション JSON
    nblm-putter/settings    → { ignorePatterns: string[] }
```

### Secrets Manager フォールバック

Secrets Manager はオプショナルな「クラウド同期レイヤー」。アクセス不可でも他機能は完全動作する。

```
session の読み書き:
  1. Secrets Manager へアクセス試行
  2. 失敗 → ~/.nblm-putter/session.json にフォールバック

ignore パターンの読み書き:
  1. Secrets Manager へアクセス試行
  2. 失敗 → SQLite にフォールバック

起動時:
  ⚠ Secrets Manager unavailable. Running in local-only mode.
    (cross-machine sync disabled)
```

---

## Data Model

### ローカル SQLite: `~/.nblm-putter/db.sqlite`

**jobs テーブル**

| カラム | 型 | 説明 |
|--------|-----|------|
| jobId | TEXT PK | UUID |
| status | TEXT | pending / running / done / failed |
| notebookId | TEXT | 登録先ノートブック ID |
| totalFiles | INTEGER | 対象ファイル総数 |
| doneFiles | INTEGER | 登録完了数 |
| errors | TEXT | JSON配列 `[{ file, reason }]` |
| createdAt | TEXT | ISO8601 |
| updatedAt | TEXT | ISO8601 |

**settings テーブル（ローカルフォールバック用）**

| カラム | 型 | 説明 |
|--------|-----|------|
| key | TEXT PK | "ignorePatterns" |
| value | TEXT | JSON配列 |

### 設定ファイル: `~/.nblm-putter/config.json`

```json
{
  "aws": {
    "region": "ap-northeast-1",
    "profile": "default"
  },
  "useSecretsManager": true
}
```

Windows パス: `%USERPROFILE%\.nblm-putter\`

---

## CLI Commands

```
nblm-putter config init
  初回セットアップ。AWS 設定・Secrets Manager 使用有無を対話的に設定。

nblm-putter auth
  Playwright(headed) でブラウザを開き Google login を実行。
  session を Secrets Manager（またはローカル）へ保存。

nblm-putter notebooks list
  Playwright(headless) + session で NotebookLM のノートブック一覧を取得・表示。

nblm-putter sync <folder> --notebook <id>
  1. ignore パターンを取得（Secrets Manager or SQLite）
  2. フォルダを再帰走査・フィルタ適用（minimatch）
  3. Playwright(headless) + session でファイルを 1 件ずつ NotebookLM へ登録
  4. 進捗をターミナルに表示（プログレスバー）
  5. 完了後、ジョブ履歴を SQLite へ記録

nblm-putter ignore add <pattern>
nblm-putter ignore list
nblm-putter ignore remove <pattern>
  ignore パターンを Secrets Manager（またはSQLite）で管理。
  パターンは minimatch 形式（*.log, node_modules/ 等）。

nblm-putter ui
  localhost:3000 でローカル Web サーバーを起動しブラウザを開く。
```

---

## Playwright フロー（sync）

```
1. session 読み込み（Secrets Manager or ローカルファイル）
2. Playwright(headless Chromium) 起動
3. session を適用して NotebookLM を開く
   └─ セッション切れ検知 → エラー終了 + "nblm-putter auth を実行してください" を表示
4. ignore パターンを取得してファイルリストをフィルタ
5. 指定ノートブックを開く（notebookId で URL 直指定）
6. ファイルを 1 件ずつ登録:
   a. 「ソースを追加」ボタンをクリック
   b. ファイルアップロード UI でファイルを選択・送信
   c. アップロード完了を待機（タイムアウト: 60秒/件）
   d. SQLite の doneFiles をインクリメント・進捗表示更新
7. 全件完了 → status を "done" に更新
```

**NotebookLM 非対応形式の扱い:**
スキップして `errors` に記録（処理は継続）。完了時に警告サマリーを表示。

**重複登録:**
重複チェックは行わない。NotebookLM 側の挙動に委ねる（同一ファイルは重複ソースとして登録される場合がある）。

---

## Web UI

`nblm-putter ui` で起動するローカルサーバー（localhost:3000）。

### 画面構成

- **Sync**: ノートブック選択 (dropdown) + フォルダパス入力 + 実行ボタン + リアルタイム進捗バー
- **History**: 過去ジョブ一覧（日時・ノートブック・登録数・エラー件数）
- **Ignore**: パターンの追加・削除リスト
- **Session**: session.json アップロードボタン → Secrets Manager（またはローカル）へ保存。ローカルモード時は「Local Only」バッジ表示。

---

## Project Structure

```
nblm-putter/
├─ packages/
│   ├─ cli/
│   │   ├─ src/
│   │   │   ├─ commands/       # auth, sync, notebooks, ignore, ui, config
│   │   │   ├─ playwright/     # NotebookLM 操作ロジック
│   │   │   ├─ db/             # SQLite (better-sqlite3)
│   │   │   ├─ aws/            # Secrets Manager SDK
│   │   │   └─ server/         # Express + UI 配信
│   │   └─ package.json
│   └─ ui/
│       ├─ src/
│       │   └─ pages/          # Sync, History, Ignore, Session
│       └─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.json
```

## Tech Stack

| 用途 | ライブラリ |
|------|-----------|
| CLI フレームワーク | `commander` |
| Playwright | `playwright` (Chromium) |
| SQLite | `better-sqlite3` |
| AWS SDK | `@aws-sdk/client-secrets-manager` |
| ローカルサーバー | `express` |
| UI | React + Vite + TailwindCSS |
| ファイルフィルタ | `minimatch` |
| 進捗表示 | `cli-progress` |
| 言語 | TypeScript |
| パッケージマネージャー | pnpm (monorepo) |

**対応OS:** Windows (PowerShell) / macOS / Linux

---

## Out of Scope

- 差分同期（同一ファイルの重複チェック）
- 自動定期実行（cron）
- Lambda / ECS / API Gateway / Cognito 等の AWS サービス
- ファイルウォッチャー
