// PR #1 のマイグレーションから外部キーを読み、図の事実シート（親->子の辺とテーブル名）を出す
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../../src/db/migrations/0000_init.sql', import.meta.url), 'utf8');
const tables = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
const edges = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" FOREIGN KEY \("\w+"\) REFERENCES "public"\."(\w+)"/g)]
  .map(([, child, parent]) => `${parent}->${child}`).sort();
console.log(JSON.stringify({ labels: tables, edges }, null, 2));
