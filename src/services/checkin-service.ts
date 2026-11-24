import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import * as checkinRepository from "../repositories/checkin-repository.js";
import * as disasterRepository from "../repositories/disaster-repository.js";
import * as shelterRepository from "../repositories/shelter-repository.js";
import * as userRepository from "../repositories/user-repository.js";

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

export function checkIn(
  user: userRepository.UserRow,
  shelterId: string,
  userIds = [user.id],
) {
  const ids = [...new Set(userIds.map((id) => id.toLowerCase()))];
  return getDb().transaction(async (tx) => {
    const members = await userRepository.findByHouseholdId(
      tx,
      user.householdId,
    );
    const memberIds = new Set(members.map((member) => member.id));
    if (ids.some((id) => !memberIds.has(id))) throw new AppError("FORBIDDEN");
    if (!(await shelterRepository.existsById(tx, shelterId))) {
      throw new AppError("SHELTER_NOT_FOUND");
    }
    const disaster = await disasterRepository.findActive(tx, "share");
    if (!disaster) throw new AppError("NO_ACTIVE_DISASTER");

    const conflicts: {
      userId: string;
      checkinId: string;
      shelter: { id: string; name: string };
    }[] = [];
    const rows = new Map<string, checkinRepository.CheckinRow>();
    for (const userId of [...ids].sort()) {
      while (!rows.has(userId)) {
        const [existing] = await checkinRepository.findActiveByUsers(
          tx,
          [userId],
          "update",
        );
        if (existing) {
          const { shelterName, ...row } = existing;
          if (row.shelterId !== shelterId.toLowerCase()) {
            conflicts.push({
              userId,
              checkinId: row.id,
              shelter: { id: row.shelterId, name: shelterName },
            });
          }
          rows.set(userId, row);
        } else {
          const row = await checkinRepository.insertIfAbsent(tx, {
            userId,
            shelterId,
            disasterId: disaster.id,
          });
          if (row) rows.set(userId, row);
        }
      }
    }
    if (conflicts.length) {
      throw new AppError("ALREADY_CHECKED_IN", undefined, { conflicts });
    }
    return {
      items: ids.map((id) => {
        const row = rows.get(id);
        if (!row) throw new Error("Missing check-in result");
        return toCheckin(row);
      }),
    };
  });
}

export async function checkOut(
  user: userRepository.UserRow,
  checkinId: string,
) {
  const db = getDb();
  const existing = await checkinRepository.findById(db, checkinId);
  if (!existing) throw new AppError("CHECKIN_NOT_FOUND");
  const member = await userRepository.findById(db, existing.userId);
  if (member?.householdId !== user.householdId) throw new AppError("FORBIDDEN");
  return proxyCheckout(checkinId);
}

export async function getMyCheckins(user: userRepository.UserRow) {
  const db = getDb();
  const members = await userRepository.findByHouseholdId(db, user.householdId);
  const rows = await checkinRepository.findActiveByUsers(
    db,
    members.map((member) => member.id),
  );
  const byUser = new Map(rows.map((row) => [row.userId, row]));
  return {
    items: members.map(({ id, name }) => {
      const row = byUser.get(id);
      return {
        user: { id, name },
        checkin: row
          ? {
              id: row.id,
              shelter: { id: row.shelterId, name: row.shelterName },
              checkedInAt: row.checkedInAt.toISOString(),
            }
          : null,
      };
    }),
  };
}
