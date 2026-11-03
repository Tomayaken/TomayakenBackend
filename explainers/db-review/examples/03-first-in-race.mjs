// 在庫の行がまだない物資に、2人が同時に初回の入庫をするとどうなるか
import { connect, fixture, freshDb, ID } from './lib.mjs';

async function receive(c, qty, upsert) {
  if (upsert) {
    // 行を先に作ってからロックする
    await c.query(`INSERT INTO shelter_supplies (shelter_id, supply_id, quantity) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`, [ID.shelterA, ID.water]);
    await c.query(`SELECT quantity FROM shelter_supplies WHERE shelter_id = $1 AND supply_id = $2 FOR UPDATE`, [ID.shelterA, ID.water]);
    await c.query(`UPDATE shelter_supplies SET quantity = quantity + $3 WHERE shelter_id = $1 AND supply_id = $2`, [ID.shelterA, ID.water, qty]);
  } else {
    // docs/database.md の手順: SELECT ... FOR UPDATE、行がなければ INSERT
    const { rowCount } = await c.query(`SELECT quantity FROM shelter_supplies WHERE shelter_id = $1 AND supply_id = $2 FOR UPDATE`, [ID.shelterA, ID.water]);
    if (rowCount === 0) await c.query(`INSERT INTO shelter_supplies (shelter_id, supply_id, quantity) VALUES ($1, $2, $3)`, [ID.shelterA, ID.water, qty]);
    else await c.query(`UPDATE shelter_supplies SET quantity = quantity + $3 WHERE shelter_id = $1 AND supply_id = $2`, [ID.shelterA, ID.water, qty]);
  }
  await c.query(`INSERT INTO supply_transactions (id, shelter_id, supply_id, type, quantity) VALUES (gen_random_uuid(), $1, $2, 'IN', $3)`, [ID.shelterA, ID.water, qty]);
}

async function run(label, upsert) {
  await freshDb();
  const setup = await connect();
  await fixture(setup);
  await setup.end();
  const a = await connect();
  const b = await connect();
  await a.query('BEGIN');
  await b.query('BEGIN');
  await receive(a, 100, upsert); // A はまだ COMMIT していない
  const bDone = receive(b, 50, upsert).then(() => b.query('COMMIT')).then(() => 'COMMIT', (e) => `エラー ${e.code} ${e.constraint ?? ''}`.trimEnd());
  await new Promise((r) => setTimeout(r, 300));
  await a.query('COMMIT');
  const bResult = await bDone;
  if (bResult !== 'COMMIT') await b.query('ROLLBACK');
  const r = await a.query(`SELECT quantity FROM shelter_supplies`);
  console.log(`${label}: 2人目の入庫 → ${bResult} / 在庫 ${r.rows[0].quantity}`);
  await a.end();
  await b.end();
}

await run('SELECT FOR UPDATE → なければ INSERT（修正前の手順）', false);
await run('INSERT ON CONFLICT DO NOTHING → SELECT FOR UPDATE', true);
