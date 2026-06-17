# nblm-putter

ローカルフォルダのファイルを [NotebookLM](https://notebooklm.google.com) へ再帰的に自動登録する CLI ツール。ローカル Web UI も付属。

---

## 動作環境

- Node.js 20 以上
- pnpm 8 以上
- macOS（推奨）/ Linux / Windows (PowerShell)
- Google Chrome がインストール済みであること（`auth` コマンドで使用）
- （オプション）AWS アカウント — Secrets Manager を使うと複数マシンで設定を共有できる

---

## インストール

### リポジトリをクローンしてビルド

```bash
git clone https://github.com/shinchit/nblm-putter.git
cd nblm-putter
pnpm install
pnpm build
```

### Playwright の Chromium をインストール（初回のみ）

`sync` コマンドはヘッドレス Chromium でファイルをアップロードするため、Playwright のブラウザが必要。

```bash
node node_modules/playwright/cli.js install chromium
```

### グローバルにリンク（`nblm-putter` コマンドとして使えるようにする）

```bash
cd packages/cli
pnpm link --global
```

リンク後は `nblm-putter --help` でどこからでも実行できる。

> **Windows の場合**  
> `pnpm link --global` 後にコマンドが見つからない場合は、pnpm のグローバル bin ディレクトリが PATH に入っていない。  
> 以下で確認・追加する:
> ```powershell
> pnpm bin --global        # グローバル bin のパスを確認
> # 表示されたパスを「システムの環境変数 → Path」に追加する
> ```
> 追加後にターミナルを再起動すると `nblm-putter` が使えるようになる。

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

システムの Google Chrome でブラウザが開くので、NotebookLM にアクセスしている Google アカウントでログインする。ログイン完了後、セッションが自動保存される。

- セッションは `~/.nblm-putter/session.json`（または Secrets Manager）に保存される
- セッションが切れたら再度 `nblm-putter auth` を実行する
- sync 実行時にセッションが自動更新され、有効期限が延長される

> **注意**: Google Chrome がインストールされていないと Google のボット検出に引っかかりログインできない。

---

## ステップ 3: ファイルを同期（CLI）

```bash
nblm-putter notebooks list
```

NotebookLM に作成済みのノートブック一覧と ID が表示される。

```
1: My Research Notes  (id: abc123)
2: Project Docs       (id: def456)
```

```bash
nblm-putter sync /path/to/folder --notebook <ノートブックID>
```

指定したフォルダ以下のファイルを再帰的に走査し、1 件ずつ NotebookLM へ登録する。ターミナルにプログレスバーと処理中ファイル名が表示される。

```bash
# 例
nblm-putter sync ~/Documents/research --notebook abc123
```

### sync の注意事項

- **1 ファイルずつ順番に**処理する。NotebookLM はファイル処理中にボタンを無効化するため、並列アップロードは機能しない。
- ファイルが多い場合は時間がかかる（1 ファイルあたり数十秒〜数分）。
- **同じノートブックへ sync を途中で止めた場合**、NotebookLM のサーバー内部に処理キューが残り、その後の sync でボタンが長時間無効になることがある。その場合は新しいノートブックを作り直すのが確実。

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
| **Sync** | ノートブックを選んでフォルダを指定し、リアルタイム進捗で同期実行 |
| **History** | 過去のジョブ一覧（日時・登録件数・エラー数） |
| **Ignore** | 除外パターンの追加・削除 |
| **Session** | `session.json` をアップロードしてセッションを更新 |

**Sync ページの機能:**
- ページを開くと既存ノートブックが自動ロードされ、先頭のノートブックが選択された状態になる
- **+ 新規作成** ボタンでノートブックを新規作成し、自動的に選択状態にする
- **Browse...** ボタンでフォルダをダイアログから選択できる（パスの手入力も可）
- 実行中はファイルごとの結果（✓ / ✗）と処理フェーズ（ボタン待ち / アップロード中）をリアルタイムで表示
- **中止** ボタンで実行中の sync を停止できる（現在処理中のファイルが完了した後に停止）
- 各ファイルの所要時間（ボタン待ち時間・アップロード時間）もログに記録される

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

---

## コマンドリファレンス

```
nblm-putter config init              初回セットアップ
nblm-putter auth                     Google 認証・セッション保存（Chrome が必要）
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

# UI 開発サーバー（Vite、ホットリロード対応）
pnpm dev:ui
```
