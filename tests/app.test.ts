import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { openApiConfig } from "../src/openapi.js";

const USER_ID = "01a19fe0-339a-77ad-8adf-2fd52c8110fa";

beforeAll(() => {
  process.env.ADMIN_TOKEN = "test-admin-token";
});

describe("OpenAPI", () => {
  it("全エンドポイントが operationId 付きで仕様に載る", () => {
    const doc = app.getOpenAPIDocument(openApiConfig);
    const ops = Object.values(doc.paths ?? {}).flatMap((path) =>
      Object.values(path as Record<string, { operationId?: string }>),
    );
    expect(ops).toHaveLength(20);
    expect(ops.every((op) => op.operationId)).toBe(true);
  });

  it("仕様のJSONとAPIドキュメントを配信する", async () => {
    expect((await app.request("/api/v1/openapi.json")).status).toBe(200);
    expect((await app.request("/api/v1/docs")).status).toBe(200);
  });
});

describe("共通のエラー形式", () => {
  it("存在しないパスは NOT_FOUND", async () => {
    const res = await app.request("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("検証エラーは INVALID_REQUEST と項目ごとの理由を返す", async () => {
    const res = await app.request(`/api/v1/users/${USER_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        details: { issues: [{ path: "name" }] },
      },
    });
  });

  it("クエリの範囲外も INVALID_REQUEST", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=91&longitude=139.7",
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        details: { issues: [{ path: "latitude" }] },
      },
    });
  });

  it("パスのIDがUUIDでなければ、DBに問い合わせる前に INVALID_REQUEST", async () => {
    const res = await app.request("/api/v1/shelters/not-a-uuid");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("未実装のエンドポイントは NOT_IMPLEMENTED", async () => {
    const res = await app.request(`/api/v1/shelters/${SHELTER_ID}/supplies`);
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({
      error: { code: "NOT_IMPLEMENTED" },
    });
  });
});

describe("近くの避難所（GET /shelters/nearby）", () => {
  it("緯度・経度が空なら INVALID_REQUEST（0 とみなさない）", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=&longitude=",
    );
    expect(res.status).toBe(400);
  });

  it("緯度・経度が数値でなければ INVALID_REQUEST", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=abc&longitude=139.76",
    );
    expect(res.status).toBe(400);
  });

  it("現在地がなければ INVALID_REQUEST", async () => {
    const res = await app.request("/api/v1/shelters/nearby");
    expect(res.status).toBe(400);
  });

  it("limit が上限を超えれば INVALID_REQUEST", async () => {
    const res = await app.request(
      "/api/v1/shelters/nearby?latitude=35.68&longitude=139.76&limit=21",
    );
    expect(res.status).toBe(400);
  });
});

describe("利用者の認証（X-User-Id）", () => {
  it("ヘッダーがなければ UNAUTHORIZED", async () => {
    const res = await app.request("/api/v1/me/checkins");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("UUIDでなければ UNAUTHORIZED", async () => {
    const res = await app.request("/api/v1/me/checkins", {
      headers: { "X-User-Id": "not-a-uuid" },
    });
    expect(res.status).toBe(401);
  });

  // 登録済みかどうかの確認はDBを使うので tests/db/users.test.ts で確かめる
});

describe("管理者の認証（Bearer）", () => {
  it("トークンがなければ UNAUTHORIZED", async () => {
    const res = await app.request("/api/v1/admin/disasters");
    expect(res.status).toBe(401);
  });

  it("トークンが違えば UNAUTHORIZED", async () => {
    const res = await app.request("/api/v1/admin/disasters", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("正しいトークンなら認証を通過する", async () => {
    const res = await app.request("/api/v1/admin/disasters", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: " " }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });
});
