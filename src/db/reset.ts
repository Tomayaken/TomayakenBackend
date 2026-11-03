import pg from "pg";

/**
 * ローカルDBのテーブルとマイグレーション履歴をすべて削除する。
 * `npm run db:reset` から呼ばれ、このあとマイグレーションとseedを流し直す。
 */

if (process.env.NODE_ENV === "production") {
  throw new Error("db:reset must not run in production");
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("drop schema if exists public cascade");
  await client.query("drop schema if exists drizzle cascade");
  await client.query("create schema public");
  console.log("reset: done");
} finally {
  await client.end();
}
