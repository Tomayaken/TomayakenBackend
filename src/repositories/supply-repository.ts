import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import {
  disasters,
  type SUPPLY_TRANSACTION_TYPES,
  shelterSupplies,
  supplies,
  supplyTransactions,
} from "../db/schema.js";

export type SupplyRefRow = { id: string; name: string; unit: string };

export type SupplyTransactionType = (typeof SUPPLY_TRANSACTION_TYPES)[number];

export type SupplyTransactionRow = {
  id: string;
  supply: SupplyRefRow;
  type: SupplyTransactionType;
  quantity: number;
  operatorName: string | null;
  note: string | null;
  disasterId: string | null;
  createdAt: Date;
};

export async function findSupplyById(
  db: Executor,
  id: string,
): Promise<SupplyRefRow | undefined> {
  const rows = await db
    .select({ id: supplies.id, name: supplies.name, unit: supplies.unit })
    .from(supplies)
    .where(eq(supplies.id, id));
  return rows[0];
}

/**
 * 在庫行がなければ quantity = 0 で作る。
 * SELECT ... FOR UPDATE は存在しない行をロックできないので、入庫ではロックの前にこれを呼ぶ
 * （docs/database.md「物資の入庫・配布」）
 */
export async function ensureStockRow(
  db: Executor,
  shelterId: string,
  supplyId: string,
) {
  await db
    .insert(shelterSupplies)
    .values({ shelterId, supplyId, quantity: 0 })
    .onConflictDoNothing();
}

/** 在庫行をロックして数量を返す。行がなければ undefined */
export async function lockStock(
  db: Executor,
  shelterId: string,
  supplyId: string,
): Promise<number | undefined> {
  const rows = await db
    .select({ quantity: shelterSupplies.quantity })
    .from(shelterSupplies)
    .where(
      and(
        eq(shelterSupplies.shelterId, shelterId),
        eq(shelterSupplies.supplyId, supplyId),
      ),
    )
    .for("update");
  return rows[0]?.quantity;
}

export async function updateStock(
  db: Executor,
  shelterId: string,
  supplyId: string,
  quantity: number,
) {
  await db
    .update(shelterSupplies)
    .set({ quantity })
    .where(
      and(
        eq(shelterSupplies.shelterId, shelterId),
        eq(shelterSupplies.supplyId, supplyId),
      ),
    );
}

/**
 * active な災害のIDを返す。なければ undefined。
 * TODO: Disaster の実装（PR #24）がマージされたら disaster-repository の関数に寄せる
 */
export async function findActiveDisasterId(
  db: Executor,
): Promise<string | undefined> {
  const rows = await db
    .select({ id: disasters.id })
    .from(disasters)
    .where(eq(disasters.status, "active"));
  return rows[0]?.id;
}

export async function insertTransaction(
  db: Executor,
  values: {
    shelterId: string;
    supplyId: string;
    type: SupplyTransactionType;
    quantity: number;
    operatorName: string | null;
    note: string | null;
    disasterId: string | null;
  },
) {
  await db.insert(supplyTransactions).values(values);
}

/** 避難所の入出庫履歴を新しい順に返す */
export async function findTransactionsByShelter(
  db: Executor,
  shelterId: string,
  filter: { disasterId?: string; supplyId?: string },
): Promise<SupplyTransactionRow[]> {
  const conditions = [eq(supplyTransactions.shelterId, shelterId)];
  if (filter.disasterId) {
    conditions.push(eq(supplyTransactions.disasterId, filter.disasterId));
  }
  if (filter.supplyId) {
    conditions.push(eq(supplyTransactions.supplyId, filter.supplyId));
  }
  return (
    db
      .select({
        id: supplyTransactions.id,
        supply: { id: supplies.id, name: supplies.name, unit: supplies.unit },
        type: supplyTransactions.type,
        quantity: supplyTransactions.quantity,
        operatorName: supplyTransactions.operatorName,
        note: supplyTransactions.note,
        disasterId: supplyTransactions.disasterId,
        createdAt: supplyTransactions.createdAt,
      })
      .from(supplyTransactions)
      .innerJoin(supplies, eq(supplies.id, supplyTransactions.supplyId))
      .where(and(...conditions))
      // supply_transactions_shelter_created_idx を使う。同じ時刻なら id（UUIDv7）の新しい順
      .orderBy(desc(supplyTransactions.createdAt), desc(supplyTransactions.id))
  );
}

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
