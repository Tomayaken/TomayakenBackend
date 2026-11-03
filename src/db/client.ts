import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

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
