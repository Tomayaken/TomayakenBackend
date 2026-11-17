import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

/** トランザクションの中で渡されるDB */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Repository が受け取るDB。トランザクションの中からも外からも呼べるようにする */
export type Executor = Db | Tx;

let shared: ReturnType<typeof createDb> | undefined;

/**
 * アプリ全体で使い回すDB。最初に呼ばれたときに接続する
 * （import しただけでは接続しないので、DBを使わないテストでも app を読み込める）。
 */
export function getDb(): Db {
  shared ??= createDb();
  return shared.db;
}

/** getDb() の接続を閉じる。テストの後片付けやスクリプトの終了時に使う */
export async function closeDb() {
  await shared?.pool.end();
  shared = undefined;
}

export function createDb(
  databaseUrl = process.env.DATABASE_URL,
  // Lambdaでは1にする（docs/infrastructure.md「DB接続」）
  max = Number(process.env.DB_POOL_MAX ?? 10),
) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
