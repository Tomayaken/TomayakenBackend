// 「災害の終了」と「チェックイン」が同時に走ると、閉じた災害に滞在中のチェックインが残るか
import { connect, fixture, freshDb, ID } from './lib.mjs';

async function run(label, lockDisaster) {
  await freshDb();
  const setup = await connect();
  await fixture(setup);
  await setup.end();
  const checkin = await connect();
  const close = await connect();

  // チェックイン側: active な災害を読む（docs/database.md の手順どおり）
  await checkin.query('BEGIN');
  const { rows } = await checkin.query(
    `SELECT id FROM disasters WHERE status = 'active'${lockDisaster ? ' FOR SHARE' : ''}`);
  const disasterId = rows[0].id;

  // その間に、管理画面が災害を終了する
  const closing = (async () => {
    await close.query('BEGIN');
    await close.query(`UPDATE disasters SET status = 'closed', ended_at = now() WHERE id = $1`, [ID.disaster]);
    await close.query(`UPDATE checkins SET checked_out_at = now() WHERE disaster_id = $1 AND checked_out_at IS NULL`, [ID.disaster]);
    await close.query('COMMIT');
  })();
  await new Promise((r) => setTimeout(r, 300)); // 終了側が先に進む時間を与える

  // チェックイン側: 読んだ災害IDで INSERT して COMMIT
  await checkin.query(
    `INSERT INTO checkins (id, disaster_id, user_id, shelter_id, checked_in_at) VALUES (gen_random_uuid(), $1, $2, $3, now())`,
    [disasterId, ID.user, ID.shelterA]);
  await checkin.query('COMMIT');
  await closing;

  const r = await checkin.query(`
    SELECT count(*)::int AS n FROM checkins c JOIN disasters d ON d.id = c.disaster_id
    WHERE d.status = 'closed' AND c.checked_out_at IS NULL`);
  console.log(`${label}: closed な災害に残った滞在中チェックイン ${r.rows[0].n} 件`);
  await checkin.end();
  await close.end();
}

await run('災害の行をロックしない（修正前の手順）', false);
await run('災害の行を FOR SHARE で読む', true);
