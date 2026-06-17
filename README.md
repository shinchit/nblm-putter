# nblm-putter

ローカルフォルダのファイルを [NotebookLM](https://notebooklm.google.com) へ再帰的に自動登録する CLI ツール。ローカル Web UI も付属。

---

## 動作環境

- Node.js 20 以上
- pnpm 8 以上
- macOS / Linux / Windows (PowerShell)
- （オプション）AWS アカウント — Secrets Manager を使うと複数マシンで設定を共有できる

---

## インストール

### リポジトリをクローンしてビルド

```bash
git clone https://github.com/yourname/nblm-putter.git
cd nblm-putter
pnpm install
pnpm build
```

### グローバルにリンク（`nblm-putter` コマンドとして使えるようにする）

```bash
cd packages/cli
npm link
```

リンク後は `nblm-putter --help` でどこからでも実行できる。

リンクせずに使う場合は、以下のコマンドをそのまま `node packages/cli/dist/index.js` に読み替えてください。

---

## ステップ 1: 初期設定

```bash
nblm-putter config init
```

対話形式で以下を設定する。

| 設定項目 | 説明 |
|---|---|
| AWS リージョン | Secrets Manager を使う場合のリージョン（デフォルト: `ap-northeast-1`） |
| AWS プロファイル | `~/.aws/credentials` のプロファイル名（デフォルト: `default`） |
| Secrets Manager 使用 | `y` で有効化。複数マシンでの設定共有に必要 |

設定ファイルは `~/.nblm-putter/config.json` に保存される。

> **Secrets Manager を使わない場合**  
> `n` を選ぶとローカルモードで動作する。ツール起動時に警告が表示されるが、すべての機能は正常に使える（マシン間の設定共有のみ無効）。

---

## ステップ 2: Google 認証

```bash
nblm-putter auth
```

ブラウザが開くので、NotebookLM にアクセスしている Google アカウントでログインする。ログイン完了後、セッションが自動保存される。

- セッションは `~/.nblm-putter/session.json`（またはSecrets Manager）に保存される
- セッションが切れたら再度 `nblm-putter auth` を実行する

---

## ステップ 3: ノートブック ID を確認

```bash
nblm-putter notebooks list
```

NotebookLM に作成済みのノートブック一覧と ID が表示される。

```
1: My Research Notes  (id: abc123)
2: Project Docs       (id: def456)
```

`sync` コマンドには、この ID が必要。

---

## ステップ 4: ファイルを同期

```bash
nblm-putter sync /path/to/folder --notebook <ノートブックID>
```

指定したフォルダ以下のファイルを再帰的に走査し、1 件ずつ NotebookLM へ登録する。ターミナルにプログレスバーが表示される。

```bash
# 例
nblm-putter sync ~/Documents/research --notebook abc123
```

完了後、登録件数とエラーがあればその一覧が表示される。

---

## ignore パターンの設定

登録対象から除外するファイルを glob パターンで指定できる。

```bash
# パターンを追加
nblm-putter ignore add "*.log"
nblm-putter ignore add "node_modules/"
nblm-putter ignore add ".git/"
nblm-putter ignore add "*.tmp"

# 現在のパターン一覧を確認
nblm-putter ignore list

# パターンを削除
nblm-putter ignore remove "*.tmp"
```

パターンは [minimatch](https://github.com/isaacs/minimatch) 形式（gitignore 互換）。設定は次回の `sync` 実行時から反映される。

---

## Web UI を使う

```bash
nblm-putter ui
```

ブラウザで `http://localhost:3000` が開く。

| ページ | 機能 |
|---|---|
| **Sync** | ノートブックを選んでフォルダを指定、リアルタイム進捗で同期実行 |
| **History** | 過去のジョブ一覧（日時・登録件数・エラー数） |
| **Ignore** | 除外パターンの追加・削除 |
| **Session** | `session.json` をアップロードしてセッションを更新 |

ポートを変更したい場合:

```bash
nblm-putter ui --port 8080
```

---

## セッションの更新（別マシンや Web UI から）

別のマシンで `nblm-putter auth` を実行してセッションを取得し、生成された `~/.nblm-putter/session.json` を Web UI の **Session** ページからアップロードすることで、セッションを更新できる。

Secrets Manager が有効な場合は、`nblm-putter auth` を実行したマシンで自動的にクラウドへ同期される。

---

## Secrets Manager を使った複数マシン対応（オプション）

AWS Secrets Manager を有効にすると、以下がマシン間で自動同期される。

- NotebookLM のセッション (`nblm-putter/session`)
- ignore パターン (`nblm-putter/settings`)

### 必要な IAM 権限

```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:PutSecretValue",
    "secretsmanager:CreateSecret"
  ],
  "Resource": [
    "arn:aws:secretsmanager:*:*:secret:nblm-putter/*"
  ]
}
```

---

## データの保存場所

| データ | 保存先 |
|---|---|
| 設定ファイル | `~/.nblm-putter/config.json` |
| セッション（ローカル） | `~/.nblm-putter/session.json` |
| ジョブ履歴 | `~/.nblm-putter/db.sqlite` |
| ignore パターン（ローカル） | `~/.nblm-putter/db.sqlite`（settings テーブル） |
| セッション（クラウド） | AWS Secrets Manager: `nblm-putter/session` |
| ignore パターン（クラウド） | AWS Secrets Manager: `nblm-putter/settings` |

Windows の場合は `~` が `%USERPROFILE%` になる。

---

## コマンドリファレンス

```
nblm-putter config init              初回セットアップ
nblm-putter auth                     Google 認証・セッション保存
nblm-putter notebooks list           ノートブック一覧を表示
nblm-putter sync <folder>            フォルダをノートブックへ同期
  --notebook <id>                      登録先ノートブック ID（必須）
nblm-putter ignore list              除外パターン一覧
nblm-putter ignore add <pattern>     除外パターンを追加
nblm-putter ignore remove <pattern>  除外パターンを削除
nblm-putter ui                       Web UI を起動
  --port <port>                        ポート番号（デフォルト: 3000）
```

---

## 開発

```bash
# 依存パッケージのインストール
pnpm install

# Playwright の Chromium をインストール（初回のみ）
node node_modules/playwright/cli.js install chromium

# ビルド（UI → CLI の順でビルド）
pnpm build

# テスト実行
pnpm test

# UI 開発サーバー（Vite、ホットリロード対応）
pnpm dev:ui
```
