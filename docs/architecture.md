# 全体設計

## 1. 目的

避難所DXのバックエンドとして、以下の機能を提供する。

- 避難所情報の管理
- 災害（開設期間）の管理
- 利用者・世帯の登録
- 利用者のチェックイン・チェックアウト（世帯単位での代理を含む）
- BLE Beaconによる避難所の検出
- 避難所ごとの現在人数の管理
- 物資の在庫管理と、入庫・配布履歴の管理
- 運営者向け管理画面へのAPI提供

開発時はローカル環境で完結させ、本番・デモ環境のみAWS上で動作させる。

現段階は、1つの自治体で運用することを前提とする。activeな災害はシステム全体で1件までとし、複数の地域で同時に起きた災害を別々に扱うことは[発展構想](#10-発展構想)とする。

## 2. システム構成

```text
 利用者アプリ (Flutter)          管理画面 (React + Vite)
   - BLE Beacon検出                - 避難者一覧・人数
   - チェックイン                  - 物資の入庫・配布
   - 世帯メンバー登録              - 災害の開始・終了
          |                               |
          | X-User-Id                     | Authorization: Bearer
          v                               v
        +-------------------------------------+
        |     Backend API (Hono) /api/v1      |
        +-------------------------------------+
                         |
                         v
                     PostgreSQL
```

| クライアント | 利用者 | 主な役割 |
| --- | --- | --- |
| 利用者アプリ（Flutter） | 避難者 | Beacon検出、避難所の確認、チェックイン/アウト、世帯メンバー管理 |
| 管理画面（React） | 避難所運営者 | 避難者の把握、物資管理、災害の開始・終了、代理チェックイン |

## 3. 技術スタック

| 区分 | 採用技術 |
| --- | --- |
| 言語・ランタイム | TypeScript / Node.js 24（開発・本番とも。`mise.toml` で固定） |
| パッケージ管理 | npm |
| Webフレームワーク | Hono |
| バリデーション / API仕様 | Zod / `@hono/zod-openapi` |
| DB | PostgreSQL |
| ORM・マイグレーション | Drizzle ORM / drizzle-kit |
| テスト | Vitest |
| 本番実行環境 | API Gateway / Lambda / RDS for PostgreSQL |
| IaC | AWS CDK（TypeScript） |
| 開発実行環境 | Hono Node.js Server / PostgreSQL on Docker |

## 4. 基本方針

バックエンド自体をLambda専用の実装にはしない。アプリケーション本体は通常のHonoアプリケーションとして実装し、実行環境ごとのエントリポイント（`server.ts` / `lambda.ts`）だけを切り替える。

```text
                    Hono Application (app.ts)
                          |
              +-----------+-----------+
              |                       |
      Local Server (server.ts)   Lambda (lambda.ts)
              |                       |
              +-----------+-----------+
                          |
                     PostgreSQL
```

これにより、ローカル開発ではAWSを必要とせず、本番のみLambdaへデプロイできる。

## 5. ディレクトリ構成

```text
TomayakenBackend/
├ src/
│  ├ app.ts                 # Honoアプリ本体（ルート登録・middleware）
│  ├ server.ts              # ローカル用エントリ（@hono/node-server）
│  ├ lambda.ts              # Lambda用エントリ（hono/aws-lambda）
│  ├ migrate.ts             # 本番のマイグレーション・seed用Lambdaエントリ
│  │
│  ├ routes/
│  │  ├ shelters.ts
│  │  ├ beacons.ts
│  │  ├ disasters.ts
│  │  ├ users.ts
│  │  ├ me.ts
│  │  ├ checkins.ts
│  │  ├ supplies.ts
│  │  └ admin/
│  │     ├ checkins.ts
│  │     ├ supplies.ts
│  │     └ disasters.ts
│  │
│  ├ services/
│  │  ├ shelter-service.ts
│  │  ├ user-service.ts
│  │  ├ checkin-service.ts
│  │  ├ supply-service.ts
│  │  └ disaster-service.ts
│  │
│  ├ repositories/
│  │  ├ shelter-repository.ts
│  │  ├ user-repository.ts
│  │  ├ checkin-repository.ts
│  │  ├ supply-repository.ts
│  │  └ disaster-repository.ts
│  │
│  ├ db/
│  │  ├ client.ts
│  │  ├ schema.ts
│  │  ├ seed.ts
│  │  ├ reset.ts            # ローカルDBの初期化（開発用）
│  │  └ migrations/
│  │
│  ├ middleware/
│  │  ├ user-auth.ts        # X-User-Id の検証
│  │  ├ admin-auth.ts       # 管理者Bearerトークンの検証
│  │  └ error-handler.ts
│  │
│  ├ schemas/               # Zodスキーマ（OpenAPIの元）
│  │
│  └ errors/
│     └ app-error.ts
│
├ infra/                    # AWS CDK
├ compose.yaml              # ローカルPostgreSQL
├ drizzle.config.ts
├ package.json
└ tsconfig.json
```

## 6. レイヤー構成

過度にレイヤーを増やさず、以下を基本構造とする。

```text
Route → Service → Repository → PostgreSQL
```

### Route

HTTPに関する処理のみを担当する。URL、HTTPメソッド、リクエストの検証（Zod）、ステータスコード、認証middlewareの適用。チェックイン処理そのものは行わず、Serviceを呼び出す。

### Service

アプリケーションのルールを担当する。HTTPやSQLには極力依存しない。トランザクションの境界はServiceで決める。

例: チェックイン

```text
対象ユーザーが全員リクエスト者と同じ世帯か
↓
避難所が存在するか
↓
activeな災害があるか
↓
対象ユーザーが他の避難所に滞在中でないか
↓
チェックインを登録（1トランザクション）
```

### Repository

PostgreSQLとの通信を担当する。Drizzleのクエリはここへ閉じ込める。DBのsnake_caseとAPIのcamelCaseの変換もここで行う。

## 7. 認証方針

| 区分 | 方式 | 対象 |
| --- | --- | --- |
| 公開 | なし | 避難所情報、Beacon→避難所、active災害、在庫一覧 |
| 利用者 | `X-User-Id` ヘッダー | 自分・世帯に関する操作、チェックイン/アウト |
| 管理者 | `Authorization: Bearer <ADMIN_TOKEN>` | `/api/v1/admin/*` |

- 利用者IDはアプリが生成するUUIDで、現段階は**自己申告**であり、なりすましは防げない。
- 認証は middleware に閉じ込め、Service は「誰がリクエストしたか」だけを受け取る。これにより、後から認証方式を差し替えてもService以下に影響しない。
- 管理者トークンは全運営者で共有する固定値。AWS上で運用できるようになったら Cognito に移行する。

## 8. 機能とドキュメントの対応

| 機能 | DB | API |
| --- | --- | --- |
| 災害 | [disasters](./database.md#disasters) | [Disaster](./api.md#disaster) |
| 避難所 | [shelters](./database.md#shelters) | [Shelter](./api.md#shelter) |
| BLE Beacon | [shelter_beacons](./database.md#shelter_beacons) | [Beacon](./api.md#beacon) |
| 利用者・世帯 | [households](./database.md#households) / [users](./database.md#users) | [User / Household](./api.md#user--household) |
| チェックイン | [checkins](./database.md#checkins) | [CheckIn](./api.md#checkin) |
| 物資 | [supplies](./database.md#supplies) / [shelter_supplies](./database.md#shelter_supplies) / [supply_transactions](./database.md#supply_transactions) | [Supply](./api.md#supply) |

## 9. 実装優先順位

| 順 | 対象 | 備考 |
| --- | --- | --- |
| 1 | DBスキーマ・seed | 避難所・Beacon・物資・災害はseedで投入 |
| 2 | Shelter | 一覧・詳細・現在人数 |
| 3 | User / Household | 登録、世帯メンバー追加 |
| 4 | Disaster | active取得、開始・終了 |
| 5 | CheckIn | 世帯まとめてチェックイン、チェックアウト、自分の状態 |
| 6 | Beacon → Shelter検索 | |
| 7 | Supply / SupplyTransaction | 在庫一覧、入庫・配布、履歴 |
| 8 | 管理画面からの代理チェックイン | 優先度低 |
| 9 | マスタ管理用のAdmin CRUD | 余裕があれば |

最小のデモでは以下まで一連で動作させる。

```text
アプリでBLE検出 → 避難所名を表示
↓
世帯でまとめてチェックイン
↓
管理画面の避難者数が増える（ポーリング）
↓
管理画面で物資を配布
↓
在庫数が減る
```

## 10. 発展構想

現段階では実装しないが、構成上は差し替え・追加できるようにしておく。

| 項目 | 内容 | 差し込み先 |
| --- | --- | --- |
| 本人確認 | マイナンバーカード（JPKI）による本人確認、Cognito等によるトークン認証 | `user-auth.ts` の差し替え |
| 世帯の検証 | 住民票の世帯情報と照合し、自己申告の世帯をサーバー側で検証 | `households` に住民票の世帯情報への参照を追加 |
| 世帯への参加 | 自分の端末を持つ家族が招待コードで既存世帯に参加 | User / Household API |
| 在場証明 | ESP32等で定期的に変化するコードをBeaconから発信し、チェックイン時にサーバーで検証して捏造を防ぐ | Beacon API・チェックインAPI |
| 運営者認証 | Cognitoで運営者を個別に認証し、`created_by` をトークンから取得 | `admin-auth.ts` の差し替え |
| 避難所ごとの開設管理 | 災害ごとにどの避難所を開設したかを管理（`shelter_openings`） | DB |
| 自治体ごとの災害 | 複数の地域で同時に起きた災害を別々に開始・終了する。`municipalities` を追加し、`shelters` と `disasters` に `municipality_id` を持たせ、activeな災害を自治体ごとに1件までにする。既存の行は既定の自治体に入れる追加のマイグレーションで移行できる。運営者の認証も自治体ごとに分ける | DB・災害API・`admin-auth.ts` |
| DB接続 | RDS Proxyで接続数を管理 | インフラ |

## 11. 設計上のポイント

このバックエンドではAWS自体をアプリケーションの中心には置かない。Hono + PostgreSQL を中心とし、Lambda / API Gateway / RDS は本番実行環境として扱う。この構成には次の利点がある。

- 普段の開発にAWS料金が発生しない
- ローカル開発が高速
- AWS環境固有の問題を減らせる
- Lambda以外への移行も比較的容易
- ハッカソン後もコードを流用しやすい
