// デモ用災害を終了したあと seed を再実行すると、active な災害は作り直されるか
import { spawnSync } from 'node:child_process';
import { connect, DB_URL, freshDb } from './lib.mjs';

const repo = new URL('../../../', import.meta.url).pathname;
const seed = () => {
  const r = spawnSync('npx', ['tsx', 'src/db/seed.ts'], { cwd: repo, env: { ...process.env, DATABASE_URL: DB_URL }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
};
const count = async (c, label) => {
  const r = await c.query(`SELECT status, count(*)::int AS n FROM disasters GROUP BY status ORDER BY status`);
  console.log(`${label}: ${r.rows.map((x) => `${x.status} ${x.n}`).join(', ') || '0 件'}`);
};

await freshDb();
const c = await connect();
seed();
await count(c, '1回目の seed');
await c.query(`UPDATE disasters SET status = 'closed', ended_at = now()`);
await count(c, 'デモ用災害を終了');
seed();
await count(c, '2回目の seed');
const s = await c.query(`SELECT (SELECT sum(quantity)::int FROM shelter_supplies) AS stock, (SELECT count(*)::int FROM supply_transactions) AS tx`);
console.log(`seed 後の在庫の合計 ${s.rows[0].stock} / supply_transactions ${s.rows[0].tx} 行`);
await c.end();
