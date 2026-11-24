import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Executor, Tx } from "../db/client.js";
import { checkins, disasters } from "../db/schema.js";

const disasterFields = {
  id: disasters.id,
  name: disasters.name,
  status: disasters.status,
  startedAt: disasters.startedAt,
  endedAt: disasters.endedAt,
};

export type DisasterRow = Omit<typeof disasters.$inferSelect, "createdAt">;

export async function findActive(db: Executor, lock?: "share") {
  const query = db
    .select(disasterFields)
    .from(disasters)
    .where(eq(disasters.status, "active"))
    .limit(1);
  const [row] = await (lock ? query.for(lock) : query);
  return row;
}

export function findAll(db: Executor) {
  return db
    .select(disasterFields)
    .from(disasters)
    .orderBy(desc(disasters.startedAt), desc(disasters.id));
}

export async function exists(db: Executor, id: string) {
  const [row] = await db
    .select({ id: disasters.id })
    .from(disasters)
    .where(eq(disasters.id, id));
  return row !== undefined;
}

function isActiveDisasterConflict(error: unknown): boolean {
  let current = error;
  // Drizzle wraps the original PostgreSQL error in Error.cause.
  while (current instanceof Error) {
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      current.constraint === "disasters_single_active_idx"
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export async function insertActive(db: Executor, name: string) {
  try {
    const [row] = await db
      .insert(disasters)
      .values({ name, status: "active", startedAt: sql`now()`, endedAt: null })
      .returning(disasterFields);
    if (!row) throw new Error("Disaster insert returned no row");
    return row;
  } catch (error) {
    if (isActiveDisasterConflict(error)) return null;
    throw error;
  }
}

export async function markClosed(tx: Tx, id: string) {
  const [row] = await tx
    .update(disasters)
    // Match JavaScript Date precision so the checkouts store the exact value.
    .set({ status: "closed", endedAt: sql`date_trunc('milliseconds', now())` })
    .where(and(eq(disasters.id, id), eq(disasters.status, "active")))
    .returning(disasterFields);
  return row;
}

export async function checkOutDisasterCheckins(
  tx: Tx,
  disasterId: string,
  endedAt: Date,
) {
  await tx
    .update(checkins)
    .set({ checkedOutAt: endedAt })
    .where(
      and(eq(checkins.disasterId, disasterId), isNull(checkins.checkedOutAt)),
    );
}
