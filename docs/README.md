# 避難所DX バックエンド設計書

## バックエンド

| ドキュメント | 内容 |
| --- | --- |
| [architecture.md](./architecture.md) | 全体設計（目的・システム構成・技術スタック・レイヤー・認証方針・実装優先順位・発展構想） |
| [database.md](./database.md) | DB設計（テーブル定義・リレーション・トランザクション） |
| [api.md](./api.md) | API設計（エンドポイント・認証区分・リクエスト/レスポンス・エラー形式） |
| [ble-checkin.md](./ble-checkin.md) | BLEによる避難所検出とチェックインの流れ |
| [infrastructure.md](./infrastructure.md) | 実行環境（ローカル開発・本番AWS構成・デプロイ・環境変数） |

## クライアントへの依頼事項

| ドキュメント | 対象 |
| --- | --- |
| [client-requests/admin-web.md](./client-requests/admin-web.md) | 運営者向け管理画面（React） |
| [client-requests/mobile-app.md](./client-requests/mobile-app.md) | 利用者向けアプリ（Flutter） |

詳細なリクエスト/レスポンス仕様は、サーバーが公開する OpenAPI（`/api/v1/openapi.json`）を正とする。`api.md` は概要と設計意図を記述する。
