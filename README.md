# TomayakenBackend

避難所DX のバックエンド。設計書は [docs/](./docs/README.md) を参照。

## 必要なもの

| ツール | 用途 |
| --- | --- |
| [mise](https://mise.jdx.dev/) | Node.js のバージョン管理。`mise.toml` で Node.js 24 に固定している（本番の Lambda と同じ） |
| Docker（Docker Compose v2） | ローカルの PostgreSQL |

mise を使わない場合は、Node.js 24 を別の方法で入れてもよい。

## セットアップ

### 1. Node.js

```sh
mise trust     # 初回のみ。このリポジトリの mise.toml を信頼する
mise install   # mise.toml の Node.js 24 を入れる
node -v        # v24.x になっていることを確認
```

シェルで mise を有効にしていれば（`mise activate`）、このディレクトリに入ると自動で Node.js 24 に切り替わる。

### 2. 依存関係と環境変数

```sh
npm install
cp .env.example .env
```

`.env` の値はローカル用で、そのまま使える。

| 変数 | 内容 |
| --- | --- |
| `DATABASE_URL` | ローカルの PostgreSQL への接続文字列 |
| `PORT` | APIサーバーのポート（既定 3000） |
| `ADMIN_TOKEN` | 管理者APIの Bearer トークン |
| `CORS_ORIGIN` | 許可する管理画面の Origin（カンマ区切り）。未設定なら全 Origin を許可 |

### 3. データベース（Docker）

```sh
npm run db:up        # PostgreSQL 17 を起動（healthy になるまで待つ）
npm run db:migrate   # マイグレーションを適用
npm run db:seed      # 初期データを投入
```

- コンテナ名は `tomayakenbackend-db-1`、データは Docker ボリューム `tomayakenbackend_db-data` に保存される。
- 停止は `npm run db:down`（データは残る）。データごと消すときは `docker compose down -v`。
- DBの中身をやり直したいときは `npm run db:reset`（テーブルを消して、マイグレーションと seed を流し直す）。
- ポート 5432 をほかの PostgreSQL が使っていると起動に失敗する。先にそちらを止める。
- psql で中を見る: `docker compose exec db psql -U tomayaken -d tomayaken`

### 4. APIサーバー

```sh
npm run dev   # http://localhost:3000 で起動し、ファイルの変更で再起動する
```

APIドキュメント（Swagger UI）は http://localhost:3000/api/v1/docs で見られる。

## 開発の流れ

### コードを変えたら

```sh
npm run check:fix   # format・lint の自動修正・import の並べ替え（Biome）
npm run typecheck   # 型チェック
npm test            # テスト（Vitest）
```

CI でも同じ検査を行う（[CI](#ci)）。エディタに Biome の拡張機能を入れると、保存時に整形できる。

### DBのスキーマを変えたら

```sh
# src/db/schema.ts を編集してから
npm run db:generate   # src/db/migrations/ にマイグレーションを生成
npm run db:migrate    # ローカルDBに適用
```

生成されたマイグレーション（`src/db/migrations/` 以下の SQL と `meta/`）はすべてコミットする。マージ済みのマイグレーションは編集・再生成しない。

### APIのルートやスキーマを変えたら

```sh
npm run openapi   # docs/openapi.json を更新
```

`docs/openapi.json` はクライアント（管理画面・Flutterアプリ）がコード生成に使うので、更新してコミットする。

### worktree で並行作業する

```sh
git worktree add .claude/worktrees/<名前> -b <ブランチ名>
cd .claude/worktrees/<名前>
npm install
cp ../../../.env .env
```

- worktree ごとに `node_modules` と `.env` が必要。
- Docker Compose のプロジェクト名を `tomayakenbackend` に固定しているので、どの worktree から `npm run db:up` しても同じ DB コンテナを使う。スキーマの異なるブランチを行き来するときは `npm run db:reset` で揃える。
- `.claude/worktrees/` は `.gitignore` 済み。

## scripts

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | APIサーバーを起動（ファイルの変更で再起動） |
| `npm run start` | APIサーバーを起動 |
| `npm run check` | Biome で format・lint・import 順を検査（書き換えない） |
| `npm run check:fix` | 上記を自動修正 |
| `npm run lint` | lint のみ |
| `npm run format` | format のみ（書き換える） |
| `npm run typecheck` | 型チェック |
| `npm test` | テスト（Vitest） |
| `npm run openapi` | OpenAPI を `docs/openapi.json` に書き出す |
| `npm run db:up` / `db:down` | ローカルの PostgreSQL を起動 / 停止 |
| `npm run db:generate` | `src/db/schema.ts` の変更からマイグレーションを生成 |
| `npm run db:migrate` | マイグレーションを適用 |
| `npm run db:seed` | 初期データを投入（何度実行しても同じ状態になる） |
| `npm run db:reset` | ローカルDBを空にして、マイグレーションと seed を流し直す |
| `npm run db:studio` | Drizzle Studio でDBを確認 |

## lint / format

[Biome](https://biomejs.dev/) で lint・format・import の並べ替えをまとめて行う。設定は `biome.json`。

- インデントは半角スペース2つ、1行80文字、ダブルクォート、末尾カンマあり。
- lint のルールは Biome の推奨セット。
- 生成物（`src/db/migrations/`、`docs/openapi.json`）と Markdown は対象外。

## CI

GitHub Actions（`.github/workflows/ci.yml`）で、PR と main への push ごとに次を確認する。

| ジョブ | 内容 |
| --- | --- |
| Lint / Typecheck / Test | `biome ci`、型チェック、テスト、`docs/openapi.json` が最新か、スキーマの変更にマイグレーションが揃っているか |
| Migrate / Seed | PostgreSQL 17 のサービスコンテナに対して、マイグレーションを適用し、seed を2回流す |

## 初期データ（seed）

IDは固定値なので、DBを作り直しても変わらない。

| 避難所 | ID | 収容人数 | Beacon (major, minor) |
| --- | --- | --- | --- |
| 第一小学校 | `01a19fe0-339a-77ad-8adf-2fd52c8110fa` | 500 | (1, 1), (1, 2) |
| 中央公民館 | `01a19fe0-339d-7651-b398-8ae97d2d07cb` | 120 | (2, 1) |
| 市民体育館 | `01a19fe0-339d-7651-b398-8d2c5c80f87c` | 800 | (3, 1) |

- 物資: 水 / 毛布 / 非常食 / 簡易トイレ
- 災害: 「デモ用災害」を active で1件作成する（active な災害がない場合のみ）
