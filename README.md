# History Vault

閲覧履歴を整理するためのブラウザ拡張機能です。WXT + React + TypeScript で開発します。

## スタック

- **WXT** — マニフェスト生成、Chrome / Firefox 向けビルド、HMR
- **React 19 + TypeScript** — ポップアップなどの UI
- **Biome** — フォーマットと基本リント
- **ESLint** — React Hooks / React Refresh 向けの追加リント
- **Vitest + happy-dom** — ユニットテスト
- **Knip** — 未使用ファイル・依存関係の検出
- **Husky + lint-staged** — コミット前の自動チェック

## 必要環境

- Node.js 22.13 以上（`.nvmrc` は 24）
- pnpm 11.8.0（`packageManager` / `devEngines` で固定）

## セットアップ

```sh
pnpm install
```

`postinstall` で WXT の型（`.wxt/`）が生成され、`prepare` で Husky のフックが有効になります。

## 開発

```sh
pnpm dev
```

Chrome が起動し、拡張機能が読み込まれた状態で開発できます。Firefox の場合は次を使います。

```sh
pnpm dev:firefox
```

手動で読み込む場合は、ビルド後の `.output/chrome-mv3-dev`（本番ビルドは `.output/chrome-mv3`）を `chrome://extensions` の「パッケージ化されていない拡張機能を読み込む」から指定してください。

## スクリプト

| コマンド                        | 内容                                      |
| ------------------------------- | ----------------------------------------- |
| `pnpm dev`                      | Chrome 向け開発サーバー                   |
| `pnpm dev:firefox`              | Firefox 向け開発サーバー                  |
| `pnpm build`                    | Chrome 向け本番ビルド                     |
| `pnpm build:firefox`            | Firefox 向け本番ビルド                    |
| `pnpm zip` / `pnpm zip:firefox` | ストア提出用 ZIP の作成                   |
| `pnpm lint`                     | Biome + ESLint                            |
| `pnpm lint:fix`                 | Biome + ESLint の自動修正                 |
| `pnpm format`                   | Biome によるフォーマット                  |
| `pnpm typecheck`                | WXT の型生成 + `tsc --noEmit`             |
| `pnpm test`                     | Vitest（1 回実行）                        |
| `pnpm test:watch`               | Vitest（ウォッチ）                        |
| `pnpm knip`                     | 未使用コード・依存関係の検出              |
| `pnpm check`                    | lint / typecheck / test / knip を一括実行 |

## ディレクトリ構成

```text
.
├── entrypoints/
│   ├── background.ts        # Service Worker
│   └── popup/               # ツールバーのポップアップ
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       └── style.css
├── utils/                   # 共通ロジック
├── tests/                   # Vitest
├── assets/icon.svg          # アイコンの原本
├── public/icon/             # 16 / 32 / 48 / 96 / 128 px の PNG
├── wxt.config.ts            # 表示名・説明・permissions
├── biome.json
├── eslint.config.js
├── knip.json
└── vitest.config.ts
```

## 設定のポイント

- 拡張機能の表示名・説明・権限は `wxt.config.ts` の `manifest` で管理しています。現在は `history` と `storage` を要求します。
- Firefox 専用の `browser_specific_settings.gecko`（アドオン ID・データ収集ポリシー）は Firefox ビルド時のみ付与されます。
- `@/` はリポジトリルートへのエイリアスです（WXT が生成する `tsconfig` の paths）。
- WXT の自動インポート（`defineBackground` など）は ESLint の globals に `.wxt/eslint-auto-imports.mjs` 経由で反映されます。
- アイコンは `assets/icon.svg` を原本に、`public/icon/*.png` を書き出してコミットしています。

## コミット前チェック

Husky の `pre-commit` で `lint-staged` が実行され、ステージしたファイルに Biome と ESLint の自動修正がかかります。

## ライセンス

MIT
