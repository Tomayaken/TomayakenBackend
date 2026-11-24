import { getDb } from "../db/client.js";
import { AppError } from "../errors/app-error.js";
import type { UserRow } from "../repositories/user-repository.js";
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
    // 新規かどうかを先に調べず、世帯を作ってから upsert する。
    // 既存の利用者だった（同時に登録された場合も含む）ときは、使わなかった世帯を消す
    const newHouseholdId = await userRepository.insertHousehold(tx);
    const user = await userRepository.upsertName(tx, {
      id,
      name,
      householdId: newHouseholdId,
    });
    if (user.householdId !== newHouseholdId) {
      await userRepository.deleteHousehold(tx, newHouseholdId);
    }
    return user;
  });
}

/** 登録済みの利用者を返す。いなければ undefined（認証で使う） */
export async function findUser(id: string): Promise<User | undefined> {
  return userRepository.findById(getDb(), id);
}

async function requireUser(id: string): Promise<User> {
  const user = await findUser(id);
  // userAuth を通っていれば存在するはずだが、その間に消された場合に備える
  if (!user) throw new AppError("UNAUTHORIZED");
  return user;
}

export async function getHousehold(userId: string): Promise<Household> {
  const user = await requireUser(userId);
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
  userId: string,
  name: string,
): Promise<User> {
  const user = await requireUser(userId);
  return userRepository.insert(getDb(), {
    name,
    householdId: user.householdId,
  });
}
