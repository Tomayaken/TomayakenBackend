import { z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { AppError } from "../errors/app-error.js";
import * as userService from "../services/user-service.js";
import type { AppEnv } from "../types.js";

export const USER_ID_HEADER = "X-User-Id";

const userIdSchema = z.uuid();

/**
 * 利用者の疑似認証（docs/architecture.md「認証方針」）。
 * `X-User-Id` ヘッダーの利用者IDが登録済みかを確かめ、`c.var.userId` に設定する。
 * 形式が正しくない、または未登録（PUT /users/:userId をしていない）なら 401。
 *
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
  if (!(await userService.findUser(parsed.data))) {
    throw new AppError(
      "UNAUTHORIZED",
      `User ${parsed.data} is not registered. Call PUT /users/{userId} first.`,
    );
  }
  c.set("userId", parsed.data);
  await next();
});
