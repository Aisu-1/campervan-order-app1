# ビルドステージ: フロントエンド (React) のビルド
FROM node:20-slim as client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
# 本番用ビルドを実行 (distフォルダが生成される)
RUN npm run build

# ランタイムステージ: バックエンド (Node.js) のセットアップ
FROM node:20
WORKDIR /app

# サーバーの依存関係を個別にコピーしてインストール
COPY server/package*.json ./
# ネイティブモジュールを確実にビルドするために --build-from-source を指定
RUN npm install --production && npm rebuild sqlite3

# サーバーのソースコードをコピー (node_modulesを除外するように.dockerignoreが効く)
COPY server/ .

# ビルドしたReactアプリをサーバーの公開ディレクトリ(public)にコピー
COPY --from=client-builder /app/client/dist ./public

# SQLiteのデータを永続化するためのディレクトリを作成
RUN mkdir -p /data

ENV PORT=8080
ENV NODE_ENV=production
ENV DB_PATH=/data/campervan.db

EXPOSE 8080
CMD ["node", "index.js"]
