import { and, asc, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { shelterSupplies, supplies } from "../db/schema.js";

export type ShelterSupplyRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
};

/**
 * 避難所の在庫を、全物資マスタについて登録順に返す。
 * 在庫行がない物資は quantity: 0 とする。
 */
export async function findStockByShelter(
  db: Executor,
  shelterId: string,
): Promise<ShelterSupplyRow[]> {
  return db
    .select({
      id: supplies.id,
      name: supplies.name,
      unit: supplies.unit,
      quantity: sql<number>`coalesce(${shelterSupplies.quantity}, 0)`.mapWith(
        Number,
      ),
    })
    .from(supplies)
    .leftJoin(
      shelterSupplies,
      and(
        eq(shelterSupplies.supplyId, supplies.id),
        eq(shelterSupplies.shelterId, shelterId),
      ),
    )
    .orderBy(asc(supplies.createdAt), asc(supplies.id));
}
