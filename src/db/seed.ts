import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { createDb } from "./client.js";
import {
  disasters,
  shelterBeacons,
  shelterSupplies,
  shelters,
  supplies,
} from "./schema.js";

/**
 * 開発・デモ用の初期データ。
 *
 * IDは固定値にして、DBを作り直してもクライアント側の設定（避難所ID、Beaconの
 * major / minor）が変わらないようにしている。何度実行しても同じ状態になる。
 * マスタ（避難所・Beacon・物資）は既存の行もこのファイルの値で上書きし、
 * 在庫と災害は操作の結果を消さないよう既存の行を上書きしない。
 *
 * iBeaconのUUIDはDBに持たず、アプリの定数とする（docs/ble-checkin.md）。
 */

export const SEED_IDS = {
  shelters: {
    elementarySchool: "01a19fe0-339a-77ad-8adf-2fd52c8110fa",
    communityCenter: "01a19fe0-339d-7651-b398-8ae97d2d07cb",
    gymnasium: "01a19fe0-339d-7651-b398-8d2c5c80f87c",
  },
  supplies: {
    water: "01a19fe0-339d-7651-b398-92922ae0a664",
    blanket: "01a19fe0-339d-7651-b398-96213c70a1a8",
    meal: "01a19fe0-339d-7651-b398-9a864c36ded3",
    toilet: "01a19fe0-339d-7651-b398-9c4255cce3eb",
  },
  disaster: "01a19fe0-339d-7651-b398-a1815a9a5e03",
} as const;

const S = SEED_IDS.shelters;
const P = SEED_IDS.supplies;

// ON CONFLICT DO UPDATE で、挿入しようとした値を参照する
const excluded = (column: string) => sql.raw(`excluded.${column}`);

const shelterRows = [
  {
    id: S.elementarySchool,
    name: "第一小学校",
    address: "○○市中央1-1-1",
    capacity: 500,
    latitude: 35.6812,
    longitude: 139.7671,
  },
  {
    id: S.communityCenter,
    name: "中央公民館",
    address: "○○市中央2-3-4",
    capacity: 120,
    latitude: 35.6852,
    longitude: 139.7528,
  },
  {
    id: S.gymnasium,
    name: "市民体育館",
    address: "○○市北町5-6-7",
    capacity: 800,
    latitude: 35.6905,
    longitude: 139.7004,
  },
];

// major = 避難所の番号、minor = 避難所内のBeacon番号
const beaconRows = [
  {
    id: "01a19fe0-4a00-7000-8000-000000000101",
    shelterId: S.elementarySchool,
    major: 1,
    minor: 1,
  },
  {
    id: "01a19fe0-4a00-7000-8000-000000000102",
    shelterId: S.elementarySchool,
    major: 1,
    minor: 2,
  },
  {
    id: "01a19fe0-4a00-7000-8000-000000000201",
    shelterId: S.communityCenter,
    major: 2,
    minor: 1,
  },
  {
    id: "01a19fe0-4a00-7000-8000-000000000301",
    shelterId: S.gymnasium,
    major: 3,
    minor: 1,
  },
];

// 1人あたりの必要量はデモ用の仮の値
const supplyRows = [
  {
    id: P.water,
    name: "水",
    unit: "bottle",
    consumptionType: "daily",
    quantityPerPerson: 3,
  },
  {
    id: P.blanket,
    name: "毛布",
    unit: "piece",
    consumptionType: "per_person",
    quantityPerPerson: 1,
  },
  {
    id: P.meal,
    name: "非常食",
    unit: "meal",
    consumptionType: "daily",
    quantityPerPerson: 3,
  },
  {
    id: P.toilet,
    name: "簡易トイレ",
    unit: "piece",
    consumptionType: "daily",
    quantityPerPerson: 5,
  },
] as const;

const stockRows = [
  { shelterId: S.elementarySchool, supplyId: P.water, quantity: 600 },
  { shelterId: S.elementarySchool, supplyId: P.blanket, quantity: 300 },
  { shelterId: S.elementarySchool, supplyId: P.meal, quantity: 900 },
  { shelterId: S.communityCenter, supplyId: P.water, quantity: 150 },
  { shelterId: S.communityCenter, supplyId: P.blanket, quantity: 80 },
  { shelterId: S.gymnasium, supplyId: P.water, quantity: 1000 },
  { shelterId: S.gymnasium, supplyId: P.meal, quantity: 1500 },
  { shelterId: S.gymnasium, supplyId: P.toilet, quantity: 200 },
];

async function main() {
  const { db, pool } = createDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(shelters)
        .values(shelterRows)
        .onConflictDoUpdate({
          target: shelters.id,
          set: {
            name: excluded("name"),
            address: excluded("address"),
            capacity: excluded("capacity"),
            latitude: excluded("latitude"),
            longitude: excluded("longitude"),
          },
        });
      await tx
        .insert(shelterBeacons)
        .values(beaconRows)
        .onConflictDoUpdate({
          target: shelterBeacons.id,
          set: {
            shelterId: excluded("shelter_id"),
            major: excluded("major"),
            minor: excluded("minor"),
          },
        });
      await tx
        .insert(supplies)
        .values([...supplyRows])
        .onConflictDoUpdate({
          target: supplies.id,
          set: {
            name: excluded("name"),
            unit: excluded("unit"),
            consumptionType: excluded("consumption_type"),
            quantityPerPerson: excluded("quantity_per_person"),
          },
        });
      await tx.insert(shelterSupplies).values(stockRows).onConflictDoNothing();

      // activeな災害がなければデモ用に1件作る。初回は固定IDで作り、
      // その災害が終了済みなら新しいIDで作る（終了済みの災害の履歴は残す）
      const active = await tx
        .select({ id: disasters.id })
        .from(disasters)
        .where(sql`${disasters.status} = 'active'`)
        .limit(1);
      if (active.length === 0) {
        const demo = { name: "デモ用災害", status: "active" as const, startedAt: new Date() };
        const created = await tx
          .insert(disasters)
          .values({ id: SEED_IDS.disaster, ...demo })
          .onConflictDoNothing()
          .returning({ id: disasters.id });
        if (created.length === 0) {
          await tx.insert(disasters).values({ id: uuidv7(), ...demo });
        }
      }
    });
    console.log("seed: done");
  } finally {
    await pool.end();
  }
}

await main();
