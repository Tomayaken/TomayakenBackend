# BLEチェックインフロー

## 方針

BLEは位置情報の厳密な証明ではなく、**避難所を発見するため**に利用する。

- Beacon検知だけで勝手にチェックインされない
- QRコード撮影のために人が一箇所へ集まらない
- 利用者自身による明示的なチェックインになる

## Beaconの設定

標準的な iBeacon を使用する。

| 項目 | 設定 |
| --- | --- |
| UUID | システム共通の1つ（アプリに定数として持つ。DBには持たない） |
| major | 0〜65535。`shelter_beacons.major` に登録 |
| minor | 0〜65535。`shelter_beacons.minor` に登録 |

- `(major, minor)` の組でBeaconを一意に識別し、避難所に対応づける。1避難所に複数Beaconを置ける。
- proximity / accuracy / RSSI は受信側（アプリ）で得られる値。距離による絞り込みはアプリ側で行い、サーバーには送らない。

## フロー

```text
避難所に設置したBeacon
    |
    | advertisement (UUID, major, minor)
    v
利用者アプリ (Flutter)
    |
    | major, minor
    v
GET /api/v1/beacons/shelter?major=&minor=
    |
    v
「○○小学校を検出しました」
    |
    | チェックインする世帯メンバーを選び、ボタンを押す
    v
POST /api/v1/shelters/:shelterId/checkins
```

Beaconが見つからない場合は、避難所一覧（`GET /api/v1/shelters`）から選んで同じチェックインAPIを呼ぶ。サーバーは経路を区別しない。

## 既知の限界

major / minor は固定値のため、値を知っていれば現地にいなくてもチェックインできる。現段階ではこれを許容する（運営者が避難者一覧で確認する）。

発展として、ESP32等で定期的に変化するコードを発信し、チェックイン時にサーバーで検証する方式を検討する（[architecture.md](./architecture.md#10-発展構想)）。

関連: [API設計 - Beacon](./api.md#beacon) / [DB設計 - shelter_beacons](./database.md#shelter_beacons)
