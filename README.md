# History Vault

閲覧履歴をブラウザの保持期間から独立して保存し、Vivaldi 風の履歴ページで見返せる Chromium 拡張機能です。WXT + React + TypeScript で開発しています。

Chrome は既定で約 90 日分の履歴しか保持しません。History Vault は閲覧のたびに履歴を IndexedDB へ複製し、コンパクトなカレンダーと日付ごとに折りたためるリストから過去の閲覧を探せるようにします。データは端末内にのみ保存され、外部へ送信されません。

## 主な機能

- **Vivaldi 風の履歴ページ** — 左側のコンパクトな連続月カレンダー（ヒートマップ）と、日付ごとに折りたためる履歴リスト
- **任意の統計パネル** — 閲覧アクティビティ、リンク遷移のドーナツ、上位ドメイン（初期状態は非表示）
- **検索** — タイトル・URL・ホスト名の全文検索、`site:` / `after:` / `before:` フィルタ
- **既存履歴のインポート** — Chrome に残っている履歴を新しい日付からバックグラウンドで取り込み
- **削除の扱いを選択** — 既定では Chrome 側の履歴削除に追従せず、Vault に残す。設定で追従も可能
- **エクスポート / インポート** — Vault 全体を JSON または CSV で保存・復元
- **ライト / ダークテーマ** — システム設定への自動追従つき
- **Ctrl+H の置き換え** — `chrome_url_overrides.history` により、Chrome の履歴ページを置き換え

## 対応ブラウザ

Chromium 系（Chrome / Edge / Brave / Arc など）を対象としています。Firefox はリリース対象外です。

## スタック

- **WXT** — マニフェスト生成、Chrome 向けビルド、HMR
- **React 19 + TypeScript** — 履歴ページとポップアップの UI
- **Dexie (IndexedDB)** — ページ・訪問履歴の保存
- **@tanstack/react-virtual** — 長い履歴リストの仮想化
- **Biome** — フォーマットと基本リント
- **ESLint** — React Hooks / React Refresh 向けの追加リント
- **Vitest + happy-dom + fake-indexeddb** — ユニットテスト
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

Chrome が起動し、拡張機能が読み込まれた状態で開発できます。

手動で読み込む場合は、ビルド後の `.output/chrome-mv3-dev`（本番ビルドは `.output/chrome-mv3`）を `chrome://extensions` の「パッケージ化されていない拡張機能を読み込む」から指定してください。読み込み後は Ctrl+H または `chrome://history` で History Vault が開きます。

初回インストール時は既存履歴のインポートが自動で始まります。インポート中はツールバーのバッジに進捗が表示されます。

## スクリプト

| コマンド          | 内容                                      |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Chrome 向け開発サーバー                   |
| `pnpm build`      | Chrome 向け本番ビルド                     |
| `pnpm zip`        | 配布用 ZIP の作成                         |
| `pnpm lint`       | Biome + ESLint                            |
| `pnpm lint:fix`   | Biome + ESLint の自動修正                 |
| `pnpm format`     | Biome によるフォーマット                  |
| `pnpm typecheck`  | WXT の型生成 + `tsc --noEmit`             |
| `pnpm test`       | Vitest（1 回実行）                        |
| `pnpm test:watch` | Vitest（ウォッチ）                        |
| `pnpm knip`       | 未使用コード・依存関係の検出              |
| `pnpm check`      | lint / typecheck / test / knip を一括実行 |

## ディレクトリ構成

```text
.
├── entrypoints/
│   ├── background.ts        # Service Worker（収集・インポート・削除同期）
│   ├── history/             # Ctrl+H で開く履歴ページ
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── style.css
│   └── popup/               # ツールバーのポップアップ
├── utils/
│   ├── history/             # 収集・集計・検索・インポート・削除
│   ├── db.ts                # Dexie スキーマ
│   ├── settings.ts          # chrome.storage.local の設定
│   └── export.ts            # JSON / CSV エクスポート
├── tests/                   # Vitest
├── assets/icon.svg          # アイコンの原本
├── public/icon/             # 16 / 32 / 48 / 96 / 128 px の PNG
├── wxt.config.ts            # 表示名・説明・permissions
├── biome.json
├── eslint.config.js
├── knip.json
└── vitest.config.ts
```

## データと権限

- `history` — 閲覧履歴の読み取りと削除イベントの購読
- `storage` — 設定・インポート進捗の保存
- `unlimitedStorage` — 長期間の履歴を IndexedDB に保存
- `favicon` — 履歴ページでのファビコン表示
- `alarms` — インポートの定期実行

保存先は IndexedDB（`history-vault`）と `chrome.storage.local` です。詳細は [PRIVACY.md](PRIVACY.md) を参照してください。

## 注意事項

- Chrome 側ですでに削除された履歴は復元できません。インポートできるのは Chrome が保持している履歴だけです。
- 拡張機能を削除すると Vault のデータも削除されます。必要な履歴は設定画面から JSON でエクスポートしてください。
- Vault からの削除は Vault 内のデータだけを消します。Chrome の履歴は削除されません。

## 設定のポイント

- 表示名・説明・権限は `wxt.config.ts` の `manifest` で管理しています。
- `@/` はリポジトリルートへのエイリアスです（WXT が生成する `tsconfig` の paths）。
- WXT の自動インポート（`defineBackground` など）は ESLint の globals に `.wxt/eslint-auto-imports.mjs` 経由で反映されます。
- アイコンは `assets/icon.svg` を原本に、`public/icon/*.png` を書き出してコミットしています。

## コミット前チェック

Husky の `pre-commit` で `lint-staged` が実行され、ステージしたファイルに Biome と ESLint の自動修正がかかります。

## ライセンス

MIT
