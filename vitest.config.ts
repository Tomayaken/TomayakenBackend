import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/db/setup/url.js";

export default defineConfig({
  test: {
    projects: [
      {
        // DBを使わないテスト（app.request() でのルートの確認など）
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/db/**"],
        },
      },
      {
        // DockerのPostgreSQLに実際につなぐテスト（npm run db:up が必要）
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          globalSetup: ["tests/db/setup/global-setup.ts"],
          setupFiles: ["tests/db/setup/each.ts"],
          env: { DATABASE_URL: TEST_DATABASE_URL },
          // 1つのテスト用DBを共有し、テストごとに空にするので、ファイルを並列に流さない
          fileParallelism: false,
        },
      },
    ],
  },
});
