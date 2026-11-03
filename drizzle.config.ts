import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // .env がなければ環境変数か既定値を使う
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://tomayaken:tomayaken@localhost:5432/tomayaken",
  },
  strict: true,
  verbose: true,
});
