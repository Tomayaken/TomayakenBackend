# API設計

詳細なリクエスト/レスポンスのスキーマは、`@hono/zod-openapi` が生成する OpenAPI（`GET /api/v1/openapi.json`）を正とする。本書は概要と設計意図を記述する。

## 共通ルール

| 項目 | ルール |
| --- | --- |
| Prefix | `/api/v1` |
| 形式 | JSON（`Content-Type: application/json`） |
| キー | camelCase |
| ID | UUID v7 文字列 |
| 日時 | ISO 8601（オフセット付き） 例: `2026-11-03T13:30:00+09:00` |
| 一覧 | 配列を直接返さず `{ "items": [...] }` で包む |
| ページング | なし（デモ規模） |

## 認証区分

| 区分 | ヘッダー | 失敗時 |
| --- | --- | --- |
| 公開 | なし | — |
| 利用者 | `X-User-Id: <userId>` | ヘッダーなし・存在しないユーザー → `401 UNAUTHORIZED` |
| 管理者 | `Authorization: Bearer <ADMIN_TOKEN>` | トークン不一致 → `401 UNAUTHORIZED` |

管理者APIはすべて `/api/v1/admin/` 配下に置き、middlewareをパス単位で適用する。

## エンドポイント一覧

利用欄の `App` は利用者アプリ（Flutter）、`Admin` は管理画面（React）を表す。

### 公開

| Method | Path | 概要 | 利用 |
| --- | --- | --- | --- |
| GET | `/shelters` | 避難所一覧 | App, Admin |
| GET | `/shelters/:shelterId` | 避難所詳細 | App, Admin |
| GET | `/beacons/shelter?major=&minor=` | Beaconから避難所を取得 | App |
| GET | `/disasters/active` | activeな災害 | App, Admin |
| GET | `/shelters/:shelterId/supplies` | 物資の在庫一覧 | App, Admin |
| GET | `/openapi.json` | API仕様 | 開発用 |

### 利用者（`X-User-Id`）

| Method | Path | 概要 | 利用 |
| --- | --- | --- | --- |
| PUT | `/users/:userId` | 利用者登録・名前更新（※`X-User-Id`不要） | App |
| GET | `/me/household` | 自分の世帯とメンバー | App |
| POST | `/me/household/members` | 端末を持たない家族を世帯に追加 | App |
| GET | `/me/checkins` | 世帯メンバー全員の現在のチェックイン状態 | App |
| POST | `/shelters/:shelterId/checkins` | チェックイン（世帯まとめて可） | App |
| POST | `/checkins/:checkinId/checkout` | チェックアウト（世帯メンバー分も可） | App |

### 管理者（`Authorization: Bearer`）

| Method | Path | 概要 | 利用 |
| --- | --- | --- | --- |
| GET | `/admin/shelters/:shelterId/checkins` | 避難者一覧 | Admin |
| POST | `/admin/shelters/:shelterId/checkins` | 代理チェックイン（優先度低） | Admin |
| POST | `/admin/checkins/:checkinId/checkout` | 代理チェックアウト | Admin |
| POST | `/admin/shelters/:shelterId/supplies/:supplyId/in` | 入庫 | Admin |
| POST | `/admin/shelters/:shelterId/supplies/:supplyId/out` | 配布 | Admin |
| GET | `/admin/shelters/:shelterId/supply-transactions` | 物資の入出庫履歴 | Admin |
| GET | `/admin/disasters` | 災害一覧（過去分を含む） | Admin |
| POST | `/admin/disasters` | 災害を開始 | Admin |
| POST | `/admin/disasters/:disasterId/close` | 災害を終了 | Admin |

以下、パスは `/api/v1` を省略する。

---

## Shelter

### `GET /shelters`

```json
{
  "items": [
    {
      "id": "0193...",
      "name": "○○小学校",
      "address": "○○市○○町1-2-3",
      "capacity": 500,
      "currentOccupancy": 132,
      "isOverCapacity": false,
      "latitude": 35.0,
      "longitude": 139.0
    }
  ]
}
```

- `currentOccupancy`: `checked_out_at IS NULL` のチェックイン数。
- `isOverCapacity`: `currentOccupancy > capacity`。満員でもチェックインは拒否しない。

### `GET /shelters/:shelterId`

一覧の1要素と同じ形を返す。

エラー: `SHELTER_NOT_FOUND` (404)

---

## Beacon

### `GET /beacons/shelter?major=&minor=`

アプリが検出したiBeaconの major / minor から避難所を取得する。**このAPIはチェックインを行わない**。フロー全体は [ble-checkin.md](./ble-checkin.md)。

```json
{
  "shelter": {
    "id": "0193...",
    "name": "○○小学校",
    "capacity": 500,
    "currentOccupancy": 132,
    "isOverCapacity": false
  }
}
```

エラー: `INVALID_REQUEST` (400), `BEACON_NOT_FOUND` (404)

---

## Disaster

### `GET /disasters/active`

```json
{
  "disaster": {
    "id": "0193...",
    "name": "2026年11月 ○○地震",
    "status": "active",
    "startedAt": "2026-11-03T06:00:00+09:00",
    "endedAt": null
  }
}
```

activeな災害がない場合は `{ "disaster": null }` を200で返す。

### `POST /admin/disasters`

Request: `{ "name": "2026年11月 ○○地震" }`

エラー: `DISASTER_ALREADY_ACTIVE` (409)

### `POST /admin/disasters/:disasterId/close`

災害を終了し、滞在中のチェックインをすべてチェックアウトする。

エラー: `DISASTER_NOT_FOUND` (404), `DISASTER_ALREADY_CLOSED` (409)

### `GET /admin/disasters`

`{ "items": [disaster, ...] }`（新しい順）

---

## User / Household

### `PUT /users/:userId`

アプリが初回起動時に生成したUUIDで利用者を登録する。冪等で、既存なら名前を更新する。新規作成時はその利用者だけの世帯を同時に作る。

Request: `{ "name": "山田太郎" }`

```json
{
  "id": "0193...",
  "name": "山田太郎",
  "householdId": "0193..."
}
```

エラー: `INVALID_REQUEST` (400)

### `GET /me/household`

```json
{
  "id": "0193...",
  "members": [
    { "id": "0193...", "name": "山田太郎" },
    { "id": "0193...", "name": "山田花子" }
  ]
}
```

### `POST /me/household/members`

端末を持たない家族を、自分と同じ世帯に追加する。IDはサーバーが生成する。

Request: `{ "name": "山田花子" }`

Response: 作成したユーザー（`{ id, name, householdId }`）

---

## CheckIn

### `POST /shelters/:shelterId/checkins`

Request:

```json
{
  "userIds": ["<自分のid>", "<世帯メンバーのid>"]
}
```

- `userIds` は任意。省略時は自分（`X-User-Id`）のみ。
- 指定できるのは自分と同じ世帯のメンバーのみ。
- 全員分を1トランザクションで処理する。
  - 同じ避難所に滞在中のユーザーは既存のチェックインを返す（冪等）。
  - 別の避難所に滞在中のユーザーが1人でもいれば、全体を取り消して409を返す。アプリは「○○から移動しますか？」と確認し、チェックアウト後に再度チェックインする。
- チェックインはactiveな災害に自動で紐づく。

Response:

```json
{
  "items": [
    {
      "id": "0193...",
      "userId": "0193...",
      "shelterId": "0193...",
      "disasterId": "0193...",
      "checkedInAt": "2026-11-03T13:30:00+09:00",
      "checkedOutAt": null
    }
  ]
}
```

エラー:

| code | status | 条件 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | |
| `FORBIDDEN` | 403 | 世帯外のユーザーが含まれる |
| `SHELTER_NOT_FOUND` | 404 | |
| `NO_ACTIVE_DISASTER` | 409 | |
| `ALREADY_CHECKED_IN` | 409 | 別の避難所に滞在中のユーザーがいる。`details` に対象ユーザーと滞在先を含める |

`ALREADY_CHECKED_IN` の例:

```json
{
  "error": {
    "code": "ALREADY_CHECKED_IN",
    "message": "Some users are already checked in to another shelter.",
    "details": {
      "conflicts": [
        {
          "userId": "0193...",
          "checkinId": "0193...",
          "shelter": { "id": "0193...", "name": "△△公民館" }
        }
      ]
    }
  }
}
```

### `POST /checkins/:checkinId/checkout`

自分または同じ世帯のメンバーのチェックインに `checked_out_at` を設定する。世帯全員をチェックアウトする場合は、アプリが人数分呼び出す。

Response: 更新後のチェックイン

エラー: `CHECKIN_NOT_FOUND` (404), `FORBIDDEN` (403), `NOT_CHECKED_IN` (409, チェックアウト済み)

### `GET /me/checkins`

世帯メンバー全員の現在の滞在状態を返す。

```json
{
  "items": [
    {
      "user": { "id": "0193...", "name": "山田太郎" },
      "checkin": {
        "id": "0193...",
        "shelter": { "id": "0193...", "name": "○○小学校" },
        "checkedInAt": "2026-11-03T13:30:00+09:00"
      }
    },
    {
      "user": { "id": "0193...", "name": "山田花子" },
      "checkin": null
    }
  ]
}
```

### `GET /admin/shelters/:shelterId/checkins`

| Query | 説明 |
| --- | --- |
| `status=active` | 滞在中のみ（省略時はactive災害の全件） |

```json
{
  "items": [
    {
      "id": "0193...",
      "user": { "id": "0193...", "name": "山田太郎", "householdId": "0193..." },
      "checkedInAt": "2026-11-03T13:30:00+09:00",
      "checkedOutAt": null
    }
  ]
}
```

### `POST /admin/shelters/:shelterId/checkins`（優先度低）

スマホを持たない人を運営者が代理でチェックインする。ユーザー（と単独の世帯）を同時に作成する。

Request: `{ "name": "鈴木一郎" }`

### `POST /admin/checkins/:checkinId/checkout`

世帯の制約なしにチェックアウトする。

---

## Supply

### `GET /shelters/:shelterId/supplies`

全物資マスタを返し、在庫行がないものは `quantity: 0` とする。

```json
{
  "items": [
    {
      "id": "0193...",
      "name": "水",
      "unit": "bottle",
      "quantity": 120
    }
  ]
}
```

### `POST /admin/shelters/:shelterId/supplies/:supplyId/in`
### `POST /admin/shelters/:shelterId/supplies/:supplyId/out`

Request:

```json
{
  "quantity": 20,
  "operatorName": "受付担当A",
  "note": "朝の配布"
}
```

- `quantity`: 1以上の整数（必須）
- `operatorName`, `note`: 任意
- 在庫更新と履歴の記録を1トランザクションで行う（[database.md](./database.md#物資の入庫配布)）。
- activeな災害があれば履歴に紐づける。なくても入庫・配布はできる（平時の備蓄）。

Response: 更新後の在庫（`{ id, name, unit, quantity }`）

エラー: `INVALID_REQUEST` (400), `SHELTER_NOT_FOUND` / `SUPPLY_NOT_FOUND` (404), `INSUFFICIENT_SUPPLY` (409, 配布のみ)

### `GET /admin/shelters/:shelterId/supply-transactions`

| Query | 説明 |
| --- | --- |
| `disasterId` | 指定した災害の履歴のみ |
| `supplyId` | 指定した物資の履歴のみ |

```json
{
  "items": [
    {
      "id": "0193...",
      "supply": { "id": "0193...", "name": "水", "unit": "bottle" },
      "type": "OUT",
      "quantity": 20,
      "operatorName": "受付担当A",
      "note": "朝の配布",
      "disasterId": "0193...",
      "createdAt": "2026-11-03T14:00:00+09:00"
    }
  ]
}
```

---

## Validation

リクエストはRouteでZodスキーマにより検証し、不正な入力はServiceまで渡さない。スキーマは `src/schemas/` に置き、OpenAPIの生成元を兼ねる。

```ts
const CheckInRequest = z.object({
  userIds: z.array(z.string().uuid()).min(1).optional(),
});
```

## エラー形式

```json
{
  "error": {
    "code": "SHELTER_NOT_FOUND",
    "message": "Shelter not found.",
    "details": {}
  }
}
```

`details` は任意。`message` は開発者向けで、画面表示の文言はクライアントが `code` から決める。

| code | HTTP Status |
| --- | --- |
| `INVALID_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `USER_NOT_FOUND` | 404 |
| `SHELTER_NOT_FOUND` | 404 |
| `BEACON_NOT_FOUND` | 404 |
| `CHECKIN_NOT_FOUND` | 404 |
| `SUPPLY_NOT_FOUND` | 404 |
| `DISASTER_NOT_FOUND` | 404 |
| `ALREADY_CHECKED_IN` | 409 |
| `NOT_CHECKED_IN` | 409 |
| `INSUFFICIENT_SUPPLY` | 409 |
| `NO_ACTIVE_DISASTER` | 409 |
| `DISASTER_ALREADY_ACTIVE` | 409 |
| `DISASTER_ALREADY_CLOSED` | 409 |
| `INTERNAL_ERROR` | 500 |

## 認証の発展

- 利用者: `user-auth.ts` を、マイナンバーカード（JPKI）による本人確認やCognitoのJWT検証に差し替える。Serviceは「リクエスト者のuserId」だけを受け取るため影響しない。
- 管理者: `admin-auth.ts` をCognitoに差し替え、Roleを導入する。

| Role | 権限 |
| --- | --- |
| User | 自分・世帯のチェックイン |
| Operator | 避難者一覧、物資更新、代理チェックイン |
| Admin | 避難所・災害の設定 |
