# DB設計

- DB: PostgreSQL
- ORM / マイグレーション: Drizzle ORM / drizzle-kit
- スキーマ: `src/db/schema.ts`、マイグレーション: `src/db/migrations/`、初期データ: `src/db/seed.ts`

## 共通ルール

- 主キーは **UUID v7**（アプリ側で生成）。型は `uuid`。
- カラム名は snake_case。APIのcamelCaseへの変換はRepositoryで行う。
- 日時は `timestamptz`。
- `created_at` / `updated_at` はDBのデフォルト `now()` を使う。

## ER図

```text
households ──< users ──< checkins >── shelters ──< shelter_beacons
                            │            │
disasters ──────────────────┘            ├──< shelter_supplies >── supplies
    │                                    │                            │
    └───────────────────────< supply_transactions >───────────────────┘
```

## disasters

災害（＝避難所の開設期間）。同時にactiveにできるのは1件まで。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| name | text | NOT NULL | 例: 「2026年11月 ○○地震」 |
| status | text | NOT NULL, `active` / `closed` | |
| started_at | timestamptz | NOT NULL | |
| ended_at | timestamptz | NULL可 | closed時に設定 |
| created_at | timestamptz | NOT NULL | |

- 部分ユニークインデックス: `UNIQUE (status) WHERE status = 'active'`（activeは1件まで）
- 終了時は滞在中のチェックインをすべて `ended_at` でチェックアウトする（[トランザクション](#災害の終了)）。

## shelters

避難所。災害をまたいで使い回す。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| name | text | NOT NULL | |
| address | text | NULL可 | |
| capacity | integer | NOT NULL, >= 0 | 収容人数 |
| latitude | double precision | NULL可 | |
| longitude | double precision | NULL可 | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

現在人数（`currentOccupancy`）はカラムに持たず、`checkins` の滞在中レコード数から求める。

## shelter_beacons

BLE Beacon（iBeacon）と避難所の対応。1避難所に複数Beaconを置ける。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| shelter_id | uuid | FK → shelters.id, NOT NULL | |
| major | integer | NOT NULL, 0〜65535 | |
| minor | integer | NOT NULL, 0〜65535 | |
| created_at | timestamptz | NOT NULL | |

- ユニーク制約: `(major, minor)`
- iBeaconのUUIDはシステム共通の1つとし、DBには持たない（アプリの定数）。

## households

世帯。住民票の「世帯」に対応させる想定。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| resident_registry_ref | text | NULL可 | 将来、住民票の世帯情報と紐づけるための参照（現段階は未使用） |
| created_at | timestamptz | NOT NULL | |

## users

避難者・利用者。災害をまたいで使い回す。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | アプリ利用者はアプリが生成したUUID。世帯メンバー・代理登録はサーバーが生成 |
| household_id | uuid | FK → households.id, NOT NULL | |
| name | text | NOT NULL | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

- アプリ利用者が初めて登録されたとき、その人だけの世帯を同時に作る。
- 端末を持たない家族は同じ `household_id` のユーザーとして追加する。
- 同じ世帯のメンバーは互いにチェックイン・チェックアウトできる（上下関係はない）。
- 将来追加しうる項目: `age_group`, `special_notes`, `emergency_contact`

## checkins

避難履歴。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| disaster_id | uuid | FK → disasters.id, NOT NULL | チェックイン時点のactive災害 |
| user_id | uuid | FK → users.id, NOT NULL | |
| shelter_id | uuid | FK → shelters.id, NOT NULL | |
| checked_in_at | timestamptz | NOT NULL | |
| checked_out_at | timestamptz | NULL可 | NULLのレコードを現在の滞在として扱う |
| created_at | timestamptz | NOT NULL | |

- 部分ユニークインデックス: `UNIQUE (user_id) WHERE checked_out_at IS NULL`
  - 同時に複数の避難所へ滞在できないようにする制約を、DBにも持たせる。検証はServiceで行うのが基本で、このインデックスはServiceの検証が漏れたときに重複を防ぐ。
- インデックス: `(shelter_id) WHERE checked_out_at IS NULL`（現在人数の集計用）

## supplies

物資の種類（マスタ）。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| name | text | NOT NULL | |
| unit | text | NOT NULL | 単位 |
| created_at | timestamptz | NOT NULL | |

データの例は次のとおり。

| name | unit |
| --- | --- |
| 水 | bottle |
| 毛布 | piece |
| 非常食 | meal |

## shelter_supplies

避難所ごとの現在在庫。物理的な現物の量なので、災害ごとには分けない。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| shelter_id | uuid | PK, FK → shelters.id | |
| supply_id | uuid | PK, FK → supplies.id | |
| quantity | integer | NOT NULL, CHECK (quantity >= 0) | |
| updated_at | timestamptz | NOT NULL | |

- 複合主キー: `(shelter_id, supply_id)`
- 行がない組み合わせは在庫0として扱う。初回入庫時に行を作成する。

## supply_transactions

物資の増減履歴。現在量だけでなく経緯を残す。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| disaster_id | uuid | FK → disasters.id, NULL可 | 操作時点のactive災害。平時の備蓄入庫ではNULL |
| shelter_id | uuid | FK → shelters.id, NOT NULL | |
| supply_id | uuid | FK → supplies.id, NOT NULL | |
| type | text | NOT NULL, `IN` / `OUT` | 入庫 / 配布 |
| quantity | integer | NOT NULL, CHECK (quantity > 0) | |
| operator_name | text | NULL可 | 管理画面で入力された運営者名（自己申告） |
| note | text | NULL可 | |
| created_at | timestamptz | NOT NULL | |

```text
水 100本 入庫
↓
20本 配布
↓
10本 配布
```

## トランザクション

### 物資の入庫・配布

```text
BEGIN
  shelter_supplies を SELECT ... FOR UPDATE（入庫で行がなければ INSERT）
  配布の場合: quantity < 要求数 なら INSUFFICIENT_SUPPLY でROLLBACK
  shelter_supplies UPDATE
  supply_transactions INSERT
COMMIT
```

### 世帯まとめてチェックイン

```text
BEGIN
  対象ユーザー全員の滞在中checkinを確認
    - 同じ避難所に滞在中のユーザー → 既存レコードを返す（冪等）
    - 別の避難所に滞在中のユーザーが1人でもいる → ALREADY_CHECKED_IN でROLLBACK
  残りのユーザー分の checkins INSERT
COMMIT
```

### 災害の終了

```text
BEGIN
  disasters UPDATE status = 'closed', ended_at = now()
  checkins UPDATE checked_out_at = ended_at
    WHERE disaster_id = :id AND checked_out_at IS NULL
COMMIT
```
