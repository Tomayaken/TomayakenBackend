# 実行環境

アプリケーションコードは共通とし、実行環境ごとのエントリポイントだけを切り替える（[architecture.md](./architecture.md#4-基本方針)）。

## 環境比較

| | Development | Production |
| --- | --- | --- |
| 管理画面 | Vite dev server | S3 + CloudFront |
| 利用者アプリ | 実機 / エミュレーターからローカルAPIへ接続 | 本番APIへ接続 |
| API実行環境 | Hono Node.js Server (:3000) | API Gateway → Lambda |
| DB | PostgreSQL on Docker (:5432) | Amazon RDS for PostgreSQL |
| デプロイ | — | AWS CDK |

## ローカル開発

ローカルではAWSサービスを使用しない。

```text
Browser (管理画面) ──→ Vite ──┐
                              ├──→ Hono :3000 ──→ Docker PostgreSQL :5432
Flutterアプリ (実機) ─────────┘
```

- API Gateway / Lambda / RDS / CloudFront / S3 はローカル再現しない。エミュレーターも使用しない。
- PostgreSQLは `compose.yaml` で起動する。
- 初期データは `src/db/seed.ts` で投入する（避難所・Beacon・物資・activeな災害）。
- 実機のFlutterアプリから接続する場合は、同一LAN上の開発PCのIPを指定する。

## テスト

- Vitest を使用する。
- Serviceのテストは Docker の PostgreSQL に実接続して行う（DBはモックしない）。
- Routeは Hono の `app.request()` で主要な正常系・異常系を確認する。

## 本番環境

```text
                    Internet
                        |
             +----------+----------+
             |                     |
             v                     v
        CloudFront             API Gateway
             |                     |
             v                     v
       S3 (管理画面)             Lambda (VPC内)
                                   |
                                   v
                                  RDS
```

| 対象 | デプロイの流れ |
| --- | --- |
| 管理画面 | React + Vite → `npm run build` → S3 → CloudFront |
| Backend | Hono → Lambda（`src/lambda.ts`）→ API Gateway |
| Database | RDS PostgreSQL（マイグレーション・seedはVPC内の専用Lambdaから実行） |
| IaC | AWS CDK（`infra/`）。詳細は [IaC（AWS CDK）](#iacaws-cdk) |

## IaC（AWS CDK）

### 採用理由

- **使わない間は環境を削除して料金を抑えられる**。常時課金されるのは実質RDSのみのため、`cdk destroy` で削除し、デモ前に `cdk deploy` で再作成する運用ができる。
- VPC / Security Group / Lambdaの VPC 配置など、手作業で間違えやすいネットワーク設定をコードで固定できる。
- バックエンドと同じTypeScriptで、同じリポジトリに置ける。`NodejsFunction` によりLambdaのビルドとアップロードも `cdk deploy` に含められる。

### 対象範囲

1スタック・最小構成とする。

| リソース | 構成 |
| --- | --- |
| VPC | Private Isolated サブネットのみ（NAT Gatewayなし） |
| RDS | PostgreSQL / `db.t4g.micro` / Single-AZ |
| Security Group | Lambda → RDS の TCP/5432 のみ許可 |
| Lambda（API） | `NodejsFunction`（`src/lambda.ts`）、VPC内に配置 |
| Lambda（DB操作） | `NodejsFunction`（`src/migrate.ts`）。マイグレーションとseedを実行する。API Gatewayには公開しない |
| API Gateway | HTTP API |
| S3 + CloudFront | 管理画面の配信 |

Secrets Manager / RDS Proxy / Cognito は対象外とし、[発展構想](./architecture.md#10-発展構想) で扱う。

### 運用

```text
デモ前:  cdk deploy → aws lambda invoke（DB操作Lambda: migrate + seed）
デモ後:  cdk destroy（RDSのデータは破棄してよい前提）
```

- 初回のみ `cdk bootstrap` が必要。
- RDSは外部公開せず、NAT Gatewayもないため、開発PCから drizzle-kit で直接マイグレーションはできない。DB操作Lambdaは drizzle の `migrate()` で `src/db/migrations/` を適用する。
- NAT Gatewayがないため、Lambdaからインターネット（外部API）へは出られない。外部連携が必要になったら VPC Endpoint か NAT を追加する。
- RDSを含むため、初回のデプロイは10〜20分程度かかる。

## DB接続

- デモ規模のため、Lambdaからは接続プールサイズ1で直接接続する。
- 同時実行数が増えて接続数が問題になる場合、余裕があれば RDS Proxy を導入する。

## RDSネットワーク

RDSはインターネットへ直接公開しない。

```text
Lambda
   |
Security Group
   |
   | TCP/5432
   v
RDS
```

- RDSのSecurity Groupでは、LambdaからのPostgreSQL接続のみ許可する。
- 開発者PCからRDSへ直接接続することは基本的に想定しない。

## 環境変数

環境ごとの差異は環境変数で管理する。アプリケーションコードに環境判定による分岐を大量に作らない。

| 変数 | 説明 | 開発 | 本番 |
| --- | --- | --- | --- |
| `DATABASE_URL` | DB接続文字列 | DockerのPostgreSQL | RDS接続文字列 |
| `NODE_ENV` | 実行モード | `development` | `production` |
| `CORS_ORIGIN` | 許可する管理画面のOrigin | Viteの開発サーバー | CloudFrontのドメイン |
| `ADMIN_TOKEN` | 管理者APIのBearerトークン | 任意の固定値 | ランダムな長い値 |
| `PORT` | ローカルサーバーのポート | `3000` | （不要） |

- デモでは本番の秘密情報もLambdaの環境変数で渡す。発展として Secrets Manager に移す。
- Flutterアプリはブラウザではないため、CORSの対象外。
