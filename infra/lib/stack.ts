import { join } from "node:path";
import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

/** リポジトリのルート（Lambda のコードと package-lock.json がある場所） */
const REPO_ROOT = join(import.meta.dirname, "..", "..");

const DB_NAME = "tomayaken";
const DB_USER = "tomayaken";

export type TomayakenStackProps = StackProps & {
  /** CloudFront（管理画面）のほかに CORS で許可する Origin。例: ローカルの Vite */
  extraCorsOrigins?: string[];
};

/**
 * デモ用の本番環境（docs/infrastructure.md「IaC（AWS CDK）」）。
 * スタックは残しておき、使わない間は Aurora Serverless v2 が自動で休む（URL は変わらない）。
 * 要らなくなったら cdk destroy で消す。DB・S3 は削除時にデータごと消える設定にしている。
 */
export class TomayakenStack extends Stack {
  constructor(scope: Construct, id: string, props: TomayakenStackProps = {}) {
    super(scope, id, props);

    // --- ネットワーク: Private Isolated サブネットだけ（NAT Gateway なし） ---
    // Aurora のサブネットグループに 2 AZ 必要なので maxAzs は 2
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    const isolated = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };

    // Lambda の通信先は Aurora だけ（外へは出られない）
    const lambdaSg = new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
      vpc,
      description: "Tomayaken Lambda functions",
      allowAllOutbound: false,
    });
    const dbSg = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc,
      description: "Tomayaken Aurora (PostgreSQL from Lambda only)",
      allowAllOutbound: false,
    });

    // --- DB: Aurora Serverless v2（PostgreSQL） ---
    // パスワードは英数字だけにする。DATABASE_URL に埋め込むので、
    // URL で特別な意味を持つ文字（@ / : ? # % など）を避ける。
    // excludeCharacters で記号を全部除くと、Secrets Manager が「各種類の文字を最低1文字含める」
    // 既定のせいで生成に失敗するので、excludePunctuation を使う（そのため Secret を自分で作る）
    const dbSecret = new secretsmanager.Secret(this, "DatabaseSecret", {
      description: "Tomayaken Aurora master credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: DB_USER }),
        generateStringKey: "password",
        passwordLength: 32,
        excludePunctuation: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // スタックは残したまま、使っていない間は DB が自動で休む（0 ACU）。休んでいる間は
    // ストレージ代だけになる。休んだあとの最初の接続は、起き上がるまで 15 秒ほど待つ
    // （docs/infrastructure.md「運用」）
    const db = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_9,
      }),
      writer: rds.ClusterInstance.serverlessV2("Writer"),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      // デモの途中の短い空き時間では休まないよう、既定（5 分）より長めにする
      serverlessV2AutoPauseDuration: Duration.minutes(10),
      vpc,
      vpcSubnets: isolated,
      securityGroups: [dbSg],
      defaultDatabaseName: DB_NAME,
      credentials: rds.Credentials.fromSecret(dbSecret),
      storageEncrypted: true,
      // Aurora は自動バックアップを止められないので最短の 1 日にする。
      // デモ環境なので、削除時は最終スナップショットを取らずにデータごと消す
      backup: { retention: Duration.days(1) },
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    db.connections.allowDefaultPortFrom(lambdaSg, "Lambda to PostgreSQL");

    // Lambda は Secrets Manager に接続できない（NAT も VPC Endpoint もない）ので、
    // デプロイ時に CloudFormation の動的参照で値を埋め込む（docs/infrastructure.md「環境変数」）
    const databaseUrl = Fn.join("", [
      `postgresql://${DB_USER}:`,
      dbSecret.secretValueFromJson("password").unsafeUnwrap(),
      "@",
      db.clusterEndpoint.hostname,
      ":",
      db.clusterEndpoint.port.toString(),
      // SSL で接続する。VPC 内の通信なので証明書の検証は省く
      `/${DB_NAME}?sslmode=no-verify`,
    ]);

    // 管理者 API のトークン。ランダムな長い値を生成する
    const adminToken = new secretsmanager.Secret(this, "AdminToken", {
      description: "Tomayaken ADMIN_TOKEN (Bearer token for /api/v1/admin/*)",
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- 管理画面: S3 + CloudFront ---
    const adminWebBucket = new s3.Bucket(this, "AdminWebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    // SPA なので、存在しないパスも index.html を返してクライアントのルーターに任せる
    const spaFallback = (httpStatus: number): cloudfront.ErrorResponse => ({
      httpStatus,
      responseHttpStatus: 200,
      responsePagePath: "/index.html",
      ttl: Duration.seconds(0),
    });
    const distribution = new cloudfront.Distribution(
      this,
      "AdminWebDistribution",
      {
        defaultBehavior: {
          origin:
            origins.S3BucketOrigin.withOriginAccessControl(adminWebBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        errorResponses: [spaFallback(403), spaFallback(404)],
      },
    );
    const adminWebUrl = `https://${distribution.distributionDomainName}`;

    // --- Lambda ---
    const functionDefaults = (
      name: string,
    ): Partial<nodejs.NodejsFunctionProps> => ({
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      vpc,
      vpcSubnets: isolated,
      securityGroups: [lambdaSg],
      projectRoot: REPO_ROOT,
      depsLockFilePath: join(REPO_ROOT, "package-lock.json"),
      logGroup: new logs.LogGroup(this, `${name}Logs`, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    const bundling: nodejs.BundlingOptions = {
      format: nodejs.OutputFormat.ESM,
      target: "node24",
      mainFields: ["module", "main"],
      // pg などの CommonJS を ESM に同梱するため、require を用意する
      banner:
        "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
      // pg-native は使わない（pg が見つからなければ無視する任意の依存）
      externalModules: ["pg-native", "@aws-sdk/*"],
      sourceMap: true,
    };
    const environment = {
      NODE_ENV: "production",
      NODE_OPTIONS: "--enable-source-maps",
      DATABASE_URL: databaseUrl,
      // docs/infrastructure.md「DB接続」: Lambda からは接続プールサイズ 1 で直接接続する
      DB_POOL_MAX: "1",
    };

    const apiFn = new nodejs.NodejsFunction(this, "ApiFunction", {
      ...functionDefaults("ApiFunction"),
      description: "Tomayaken API (Hono)",
      entry: join(REPO_ROOT, "src", "lambda.ts"),
      handler: "handler",
      timeout: Duration.seconds(29),
      bundling,
      environment: {
        ...environment,
        ADMIN_TOKEN: adminToken.secretValue.unsafeUnwrap(),
        CORS_ORIGIN: [adminWebUrl, ...(props.extraCorsOrigins ?? [])].join(","),
      },
    });

    // マイグレーションと seed を流す。API Gateway には公開せず、aws lambda invoke で呼ぶ
    const migrateFn = new nodejs.NodejsFunction(this, "MigrateFunction", {
      ...functionDefaults("MigrateFunction"),
      description: "Tomayaken DB migration and seed",
      entry: join(REPO_ROOT, "src", "migrate.ts"),
      handler: "handler",
      timeout: Duration.minutes(5),
      bundling: {
        ...bundling,
        // migrate() が読む SQL をバンドルの隣（db/migrations）に置く。src/migrate.ts と同じ相対位置
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `mkdir -p "${outputDir}/db"`,
            `cp -r "${inputDir}/src/db/migrations" "${outputDir}/db/migrations"`,
          ],
        },
      },
      environment,
    });

    // --- API Gateway（HTTP API）: すべてのパスを API の Lambda に渡す ---
    // CORS は Hono（src/app.ts）が CORS_ORIGIN を見て返すので、API Gateway では設定しない
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      description: "Tomayaken API",
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", apiFn),
    });

    // --- 出力 ---
    new CfnOutput(this, "ApiUrl", {
      value: `${httpApi.apiEndpoint}/api/v1`,
      description: "API のベース URL",
    });
    new CfnOutput(this, "MigrateFunctionName", {
      value: migrateFn.functionName,
      description:
        "マイグレーションと seed を流す Lambda（aws lambda invoke で呼ぶ）",
    });
    new CfnOutput(this, "AdminTokenSecretArn", {
      value: adminToken.secretArn,
      description:
        "ADMIN_TOKEN の Secret（aws secretsmanager get-secret-value で取り出す）",
    });
    new CfnOutput(this, "AdminWebUrl", {
      value: adminWebUrl,
      description: "管理画面の URL",
    });
    new CfnOutput(this, "AdminWebBucketName", {
      value: adminWebBucket.bucketName,
      description: "管理画面のビルド結果を置く S3 バケット",
    });
    new CfnOutput(this, "AdminWebDistributionId", {
      value: distribution.distributionId,
      description:
        "キャッシュを消すときに使う CloudFront のディストリビューション ID",
    });
  }
}
