/*
 * config.js の雛形（テンプレート）。これ自体は安全（キーは入っていない）なのでコミットする。
 *
 * ▼ ローカル開発:
 *     cp js/config.template.js js/config.js
 *   して js/config.js の __GOOGLE_MAPS_API_KEY__ を自分のキーに置き換える。
 *   js/config.js は .gitignore 済みなので公開されない。
 *
 * ▼ 本番(GitHub Pages):
 *   .github/workflows/deploy.yml が、このテンプレートの __GOOGLE_MAPS_API_KEY__ を
 *   リポジトリ Secret `GOOGLE_MAPS_API_KEY` で置換して config.js を生成・配信する。
 *   キーはソースには残らない。
 */
window.CONFIG = {
  GOOGLE_MAPS_API_KEY: "__GOOGLE_MAPS_API_KEY__",

  // GPS が取れない時の初期表示位置（例: 東京駅）
  DEFAULT_CENTER: { lat: 35.681236, lng: 139.767125 },
  DEFAULT_ZOOM: 16,
};
