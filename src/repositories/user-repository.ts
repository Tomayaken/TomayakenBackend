import { and, asc, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { households, users } from "../db/schema.js";

/** API で返す利用者の項目 */
export type UserRow = {
  id: string;
  name: string;
  householdId: string;
};

/** 認証で使う利用者。端末を持つ本人（アプリから登録した利用者）かどうかを含む */
export type AuthUserRow = UserRow & { hasDevice: boolean };

const userColumns = {
  id: users.id,
  name: users.name,
  householdId: users.householdId,
};

export async function findById(
  db: Executor,
  id: string,
): Promise<AuthUserRow | undefined> {
  const rows = await db
    .select({ ...userColumns, hasDevice: users.hasDevice })
    .from(users)
    .where(eq(users.id, id));
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

/** 端末を持たない家族を作る。id はサーバーが生成する */
export async function insertMember(
  db: Executor,
  values: { name: string; householdId: string },
): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({ ...values, hasDevice: false })
    .returning(userColumns);
  if (!row) throw new Error("failed to insert user");
  return row;
}

/**
 * アプリから登録した利用者の名前を更新する。
 * いない、または端末を持たない家族の id なら undefined
 */
export async function updateAppUserName(
  db: Executor,
  id: string,
  name: string,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ name })
    .where(and(eq(users.id, id), eq(users.hasDevice, true)))
    .returning(userColumns);
  return row;
}

/**
 * アプリから登録した利用者を作る。同じ id のアプリ利用者がすでにいれば名前だけを更新する
 * （世帯は変えない）。同じ id で同時に呼ばれても、主キーの一意制約で1行にまとまる。
 * 同じ id が端末を持たない家族のものなら、何も変えずに undefined を返す。
 */
export async function upsertAppUser(
  db: Executor,
  values: { id: string; name: string; householdId: string },
): Promise<UserRow | undefined> {
  const [row] = await db
    .insert(users)
    .values({ ...values, hasDevice: true })
    .onConflictDoUpdate({
      target: users.id,
      set: { name: values.name, updatedAt: sql`now()` },
      setWhere: eq(users.hasDevice, true),
    })
    .returning(userColumns);
  return row;
}
