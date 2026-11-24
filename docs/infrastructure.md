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
- 初期データは `src/db/seed.ts` で投入する（避難所・物資・activeな災害）。
- 実機のFlutterアプリから接続する場合は、同一LAN上の開発PCのIPを指定する。

## テスト

- Vitest を使用する。
- Serviceのテストは Docker の PostgreSQL に実接続して行う（DBはモックしない）。開発用DBとは別のテスト用DB（`tomayaken_test`）を使い、テストごとに全テーブルを空にする。
- Routeは Hono の `app.request()` で主要な正常系・異常系を確認する。
- 実行方法とテストの書き方は [README](../README.md#テストの書き方) を参照。

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
                         Aurora Serverless v2
```

| 対象 | デプロイの流れ |
| --- | --- |
| 管理画面 | React + Vite → `npm run build` → S3 → CloudFront |
| Backend | Hono → Lambda（`src/lambda.ts`）→ API Gateway |
| Database | Aurora Serverless v2（PostgreSQL）。マイグレーション・seedはVPC内の専用Lambdaから実行 |
| IaC | AWS CDK（`infra/`）。詳細は [IaC（AWS CDK）](#iacaws-cdk) |

## IaC（AWS CDK）

### 採用理由

- **環境を残したまま、使わない間の料金を抑えられる**。DB は Aurora Serverless v2 で、使っていない間は自動で休む（0 ACU）。休んでいる間はストレージ代だけになり、Lambda・API Gateway・CloudFront は使った分だけの課金なので、スタックを消さずに置いておける。消さないので、API と管理画面の URL も変わらない。
- VPC / Security Group / Lambdaの VPC 配置など、手作業で間違えやすいネットワーク設定をコードで固定できる。
- バックエンドと同じTypeScriptで、同じリポジトリに置ける。`NodejsFunction` によりLambdaのビルドとアップロードも `cdk deploy` に含められる。

### 対象範囲

1スタック・最小構成とする。

| リソース | 構成 |
| --- | --- |
| VPC | Private Isolated サブネットのみ（NAT Gatewayなし） |
| Aurora | Aurora Serverless v2（PostgreSQL 17）/ 0〜2 ACU / writer 1 台。10 分使われないと休む |
| Security Group | Lambda → Aurora の TCP/5432 のみ許可 |
| Lambda（API） | `NodejsFunction`（`src/lambda.ts`）、VPC内に配置 |
| Lambda（DB操作） | `NodejsFunction`（`src/migrate.ts`）。マイグレーションとseedを実行する。API Gatewayには公開しない |
| API Gateway | HTTP API |
| S3 + CloudFront | 管理画面の配信 |

Secrets Manager / RDS Proxy / Cognito は対象外とし、[発展構想](./architecture.md#10-発展構想) で扱う。

### 運用

```text
最初に1回:     cdk deploy → aws lambda invoke（DB操作Lambda: migrate + seed）
コードの変更:  cdk deploy（スキーマを変えたら DB操作Lambda も実行する）
デモの直前:    API に1回アクセスして DB を起こしておく
不要になったら: cdk destroy（DBのデータは破棄してよい前提）
```

- 初回のみ `cdk bootstrap` が必要。
- Aurora は外部公開せず、NAT Gatewayもないため、開発PCから drizzle-kit で直接マイグレーションはできない。DB操作Lambdaは drizzle の `migrate()` で `src/db/migrations/` を適用する。CDK がバンドルの隣（`db/migrations/`）に SQL をコピーする。
- NAT Gatewayがないため、Lambdaからインターネット（外部API）へは出られない。外部連携が必要になったら VPC Endpoint か NAT を追加する。
- Aurora を作るため、初回のデプロイは10〜15分程度かかる。2回目以降の `cdk deploy`（Lambda のコードの更新など）は数分で終わる。
- DB が休んでいるときの最初のリクエストは、DB が起き上がるまで15秒ほどかかる（API Gateway のタイムアウトは30秒）。管理画面の自動更新などでアクセスが続いている間は休まない。
- Aurora は自動バックアップを止められないので、保持期間を最短の1日にしている（1日分は追加料金なし）。

### デプロイと削除の手順

CDK のコードは `infra/`（スタックは `infra/lib/stack.ts`）にある。アプリ本体とは別のパッケージにしている。

**準備（初回のみ）**

1. AWS CLI を入れ、デプロイ先のアカウントの認証情報を設定する（`aws configure` や `aws sso login`）。`AWS_PROFILE` と `AWS_REGION` で、デプロイ先のアカウントとリージョンが決まる。
2. 依存を入れる。Lambda のバンドルにはアプリ本体の依存も使うので、ルートと `infra/` の両方で実行する。

   ```sh
   npm ci
   cd infra && npm ci
   ```

3. アカウントとリージョンごとに一度だけ、CDK の準備をする。

   ```sh
   npx cdk bootstrap
   ```

**デプロイ（最初の1回と、コードを変えたとき）**

`infra/` で実行する。

```sh
npx cdk deploy
```

終わると、次の値が出力される。

| 出力 | 内容 |
| --- | --- |
| `ApiUrl` | API のベース URL（`https://…/api/v1`）。利用者アプリと管理画面の接続先 |
| `MigrateFunctionName` | マイグレーションと seed を流す Lambda |
| `AdminTokenSecretArn` | `ADMIN_TOKEN` を入れた Secret |
| `AdminWebUrl` | 管理画面の URL（CloudFront） |
| `AdminWebBucketName` / `AdminWebDistributionId` | 管理画面のビルド結果を置く S3 バケットと、CloudFront の ID |

続けて、マイグレーションと seed を流す。seed は何度流しても同じ状態になる。seed を飛ばすときは `--payload '{"seed": false}'` にする。

```sh
aws lambda invoke --function-name <MigrateFunctionName> \
  --cli-binary-format raw-in-base64-out --payload '{}' /dev/stdout
```

動作を確かめる。DB が休んでいると、最初の1回は15秒ほどかかる。デモの直前にも1回アクセスして、DB を起こしておく。

```sh
curl <ApiUrl>/shelters
```

管理画面から管理者 API を呼ぶためのトークンは、次で取り出す。

```sh
aws secretsmanager get-secret-value --secret-id <AdminTokenSecretArn> \
  --query SecretString --output text
```

管理画面のビルド結果（`dist/`）は、S3 に置いてから CloudFront のキャッシュを消す。

```sh
aws s3 sync dist/ s3://<AdminWebBucketName>/ --delete
aws cloudfront create-invalidation --distribution-id <AdminWebDistributionId> --paths '/*'
```

ローカルの Vite から本番の API を呼ぶときは、CORS で許可する Origin を足してデプロイする。

```sh
npx cdk deploy -c extraCorsOrigins=http://localhost:5173
```

**削除（環境が要らなくなったら）**

使わない間は DB が自動で休むので、デモのたびに消す必要はない。

```sh
npx cdk destroy
```

DB のデータ、S3 の管理画面、Secret はすべて消える（デモ環境なので残さない）。次にデプロイすると、DB は空から作り直され、API と管理画面の URL、`ADMIN_TOKEN` も新しい値になる。

**変更を確かめる（デプロイしない）**

```sh
npx cdk synth --quiet   # テンプレートの生成と Lambda のバンドル。CI でも実行する
npx cdk diff            # デプロイ済みの環境との差分（AWS の認証情報が必要）
```

## DB接続

- デモ規模のため、Lambdaからは接続プールサイズ1で直接接続する。
- 同時実行数が増えて接続数が問題になる場合、余裕があれば RDS Proxy を導入する。

## DBネットワーク

Aurora はインターネットへ直接公開しない。

```text
Lambda
   |
Security Group
   |
   | TCP/5432
   v
Aurora
```

- Aurora の Security Group では、LambdaからのPostgreSQL接続のみ許可する。
- 開発者PCから Aurora へ直接接続することは基本的に想定しない。

## 環境変数

環境ごとの差異は環境変数で管理する。アプリケーションコードに環境判定による分岐を大量に作らない。

| 変数 | 説明 | 開発 | 本番 |
| --- | --- | --- | --- |
| `DATABASE_URL` | DB接続文字列 | DockerのPostgreSQL | Aurora の接続文字列 |
| `NODE_ENV` | 実行モード | `development` | `production` |
| `CORS_ORIGIN` | 許可する管理画面のOrigin | Viteの開発サーバー | CloudFrontのドメイン |
| `ADMIN_TOKEN` | 管理者APIのBearerトークン | 任意の固定値 | ランダムな長い値 |
| `PORT` | ローカルサーバーのポート | `3000` | （不要） |
| `TEST_DATABASE_URL` | DBを使うテストの接続先（DB名は `_test` で終わること） | 省略時は `tomayaken_test` | （不要） |

- デモでは本番の秘密情報もLambdaの環境変数で渡す。発展として、実行時に Secrets Manager から読むようにする。
- 本番の `DATABASE_URL` と `ADMIN_TOKEN` は、CDK が生成した Secret（DB のパスワード、管理者トークン）から、デプロイ時に CloudFormation の動的参照で Lambda の環境変数へ埋め込む。Lambda は VPC の外（Secrets Manager）へ出られないため、実行時には読みに行かない。値はテンプレートには残らないが、Lambda のコンソールでは見える。
- DB のパスワードは英数字だけにしている（URL に埋め込むため）。
- `DATABASE_URL` に `sslmode=no-verify` を付け、SSL で接続する。通信は暗号化するが、VPC 内の通信なのでサーバー証明書の検証は省く。
- 本番の `CORS_ORIGIN` は CloudFront のドメイン。`-c extraCorsOrigins=…` で Origin を足せる。
- Flutterアプリはブラウザではないため、CORSの対象外。
