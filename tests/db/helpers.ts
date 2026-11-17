import { sql } from "drizzle-orm";
import { createDb, type Db } from "../../src/db/client.js";

let current: ReturnType<typeof createDb> | undefined;

/**
 * テスト用DBへの接続。テストファイルの中で使い回し、ファイルの最後に閉じる
 * （tests/db/setup/each.ts）。接続先は vitest.config.ts が DATABASE_URL に入れる。
 */
export function testDb(): Db {
  current ??= createDb(process.env.DATABASE_URL, 2);
  return current.db;
}

export async function closeTestDb() {
  await current?.pool.end();
  current = undefined;
}

/** public スキーマの全テーブルを空にする（マイグレーション履歴は drizzle スキーマなので残る） */
export async function truncateAll(db: Db) {
  const result = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (result.rows.length === 0) return;
  const tables = result.rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}

/** DBの制約違反などで投げられたエラーから、PostgreSQLのエラーコードを取り出す */
export function pgErrorCode(error: unknown): string | undefined {
  let e: unknown = error;
  while (e instanceof Error) {
    if ("code" in e && typeof e.code === "string") return e.code;
    e = e.cause;
  }
  return undefined;
}

/** PostgreSQLのエラーコード（https://www.postgresql.org/docs/current/errcodes-appendix.html） */
export const PG_ERROR = {
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
} as const;
