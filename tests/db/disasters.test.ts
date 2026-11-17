import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { checkins, disasters, shelters } from "../../src/db/schema.js";
import { createCheckin, createDisaster, createUser } from "./fixtures.js";
import { testDb } from "./helpers.js";

const db = testDb();
const activePath = "/api/v1/disasters/active";
const adminPath = "/api/v1/admin/disasters";
const auth = { Authorization: "Bearer test-admin-token" };

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "test-admin-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function start(name: string) {
  return app.request(adminPath, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

function close(id: string) {
  return app.request(`${adminPath}/${id}/close`, {
    method: "POST",
    headers: auth,
  });
}

describe("Disaster API", () => {
  it("activeな災害がなければ200でnullを返す", async () => {
    const res = await app.request(activePath);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disaster: null });
  });

  it("災害を開始すると201で返り、activeな災害として取得できる", async () => {
    const before = Date.now();
    const res = await start("2026年11月 ○○地震");
    expect(res.status).toBe(201);
    const [row] = await db.select().from(disasters);
    if (!row) throw new Error("Expected a disaster in the database");
    expect(row.id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    );
    expect(row.startedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.startedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const disaster = {
      id: row.id,
      name: "2026年11月 ○○地震",
      status: "active",
      startedAt: row.startedAt.toISOString(),
      endedAt: null,
    };
    expect(row).toMatchObject({
      name: disaster.name,
      status: "active",
      endedAt: null,
    });
    expect(await res.json()).toEqual(disaster);

    const active = await app.request(activePath);
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual({ disaster });
  });

  it("終了済みも含めて開始時刻の新しい順で返す", async () => {
    const newest = await createDisaster(db, {
      startedAt: new Date("2026-11-03T01:00:00Z"),
    });
    const oldest = await createDisaster(db, {
      status: "closed",
      startedAt: new Date("2026-11-01T01:00:00Z"),
      endedAt: new Date("2026-11-01T02:00:00Z"),
    });
    const middle = await createDisaster(db, {
      status: "closed",
      startedAt: new Date("2026-11-02T01:00:00Z"),
      endedAt: new Date("2026-11-02T02:00:00Z"),
    });

    const res = await app.request(adminPath, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [newest, middle, oldest].map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
      })),
    });
  });

  it("すでにactiveな災害があると409を返す", async () => {
    await createDisaster(db);
    const res = await start("2件目");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "DISASTER_ALREADY_ACTIVE" },
    });
  });

  it("同時に開始しても部分ユニークインデックスでactiveは1件だけになる", async () => {
    const responses = await Promise.all([start("災害A"), start("災害B")]);
    const [created, conflict] = responses.sort((a, b) => a.status - b.status);
    if (!created || !conflict) throw new Error("Expected two responses");

    expect(created.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: "DISASTER_ALREADY_ACTIVE" },
    });
    const body = (await created.json()) as { id: string };
    const rows = await db.select().from(disasters);
    expect(rows).toMatchObject([{ id: body.id, status: "active" }]);
  });

  it("災害を終了し、その災害の滞在中の人だけを同じ時刻に退所させる", async () => {
    const disaster = await createDisaster(db);
    const earlier = new Date("2026-11-01T00:00:00Z");
    const other = await createDisaster(db, {
      status: "closed",
      startedAt: earlier,
      endedAt: earlier,
    });
    const [shelter] = await db
      .insert(shelters)
      .values({
        name: "テスト避難所",
        capacity: 10,
        latitude: 35,
        longitude: 137,
      })
      .returning({ id: shelters.id });
    if (!shelter) throw new Error("Expected a shelter in the database");

    const addCheckin = async (disasterId: string, checkedOutAt: Date | null) =>
      createCheckin(db, {
        disasterId,
        shelterId: shelter.id,
        userId: (await createUser(db)).id,
        checkedOutAt,
      });
    const first = await addCheckin(disaster.id, null);
    const second = await addCheckin(disaster.id, null);
    const left = await addCheckin(disaster.id, earlier);
    const unrelated = await addCheckin(other.id, null);

    const res = await close(disaster.id);
    expect(res.status).toBe(200);
    const [closed] = await db
      .select()
      .from(disasters)
      .where(eq(disasters.id, disaster.id));
    if (!closed?.endedAt)
      throw new Error("Expected the disaster to have ended");
    expect(closed.status).toBe("closed");
    expect(await res.json()).toMatchObject({
      id: disaster.id,
      status: "closed",
      endedAt: closed.endedAt.toISOString(),
    });

    const rows = await db.select().from(checkins);
    const checkoutTimes = new Map(
      rows.map((row) => [row.id, row.checkedOutAt]),
    );
    expect(checkoutTimes.get(first.id)).toEqual(closed.endedAt);
    expect(checkoutTimes.get(second.id)).toEqual(closed.endedAt);
    expect(checkoutTimes.get(left.id)).toEqual(earlier);
    expect(checkoutTimes.get(unrelated.id)).toBeNull();

    const active = await app.request(activePath);
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual({ disaster: null });
  });

  it("存在しない災害の終了は404を返す", async () => {
    const res = await close(uuidv7());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "DISASTER_NOT_FOUND" },
    });
  });

  it("終了済みの災害を再度終了すると409を返し、終了時刻を保持する", async () => {
    const disaster = await createDisaster(db);
    const first = await close(disaster.id);
    expect(first.status).toBe(200);
    const body = (await first.json()) as { endedAt: string };

    const res = await close(disaster.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "DISASTER_ALREADY_CLOSED" },
    });
    const [row] = await db.select().from(disasters);
    expect(row?.endedAt?.toISOString()).toBe(body.endedAt);
  });
});
