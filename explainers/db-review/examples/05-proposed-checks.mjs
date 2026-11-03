// レビューで提案する CHECK 制約を足すと、01 で受け入れてしまった行を拒めるか
import { attempt, connect, fixture, freshDb, ID, uid } from './lib.mjs';

await freshDb();
const c = await connect();
await fixture(c);
await c.query(`ALTER TABLE disasters ADD CONSTRAINT disasters_ended_at_check
  CHECK ((status = 'active' AND ended_at IS NULL) OR (status = 'closed' AND ended_at IS NOT NULL))`);
await c.query(`ALTER TABLE checkins ADD CONSTRAINT checkins_period_check
  CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at)`);
await c.query(`INSERT INTO checkins (id, disaster_id, user_id, shelter_id, checked_in_at) VALUES ($1, $2, $3, $4, now())`,
  [uid(10), ID.disaster, ID.user, ID.shelterA]);
await c.query('BEGIN');
await attempt(c, 'closed なのに ended_at が NULL の災害',
  `INSERT INTO disasters (id, name, status, started_at) VALUES ($1, '終わった災害', 'closed', now())`, [uid(3)]);
await attempt(c, 'チェックアウトがチェックインより前',
  `UPDATE checkins SET checked_out_at = checked_in_at - interval '1 hour' WHERE id = $1`, [uid(10)]);
await attempt(c, '正しい終了（closed + ended_at）',
  `UPDATE disasters SET status = 'closed', ended_at = now() WHERE id = $1`, [ID.disaster]);
await c.query('ROLLBACK');
await c.end();
