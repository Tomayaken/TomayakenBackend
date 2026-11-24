import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { shelterSupplies } from "../../src/db/schema.js";
import { SEED_IDS, seed } from "../../src/db/seed.js";
import * as supplyService from "../../src/services/supply-service.js";
import { testDb } from "./helpers.js";

const db = testDb();
const S = SEED_IDS.shelters;
const P = SEED_IDS.supplies;
const UNKNOWN_ID = "01a19fe0-0000-7000-8000-000000000000";

beforeEach(async () => {
  await seed(db);
});

describe("supplyService.listShelterSupplies", () => {
  it("全物資を登録順に返し、在庫行がない物資は 0 にする", async () => {
    // 中央公民館の在庫は水と毛布だけ（seed）
    expect(await supplyService.listShelterSupplies(S.communityCenter)).toEqual([
      { id: P.water, name: "水", unit: "bottle", quantity: 150 },
      { id: P.blanket, name: "毛布", unit: "piece", quantity: 80 },
      { id: P.meal, name: "非常食", unit: "meal", quantity: 0 },
      { id: P.toilet, name: "簡易トイレ", unit: "piece", quantity: 0 },
    ]);
  });

  it("ほかの避難所の在庫は混ざらない", async () => {
    await db
      .update(shelterSupplies)
      .set({ quantity: 1 })
      .where(
        and(
          eq(shelterSupplies.shelterId, S.gymnasium),
          eq(shelterSupplies.supplyId, P.water),
        ),
      );
    const items = await supplyService.listShelterSupplies(S.elementarySchool);
    expect(items.find((s) => s.id === P.water)?.quantity).toBe(600);
  });

  it("存在しない避難所は SHELTER_NOT_FOUND", async () => {
    await expect(
      supplyService.listShelterSupplies(UNKNOWN_ID),
    ).rejects.toMatchObject({ code: "SHELTER_NOT_FOUND" });
  });
});

describe("GET /api/v1/shelters/:shelterId/supplies", () => {
  it("{ items } で返す", async () => {
    const res = await app.request(`/api/v1/shelters/${S.gymnasium}/supplies`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; quantity: number }[];
    };
    expect(body.items.map((s) => [s.id, s.quantity])).toEqual([
      [P.water, 1000],
      [P.blanket, 0],
      [P.meal, 1500],
      [P.toilet, 200],
    ]);
  });

  it("存在しなければ 404 SHELTER_NOT_FOUND", async () => {
    const res = await app.request(`/api/v1/shelters/${UNKNOWN_ID}/supplies`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "SHELTER_NOT_FOUND" },
    });
  });
});
