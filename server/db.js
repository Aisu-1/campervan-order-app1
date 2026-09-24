const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || './campervan.db';
const db = new Database(path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath));

db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    image TEXT,
    available INTEGER DEFAULT 1
  )`);

db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'pending_payment',
    token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

const orderCols = db.prepare('PRAGMA table_info(orders)').all();
if (!orderCols.some((col) => col.name === 'token')) {
  db.exec('ALTER TABLE orders ADD COLUMN token TEXT');
  console.log('Added token column to orders table');
}

const potatoImage =
  'https://images.unsplash.com/photo-1630384060421-a4323ceca0ad?w=500&auto=format&fit=crop&q=60';
const cheeseImage =
  'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500&auto=format&fit=crop&q=60';

const seedMenu = db.transaction(() => {
  db.prepare('DELETE FROM menu').run();
  const stmt = db.prepare(
    'INSERT INTO menu (name, price, category, image, available) VALUES (?, ?, ?, ?, 1)'
  );

  stmt.run('ポテト（塩）', 500, 'food', potatoImage);
  stmt.run('ポテト（ブラックペッパー）', 500, 'food', potatoImage);
  stmt.run('ポテト（コンソメ）', 500, 'food', potatoImage);
  stmt.run(
    'ポテト（ケチャップ）',
    500,
    'food',
    'https://images.unsplash.com/photo-1572656631137-7935297eff55?w=500&auto=format&fit=crop&q=60'
  );
  stmt.run('ポテト（すしのこ）', 500, 'food', potatoImage);
  stmt.run('ポテト（チーズ）', 600, 'food', cheeseImage);

  stmt.run('【大盛り】ポテト（塩）', 700, 'food', potatoImage);
  stmt.run('【大盛り】ポテト（ブラックペッパー）', 700, 'food', potatoImage);
  stmt.run('【大盛り】ポテト（コンソメ）', 700, 'food', potatoImage);
  stmt.run(
    '【大盛り】ポテト（ケチャップ）',
    700,
    'food',
    'https://images.unsplash.com/photo-1572656631137-7935297eff55?w=500&auto=format&fit=crop&q=60'
  );
  stmt.run('【大盛り】ポテト（すしのこ）', 700, 'food', potatoImage);
  stmt.run('【大盛り】ポテト（チーズ）', 800, 'food', cheeseImage);

  stmt.run(
    'ホットコーヒー',
    400,
    'drink',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=60'
  );
  stmt.run(
    'ホットココア',
    300,
    'drink',
    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&auto=format&fit=crop&q=60'
  );
  stmt.run(
    'コーンスープ',
    300,
    'drink',
    'https://images.unsplash.com/photo-1616501268209-ed0cb31090e6?w=500&auto=format&fit=crop&q=60'
  );
  stmt.run(
    'コーラ（250ml）',
    200,
    'drink',
    'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60'
  );
  stmt.run(
    'お茶',
    100,
    'drink',
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=60'
  );
});

seedMenu();
console.log('Menu initialized with updated prices and items.');

db.getAsync = (sql, params = []) =>
  Promise.resolve(db.prepare(sql).get(...params));

db.allAsync = (sql, params = []) =>
  Promise.resolve(db.prepare(sql).all(...params));

db.runAsync = (sql, params = []) => {
  const info = db.prepare(sql).run(...params);
  return Promise.resolve({
    lastID: Number(info.lastInsertRowid),
    changes: info.changes,
  });
};

module.exports = db;
