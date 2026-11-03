# 利用者アプリ（Flutter）への依頼事項

バックエンドの設計に合わせて、利用者アプリ側で実装してほしいことをまとめる。API仕様の詳細は OpenAPI（`docs/openapi.json`。サーバー起動中は `/api/v1/docs` でも見られる）を正とし、概要は [api.md](../api.md) を参照。

## 1. API接続

- Base URL は環境ごとに切り替えられるようにする（ローカル: 開発PCのLAN IP:3000 / 本番: API GatewayのURL）。
- OpenAPI（リポジトリの `docs/openapi.json`）から `openapi-generator`（dart / dart-dio）でクライアントを生成して使うことを推奨。
- サーバーの実装を待たずに開発できるよう、`docs/openapi.json` からモックサーバーを立てられる（例: `npx @stoplight/prism-cli mock docs/openapi.json`）。
- エラーレスポンスは `{ "error": { "code", "message", "details" } }`。画面の文言は `message` ではなく `code` から決める（[エラーコード一覧](../api.md#エラー形式)）。

## 2. 利用者の識別（疑似認証）

1. 初回起動時に **UUID v7**（v4でも可）を生成し、端末に永続化する（`shared_preferences` / `flutter_secure_storage` など）。
2. 名前入力画面を出し、`PUT /api/v1/users/:userId`（body: `{ "name" }`）で登録する。何度呼んでもよい（名前変更にも使う）。
3. 以降、利用者APIにはすべて `X-User-Id: <userId>` ヘッダーを付ける。
4. `401 UNAUTHORIZED` が返った場合（DBリセット等）は、保存済みのIDで `PUT /users/:userId` を再実行して復旧する。

> 発表では「現在は端末IDによる簡易識別。将来はマイナンバーカードで本人確認」と説明する想定。差し替え時もヘッダー部分が変わるだけになるよう、HTTPクライアントの共通処理（interceptor）でヘッダーを付けてほしい。

## 3. 世帯メンバー

- スマホを持たない家族（子ども・高齢者など）を `POST /api/v1/me/household/members`（body: `{ "name" }`）で追加する画面を用意する。
- 世帯メンバー一覧は `GET /api/v1/me/household`。
- 同じ世帯のメンバーは、誰でも全員分のチェックイン・チェックアウトができる。
- 自分のスマホを持つ家族は、それぞれのアプリで個別に登録・チェックインする（既存世帯への参加機能は現段階ではない）。

## 4. 災害モード

- 起動時・復帰時に `GET /api/v1/disasters/active` を呼ぶ。
  - 現段階はactiveな災害がシステム全体で1件の前提。将来、自治体ごとに災害を分ける場合は、検出した避難所を指定して取得する形になる。災害の取得はAPIクライアントの1か所にまとめてほしい。
- `disaster` が `null` の場合はチェックインできない（`409 NO_ACTIVE_DISASTER`）。「現在開設中の避難所はありません」等を表示する。

## 5. BLEによる避難所検出

フロー全体は [ble-checkin.md](../ble-checkin.md)。

- iBeacon をスキャンする（`flutter_beacon` / `dchs_flutter_beacon` 等）。
- iOS では CoreLocation のリージョン監視を使うため、**システム共通のUUIDをアプリの定数として持つ**（値はバックエンドチームから共有する）。
- 検出した `major` / `minor` で `GET /api/v1/beacons/shelter?major=&minor=` を呼び、避難所名を表示する。
  - `404 BEACON_NOT_FOUND` は無視してよい（他システムのBeacon等）。
- **Beaconを検出しただけでチェックインしないこと。** 必ず利用者がボタンを押してチェックインする。
- 距離による絞り込み（RSSIが弱すぎるものを除外する等）はアプリ側の判断で行ってよい。サーバーには送らない。
- 必要な権限: Bluetooth、位置情報（iOS: `NSLocationWhenInUseUsageDescription` / `NSBluetoothAlwaysUsageDescription`、Android: `BLUETOOTH_SCAN` / `ACCESS_FINE_LOCATION`）。

## 6. 避難所一覧からの選択（Beaconがない場合）

- `GET /api/v1/shelters` で一覧を表示し、選んだ避難所でチェックインできるようにする。
- `latitude` / `longitude` があれば地図表示や距離順の並び替えに使ってよい（NULLの避難所もある）。
- `isOverCapacity: true` の避難所は「定員超過」と表示する（チェックイン自体はできる）。

## 7. チェックイン

- チェックイン画面では、世帯メンバーの中からチェックインする人を選べるようにする（デフォルトは全員）。
- `POST /api/v1/shelters/:shelterId/checkins`（body: `{ "userIds": [...] }`）。省略時は自分のみ。
- 1トランザクションで処理するため、全員分が成功するか全員分が失敗するかのどちらかになる。
- `409 ALREADY_CHECKED_IN` が返った場合は、次のように扱う。
  - `details.conflicts` に、別の避難所に滞在中のメンバーと滞在先が入っている。
  - 「△△公民館から○○小学校へ移動しますか？」と確認し、OKなら該当チェックインを `POST /checkins/:checkinId/checkout` してから、再度チェックインする。
- 同じ避難所に既にチェックイン済みの人が含まれていてもエラーにならない（既存のチェックインが返る）。

## 8. 現在の状態とチェックアウト

- ホーム画面等で `GET /api/v1/me/checkins` を呼び、世帯メンバーごとの滞在先を表示する（未チェックインは `checkin: null`）。
- チェックアウトは `POST /api/v1/checkins/:checkinId/checkout`。世帯全員をチェックアウトする場合は人数分呼ぶ。
- 災害が終了すると、サーバー側で全員自動的にチェックアウトされる。

## 9. 物資情報（任意）

- `GET /api/v1/shelters/:shelterId/supplies` で避難所の在庫を表示できる（認証不要）。表示するかはアプリ側の判断でよい。
