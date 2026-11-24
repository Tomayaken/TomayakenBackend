import { asc, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { households, users } from "../db/schema.js";

export type UserRow = {
  id: string;
  name: string;
  householdId: string;
};

const userColumns = {
  id: users.id,
  name: users.name,
  householdId: users.householdId,
};

export async function findById(
  db: Executor,
  id: string,
): Promise<UserRow | undefined> {
  const rows = await db.select(userColumns).from(users).where(eq(users.id, id));
  return rows[0];
}

/** 世帯のメンバーを登録順に返す */
export async function findByHouseholdId(
  db: Executor,
  householdId: string,
): Promise<UserRow[]> {
  return db
    .select(userColumns)
    .from(users)
    .where(eq(users.householdId, householdId))
    .orderBy(asc(users.createdAt), asc(users.id));
}

export async function insertHousehold(db: Executor): Promise<string> {
  const [row] = await db
    .insert(households)
    .values({})
    .returning({ id: households.id });
  if (!row) throw new Error("failed to insert household");
  return row.id;
}

export async function deleteHousehold(db: Executor, id: string) {
  await db.delete(households).where(eq(households.id, id));
}

/** 利用者を作る。id を省略するとサーバーが生成する */
export async function insert(
  db: Executor,
  values: { id?: string; name: string; householdId: string },
): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning(userColumns);
  if (!row) throw new Error("failed to insert user");
  return row;
}

/** 名前を更新する。利用者がいなければ undefined */
export async function updateName(
  db: Executor,
  id: string,
  name: string,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ name })
    .where(eq(users.id, id))
    .returning(userColumns);
  return row;
}

/**
 * 利用者を作る。同じ id がすでにあれば名前だけを更新する（世帯は変えない）。
 * 同じ id で同時に呼ばれても、主キーの一意制約で1行にまとまる。
 */
export async function upsertName(
  db: Executor,
  values: { id: string; name: string; householdId: string },
): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.id,
      set: { name: values.name, updatedAt: sql`now()` },
    })
    .returning(userColumns);
  if (!row) throw new Error("failed to upsert user");
  return row;
}
