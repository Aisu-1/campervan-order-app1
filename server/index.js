const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();

// Fly.ioのリバースプロキシを信頼する設定 (レート制限用)
app.set('trust proxy', 1);

// レート制限の設定 (1分間に100回まで) - 快適に使えるように緩和
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "リクエストが多すぎます。少し時間を置いてから再度お試しください。" }
});

// スタッフ認証用レート制限 (1分間に40回まで) - 実用性とセキュリティのバランス
const staffLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: "短時間の操作が多すぎます。少し待ってから操作してください。" }
});

app.use("/api/", limiter);

// CORS設定: 本番環境では環境変数 ALLOWED_ORIGIN を推奨
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({
  origin: allowedOrigin
}));
app.use(express.json());

// 静的ファイルの配信 (Reactアプリ)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST", "PUT"]
  }
});

// Google Apps ScriptのURL (環境変数から取得)
const GAS_URL = process.env.GAS_URL;

// スタッフ認証設定 (環境変数から取得。未設定の場合はエラー)
const STAFF_PIN = process.env.STAFF_PIN;
if (!STAFF_PIN) {
  console.warn("WARNING: STAFF_PIN environment variable is not set.");
}


// ステータス遷移の定義
const VALID_STATUS_FLOW = {
  'pending_payment': ['pending', 'completed'], // 支払い待ち -> 支払い完了(pending) or キャンセル(completed)
  'pending': ['cooking', 'ready', 'completed'],
  'cooking': ['ready', 'completed'],
  'ready': ['completed'],
  'completed': []
};

// スタッフ認証ミドルウェア
const requireStaffAuth = (req, res, next) => {
  const pin = req.headers['x-staff-pin'];
  if (pin === STAFF_PIN) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid Staff PIN" });
  }
};

// --- API Endpoints ---

// メニュー取得 (誰でもアクセス可)
app.get('/api/menu', async (req, res) => {
  try {
    const rows = await db.allAsync("SELECT * FROM menu");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// メニュー在庫更新 (スタッフ専用) - 厳しい制限を適用
app.put('/api/menu/:id', staffLimiter, requireStaffAuth, async (req, res) => {
  const { id } = req.params;
  const { available } = req.body;
  try {
    await db.runAsync("UPDATE menu SET available = ? WHERE id = ?", [available, id]);
    io.emit('menu_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 注文一覧取得 (スタッフ専用)
app.get('/api/orders', requireStaffAuth, async (req, res) => {
  try {
    const rows = await db.allAsync("SELECT * FROM orders ORDER BY created_at DESC");
    const orders = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items)
    }));
    res.json(orders);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: "データの取得に失敗しました。" });
  }
});

// 個別注文取得 (顧客用、トークン必須)
app.get('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(403).json({ error: "Access denied. Token required." });
  }

  try {
    const row = await db.getAsync("SELECT * FROM orders WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Order not found" });

    // トークンチェック
    if (!row.token || row.token !== token) {
      return res.status(403).json({ error: "Access denied. Invalid token." });
    }

    const order = {
      ...row,
      items: JSON.parse(row.items)
    };
    res.json(order);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: "データの取得に失敗しました。" });
  }
});

// 注文作成 (セキュリティ強化: バリデーションと再計算)
app.post('/api/orders', async (req, res) => {
  const { items, total: clientTotal } = req.body;
  
  try {
    // バリデーション: アイテムが空でないか
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "注文に商品が含まれていません。" });
    }

    // バリデーション: 数量が正の整数か
    for (const item of items) {
      if (!item.qty || !Number.isInteger(item.qty) || item.qty <= 0) {
        return res.status(400).json({ error: `不正な数量です: ${item.name}` });
      }
    }

    // 最新のメニュー情報を取得
    const menuItems = await db.allAsync("SELECT id, price, name, category, available FROM menu");
    
    let serverTotal = 0;
    let potatoCount = 0;
    let eligibleDrinkCount = 0;

    for (const item of items) {
      const dbItem = menuItems.find(m => m.id === item.id);
      if (!dbItem) return res.status(400).json({ error: `不正な商品IDです: ${item.id}` });
      
      // 在庫チェック
      if (dbItem.available === 0) {
        return res.status(400).json({ error: `申し訳ありません。${dbItem.name} は現在売り切れです。` });
      }

      serverTotal += dbItem.price * item.qty;

      if (dbItem.name.includes('ポテト')) potatoCount += item.qty;
      // 割引対象: コーラ・お茶以外のドリンク
      if (dbItem.category === 'drink' && 
          !dbItem.name.includes('コーラ') && 
          !dbItem.name.includes('お茶')) {
        eligibleDrinkCount += item.qty;
      }
    }

    // セット割引計算
    const discountSets = Math.min(potatoCount, eligibleDrinkCount);
    serverTotal -= (discountSets * 100);

    // 金額チェック
    if (serverTotal !== clientTotal) {
      return res.status(400).json({ error: "金額の不一致が検出されました。" });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const result = await db.runAsync(
      "INSERT INTO orders (items, total, token) VALUES (?, ?, ?)",
      [JSON.stringify(items), serverTotal, token]
    );
    
    const newOrder = {
      id: result.lastID,
      items,
      total: serverTotal,
      token,
      status: 'pending_payment',
      created_at: new Date().toISOString()
    };
    
    const notificationData = { ...newOrder };
    delete notificationData.token;
    io.to('staff_room').emit('new_order', notificationData);

    // スプレッドシートへ送信 (非同期で行い、レスポンスを待たない)
    const itemsSummary = items.map(i => `${i.name} x${i.qty}`).join(', ');
    axios.post(GAS_URL, {
      id: newOrder.id,
      total: serverTotal,
      items: itemsSummary
    }).catch(e => console.error("GAS Error:", e.message));

    res.json(newOrder);
  } catch (err) {
    console.error("Order Creation Error:", err);
    res.status(500).json({ error: "注文の作成に失敗しました。" });
  }
});

// ステータス更新 (スタッフ専用 + 遷移バリデーション)
app.put('/api/orders/:id/status', staffLimiter, requireStaffAuth, async (req, res) => {
  const { id } = req.params;
  const { status: newStatus } = req.body;

  try {
    const row = await db.getAsync("SELECT status FROM orders WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "注文が見つかりません。" });

    const currentStatus = row.status;
    const allowedTransitions = VALID_STATUS_FLOW[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({ 
        error: `不正なステータス遷移です: ${currentStatus} -> ${newStatus}` 
      });
    }

    await db.runAsync("UPDATE orders SET status = ? WHERE id = ?", [newStatus, id]);
    
    const updatePayload = { id: parseInt(id), status: newStatus };
    io.to(`order_${id}`).emit('order_status_updated', updatePayload);
    io.to('staff_room').emit('order_status_updated', updatePayload);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// その他のリクエストはReactアプリ(index.html)を返す (SPA対応)
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// --- Socket.io ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // スタッフ専用ルームへの入室 (セキュリティ強化: PIN認証を追加)
  socket.on('join_staff_room', (pin) => {
    if (pin === STAFF_PIN) {
      socket.join('staff_room');
      console.log(`Socket ${socket.id} joined staff_room (Verified)`);
    } else {
      console.warn(`Unauthorized join attempt to staff_room from ${socket.id}`);
    }
  });

  // 特定の注文の更新を受け取るためのルーム入室 (トークン認証)
  socket.on('join_order', ({ id, token }) => {
    db.get("SELECT token FROM orders WHERE id = ?", [id], (err, row) => {
      if (!err && row && row.token === token) {
        socket.join(`order_${id}`);
        console.log(`Socket ${socket.id} joined room: order_${id}`);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});