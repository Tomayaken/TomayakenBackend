import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import * as checkinRepository from "../repositories/checkin-repository.js";
import * as shelterRepository from "../repositories/shelter-repository.js";

/** 日時を API の形式（ISO 文字列）にする。チェックインを返す関数はすべてこれを通す */
function toCheckin<T extends { checkedInAt: Date; checkedOutAt: Date | null }>(
  row: T,
) {
  return {
    ...row,
    checkedInAt: row.checkedInAt.toISOString(),
    checkedOutAt: row.checkedOutAt?.toISOString() ?? null,
  };
}

/**
 * 管理画面の避難者一覧。activeな災害のチェックインだけを返す。
 * activeな災害がなければ空の一覧を返す（エラーにはしない）。
 */
export async function listShelterCheckins(
  shelterId: string,
  { activeOnly }: { activeOnly: boolean },
) {
  const db = getDb();
  if (!(await shelterRepository.existsById(db, shelterId))) {
    throw new AppError("SHELTER_NOT_FOUND");
  }
  const rows = await checkinRepository.findByShelterInActiveDisaster(
    db,
    shelterId,
    { activeOnly },
  );
  return rows.map(toCheckin);
}

/** 管理画面からの代理チェックアウト。世帯の制約はない */
export async function proxyCheckout(checkinId: string) {
  const db = getDb();
  const row = await checkinRepository.markCheckedOut(db, checkinId, new Date());
  if (row) return toCheckin(row);

  const existing = await checkinRepository.findById(db, checkinId);
  throw new AppError(existing ? "NOT_CHECKED_IN" : "CHECKIN_NOT_FOUND");
}
