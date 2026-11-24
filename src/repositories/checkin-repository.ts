import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { checkins, disasters, shelters, users } from "../db/schema.js";

const checkinFields = {
  id: checkins.id,
  userId: checkins.userId,
  shelterId: checkins.shelterId,
  disasterId: checkins.disasterId,
  checkedInAt: checkins.checkedInAt,
  checkedOutAt: checkins.checkedOutAt,
};

export type CheckinRow = {
  id: string;
  userId: string;
  shelterId: string;
  disasterId: string;
  checkedInAt: Date;
  checkedOutAt: Date | null;
};

export type ShelterCheckinRow = {
  id: string;
  user: { id: string; name: string; householdId: string };
  checkedInAt: Date;
  checkedOutAt: Date | null;
};

/**
 * 避難所の、activeな災害に紐づくチェックインを利用者付きで返す（到着順）。
 * activeOnly なら滞在中（チェックアウトしていない）のものだけ。
 * activeな災害がなければ空になる。
 */
export async function findByShelterInActiveDisaster(
  db: Executor,
  shelterId: string,
  { activeOnly }: { activeOnly: boolean },
): Promise<ShelterCheckinRow[]> {
  const conditions: SQL[] = [eq(checkins.shelterId, shelterId)];
  if (activeOnly) {
    conditions.push(isNull(checkins.checkedOutAt));
  }
  return db
    .select({
      id: checkins.id,
      user: {
        id: users.id,
        name: users.name,
        householdId: users.householdId,
      },
      checkedInAt: checkins.checkedInAt,
      checkedOutAt: checkins.checkedOutAt,
    })
    .from(checkins)
    .innerJoin(users, eq(users.id, checkins.userId))
    .innerJoin(
      disasters,
      and(
        eq(disasters.id, checkins.disasterId),
        eq(disasters.status, "active"),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(checkins.checkedInAt), asc(checkins.id));
}

export function findActiveByUsers(
  db: Executor,
  userIds: string[],
  lock?: "update",
) {
  const query = db
    .select({ ...checkinFields, shelterName: shelters.name })
    .from(checkins)
    .innerJoin(shelters, eq(shelters.id, checkins.shelterId))
    .where(
      and(inArray(checkins.userId, userIds), isNull(checkins.checkedOutAt)),
    );
  return lock ? query.for(lock, { of: checkins }) : query;
}

export async function insertIfAbsent(
  db: Executor,
  values: Pick<CheckinRow, "userId" | "shelterId" | "disasterId">,
) {
  const [row] = await db
    .insert(checkins)
    .values({ ...values, checkedInAt: new Date() })
    .onConflictDoNothing({
      target: checkins.userId,
      where: isNull(checkins.checkedOutAt),
    })
    .returning(checkinFields);
  return row;
}

export async function findById(
  db: Executor,
  id: string,
): Promise<CheckinRow | undefined> {
  const [row] = await db
    .select(checkinFields)
    .from(checkins)
    .where(eq(checkins.id, id));
  return row;
}

/**
 * 滞在中のチェックインをチェックアウトする。
 * チェックアウト済み・存在しない場合は undefined（同時に呼ばれても更新は1回だけ）。
 */
export async function markCheckedOut(
  db: Executor,
  id: string,
  at: Date,
): Promise<CheckinRow | undefined> {
  const [row] = await db
    .update(checkins)
    .set({ checkedOutAt: at })
    .where(and(eq(checkins.id, id), isNull(checkins.checkedOutAt)))
    .returning(checkinFields);
  return row;
}
