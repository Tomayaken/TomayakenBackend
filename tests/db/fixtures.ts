import { v7 as uuidv7 } from "uuid";
import type { Db } from "../../src/db/client.js";
import { checkins, disasters, households, users } from "../../src/db/schema.js";

/**
 * テストデータを作る関数。必要な列だけ指定し、残りは既定値で埋める。
 * 避難所・物資は seed(db) の固定IDを使う（SEED_IDS）。
 */

export async function createDisaster(
  db: Db,
  values: Partial<typeof disasters.$inferInsert> = {},
) {
  const [row] = await db
    .insert(disasters)
    .values({
      name: "テスト災害",
      status: "active",
      startedAt: new Date(),
      ...values,
    })
    .returning();
  if (!row) throw new Error("failed to create disaster");
  return row;
}

/** 世帯と、その世帯の利用者（既定はアプリから登録した、端末を持つ本人）を作る */
export async function createUser(
  db: Db,
  values: Partial<typeof users.$inferInsert> = {},
) {
  const householdId =
    values.householdId ??
    (await db.insert(households).values({ id: uuidv7() }).returning())[0]?.id;
  if (!householdId) throw new Error("failed to create household");
  const [row] = await db
    .insert(users)
    .values({ name: "テスト利用者", hasDevice: true, ...values, householdId })
    .returning();
  if (!row) throw new Error("failed to create user");
  return row;
}

export async function createCheckin(
  db: Db,
  values: Pick<
    typeof checkins.$inferInsert,
    "disasterId" | "userId" | "shelterId"
  > &
    Partial<typeof checkins.$inferInsert>,
) {
  const [row] = await db
    .insert(checkins)
    .values({ checkedInAt: new Date(), ...values })
    .returning();
  if (!row) throw new Error("failed to create checkin");
  return row;
}
