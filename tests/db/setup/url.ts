/**
 * DBを使うテストの接続先。開発用DB（tomayaken）とは別のDBを使う。
 * テストのたびに中身を消すので、DB名が `_test` で終わらなければ実行しない。
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://tomayaken:tomayaken@localhost:5432/tomayaken_test";

export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(
      `テスト用DBの名前は _test で終わる必要があります（指定: ${name}）`,
    );
  }
  return name;
}
