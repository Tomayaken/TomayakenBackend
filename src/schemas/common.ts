import { z } from "@hono/zod-openapi";
import { ERROR_STATUS, type ErrorCode } from "../errors/app-error.js";

export const Uuid = z.uuid().openapi({
  example: "01a19fe0-339a-77ad-8adf-2fd52c8110fa",
});

export const DateTime = z.iso.datetime({ offset: true }).openapi({
  example: "2026-11-03T13:30:00+09:00",
});

export const Name = z.string().trim().min(1).max(100).openapi({
  example: "山田太郎",
});

export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]]),
      message: z.string().openapi({
        description: "開発者向けの説明。画面表示の文言はクライアントが code から決める",
      }),
      details: z
        .record(z.string(), z.unknown())
        .optional()
        .openapi({
          type: "object",
          additionalProperties: true,
          description: "エラーの補足情報。内容はエラーコードごとに異なる",
        }),
    }),
  })
  .openapi("ErrorResponse");

/** 一覧のレスポンス `{ items: [...] }` */
export function itemsOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}

export function jsonContent<T extends z.ZodType>(
  schema: T,
  description: string,
) {
  return {
    description,
    content: { "application/json": { schema } },
  } as const;
}

/**
 * 発生しうるエラーコードから、OpenAPIのエラーレスポンスを作る。
 * 同じステータスのコードは1つにまとめ、description にコードを列挙する。
 * INTERNAL_ERROR (500) は常に含める。
 */
export function errorResponses(...codes: ErrorCode[]) {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of [...codes, "INTERNAL_ERROR"] as ErrorCode[]) {
    const status = ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return Object.fromEntries(
    [...byStatus].map(([status, list]) => [
      status,
      jsonContent(ErrorResponse, list.join(" / ")),
    ]),
  );
}

/** JSONのリクエストボディ（必須） */
export function jsonBody<T extends z.ZodType>(schema: T) {
  return {
    required: true,
    content: { "application/json": { schema } },
  } as const;
}
