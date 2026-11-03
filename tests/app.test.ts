import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { openApiConfig } from "../src/openapi.js";

const USER_ID = "01a19fe0-339a-77ad-8adf-2fd52c8110fa";
const SHELTER_ID = "01a19fe0-339d-7651-b398-8ae97d2d07cb";

beforeAll(() => {
  process.env.ADMIN_TOKEN = "test-admin-token";
});

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", "X-User-Id": USER_ID },
  body: JSON.stringify(body),
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
    const res = await app.request("/api/v1/me/household/members", json({ name: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "INVALID_REQUEST", details: { issues: [{ path: "name" }] } },
    });
  });

  it("クエリの範囲外も INVALID_REQUEST", async () => {
    const res = await app.request("/api/v1/beacons/shelter?major=70000&minor=1");
    expect(res.status).toBe(400);
  });

  it("未実装のエンドポイントは NOT_IMPLEMENTED", async () => {
    const res = await app.request("/api/v1/shelters");
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_IMPLEMENTED" } });
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

  it("正しいヘッダーなら認証を通過する", async () => {
    const res = await app.request(`/api/v1/shelters/${SHELTER_ID}/checkins`, json({}));
    expect(res.status).toBe(501);
  });
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
      headers: { Authorization: "Bearer test-admin-token" },
    });
    expect(res.status).toBe(501);
  });
});
