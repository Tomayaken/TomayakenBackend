// DB 制約が「拒むもの」と「受け入れてしまうもの」を並べる
import { attempt, connect, fixture, freshDb, ID, uid } from './lib.mjs';

await freshDb();
const c = await connect();
await fixture(c);
await c.query('BEGIN');

console.log('-- DB が拒むもの');
await attempt(c, '2件目の active な災害',
  `INSERT INTO disasters (id, name, status, started_at) VALUES ($1, '災害2', 'active', now())`, [uid(2)]);
await c.query(`INSERT INTO checkins (id, disaster_id, user_id, shelter_id, checked_in_at) VALUES ($1, $2, $3, $4, now())`,
  [uid(10), ID.disaster, ID.user, ID.shelterA]);
await attempt(c, '滞在中の人を別の避難所へチェックイン',
  `INSERT INTO checkins (id, disaster_id, user_id, shelter_id, checked_in_at) VALUES ($1, $2, $3, $4, now())`,
  [uid(11), ID.disaster, ID.user, ID.shelterB]);
await attempt(c, 'マイナスの在庫',
  `INSERT INTO shelter_supplies (shelter_id, supply_id, quantity) VALUES ($1, $2, -1)`, [ID.shelterA, ID.water]);

console.log('-- DB が受け入れてしまうもの');
await attempt(c, 'closed なのに ended_at が NULL の災害',
  `INSERT INTO disasters (id, name, status, started_at) VALUES ($1, '終わった災害', 'closed', now())`, [uid(3)]);
await attempt(c, 'チェックアウトがチェックインより前',
  `UPDATE checkins SET checked_out_at = checked_in_at - interval '1 hour' WHERE id = $1`, [uid(10)]);
await attempt(c, 'closed な災害へのチェックイン',
  `INSERT INTO checkins (id, disaster_id, user_id, shelter_id, checked_in_at) VALUES ($1, $2, $3, $4, now())`,
  [uid(12), uid(3), ID.user, ID.shelterA]);
await attempt(c, '在庫を履歴なしで書き換え',
  `INSERT INTO shelter_supplies (shelter_id, supply_id, quantity) VALUES ($1, $2, 500)`, [ID.shelterA, ID.water]);
const r = await c.query(`SELECT count(*)::int AS n FROM supply_transactions`);
console.log(`在庫 500 に対する supply_transactions の行数: ${r.rows[0].n}`);

await c.query('ROLLBACK');
await c.end();
