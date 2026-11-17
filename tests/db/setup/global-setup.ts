import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createDb } from "../../../src/db/client.js";
import { assertTestDatabase, TEST_DATABASE_URL } from "./url.js";

/**
 * DBを使うテストの前に1回だけ動く。
 * テスト用DBがなければ作り、スキーマを空にしてからマイグレーションを流す。
 * 毎回マイグレーションを最初から流すので、マイグレーション自体の不具合にも気づける。
 */
export default async function setup() {
  const name = assertTestDatabase(TEST_DATABASE_URL);

  await createDatabaseIfMissing(name);

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query("drop schema if exists public cascade");
    await client.query("drop schema if exists drizzle cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }

  const { db, pool } = createDb(TEST_DATABASE_URL, 1);
  try {
    await migrate(db, { migrationsFolder: "src/db/migrations" });
  } finally {
    await pool.end();
  }
}

async function createDatabaseIfMissing(name: string) {
  // CREATE DATABASE は対象のDB自身には接続できないので、postgres DBにつなぐ
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      "テスト用のPostgreSQLに接続できません。`npm run db:up` で起動してください。",
      { cause: error },
    );
  }
  try {
    const found = await client.query(
      "select 1 from pg_database where datname = $1",
      [name],
    );
    if (found.rowCount === 0) {
      await client.query(`create database "${name}"`);
    }
  } finally {
    await client.end();
  }
}
