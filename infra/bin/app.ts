import { App, Tags } from "aws-cdk-lib";
import { TomayakenStack } from "../lib/stack.js";

const app = new App();

// ローカルの Vite など、管理画面以外から本番の API を呼ぶときに足す。
// 例: npx cdk deploy -c extraCorsOrigins=http://localhost:5173
const extraCorsOrigins = (
  app.node.tryGetContext("extraCorsOrigins") as string | undefined
)
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const stack = new TomayakenStack(app, "TomayakenBackend", {
  description: "避難所DX バックエンドのデモ環境",
  // アカウントとリージョンは、AWS CLI のプロファイル（AWS_PROFILE / AWS_REGION）から決まる
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  extraCorsOrigins,
});
Tags.of(stack).add("project", "tomayaken");
