import { and, count, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import {
  disasters,
  shelterSupplies,
  supplyTransactions,
} from "../../src/db/schema.js";
import { SEED_IDS, seed } from "../../src/db/seed.js";
import * as supplyService from "../../src/services/supply-service.js";
import { testDb } from "./helpers.js";

const db = testDb();
const S = SEED_IDS.shelters;
const P = SEED_IDS.supplies;
const UNKNOWN_ID = "01a19fe0-0000-7000-8000-000000000000";
const ADMIN = { Authorization: "Bearer test-admin-token" };

beforeAll(() => {
  process.env.ADMIN_TOKEN = "test-admin-token";
});

beforeEach(async () => {
  await seed(db);
});

async function stock(shelterId: string, supplyId: string) {
  const rows = await db
    .select({ quantity: shelterSupplies.quantity })
    .from(shelterSupplies)
    .where(
      and(
        eq(shelterSupplies.shelterId, shelterId),
        eq(shelterSupplies.supplyId, supplyId),
      ),
    );
  return rows[0]?.quantity;
}

async function transactionCount() {
  const [row] = await db.select({ n: count() }).from(supplyTransactions);
  return row?.n;
}

function post(path: string, body: unknown, headers: HeadersInit = ADMIN) {
  return app.request(`/api/v1/admin${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("supplyService.operateSupply", () => {
  it("入庫すると在庫が増え、active な災害に紐づいた履歴が残る", async () => {
    const result = await supplyService.operateSupply(
      "IN",
      S.communityCenter,
      P.water,
      { quantity: 20, operatorName: "受付担当A", note: "追加" },
    );
    expect(result).toEqual({
      id: P.water,
      name: "水",
      unit: "bottle",
      quantity: 170,
    });
    expect(await stock(S.communityCenter, P.water)).toBe(170);

    const [tx] = await supplyService.listTransactions(S.communityCenter, {});
    expect(tx).toMatchObject({
      supply: { id: P.water, name: "水", unit: "bottle" },
      type: "IN",
      quantity: 20,
      operatorName: "受付担当A",
      note: "追加",
      disasterId: SEED_IDS.disaster,
    });
  });

  it("在庫行がない物資にも入庫できる", async () => {
    // 中央公民館には非常食の在庫行がない（seed）
    expect(await stock(S.communityCenter, P.meal)).toBeUndefined();
    const result = await supplyService.operateSupply(
      "IN",
      S.communityCenter,
      P.meal,
      { quantity: 5 },
    );
    expect(result.quantity).toBe(5);
    expect(await stock(S.communityCenter, P.meal)).toBe(5);
  });

  it("配布すると在庫が減る。在庫ちょうどまで配れる", async () => {
    const result = await supplyService.operateSupply(
      "OUT",
      S.communityCenter,
      P.blanket,
      { quantity: 80 },
    );
    expect(result.quantity).toBe(0);
    expect(await stock(S.communityCenter, P.blanket)).toBe(0);
  });

  it("在庫より多く配ると INSUFFICIENT_SUPPLY で、在庫も履歴も変えない", async () => {
    await expect(
      supplyService.operateSupply("OUT", S.communityCenter, P.blanket, {
        quantity: 81,
      }),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_SUPPLY",
      details: { available: 80, requested: 81 },
    });
    expect(await stock(S.communityCenter, P.blanket)).toBe(80);
    expect(await transactionCount()).toBe(0);
  });

  it("在庫行がない物資の配布は INSUFFICIENT_SUPPLY", async () => {
    await expect(
      supplyService.operateSupply("OUT", S.communityCenter, P.meal, {
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_SUPPLY" });
  });

  it("active な災害がなくても入庫でき、履歴の disasterId は null", async () => {
    await db
      .update(disasters)
      .set({ status: "closed", endedAt: new Date() })
      .where(eq(disasters.id, SEED_IDS.disaster));
    await supplyService.operateSupply("IN", S.gymnasium, P.toilet, {
      quantity: 1,
    });
    const [tx] = await supplyService.listTransactions(S.gymnasium, {});
    expect(tx?.disasterId).toBeNull();
  });

  it("存在しない避難所・物資は 404 のエラー", async () => {
    await expect(
      supplyService.operateSupply("IN", UNKNOWN_ID, P.water, { quantity: 1 }),
    ).rejects.toMatchObject({ code: "SHELTER_NOT_FOUND" });
    await expect(
      supplyService.operateSupply("IN", S.gymnasium, UNKNOWN_ID, {
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "SUPPLY_NOT_FOUND" });
  });
});

describe("同時の入庫・配布", () => {
  it("同時に配布しても在庫はマイナスにならず、成功した分だけ減る", async () => {
    // 中央公民館の毛布は 80。30 ずつ 5 件配ると、成功は 2 件だけ
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        supplyService.operateSupply("OUT", S.communityCenter, P.blanket, {
          quantity: 30,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(2);
    for (const r of failed) {
      expect(r.reason).toMatchObject({ code: "INSUFFICIENT_SUPPLY" });
    }
    expect(await stock(S.communityCenter, P.blanket)).toBe(20);
    expect(await transactionCount()).toBe(2);
  });

  it("在庫行がない物資への初回入庫が同時に来ても、すべて成功する", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        supplyService.operateSupply("IN", S.communityCenter, P.toilet, {
          quantity: 2,
        }),
      ),
    );
    expect(await stock(S.communityCenter, P.toilet)).toBe(10);
  });
});

describe("supplyService.listTransactions", () => {
  it("新しい順に返し、物資・災害で絞り込める", async () => {
    await supplyService.operateSupply("IN", S.gymnasium, P.water, {
      quantity: 1,
    });
    await supplyService.operateSupply("OUT", S.gymnasium, P.meal, {
      quantity: 2,
    });
    await supplyService.operateSupply("OUT", S.gymnasium, P.water, {
      quantity: 3,
    });
    // 別の避難所の履歴は含まれない
    await supplyService.operateSupply("IN", S.communityCenter, P.water, {
      quantity: 4,
    });

    const all = await supplyService.listTransactions(S.gymnasium, {});
    expect(all.map((t) => [t.type, t.quantity])).toEqual([
      ["OUT", 3],
      ["OUT", 2],
      ["IN", 1],
    ]);

    const water = await supplyService.listTransactions(S.gymnasium, {
      supplyId: P.water,
    });
    expect(water.map((t) => t.quantity)).toEqual([3, 1]);

    expect(
      await supplyService.listTransactions(S.gymnasium, {
        disasterId: UNKNOWN_ID,
      }),
    ).toEqual([]);
    expect(
      await supplyService.listTransactions(S.gymnasium, {
        disasterId: SEED_IDS.disaster,
      }),
    ).toHaveLength(3);
  });

  it("存在しない避難所は SHELTER_NOT_FOUND", async () => {
    await expect(
      supplyService.listTransactions(UNKNOWN_ID, {}),
    ).rejects.toMatchObject({ code: "SHELTER_NOT_FOUND" });
  });
});

describe("管理画面の物資 API", () => {
  it("配布すると更新後の在庫を返し、履歴に残る", async () => {
    const res = await post(`/shelters/${S.gymnasium}/supplies/${P.water}/out`, {
      quantity: 10,
      operatorName: " 受付担当A ",
      note: "朝の配布",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: P.water,
      name: "水",
      unit: "bottle",
      quantity: 990,
    });

    const list = await app.request(
      `/api/v1/admin/shelters/${S.gymnasium}/supply-transactions?supplyId=${P.water}`,
      { headers: ADMIN },
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: unknown[] };
    expect(body.items).toEqual([
      expect.objectContaining({
        type: "OUT",
        quantity: 10,
        operatorName: "受付担当A",
        note: "朝の配布",
        createdAt: expect.any(String),
      }),
    ]);
  });

  it("在庫が足りなければ 409 INSUFFICIENT_SUPPLY", async () => {
    const res = await post(
      `/shelters/${S.communityCenter}/supplies/${P.blanket}/out`,
      { quantity: 81 },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "INSUFFICIENT_SUPPLY" },
    });
  });

  it("数量が0や上限超えなら 400 INVALID_REQUEST", async () => {
    for (const quantity of [0, 1_000_001]) {
      const res = await post(
        `/shelters/${S.gymnasium}/supplies/${P.water}/in`,
        { quantity },
      );
      expect(res.status).toBe(400);
    }
  });

  it("存在しない物資は 404 SUPPLY_NOT_FOUND", async () => {
    const res = await post(
      `/shelters/${S.gymnasium}/supplies/${UNKNOWN_ID}/in`,
      { quantity: 1 },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "SUPPLY_NOT_FOUND" },
    });
  });

  it("管理者トークンがなければ 401 で、在庫は変わらない", async () => {
    const res = await post(
      `/shelters/${S.gymnasium}/supplies/${P.water}/in`,
      { quantity: 1 },
      {},
    );
    expect(res.status).toBe(401);
    expect(await stock(S.gymnasium, P.water)).toBe(1000);
  });
});
