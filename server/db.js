const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 環境変数 DB_PATH があればそれを使用し、なければローカルの ./campervan.db を使用
const dbPath = process.env.DB_PATH || './campervan.db';
const db = new sqlite3.Database(dbPath);

// WALモードを有効化して同時実行性とパフォーマンスを向上させる
db.run("PRAGMA journal_mode = WAL;");

db.serialize(() => {
  // メニューテーブル (availableカラムを追加)
  db.run(`CREATE TABLE IF NOT EXISTS menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    image TEXT,
    available INTEGER DEFAULT 1 -- 1: 販売中, 0: 売り切れ
  )`);

  // 注文テーブル
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'pending_payment',
    token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (!err) {
      // 既存のテーブルに token カラムがない場合のマイグレーション
      db.all("PRAGMA table_info(orders)", (err, columns) => {
        if (!err) {
          const hasToken = columns.some(col => col.name === 'token');
          if (!hasToken) {
            db.run("ALTER TABLE orders ADD COLUMN token TEXT", (err) => {
              if (err) console.error("Error adding token column:", err);
              else console.log("Added token column to orders table");
            });
          }
        }
      });
    }
  });

  // 初期データ (毎回リセットして最新の定義を反映)
  db.run("DELETE FROM menu", (err) => {
    if (!err) {
      const stmt = db.prepare("INSERT INTO menu (name, price, category, image, available) VALUES (?, ?, ?, ?, 1)");
      
      // --- ポテトメニュー (Category: food) ---
      // 基本: 500円, チーズ: 600円
      const potatoImage = "https://images.unsplash.com/photo-1630384060421-a4323ceca0ad?w=500&auto=format&fit=crop&q=60";
      const cheeseImage = "https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500&auto=format&fit=crop&q=60";

      stmt.run("ポテト（塩）", 500, "food", potatoImage);
      stmt.run("ポテト（ブラックペッパー）", 500, "food", potatoImage);
      stmt.run("ポテト（コンソメ）", 500, "food", potatoImage);
      stmt.run("ポテト（ケチャップ）", 500, "food", "https://images.unsplash.com/photo-1572656631137-7935297eff55?w=500&auto=format&fit=crop&q=60");
      stmt.run("ポテト（すしのこ）", 500, "food", potatoImage);
      stmt.run("ポテト（チーズ）", 600, "food", cheeseImage);

      // --- ポテト大盛り (+200円) ---
      // 基本: 700円, チーズ: 800円
      stmt.run("【大盛り】ポテト（塩）", 700, "food", potatoImage);
      stmt.run("【大盛り】ポテト（ブラックペッパー）", 700, "food", potatoImage);
      stmt.run("【大盛り】ポテト（コンソメ）", 700, "food", potatoImage);
      stmt.run("【大盛り】ポテト（ケチャップ）", 700, "food", "https://images.unsplash.com/photo-1572656631137-7935297eff55?w=500&auto=format&fit=crop&q=60");
      stmt.run("【大盛り】ポテト（すしのこ）", 700, "food", potatoImage);
      stmt.run("【大盛り】ポテト（チーズ）", 800, "food", cheeseImage);

      // --- ドリンクメニュー (Category: drink) ---
      // ホットコーヒー: 400円
      stmt.run("ホットコーヒー", 400, "drink", "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=60");
      
      // その他ホット: 300円
      stmt.run("ホットココア", 300, "drink", "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&auto=format&fit=crop&q=60");
      stmt.run("コーンスープ", 300, "drink", "https://images.unsplash.com/photo-1616501268209-ed0cb31090e6?w=500&auto=format&fit=crop&q=60");
      
      // 冷たいドリンク
      stmt.run("コーラ（250ml）", 200, "drink", "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60");
      stmt.run("お茶", 100, "drink", "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=60");
      
      stmt.finalize();
      console.log("Menu initialized with updated prices and items.");
    }
  });
});

// Promiseベースのラッパーを追加
db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

module.exports = db;