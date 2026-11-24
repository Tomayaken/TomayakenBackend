import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { households, users } from "../../src/db/schema.js";
import * as userService from "../../src/services/user-service.js";
import { createUser } from "./fixtures.js";
import { testDb } from "./helpers.js";

const db = testDb();
const USER_ID = "01a19fe0-339a-77ad-8adf-2fd52c8110fa";
const UNREGISTERED_ID = "01a19fe0-0000-7000-8000-000000000000";

async function countRows() {
  const [h] = await db.select({ n: count() }).from(households);
  const [u] = await db.select({ n: count() }).from(users);
  return { households: h?.n, users: u?.n };
}

function putUser(userId: string, name: string) {
  return app.request(`/api/v1/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

function asUser(userId: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
      ...init.headers,
    },
  };
}

describe("userService.putUser", () => {
  it("初回はその利用者だけの世帯を作る", async () => {
    const user = await userService.putUser(USER_ID, "山田太郎");
    expect(user).toMatchObject({ id: USER_ID, name: "山田太郎" });
    expect(await countRows()).toEqual({ households: 1, users: 1 });
    expect((await userService.getHousehold(user)).members).toEqual([
      { id: USER_ID, name: "山田太郎" },
    ]);
  });

  it("2回目は名前だけを更新し、世帯は変えない（使わない世帯も残さない）", async () => {
    const first = await userService.putUser(USER_ID, "山田太郎");
    const second = await userService.putUser(USER_ID, "山田 太郎");
    expect(second).toEqual({
      id: USER_ID,
      name: "山田 太郎",
      householdId: first.householdId,
    });
    expect(await countRows()).toEqual({ households: 1, users: 1 });
  });

  it("端末を持たない家族のIDは FORBIDDEN で、名前も世帯も変えない", async () => {
    const me = await userService.putUser(USER_ID, "山田太郎");
    const member = await userService.addHouseholdMember(me, "山田花子");

    await expect(userService.putUser(member.id, "偽名")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect((await userService.getHousehold(me)).members).toEqual([
      { id: USER_ID, name: "山田太郎" },
      { id: member.id, name: "山田花子" },
    ]);
    expect(await countRows()).toEqual({ households: 1, users: 2 });
  });

  it("同じIDで同時に登録しても、利用者と世帯は1つずつ", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        userService.putUser(USER_ID, `名前${i}`),
      ),
    );
    expect(new Set(results.map((u) => u.householdId)).size).toBe(1);
    expect(await countRows()).toEqual({ households: 1, users: 1 });
  });
});

describe("userService の世帯", () => {
  it("家族を追加すると、同じ世帯のメンバーとして登録順に返る", async () => {
    const me = await userService.putUser(USER_ID, "山田太郎");
    const member = await userService.addHouseholdMember(me, "山田花子");
    expect(member).toMatchObject({
      name: "山田花子",
      householdId: me.householdId,
    });
    expect(member.id).not.toBe(USER_ID);

    // 別の世帯の人は含まれない
    await createUser(db, { name: "別の世帯" });

    expect(await userService.getHousehold(me)).toEqual({
      id: me.householdId,
      members: [
        { id: USER_ID, name: "山田太郎" },
        { id: member.id, name: "山田花子" },
      ],
    });
  });
});

describe("PUT /api/v1/users/:userId", () => {
  it("X-User-Id なしで登録でき、登録後の利用者を返す", async () => {
    const res = await putUser(USER_ID, "  山田太郎  ");
    expect(res.status).toBe(200);
    // 内部の項目（hasDevice）は返さない
    expect(Object.keys((await res.json()) as object).sort()).toEqual([
      "householdId",
      "id",
      "name",
    ]);
  });

  it("端末を持たない家族のIDなら 403 FORBIDDEN", async () => {
    const me = await userService.putUser(USER_ID, "山田太郎");
    const member = await userService.addHouseholdMember(me, "山田花子");
    const res = await putUser(member.id, "偽名");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});

describe("世帯の API（登録 → 家族の追加 → 世帯の取得）", () => {
  it("一連で動く", async () => {
    await putUser(USER_ID, "山田太郎");

    const added = await app.request(
      "/api/v1/me/household/members",
      asUser(USER_ID, {
        method: "POST",
        body: JSON.stringify({ name: "山田花子" }),
      }),
    );
    expect(added.status).toBe(201);
    const member = (await added.json()) as { id: string; householdId: string };

    const res = await app.request("/api/v1/me/household", asUser(USER_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: member.householdId,
      members: [
        { id: USER_ID, name: "山田太郎" },
        { id: member.id, name: "山田花子" },
      ],
    });
  });

  it("家族の名前が空なら INVALID_REQUEST", async () => {
    await putUser(USER_ID, "山田太郎");
    const res = await app.request(
      "/api/v1/me/household/members",
      asUser(USER_ID, { method: "POST", body: JSON.stringify({ name: " " }) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("利用者の認証（X-User-Id）", () => {
  it("未登録のIDなら UNAUTHORIZED", async () => {
    const res = await app.request(
      "/api/v1/me/household",
      asUser(UNREGISTERED_ID),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("端末を持たない家族のIDなら UNAUTHORIZED", async () => {
    const me = await userService.putUser(USER_ID, "山田太郎");
    const member = await userService.addHouseholdMember(me, "山田花子");
    const res = await app.request("/api/v1/me/household", asUser(member.id));
    expect(res.status).toBe(401);
  });

  it("登録済みのIDなら認証を通過する", async () => {
    await putUser(USER_ID, "山田太郎");
    const res = await app.request("/api/v1/me/household", asUser(USER_ID));
    expect(res.status).toBe(200);
  });
});
