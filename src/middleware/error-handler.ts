import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import type { Hook } from "@hono/zod-openapi";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    if (err.status >= 500 && err.code !== "NOT_IMPLEMENTED") {
      console.error(err);
    }
    return c.json(err.toBody(), err.status);
  }
  console.error(err);
  return c.json(new AppError("INTERNAL_ERROR").toBody(), 500);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(new AppError("NOT_FOUND").toBody(), 404);

/** Zodの検証に失敗したら INVALID_REQUEST (400) を返す */
export const validationHook: Hook<unknown, any, string, unknown> = (
  result,
  c: Context,
) => {
  if (!result.success) {
    return c.json(
      new AppError("INVALID_REQUEST", undefined, {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }).toBody(),
      400,
    );
  }
};
