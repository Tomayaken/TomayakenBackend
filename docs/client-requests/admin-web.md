# 管理画面（React）への依頼事項

バックエンドの設計に合わせて、運営者向け管理画面で実装してほしいことをまとめる。API仕様の詳細は OpenAPI（`docs/openapi.json`。サーバー起動中は `/api/v1/docs` でも見られる）を正とし、概要は [api.md](../api.md) を参照。

## 1. 技術・接続

- React + Vite。本番は S3 + CloudFront に配置する。
- API の Base URL は環境変数（例: `VITE_API_BASE_URL`）で切り替える。
- OpenAPI（リポジトリの `docs/openapi.json`）から型を生成して使うことを推奨（例: `openapi-typescript` + `openapi-fetch`）。
- サーバーの実装を待たずに開発できるよう、`docs/openapi.json` からモックサーバーを立てられる（例: `npx @stoplight/prism-cli mock docs/openapi.json`）。
- 本番のOriginはバックエンドの `CORS_ORIGIN` に登録する必要があるため、CloudFrontのドメインが決まったら共有してほしい。
- エラーレスポンスは `{ "error": { "code", "message", "details" } }`。画面の文言は `code` から決める（[エラーコード一覧](../api.md#エラー形式)）。

## 2. 管理者認証（簡易）

- `/api/v1/admin/*` には `Authorization: Bearer <ADMIN_TOKEN>` が必要。
- ログイン画面でトークンを入力させ、`localStorage` 等に保持して全管理者APIに付与する。
- `401 UNAUTHORIZED` が返ったらトークン入力画面に戻す。
- 将来 Cognito に移行する予定なので、トークンの付与はAPIクライアントの共通処理にまとめてほしい。

## 3. 運営者名

- 運営者名を入力する欄を用意し、`localStorage` に保持する（トークン入力と同じ画面でよい）。
- 物資の入庫・配布時に `operatorName` として送る（任意項目）。

## 4. 災害の管理

- `GET /api/v1/disasters/active` でactiveな災害を常に表示する（ヘッダー等）。
- 災害がない場合は「災害を開始」ボタンを表示し、`POST /api/v1/admin/disasters`（body: `{ "name" }`）を呼ぶ。
- 災害の終了は `POST /api/v1/admin/disasters/:disasterId/close`。**滞在中の全員が自動でチェックアウトされる**ため、確認ダイアログを出す。
- 過去の災害一覧: `GET /api/v1/admin/disasters`。

## 5. 避難所一覧・ダッシュボード

- `GET /api/v1/shelters` で避難所ごとの `currentOccupancy` / `capacity` を表示する。
- `isOverCapacity: true` は警告表示（定員超過でもチェックインは拒否されない）。
- `latitude` / `longitude` があれば地図表示に使ってよい（NULLの避難所もある）。
- 表示の更新は **10秒間隔のポーリング** で行う（WebSocketは提供しない）。

## 6. 避難者一覧

- `GET /api/v1/admin/shelters/:shelterId/checkins?status=active` で滞在中の避難者を表示する。
- `user.householdId` で世帯ごとにグルーピング表示できると望ましい。
- 代理チェックアウト: `POST /api/v1/admin/checkins/:checkinId/checkout`。

## 7. 代理チェックイン（優先度低）

- スマホを持たない人のために、名前を入力してチェックインするフォーム。
- `POST /api/v1/admin/shelters/:shelterId/checkins`（body: `{ "name" }`）。
- バックエンド側も優先度低のため、実装状況を確認してから着手してほしい。

## 8. 物資管理

- 在庫一覧: `GET /api/v1/shelters/:shelterId/supplies`（全物資を返し、在庫なしは `quantity: 0`）。
- 入庫: `POST /api/v1/admin/shelters/:shelterId/supplies/:supplyId/in`
- 配布: `POST /api/v1/admin/shelters/:shelterId/supplies/:supplyId/out`
  - body: `{ "quantity": 1以上の整数, "operatorName"?: string, "note"?: string }`
  - `409 INSUFFICIENT_SUPPLY` の場合は「在庫が不足しています」と表示する。
- 入出庫履歴: `GET /api/v1/admin/shelters/:shelterId/supply-transactions`（`disasterId` / `supplyId` で絞り込み可）。
- 在庫一覧もポーリングで更新する。

## 9. 現段階で提供しないもの

- 避難所・Beacon・物資マスタの作成/編集画面（seedで投入する。余裕があればAdmin CRUDを追加）
- 運営者の個別アカウント・権限管理（Cognito移行後）
