import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { shelters } from "../../src/db/schema.js";
import { SEED_IDS, seed } from "../../src/db/seed.js";
import * as shelterService from "../../src/services/shelter-service.js";
import { createCheckin, createUser } from "./fixtures.js";
import { testDb } from "./helpers.js";

const db = testDb();
const S = SEED_IDS.shelters;

/** 避難所に、滞在中のチェックインを n 件作る（seed の active な災害に紐づける） */
async function checkInPeople(shelterId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const user = await createUser(db);
    await createCheckin(db, {
      disasterId: SEED_IDS.disaster,
      userId: user.id,
      shelterId,
    });
  }
}

beforeEach(async () => {
  await seed(db);
});

describe("shelterService.listShelters", () => {
  it("全避難所を登録順に返す", async () => {
    const items = await shelterService.listShelters();
    expect(items.map((s) => s.id)).toEqual([
      S.elementarySchool,
      S.communityCenter,
      S.gymnasium,
    ]);
    expect(items[0]).toEqual({
      id: S.elementarySchool,
      name: "第一小学校",
      address: "○○市中央1-1-1",
      capacity: 500,
      latitude: 35.6812,
      longitude: 139.7671,
      currentOccupancy: 0,
      isOverCapacity: false,
    });
  });

  it("現在人数は滞在中のチェックインだけを数える", async () => {
    await checkInPeople(S.communityCenter, 2);
    const left = await createUser(db);
    await createCheckin(db, {
      disasterId: SEED_IDS.disaster,
      userId: left.id,
      shelterId: S.communityCenter,
      checkedOutAt: new Date(),
    });

    const items = await shelterService.listShelters();
    const occupancy = Object.fromEntries(
      items.map((s) => [s.id, s.currentOccupancy]),
    );
    expect(occupancy).toEqual({
      [S.elementarySchool]: 0,
      [S.communityCenter]: 2,
      [S.gymnasium]: 0,
    });
  });
});

describe("shelterService.getShelter", () => {
  it("定員を超えると isOverCapacity が true（定員ちょうどは false）", async () => {
    // 中央公民館の定員は120。テストを軽くするため定員を2に下げる
    await db
      .update(shelters)
      .set({ capacity: 2 })
      .where(eq(shelters.id, S.communityCenter));
    await checkInPeople(S.communityCenter, 2);
    expect(
      (await shelterService.getShelter(S.communityCenter)).isOverCapacity,
    ).toBe(false);

    await checkInPeople(S.communityCenter, 1);
    const shelter = await shelterService.getShelter(S.communityCenter);
    expect(shelter.currentOccupancy).toBe(3);
    expect(shelter.isOverCapacity).toBe(true);
  });

  it("存在しない避難所は SHELTER_NOT_FOUND", async () => {
    await expect(
      shelterService.getShelter("01a19fe0-0000-7000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "SHELTER_NOT_FOUND" });
  });
});

describe("GET /api/v1/shelters", () => {
  it("{ items } で返す", async () => {
    const res = await app.request("/api/v1/shelters");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(3);
  });
});

describe("GET /api/v1/shelters/:shelterId", () => {
  it("避難所を返す", async () => {
    await checkInPeople(S.gymnasium, 1);
    const res = await app.request(`/api/v1/shelters/${S.gymnasium}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: S.gymnasium,
      name: "市民体育館",
      currentOccupancy: 1,
      isOverCapacity: false,
    });
  });

  it("存在しなければ 404 SHELTER_NOT_FOUND", async () => {
    const res = await app.request(
      "/api/v1/shelters/01a19fe0-0000-7000-8000-000000000000",
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "SHELTER_NOT_FOUND" },
    });
  });
});
