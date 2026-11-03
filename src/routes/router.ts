import { OpenAPIHono } from "@hono/zod-openapi";
import { validationHook } from "../middleware/error-handler.js";
import type { AppEnv } from "../types.js";

/** 各ルートファイルで使うルーター。検証エラーの形式をそろえる */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
}

// OpenAPIのセキュリティ要件
export const userSecurity = [{ UserId: [] }];
export const adminSecurity = [{ AdminToken: [] }];
