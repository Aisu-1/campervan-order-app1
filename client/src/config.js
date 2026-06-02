// APIのベースURL設定
// 本番ビルド(import.meta.env.PRODがtrue)の場合は、同一オリジンで配信するため空文字(相対パス)を使用します。
// これにより、フロントエンドとバックエンドが同じドメイン・ポートで動作する場合に設定不要で動作します。
// 開発環境では http://localhost:3001 をデフォルトとします。
// 明示的に VITE_API_URL が指定された場合はそれが最優先されます。
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');