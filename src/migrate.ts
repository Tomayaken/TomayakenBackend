import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./db/client.js";
import { seed } from "./db/seed.js";

/**
 * 本番のマイグレーションと seed を流す Lambda のエントリ（docs/infrastructure.md「運用」）。
 * RDS は VPC の外から接続できないので、開発PCの drizzle-kit ではなく、VPC 内のこの Lambda から流す。
 *
 * 呼び出し: aws lambda invoke --function-name <MigrateFunctionName> --payload '{}' out.json
 * seed を飛ばすときは --payload '{"seed": false}'（CLI v2 では --cli-binary-format raw-in-base64-out も付ける）
 */

export type MigrateEvent = {
  /** seed も流すか（既定は true）。seed は何度流しても同じ結果になる */
  seed?: boolean;
};

/**
 * マイグレーションの SQL の置き場所。
 * Lambda では、CDK がバンドルの隣（migrations/）にコピーする。
 * ローカルでこのファイルを直接動かすときは src/db/migrations を使う。
 */
function migrationsFolder() {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  return join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");
}

export async function handler(event: MigrateEvent = {}) {
  const db = getDb();
  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
    const seeded = event.seed !== false;
    if (seeded) await seed(db);
    console.log(`migrate: done (seed: ${seeded})`);
    return { migrated: true, seeded };
  } finally {
    // Lambda は実行環境を使い回すので、次の呼び出しで新しく接続し直せるよう閉じる
    await closeDb();
  }
}
