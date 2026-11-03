import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "./types.js";

export const OPENAPI_PATH = "/api/v1/openapi.json";
export const DOCS_PATH = "/api/v1/docs";

export const openApiConfig = {
  openapi: "3.0.3",
  info: {
    title: "避難所DX API",
    version: "0.1.0",
    description: [
      "避難所DX バックエンドのAPI仕様。設計の背景は docs/api.md を参照。",
      "",
      "- 利用者API: `X-User-Id` ヘッダーに、アプリが生成した利用者ID（UUID）を付ける。",
      "- 管理者API（/api/v1/admin/*）: `Authorization: Bearer <ADMIN_TOKEN>` を付ける。",
      "- エラーは `{ error: { code, message, details? } }`。画面の文言は code から決める。",
      "- まだ実装していないエンドポイントは 501 NOT_IMPLEMENTED を返す。",
    ].join("\n"),
  },
  servers: [{ url: "http://localhost:3000", description: "ローカル" }],
};

export function registerSecuritySchemes(app: OpenAPIHono<AppEnv>) {
  app.openAPIRegistry.registerComponent("securitySchemes", "UserId", {
    type: "apiKey",
    in: "header",
    name: "X-User-Id",
    description: "アプリが生成した利用者ID（UUID）。現段階は自己申告",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "AdminToken", {
    type: "http",
    scheme: "bearer",
    description: "全運営者で共有する管理者トークン（ADMIN_TOKEN）",
  });
}
