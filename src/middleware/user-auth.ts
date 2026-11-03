import { z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { AppError } from "../errors/app-error.js";
import type { AppEnv } from "../types.js";

export const USER_ID_HEADER = "X-User-Id";

const userIdSchema = z.uuid();

/**
 * 利用者の疑似認証（docs/architecture.md「認証方針」）。
 * `X-User-Id` ヘッダーの利用者IDを検証し、`c.var.userId` に設定する。
 *
 * TODO: User APIの実装時に、利用者がDBに存在するかの確認を追加する。
 * 将来はマイナンバーカードやCognitoのJWT検証に差し替える。
 */
export const userAuth = createMiddleware<AppEnv>(async (c, next) => {
  const parsed = userIdSchema.safeParse(c.req.header(USER_ID_HEADER));
  if (!parsed.success) {
    throw new AppError(
      "UNAUTHORIZED",
      `${USER_ID_HEADER} header is missing or invalid.`,
    );
  }
  c.set("userId", parsed.data);
  await next();
});
