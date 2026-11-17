import { afterAll, beforeEach } from "vitest";
import { closeTestDb, testDb, truncateAll } from "../helpers.js";

// テストごとに全テーブルを空にして、前のテストのデータが残らないようにする。
// 初期データが必要なテストは、テストの中で seed() を呼ぶ。
beforeEach(async () => {
  await truncateAll(testDb());
});

afterAll(async () => {
  await closeTestDb();
});
