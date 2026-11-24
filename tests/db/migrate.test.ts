import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { shelters } from "../../src/db/schema.js";
import { handler } from "../../src/migrate.js";
import { testDb } from "./helpers.js";

/** 避難所の件数（handler は接続を閉じるので、毎回 testDb() を取り直す） */
async function shelterCount() {
  const [row] = await testDb().select({ n: count() }).from(shelters);
  return row?.n;
}

describe("DB操作 Lambda（src/migrate.ts）", () => {
  it("適用済みのマイグレーションは流し直さず、seed を入れる", async () => {
    // global-setup でマイグレーション済み。各テストの前に全テーブルを空にしている
    expect(await shelterCount()).toBe(0);
    expect(await handler({})).toEqual({ migrated: true, seeded: true });
    expect(await shelterCount()).toBe(3);

    // 2回目も同じ結果になる
    expect(await handler()).toEqual({ migrated: true, seeded: true });
    expect(await shelterCount()).toBe(3);
  });

  it("seed: false ならマイグレーションだけ", async () => {
    expect(await handler({ seed: false })).toEqual({
      migrated: true,
      seeded: false,
    });
    expect(await shelterCount()).toBe(0);
  });
});
