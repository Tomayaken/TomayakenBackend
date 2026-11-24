import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { checkins, shelters } from "../db/schema.js";

export type ShelterRow = {
  id: string;
  name: string;
  address: string | null;
  capacity: number;
  latitude: number;
  longitude: number;
  /** 滞在中（チェックアウトしていない）のチェックイン数 */
  currentOccupancy: number;
};

/**
 * 避難所に現在人数を付けて取り出すクエリ。
 * 滞在中のチェックインだけを LEFT JOIN して数える（checkins_active_by_shelter_idx を使う）。
 */
function selectWithOccupancy(db: Executor) {
  return db
    .select({
      id: shelters.id,
      name: shelters.name,
      address: shelters.address,
      capacity: shelters.capacity,
      latitude: shelters.latitude,
      longitude: shelters.longitude,
      currentOccupancy: count(checkins.id),
    })
    .from(shelters)
    .leftJoin(
      checkins,
      and(eq(checkins.shelterId, shelters.id), isNull(checkins.checkedOutAt)),
    )
    .groupBy(shelters.id)
    .$dynamic();
}

/** 全避難所を登録順に返す */
export async function findAll(db: Executor): Promise<ShelterRow[]> {
  return selectWithOccupancy(db).orderBy(
    asc(shelters.createdAt),
    asc(shelters.id),
  );
}

/** 避難所があるかだけを調べる（現在人数の集計をしない） */
export async function existsById(db: Executor, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: shelters.id })
    .from(shelters)
    .where(eq(shelters.id, id));
  return rows.length > 0;
}

export async function findById(
  db: Executor,
  id: string,
): Promise<ShelterRow | undefined> {
  const rows = await selectWithOccupancy(db).where(eq(shelters.id, id));
  return rows[0];
}
