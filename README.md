# TomayakenBackend

避難所DX のバックエンド。設計書は [docs/](./docs/README.md) を参照。

## 必要なもの

- Node.js 24（`mise.toml` で固定。本番の Lambda と同じバージョン）
- Docker（ローカルの PostgreSQL 用）

## セットアップ

```sh
npm install
cp .env.example .env
npm run db:up        # PostgreSQL を起動
npm run db:migrate   # マイグレーションを適用
npm run db:seed      # 初期データを投入
npm run dev          # http://localhost:3000 でAPIサーバーを起動（変更を監視）
```

APIドキュメントは http://localhost:3000/api/v1/docs で見られる。

## scripts

| コマンド | 内容 |
| --- | --- |
| `npm run db:up` / `db:down` | ローカルの PostgreSQL を起動 / 停止 |
| `npm run db:generate` | `src/db/schema.ts` の変更からマイグレーションを生成 |
| `npm run db:migrate` | マイグレーションを適用 |
| `npm run db:seed` | 初期データを投入（何度実行しても同じ状態になる） |
| `npm run db:reset` | ローカルDBを空にして、マイグレーションと seed を流し直す |
| `npm run db:studio` | Drizzle Studio でDBを確認 |
| `npm run dev` | APIサーバーを起動（ファイルの変更で再起動） |
| `npm run start` | APIサーバーを起動 |
| `npm run openapi` | OpenAPI を `docs/openapi.json` に書き出す（ルートやスキーマを変えたら実行してコミットする） |
| `npm test` | テスト（Vitest） |
| `npm run typecheck` | 型チェック |

## 初期データ（seed）

IDは固定値なので、DBを作り直しても変わらない。

| 避難所 | ID | 収容人数 | Beacon (major, minor) |
| --- | --- | --- | --- |
| 第一小学校 | `01a19fe0-339a-77ad-8adf-2fd52c8110fa` | 500 | (1, 1), (1, 2) |
| 中央公民館 | `01a19fe0-339d-7651-b398-8ae97d2d07cb` | 120 | (2, 1) |
| 市民体育館 | `01a19fe0-339d-7651-b398-8d2c5c80f87c` | 800 | (3, 1) |

- 物資: 水 / 毛布 / 非常食 / 簡易トイレ
- 災害: 「デモ用災害」を active で1件作成する（active な災害がない場合のみ）。初回は固定ID `01a19fe0-339d-7651-b398-a1815a9a5e03`、その災害が終了済みなら新しいIDで作る
