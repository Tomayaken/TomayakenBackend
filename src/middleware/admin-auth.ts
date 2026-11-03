import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { AppError } from "../errors/app-error.js";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * 管理者APIの簡易認証。全運営者で共有する固定トークン（ADMIN_TOKEN）と照合する。
 * 将来はCognitoに差し替える。
 */
export const adminAuth = createMiddleware(async (c, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    throw new AppError("INTERNAL_ERROR", "ADMIN_TOKEN is not configured.");
  }
  const header = c.req.header("Authorization") ?? "";
  if (!safeEqual(header, `Bearer ${token}`)) {
    throw new AppError("UNAUTHORIZED", "Invalid admin token.");
  }
  await next();
});
