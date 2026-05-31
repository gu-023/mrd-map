# MRD Map — Meta Ray-Ban Display 向け現在地マップ

Ray-Ban Display の **Web App** として動く、Google Maps 現在地マップです。
600×600・単眼・加算ディスプレイ前提（黒=透明）、操作は **D-pad（Neural Band）** のみ。

```
index.html               画面（600x600 / 黒背景）
css/style.css            加算ディスプレイ向けスタイル
js/app.js                地図・GPS・D-pad 操作
js/config.template.js    config.js の雛形（キーは入っていない・コミットする）
js/config.js             ★ローカル開発用。キー入り・.gitignore 済み（コミットしない）
.github/workflows/deploy.yml  GitHub Pages へ自動デプロイ（Secret からキー注入）
```

操作:
- 通常モード: `←` `→` でボタン選択、決定で実行（−／◎現在地／＋／✥移動／🧭コンパス／↻再読込）
- 移動モード（✥）: `←↑↓→` で地図移動、決定で終了
- コンパス（🧭）: 向いている方向が画面の上になるよう地図を回転（ヘディングアップ）。中央の矢印が進行方向、ステータスに方位を表示
- ナビ（🚩）: **目的地メニュー**を開く（`↑↓`で選択 / 決定 / `←`戻る）
  - 📍 地図で目的地を選ぶ（中央の十字に合わせて決定）
  - ⭐ お気に入り / 🕘 最近の目的地（端末内に保存・ログイン不要）
  - 🚶 移動手段: 徒歩 / 🚗 自動車 / 🚲 自転車 / 🚆 公共交通
  - ナビ中はお気に入り登録・ナビ終了も
- ナビ案内: 大きな方向アイコン＋ターンまでの距離、通り名・残り距離/到着予想。ルートから外れると自動リルート。到着で🏁

### ナビに必要な Google Cloud 設定（あなたの作業）
APIキーの「APIの制限」に以下を**追加**（有効化も必要）:
- **Directions API** … 経路（徒歩/自動車/自転車/公共交通すべて）
- **Geocoding API** … お気に入り/履歴の地点名表示（未設定でも動くが座標表示になる）

## APIキーの扱い（重要）

Maps JS API のキーはブラウザに必ず露出します。本プロジェクトでは**キーをソースにコミットしません**。
キーの居場所は次の3つだけ:

| 場所 | 用途 |
|---|---|
| ローカル `js/config.js`（gitignore） | Chrome 開発 |
| GitHub リポジトリ Secret `GOOGLE_MAPS_API_KEY` | 本番デプロイ時に注入 |
| デプロイ済み Pages の出力 | グラスが読む（HTTPリファラー制限で保護） |

守りの本体は Google Cloud 側の **HTTPリファラー制限**です。

---

## デプロイ手順（GitHub Pages）

### あなたの作業
1. **リポジトリ Secret を登録**
   GitHub → リポジトリ → Settings → Secrets and variables → Actions → New repository secret
   - Name: `GOOGLE_MAPS_API_KEY`
   - Secret: あなたの Maps API キー
2. **Pages のソースを GitHub Actions に設定**
   Settings → Pages → Build and deployment → Source = **GitHub Actions**
3. **Google Cloud のリファラー制限**（設定済み）
   - 許可: `https://gu-023.github.io/mrd-map/*`
   - API 制限: Maps JavaScript API のみ

→ `main` に push すると自動でビルド & デプロイ。完成URL: `https://gu-023.github.io/mrd-map/`

### グラスに登録
1. Meta AI アプリ →「デバイス」→ Display Glasses 設定 →「App connections」→「Web apps」
2. 上記 HTTPS URL を追加 → グラスで起動
> 実機要件: グラス v125+ / Meta AI アプリ v272+

---

## ローカルで確認する
```bash
cp js/config.template.js js/config.js      # 初回のみ。__GOOGLE_MAPS_API_KEY__ を自分のキーに
python3 -m http.server 8080                # http://localhost:8080 を Chrome で開く
```
- Chrome を 600×600 にして確認（DevTools のデバイスツールバー）
- 位置情報は DevTools → ⋮ → More tools → Sensors で緯度経度を上書き
- D-pad は **矢印キー**、決定は **Enter**
- ローカルで実キーを使う場合は、リファラーに `http://localhost:8080/*` を一時追加（不要になったら削除）

---

## 次の拡張
- ナビ（目的地入力＋経路＋次の曲がり角）→ Directions / Places API を追加で有効化
- 公式 Claude Code プラグイン（このデバイス専用の雛形・スキル）:
  ```
  /plugin marketplace add https://github.com/facebookincubator/meta-wearables-webapp
  /plugin install meta-wearables-webapp@meta-wearables
  ```
