import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { checkins, disasters } from "../../src/db/schema.js";
import { SEED_IDS, seed } from "../../src/db/seed.js";
import * as checkinService from "../../src/services/checkin-service.js";
import { createCheckin, createDisaster, createUser } from "./fixtures.js";
import { testDb } from "./helpers.js";

const db = testDb();
const S = SEED_IDS.shelters;
const MISSING_ID = "01a19fe0-0000-7000-8000-000000000000";
const ADMIN = { Authorization: "Bearer test-admin-token" };

beforeAll(() => {
  process.env.ADMIN_TOKEN = "test-admin-token";
});

beforeEach(async () => {
  await seed(db);
});

/** seed の active な災害に、指定した避難所のチェックインを作る */
async function checkIn(
  shelterId: string,
  values: { name?: string; checkedInAt?: Date; checkedOutAt?: Date } = {},
) {
  const user = await createUser(db, { name: values.name ?? "テスト利用者" });
  const checkin = await createCheckin(db, {
    disasterId: SEED_IDS.disaster,
    userId: user.id,
    shelterId,
    checkedInAt: values.checkedInAt ?? new Date(),
    checkedOutAt: values.checkedOutAt ?? null,
  });
  return { user, checkin };
}

describe("checkinService.listShelterCheckins", () => {
  it("activeな災害のチェックインを到着順に、利用者付きで返す", async () => {
    const later = await checkIn(S.gymnasium, {
      name: "山田花子",
      checkedInAt: new Date("2026-11-03T05:00:00Z"),
    });
    const earlier = await checkIn(S.gymnasium, {
      name: "山田太郎",
      checkedInAt: new Date("2026-11-03T04:00:00Z"),
    });
    await checkIn(S.communityCenter); // 別の避難所は含まない

    const items = await checkinService.listShelterCheckins(S.gymnasium, {
      activeOnly: false,
    });
    expect(items).toEqual([
      {
        id: earlier.checkin.id,
        user: {
          id: earlier.user.id,
          name: "山田太郎",
          householdId: earlier.user.householdId,
        },
        checkedInAt: "2026-11-03T04:00:00.000Z",
        checkedOutAt: null,
      },
      expect.objectContaining({ id: later.checkin.id }),
    ]);
  });

  it("activeOnly ならチェックアウト済みを除く。省略時は含める", async () => {
    const staying = await checkIn(S.gymnasium);
    const left = await checkIn(S.gymnasium, {
      checkedOutAt: new Date("2026-11-03T06:00:00Z"),
    });

    const active = await checkinService.listShelterCheckins(S.gymnasium, {
      activeOnly: true,
    });
    expect(active.map((c) => c.id)).toEqual([staying.checkin.id]);

    const all = await checkinService.listShelterCheckins(S.gymnasium, {
      activeOnly: false,
    });
    expect(all.map((c) => c.id).sort()).toEqual(
      [staying.checkin.id, left.checkin.id].sort(),
    );
    expect(all.find((c) => c.id === left.checkin.id)?.checkedOutAt).toBe(
      "2026-11-03T06:00:00.000Z",
    );
  });

  it("終了した災害のチェックインは含まない", async () => {
    await db
      .update(disasters)
      .set({ status: "closed", endedAt: new Date() })
      .where(eq(disasters.id, SEED_IDS.disaster));
    const closedUser = await createUser(db);
    await createCheckin(db, {
      disasterId: SEED_IDS.disaster,
      userId: closedUser.id,
      shelterId: S.gymnasium,
      checkedOutAt: new Date(),
    });

    // activeな災害がないときは空
    expect(
      await checkinService.listShelterCheckins(S.gymnasium, {
        activeOnly: false,
      }),
    ).toEqual([]);

    // 新しい災害のチェックインだけが出る
    const current = await createDisaster(db);
    const user = await createUser(db);
    const checkin = await createCheckin(db, {
      disasterId: current.id,
      userId: user.id,
      shelterId: S.gymnasium,
    });
    const items = await checkinService.listShelterCheckins(S.gymnasium, {
      activeOnly: false,
    });
    expect(items.map((c) => c.id)).toEqual([checkin.id]);
  });

  it("存在しない避難所は SHELTER_NOT_FOUND", async () => {
    await expect(
      checkinService.listShelterCheckins(MISSING_ID, { activeOnly: false }),
    ).rejects.toMatchObject({ code: "SHELTER_NOT_FOUND" });
  });
});

describe("checkinService.proxyCheckout", () => {
  it("滞在中のチェックインをチェックアウトし、現在人数から外れる", async () => {
    const { checkin } = await checkIn(S.gymnasium);
    const result = await checkinService.proxyCheckout(checkin.id);
    expect(result).toMatchObject({
      id: checkin.id,
      shelterId: S.gymnasium,
      disasterId: SEED_IDS.disaster,
      checkedOutAt: expect.any(String),
    });

    const [row] = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, checkin.id));
    expect(row?.checkedOutAt).toBeInstanceOf(Date);
    const res = await app.request(`/api/v1/shelters/${S.gymnasium}`);
    expect(await res.json()).toMatchObject({ currentOccupancy: 0 });
  });

  it("チェックアウト済みなら NOT_CHECKED_IN", async () => {
    const { checkin } = await checkIn(S.gymnasium);
    await checkinService.proxyCheckout(checkin.id);
    await expect(
      checkinService.proxyCheckout(checkin.id),
    ).rejects.toMatchObject({ code: "NOT_CHECKED_IN" });
  });

  it("同時に呼んでも成功するのは1回だけ", async () => {
    const { checkin } = await checkIn(S.gymnasium);
    const results = await Promise.allSettled([
      checkinService.proxyCheckout(checkin.id),
      checkinService.proxyCheckout(checkin.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "NOT_CHECKED_IN" },
    });
  });

  it("存在しないチェックインは CHECKIN_NOT_FOUND", async () => {
    await expect(
      checkinService.proxyCheckout(MISSING_ID),
    ).rejects.toMatchObject({ code: "CHECKIN_NOT_FOUND" });
  });
});

describe("GET /api/v1/admin/shelters/:shelterId/checkins", () => {
  const url = (query = "") =>
    `/api/v1/admin/shelters/${S.gymnasium}/checkins${query}`;

  it("管理者トークンがなければ 401", async () => {
    const res = await app.request(url());
    expect(res.status).toBe(401);
  });

  it("status=active で滞在中だけを { items } で返す", async () => {
    const staying = await checkIn(S.gymnasium);
    await checkIn(S.gymnasium, { checkedOutAt: new Date() });

    const res = await app.request(url("?status=active"), { headers: ADMIN });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((c) => c.id)).toEqual([staying.checkin.id]);

    const all = await app.request(url(), { headers: ADMIN });
    expect(((await all.json()) as { items: unknown[] }).items).toHaveLength(2);
  });

  it("status に active 以外を渡すと 400", async () => {
    const res = await app.request(url("?status=all"), { headers: ADMIN });
    expect(res.status).toBe(400);
  });

  it("存在しない避難所は 404 SHELTER_NOT_FOUND", async () => {
    const res = await app.request(
      `/api/v1/admin/shelters/${MISSING_ID}/checkins`,
      { headers: ADMIN },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "SHELTER_NOT_FOUND" },
    });
  });
});

describe("POST /api/v1/admin/checkins/:checkinId/checkout", () => {
  const checkout = (
    checkinId: string,
    headers: Record<string, string> = ADMIN,
  ) =>
    app.request(`/api/v1/admin/checkins/${checkinId}/checkout`, {
      method: "POST",
      headers,
    });

  it("管理者トークンがなければ 401 で、チェックアウトされない", async () => {
    const { checkin } = await checkIn(S.gymnasium);
    const res = await checkout(checkin.id, {});
    expect(res.status).toBe(401);
    const [row] = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, checkin.id));
    expect(row?.checkedOutAt).toBeNull();
  });

  it("世帯に関係なくチェックアウトでき、更新後のチェックインを返す", async () => {
    const { checkin } = await checkIn(S.gymnasium);
    const res = await checkout(checkin.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: checkin.id,
      checkedOutAt: expect.any(String),
    });
  });

  it("2回目は 409 NOT_CHECKED_IN", async () => {
    const { checkin } = await checkIn(S.gymnasium);
    await checkout(checkin.id);
    const res = await checkout(checkin.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "NOT_CHECKED_IN" },
    });
  });

  it("存在しなければ 404 CHECKIN_NOT_FOUND", async () => {
    const res = await checkout(MISSING_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "CHECKIN_NOT_FOUND" },
    });
  });
});
