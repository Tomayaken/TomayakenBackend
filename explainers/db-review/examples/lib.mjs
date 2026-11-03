// 実験用の使い捨てDBを作り、PR #1 のマイグレーション（0000_init.sql）をそのまま流す
import { readFileSync } from 'node:fs';
import pg from 'pg';

const BASE = 'postgresql://tomayaken:tomayaken@localhost:5432';
export const DB_NAME = 'db_review_explainer';
export const DB_URL = `${BASE}/${DB_NAME}`;
const MIGRATION = new URL('../../../src/db/migrations/0000_init.sql', import.meta.url);

export async function freshDb() {
  const admin = new pg.Client({ connectionString: `${BASE}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  const c = await connect();
  for (const stmt of readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint')) await c.query(stmt);
  await c.end();
}

export async function connect() {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

// 固定のID（読みやすさのため v7 ではない）
export const ID = {
  disaster: '00000000-0000-7000-8000-00000000d001',
  shelterA: '00000000-0000-7000-8000-00000000a001',
  shelterB: '00000000-0000-7000-8000-00000000b001',
  household: '00000000-0000-7000-8000-00000000f001',
  user: '00000000-0000-7000-8000-00000000c001',
  water: '00000000-0000-7000-8000-00000000e001',
};
export const uid = (n) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export async function fixture(c) {
  await c.query(`INSERT INTO disasters (id, name, status, started_at) VALUES ($1, '災害1', 'active', now())`, [ID.disaster]);
  await c.query(`INSERT INTO shelters (id, name, capacity) VALUES ($1, '避難所A', 100), ($2, '避難所B', 100)`, [ID.shelterA, ID.shelterB]);
  await c.query(`INSERT INTO households (id) VALUES ($1)`, [ID.household]);
  await c.query(`INSERT INTO users (id, household_id, name) VALUES ($1, $2, '利用者1')`, [ID.user, ID.household]);
  await c.query(`INSERT INTO supplies (id, name, unit) VALUES ($1, '水', 'bottle')`, [ID.water]);
}

// SQL を 1 本流し、DB が受け入れたか拒んだかを 1 行で出す
export async function attempt(c, label, sql, params = []) {
  await c.query('SAVEPOINT s');
  try {
    await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT s');
    console.log(`${label}: 受け入れた`);
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT s');
    console.log(`${label}: 拒否 ${e.code} ${e.constraint ?? ''}`.trimEnd());
  }
}
