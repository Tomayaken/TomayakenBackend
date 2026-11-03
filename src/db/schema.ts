import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// 詳細は docs/database.md を参照

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const DISASTER_STATUSES = ["active", "closed"] as const;
export const SUPPLY_TRANSACTION_TYPES = ["IN", "OUT"] as const;
export const CONSUMPTION_TYPES = ["daily", "per_person"] as const;

export const disasters = pgTable(
  "disasters",
  {
    id: id(),
    name: text("name").notNull(),
    status: text("status", { enum: DISASTER_STATUSES }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("disasters_status_check", sql`${t.status} in ('active', 'closed')`),
    // activeな災害は同時に1件まで
    uniqueIndex("disasters_single_active_idx")
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const shelters = pgTable(
  "shelters",
  {
    id: id(),
    name: text("name").notNull(),
    address: text("address"),
    capacity: integer("capacity").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("shelters_capacity_check", sql`${t.capacity} >= 0`)],
);

export const shelterBeacons = pgTable(
  "shelter_beacons",
  {
    id: id(),
    shelterId: uuid("shelter_id")
      .notNull()
      .references(() => shelters.id),
    major: integer("major").notNull(),
    minor: integer("minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("shelter_beacons_major_minor_idx").on(t.major, t.minor),
    index("shelter_beacons_shelter_id_idx").on(t.shelterId),
    check("shelter_beacons_major_check", sql`${t.major} between 0 and 65535`),
    check("shelter_beacons_minor_check", sql`${t.minor} between 0 and 65535`),
  ],
);

export const households = pgTable("households", {
  id: id(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    // アプリ利用者はアプリが生成したUUID、世帯メンバー・代理登録はサーバーが生成
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("users_household_id_idx").on(t.householdId)],
);

export const checkins = pgTable(
  "checkins",
  {
    id: id(),
    disasterId: uuid("disaster_id")
      .notNull()
      .references(() => disasters.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    shelterId: uuid("shelter_id")
      .notNull()
      .references(() => shelters.id),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull(),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // 同時に複数の避難所へ滞在できない
    uniqueIndex("checkins_single_active_per_user_idx")
      .on(t.userId)
      .where(sql`${t.checkedOutAt} is null`),
    // 現在人数の集計用
    index("checkins_active_by_shelter_idx")
      .on(t.shelterId)
      .where(sql`${t.checkedOutAt} is null`),
    index("checkins_disaster_id_idx").on(t.disasterId),
  ],
);

export const supplies = pgTable(
  "supplies",
  {
    id: id(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    // daily: 1人1日あたり quantity_per_person 消費する（水・食料など）
    // per_person: 1人あたり quantity_per_person あればよい（毛布など）
    consumptionType: text("consumption_type", { enum: CONSUMPTION_TYPES })
      .notNull()
      .default("daily"),
    quantityPerPerson: doublePrecision("quantity_per_person")
      .notNull()
      .default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "supplies_consumption_type_check",
      sql`${t.consumptionType} in ('daily', 'per_person')`,
    ),
    check(
      "supplies_quantity_per_person_check",
      sql`${t.quantityPerPerson} >= 0`,
    ),
  ],
);

export const shelterSupplies = pgTable(
  "shelter_supplies",
  {
    shelterId: uuid("shelter_id")
      .notNull()
      .references(() => shelters.id),
    supplyId: uuid("supply_id")
      .notNull()
      .references(() => supplies.id),
    quantity: integer("quantity").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.shelterId, t.supplyId] }),
    check("shelter_supplies_quantity_check", sql`${t.quantity} >= 0`),
  ],
);

export const supplyTransactions = pgTable(
  "supply_transactions",
  {
    id: id(),
    // 平時の備蓄入庫ではNULL
    disasterId: uuid("disaster_id").references(() => disasters.id),
    shelterId: uuid("shelter_id")
      .notNull()
      .references(() => shelters.id),
    supplyId: uuid("supply_id")
      .notNull()
      .references(() => supplies.id),
    type: text("type", { enum: SUPPLY_TRANSACTION_TYPES }).notNull(),
    quantity: integer("quantity").notNull(),
    operatorName: text("operator_name"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    check("supply_transactions_type_check", sql`${t.type} in ('IN', 'OUT')`),
    check("supply_transactions_quantity_check", sql`${t.quantity} > 0`),
    index("supply_transactions_shelter_created_idx").on(
      t.shelterId,
      t.createdAt,
    ),
  ],
);

// 到着予測に使う位置の履歴（docs/arrival-forecast.md）。
// 直近の一定時間（60分の案）だけ保持し、古い点は受信時に削除する。
// 偽装された位置（isMocked）や精度の悪い点は受信時に捨て、保存しない。
export const userLocationPoints = pgTable(
  "user_location_points",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    // 水平精度（m）
    accuracy: doublePrecision("accuracy").notNull(),
    // OSが算出した速さ（m/s）と進行方向（度）。取れなければNULL
    speed: doublePrecision("speed"),
    heading: doublePrecision("heading"),
    // 端末で測位した時刻
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_location_points_user_recorded_idx").on(
      t.userId,
      t.recordedAt,
    ),
    check(
      "user_location_points_latitude_check",
      sql`${t.latitude} between -90 and 90`,
    ),
    check(
      "user_location_points_longitude_check",
      sql`${t.longitude} between -180 and 180`,
    ),
    check("user_location_points_accuracy_check", sql`${t.accuracy} >= 0`),
    check(
      "user_location_points_speed_check",
      sql`${t.speed} is null or ${t.speed} >= 0`,
    ),
    check(
      "user_location_points_heading_check",
      sql`${t.heading} is null or (${t.heading} >= 0 and ${t.heading} < 360)`,
    ),
  ],
);
