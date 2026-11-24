import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { checkins, disasters, shelters, users } from "../../src/db/schema.js";
import { SEED_IDS, seed } from "../../src/db/seed.js";
import { closeDisaster } from "../../src/services/disaster-service.js";
import { createUser } from "./fixtures.js";
import { testDb } from "./helpers.js";

const db = testDb();
const shelterId = SEED_IDS.shelters.gymnasium;
const otherShelterId = SEED_IDS.shelters.communityCenter;
const missingId = "01a19fe0-0000-7000-8000-000000000000";

async function waitForBlockedQuery(pattern: string) {
  await vi.waitFor(async () => {
    const { rows } = await db.execute(sql`
      select pid from pg_stat_activity
      where wait_event_type = 'Lock' and query like ${pattern}
    `);
    expect(rows).not.toHaveLength(0);
  });
}

beforeEach(async () => {
  await seed(db);
});

async function enter(
  actor: string,
  userIds?: string[],
  destination: string = shelterId,
) {
  return app.request(`/api/v1/shelters/${destination}/checkins`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": actor },
    body: JSON.stringify({ userIds }),
  });
}

function leave(actor: string, id: string) {
  return app.request(`/api/v1/checkins/${id}/checkout`, {
    method: "POST",
    headers: { "X-User-Id": actor },
  });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code } });
}

async function occupancy() {
  const response = await app.request(`/api/v1/shelters/${shelterId}`);
  expect(response.status).toBe(200);
  return (await response.json()).currentOccupancy;
}

it("defaults to the caller and reports every household member", async () => {
  const owner = await createUser(db);
  const member = await createUser(db, { householdId: owner.householdId });
  await createUser(db);
  const response = await enter(owner.id);
  expect(response.status).toBe(201);
  const { items } = await response.json();
  expect(items).toEqual([expect.objectContaining({ userId: owner.id })]);
  const [shelter] = await db
    .select()
    .from(shelters)
    .where(eq(shelters.id, shelterId));
  const state = await app.request("/api/v1/me/checkins", {
    headers: { "X-User-Id": owner.id },
  });
  expect(state.status).toBe(200);
  expect(await state.json()).toEqual({
    items: expect.arrayContaining([
      {
        user: { id: owner.id, name: owner.name },
        checkin: {
          id: items[0].id,
          shelter: { id: shelterId, name: shelter?.name },
          checkedInAt: items[0].checkedInAt,
        },
      },
      { user: { id: member.id, name: member.name }, checkin: null },
    ]),
  });
  expect(await db.select().from(checkins)).toHaveLength(1);
});

it("checks in a household, retries idempotently, and updates occupancy on checkout", async () => {
  const owner = await createUser(db);
  const member = await createUser(db, { householdId: owner.householdId });
  const ids = [owner.id, member.id];
  expect(await occupancy()).toBe(0);
  const response = await enter(owner.id, ids);
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.items.map((row: { userId: string }) => row.userId)).toEqual(ids);
  expect(await occupancy()).toBe(2);
  const retry = await enter(owner.id, ids);
  expect(retry.status).toBe(201);
  expect(await retry.json()).toEqual(body);
  for (const [index, item] of body.items.entries()) {
    const checkout = await leave(owner.id, item.id);
    expect(checkout.status).toBe(200);
    expect(await checkout.json()).toEqual({
      ...item,
      checkedOutAt: expect.any(String),
    });
    expect(await occupancy()).toBe(1 - index);
  }
  await expectError(
    await leave(owner.id, body.items[0].id),
    409,
    "NOT_CHECKED_IN",
  );
});

it("rejects forbidden users, missing shelters and checkins, and inactive disasters", async () => {
  const owner = await createUser(db);
  const outsider = await createUser(db);
  await expectError(
    await enter(owner.id, [owner.id, outsider.id]),
    403,
    "FORBIDDEN",
  );
  expect(await db.select().from(checkins)).toHaveLength(0);
  await expectError(
    await enter(owner.id, undefined, missingId),
    404,
    "SHELTER_NOT_FOUND",
  );
  await expectError(await leave(owner.id, missingId), 404, "CHECKIN_NOT_FOUND");
  const response = await enter(owner.id, [owner.id]);
  expect(response.status).toBe(201);
  const { items } = await response.json();
  await expectError(await leave(outsider.id, items[0].id), 403, "FORBIDDEN");
  await db.update(disasters).set({ status: "closed", endedAt: new Date() });
  await expectError(await enter(outsider.id), 409, "NO_ACTIVE_DISASTER");
});

it("returns conflict details and rolls back the other member's checkin", async () => {
  const owner = await createUser(db);
  const member = await createUser(db, { householdId: owner.householdId });
  const first = await enter(owner.id, [member.id], otherShelterId);
  expect(first.status).toBe(201);
  const { items } = await first.json();
  const [shelter] = await db
    .select()
    .from(shelters)
    .where(eq(shelters.id, otherShelterId));
  const response = await enter(owner.id, [owner.id, member.id]);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: {
      code: "ALREADY_CHECKED_IN",
      details: {
        conflicts: [
          {
            userId: member.id,
            checkinId: items[0].id,
            shelter: { id: otherShelterId, name: shelter?.name },
          },
        ],
      },
    },
  });
  expect(await db.select().from(checkins)).toEqual([
    expect.objectContaining({ id: items[0].id }),
  ]);
});

it("concurrent requests produce one checkin and one successful checkout", async () => {
  const owner = await createUser(db);
  const responses = await Promise.all([enter(owner.id), enter(owner.id)]);
  expect(responses.map(({ status }) => status)).toEqual([201, 201]);
  const [first, second] = await Promise.all(
    responses.map((response) => response.json()),
  );
  expect(first).toEqual(second);
  expect(await db.select().from(checkins)).toHaveLength(1);
  const id = first.items[0].id;
  const results = await Promise.all([leave(owner.id, id), leave(owner.id, id)]);
  expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
});

it("disaster closure waits for an in-progress checkin and checks it out", async () => {
  const owner = await createUser(db);
  const operations: Promise<unknown>[] = [];
  try {
    await db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, owner.id)).for("update");
      operations.push(
        enter(owner.id).then((response) => {
          expect(response.status).toBe(201);
        }),
      );
      await waitForBlockedQuery('insert into "checkins"%');
      operations.push(closeDisaster(SEED_IDS.disaster));
      await waitForBlockedQuery('update "disasters"%');
    });
  } finally {
    await Promise.all(operations);
  }
  const [disaster] = await db.select().from(disasters);
  expect(disaster?.status).toBe("closed");
  expect(disaster?.endedAt).toBeInstanceOf(Date);
  expect(await db.select().from(checkins)).toEqual([
    expect.objectContaining({
      userId: owner.id,
      checkedOutAt: disaster?.endedAt,
    }),
  ]);
});
