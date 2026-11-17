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

// seed の座標: 第一小学校 (35.6812, 139.7671) / 中央公民館 (35.6852, 139.7528) /
// 市民体育館 (35.6905, 139.7004)。第一小学校から見て、公民館が約1.4km、体育館が約6.1km
describe("shelterService.listNearbyShelters", () => {
  it("近い順に並び、避難所の上にいれば距離は 0", async () => {
    const items = await shelterService.listNearbyShelters(
      { latitude: 35.6812, longitude: 139.7671 },
      5,
    );
    expect(items.map((s) => s.id)).toEqual([
      S.elementarySchool,
      S.communityCenter,
      S.gymnasium,
    ]);
    expect(items[0]?.distanceMeters).toBe(0);
  });

  it("現在地が変われば順番も変わる（体育館のそば）", async () => {
    const items = await shelterService.listNearbyShelters(
      { latitude: 35.6901, longitude: 139.701 },
      5,
    );
    expect(items.map((s) => s.id)).toEqual([
      S.gymnasium,
      S.communityCenter,
      S.elementarySchool,
    ]);
  });

  it("距離は四捨五入した整数（m）", async () => {
    const items = await shelterService.listNearbyShelters(
      { latitude: 35.6812, longitude: 139.7671 },
      5,
    );
    for (const s of items) {
      expect(Number.isInteger(s.distanceMeters)).toBe(true);
    }
    // 第一小学校から中央公民館まで（ハーバーサイン公式で約1.39km）
    expect(items[1]?.distanceMeters).toBeGreaterThan(1300);
    expect(items[1]?.distanceMeters).toBeLessThan(1500);
  });

  it("limit 件まで返す", async () => {
    const items = await shelterService.listNearbyShelters(
      { latitude: 35.6812, longitude: 139.7671 },
      2,
    );
    expect(items).toHaveLength(2);
  });

  it("現在人数と定員超過も付ける", async () => {
    await checkInPeople(S.elementarySchool, 2);
    const [nearest] = await shelterService.listNearbyShelters(
      { latitude: 35.6812, longitude: 139.7671 },
      1,
    );
    expect(nearest).toEqual({
      id: S.elementarySchool,
      name: "第一小学校",
      capacity: 500,
      currentOccupancy: 2,
      isOverCapacity: false,
      latitude: 35.6812,
      longitude: 139.7671,
      distanceMeters: 0,
    });
  });
});

describe("GET /api/v1/shelters/nearby", () => {
  it("/shelters/{shelterId} ではなく nearby のルートに届き、{ items } で返す", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=35.6812&longitude=139.7671",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((s) => s.id)).toEqual([
      S.elementarySchool,
      S.communityCenter,
      S.gymnasium,
    ]);
  });

  it("limit を省略すると最大5件、空なら省略と同じ", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=35.6812&longitude=139.7671&limit=",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    // seed の避難所は3件なので、5件より少ない全件が返る
    expect(body.items).toHaveLength(3);
  });

  it("limit を指定するとその件数まで", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=35.6812&longitude=139.7671&limit=1",
    );
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });
});
