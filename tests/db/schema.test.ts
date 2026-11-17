import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  disasters,
  shelterSupplies,
  shelters,
  supplies,
} from "../../src/db/schema.js";
import { SEED_IDS, seed } from "../../src/db/seed.js";
import { PG_ERROR, pgErrorCode, testDb } from "./helpers.js";

const db = testDb();

const countOf = async (table: typeof shelters | typeof supplies) =>
  (await db.select({ n: count() }).from(table))[0]?.n;

describe("テストの土台", () => {
  it("テストごとに全テーブルが空になる（1件入れる）", async () => {
    await seed(db);
    expect(await countOf(shelters)).toBe(3);
  });

  it("テストごとに全テーブルが空になる（前のテストのデータが残っていない）", async () => {
    expect(await countOf(shelters)).toBe(0);
  });
});

describe("seed", () => {
  it("2回流しても同じ状態になる", async () => {
    await seed(db);
    await seed(db);
    expect(await countOf(shelters)).toBe(3);
    expect(await countOf(supplies)).toBe(4);
    const active = await db
      .select()
      .from(disasters)
      .where(eq(disasters.status, "active"));
    expect(active.map((d) => d.id)).toEqual([SEED_IDS.disaster]);
  });

  it("在庫は既存の行を上書きしない", async () => {
    await seed(db);
    await db
      .update(shelterSupplies)
      .set({ quantity: 1 })
      .where(eq(shelterSupplies.shelterId, SEED_IDS.shelters.gymnasium));
    await seed(db);
    const rows = await db
      .select({ quantity: shelterSupplies.quantity })
      .from(shelterSupplies)
      .where(eq(shelterSupplies.shelterId, SEED_IDS.shelters.gymnasium));
    expect(rows.every((r) => r.quantity === 1)).toBe(true);
  });
});

describe("DBの制約", () => {
  it("activeな災害は1件まで", async () => {
    const active = { status: "active" as const, startedAt: new Date() };
    await db.insert(disasters).values({ name: "1件目", ...active });
    const error = await db
      .insert(disasters)
      .values({ name: "2件目", ...active })
      .catch((e: unknown) => e);
    expect(pgErrorCode(error)).toBe(PG_ERROR.UNIQUE_VIOLATION);
  });

  it("避難所の緯度は -90〜90", async () => {
    const error = await db
      .insert(shelters)
      .values({ name: "範囲外", capacity: 10, latitude: 91, longitude: 139 })
      .catch((e: unknown) => e);
    expect(pgErrorCode(error)).toBe(PG_ERROR.CHECK_VIOLATION);
  });
});
