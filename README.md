# TomayakenBackend

避難所DX のバックエンド。設計書は [docs/](./docs/README.md) を参照。

## 起動のしかた

ローカルでの起動のしかたは2通りある。目的に合わせてどちらかを選ぶ。

| | [Docker だけで起動する](#docker-だけで起動する) | [ホストで開発する](#ホストで開発する) |
| --- | --- | --- |
| 向いている場面 | API を動かして試すだけ（管理画面やアプリを開発するときなど） | バックエンドのコードを変える。テストや lint を流す |
| 必要なもの | Docker（Docker Compose v2） | Docker（Docker Compose v2）と Node.js 24 |
| Docker で動かすもの | DB・マイグレーション・APIサーバーのすべて | DB だけ |
| APIサーバーの起動 | `docker compose up --build` | `npm run dev`（ホストで動かす） |
| マイグレーションと seed | 起動時に自動で流れる | `npm run db:migrate` と `npm run db:seed` を自分で流す |

どちらの方法でも、同じ DB コンテナとボリュームを使う。そのため、方法を切り替えても DB のデータは残る。

ただし、2つの方法を同時には使えない。どちらも APIサーバーをポート 3000 で起動するためである。切り替えるときは、次のように片方を止めてから起動する。

- 「Docker だけ」から「ホスト」へ: `docker compose down` で全コンテナを止めてから、`npm run db:up` で DB だけを起動する。
- 「ホスト」から「Docker だけ」へ: ホストの `npm run dev` を止めてから、`docker compose up --build` を実行する。

## Docker だけで起動する

Node.js を入れなくても、Docker だけで DB・マイグレーション・APIサーバーをまとめて起動できる。

```sh
cp .env.example .env
docker compose up --build
```

次の 3 つのサービスが順に立ち上がる。

| サービス | 内容 |
| --- | --- |
| `db` | PostgreSQL 17（:5432） |
| `migrate` | マイグレーションと seed を流して終了する |
| `api` | APIサーバー（<http://localhost:3000）。`migrate`> が成功してから起動する |

- `api` は `src/` をマウントしているので、ホストでファイルを変えると再起動する。
- `api` は `.env` から `ADMIN_TOKEN` や `CORS_ORIGIN` を読む。`.env` がなくても起動はするが、管理者APIは使えない。`DATABASE_URL` と `PORT` はコンテナ用の値で上書きされる。
- `package.json` を変えたら、`docker compose up --build` でイメージを作り直す。
- バックグラウンドで起動するなら `docker compose up -d --build --wait`。停止は `docker compose down`（データは残る）。
- DB のデータごと消して作り直すときは、`docker compose down -v` のあとに `docker compose up --build` を実行する。

APIドキュメント（Swagger UI）は <http://localhost:3000/api/v1/docs> で見られる。

テストや lint は Docker では流せない。コードを変えるときは、[ホストで開発する](#ホストで開発する)の手順で準備する。

## ホストで開発する

DB だけを Docker で動かし、APIサーバー・テスト・lint はホストの Node.js で動かす。

### 1. Node.js

`mise.toml` で Node.js 24 に固定している（本番の Lambda と同じバージョン）。[mise](https://mise.jdx.dev/) で入れる。

```sh
mise trust     # 初回のみ。このリポジトリの mise.toml を信頼する
mise install   # mise.toml の Node.js 24 を入れる
node -v        # v24.x になっていることを確認
```

シェルで mise を有効にしていれば（`mise activate`）、このディレクトリに入ると自動で Node.js 24 に切り替わる。mise を使わない場合は、Node.js 24 を別の方法で入れてもよい。

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

### 3. データベース

DB だけを Docker で起動し、ホストからマイグレーションと seed を流す。

```sh
npm run db:up        # PostgreSQL 17 のコンテナだけを起動（healthy になるまで待つ）
npm run db:migrate   # マイグレーションを適用
npm run db:seed      # 初期データを投入
```

- コンテナ名は `tomayakenbackend-db-1`、データは Docker ボリューム `tomayakenbackend_db-data` に保存される。
- 停止は `npm run db:down`（データは残る）。中身は `docker compose down` なので、Docker だけで起動したコンテナも止まる。データごと消すときは `docker compose down -v`。
- DBの中身をやり直したいときは `npm run db:reset`（テーブルを消して、マイグレーションと seed を流し直す）。
- ポート 5432 をほかの PostgreSQL が使っていると起動に失敗する。先にそちらを止める。
- psql で中を見る: `docker compose exec db psql -U tomayaken -d tomayaken`

### 4. APIサーバー

```sh
npm run dev   # http://localhost:3000 で起動し、ファイルの変更で再起動する
```

APIドキュメント（Swagger UI）は <http://localhost:3000/api/v1/docs> で見られる。

## 開発の流れ

### コードを変えたら

```sh
npm run check:fix   # format・lint の自動修正・import の並べ替え（Biome）
npm run typecheck   # 型チェック
npm test            # DBを使わないテスト（Vitest）
npm run test:db     # DBに実際につなぐテスト（先に npm run db:up）
```

CI でも同じ検査を行う（[CI](#ci)）。エディタに Biome の拡張機能を入れると、保存時に整形できる。

### テストの書き方

テストは2種類に分けている（`vitest.config.ts` の projects）。

| 種類 | 置き場所 | 実行 | 内容 |
| --- | --- | --- | --- |
| unit | `tests/`（`tests/db/` 以外） | `npm test` | `app.request()` でルートを確かめる。DBは使わない |
| db | `tests/db/` | `npm run test:db` | Service や Repository を、DockerのPostgreSQLに実際につないで確かめる（DBはモックしない） |

db のテストは次のように動く。

- 開発用DB（`tomayaken`）とは別のテスト用DB（`tomayaken_test`）を使う。接続先は `TEST_DATABASE_URL` で変えられる。DB名が `_test` で終わらなければ実行しない。
- 最初に1回、テスト用DBがなければ作り、スキーマを空にしてマイグレーションを流す。
- テストの間は、`DATABASE_URL` がテスト用DBを指す。
- テストごとに全テーブルを空にする。初期データが必要なテストは、テストの中で `seed(db)`（`src/db/seed.ts`）を呼ぶ。
- 1つのDBを共有するので、テストファイルは並列に流さない。
- DBへの接続は `tests/db/helpers.ts` の `testDb()` を使う。制約違反は `pgErrorCode()` で PostgreSQL のエラーコードを確かめられる。

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
| `npm test` | DBを使わないテスト（Vitest） |
| `npm run test:db` | DBに実際につなぐテスト（テスト用DB `tomayaken_test` を使う） |
| `npm run test:all` | 両方のテスト |
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
| Lint / Typecheck / Test | `biome ci`、型チェック、DBを使わないテスト、`docs/openapi.json` が最新か、スキーマの変更にマイグレーションが揃っているか |
| Migrate / Seed / DB Test | PostgreSQL 17 のサービスコンテナに対して、マイグレーションを適用し、seed を2回流す。そのあとDBに実際につなぐテストを流す |
| CDK Typecheck / Synth | `infra/` の型チェックと `cdk synth`（テンプレートの生成と Lambda のバンドル）。AWS には接続しない |

## 本番環境（AWS）

デモ用の本番環境は AWS CDK（`infra/`）で作る。DB は Aurora Serverless v2 で、使わない間は自動で休むので、環境は消さずに置いておける。手順は [docs/infrastructure.md](docs/infrastructure.md#デプロイと削除の手順) を参照。

## 初期データ（seed）

IDは固定値なので、DBを作り直しても変わらない。

| 避難所 | ID | 収容人数 | 緯度, 経度 |
| --- | --- | --- | --- |
| 第一小学校 | `01a19fe0-339a-77ad-8adf-2fd52c8110fa` | 500 | 35.6812, 139.7671 |
| 中央公民館 | `01a19fe0-339d-7651-b398-8ae97d2d07cb` | 120 | 35.6852, 139.7528 |
| 市民体育館 | `01a19fe0-339d-7651-b398-8d2c5c80f87c` | 800 | 35.6905, 139.7004 |

- 物資: 水 / 毛布 / 非常食 / 簡易トイレ
- 災害: 「デモ用災害」を active で1件作成する（active な災害がない場合のみ）。初回は固定ID `01a19fe0-339d-7651-b398-a1815a9a5e03`、その災害が終了済みなら新しいIDで作る
