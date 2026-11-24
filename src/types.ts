import type { UserRow } from "./repositories/user-repository.js";

export type AppEnv = {
  Variables: {
    // user-auth が設定する、リクエストした利用者のID
    userId: string;
    // user-auth がDBから読んだ利用者（サービスで読み直さずに使う）
    user: UserRow;
  };
};
