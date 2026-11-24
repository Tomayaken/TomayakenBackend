import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import type { AuthUserRow, UserRow } from "../repositories/user-repository.js";
import * as userRepository from "../repositories/user-repository.js";

export type User = UserRow;

export type Household = {
  id: string;
  members: Pick<User, "id" | "name">[];
};

/**
 * アプリが生成したIDで利用者を登録する。すでにいれば名前だけを更新する（冪等）。
 * 新規のときは、その利用者だけの世帯も作る。
 */
export async function putUser(id: string, name: string): Promise<User> {
  return getDb().transaction(async (tx) => {
    // 2回目以降（名前の更新）がほとんどなので、まず更新を試す
    const updated = await userRepository.updateAppUserName(tx, id, name);
    if (updated) return updated;

    // 新規。同じIDで同時に登録された場合に備えて upsert にし、
    // 先を越されていた（世帯が違う）ときは、使わなかった世帯を消す
    const newHouseholdId = await userRepository.insertHousehold(tx);
    const user = await userRepository.upsertAppUser(tx, {
      id,
      name,
      householdId: newHouseholdId,
    });
    if (!user) {
      // 端末を持たない家族のID。アプリの利用者として登録・改名させない
      // （投げるとトランザクションごと取り消され、作った世帯も残らない）
      throw new AppError(
        "FORBIDDEN",
        "This ID belongs to a household member without a device.",
      );
    }
    if (user.householdId !== newHouseholdId) {
      await userRepository.deleteHousehold(tx, newHouseholdId);
    }
    return user;
  });
}

/**
 * X-User-Id として使える利用者（アプリから登録した、端末を持つ本人）を返す。
 * いない、または端末を持たない家族なら undefined（認証で使う）
 */
export async function findAppUser(id: string): Promise<User | undefined> {
  const row: AuthUserRow | undefined = await userRepository.findById(
    getDb(),
    id,
  );
  if (!row?.hasDevice) return undefined;
  return { id: row.id, name: row.name, householdId: row.householdId };
}

/** user は userAuth が読んだ、リクエストした利用者 */
export async function getHousehold(user: User): Promise<Household> {
  const members = await userRepository.findByHouseholdId(
    getDb(),
    user.householdId,
  );
  return {
    id: user.householdId,
    members: members.map(({ id, name }) => ({ id, name })),
  };
}

/** 端末を持たない家族を、リクエストした利用者と同じ世帯に追加する */
export async function addHouseholdMember(
  user: User,
  name: string,
): Promise<User> {
  return userRepository.insertMember(getDb(), {
    name,
    householdId: user.householdId,
  });
}
