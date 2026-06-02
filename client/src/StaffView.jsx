import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { Clock, CheckCircle, ChefHat, Flame, BellRing, Lock, Delete, Settings, Volume2, VolumeX, Store, X, Banknote } from 'lucide-react';
import { API_URL } from './config';
import { socket } from './socket';

export default function StaffView() {
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  
  const audioContextRef = useRef(null);

  // --- メモ化された計算 ---
  
  // ステータスごとの件数カウント
  const counts = useMemo(() => {
    const c = { pending_payment: 0, pending: 0, cooking: 0, ready: 0, completed: 0 };
    orders.forEach(o => {
      if (c[o.status] !== undefined) c[o.status]++;
    });
    return c;
  }, [orders]);

  // 表示用にソート・フィルタリングされた注文リスト
  const displayOrders = useMemo(() => {
    let filtered = orders;
    if (!showCompleted) {
      filtered = orders.filter(o => o.status !== 'completed');
    }
    return [...filtered].sort((a, b) => b.id - a.id);
  }, [orders, showCompleted]);

  // Web Audio APIの初期化
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playBeep = () => {
    if (!soundEnabled) return;
    
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // チャイム音（ラ→ファ）
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(698, ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  };

  const handlePinClick = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
      
      if (newPin.length === 4) {
        // 4桁入力されたら、実際にデータを取得してみて認証を確認する
        verifyAndFetch(newPin);
      }
    }
  };

  const verifyAndFetch = async (inputPin) => {
    try {
      const res = await axios.get(`${API_URL}/api/orders`, {
        headers: { 'x-staff-pin': inputPin }
      });
      setOrders(res.data);
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Authentication failed", err);
      setError(true);
      // 1秒後にリセットして入力をやり直せるようにする
      setTimeout(() => {
        setPin('');
        setError(false);
      }, 1000);
    }
  };

  const handleDelete = () => {
    if (error) return; // エラー表示中は削除不可
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/orders`, {
        headers: { 'x-staff-pin': pin }
      });
      setOrders(res.data);
    } catch (err) {
      console.error("Failed to fetch orders", err);
      if (err.response && err.response.status === 401) {
        setIsAuthenticated(false);
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 1000);
      }
    }
  };

  const fetchMenu = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/menu`);
      setMenu(res.data);
    } catch (err) {
      console.error("Failed to fetch menu", err);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API_URL}/api/orders/${id}/status`, { status }, {
        headers: { 'x-staff-pin': pin }
      });
      // 注意: ここで直接 setOrders しない。
      // サーバー側で io.to('staff_room').emit('order_status_updated') しているので、
      // Socketリスナー側で自動的に更新されるのを待つ（これにより二重更新や同期ズレを防ぐ）。
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const toggleAvailability = async (item) => {
    const newStatus = item.available === 1 ? 0 : 1;
    try {
      await axios.put(`${API_URL}/api/menu/${item.id}`, { available: newStatus }, {
        headers: { 'x-staff-pin': pin }
      });
    } catch (err) {
      console.error("Failed to update availability", err);
    }
  };

  const parseDate = (dateString) => {
    if (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.includes('+')) {
      return new Date(dateString + 'Z');
    }
    return new Date(dateString);
  };

  const getTimeElapsed = (dateString) => {
    const start = parseDate(dateString);
    const now = new Date();
    const diff = Math.floor((now - start) / 1000 / 60);
    return diff < 1 ? 'たった今' : `${diff}分前`;
  };

  const sortedOrders = [...orders].sort((a, b) => b.id - a.id);

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
      fetchMenu();
      
      // スタッフ専用ルームに参加 (PIN認証付き)
      const joinRoom = () => {
        console.log("Emitting join_staff_room with PIN...");
        socket.emit('join_staff_room', pin);
      };
      
      if (socket.connected) {
        joinRoom();
      }

      socket.on('connect', joinRoom);

      socket.on('new_order', (order) => {
        setOrders(prev => {
          // 重複チェック
          if (prev.some(o => o.id === order.id)) return prev;
          return [order, ...prev];
        });
        playBeep();
      });

      socket.on('order_status_updated', ({ id, status }) => {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      });

      socket.on('menu_updated', fetchMenu);

      return () => {
        socket.off('connect', joinRoom);
        socket.off('new_order');
        socket.off('order_status_updated');
        socket.off('menu_updated');
      };
    }
  }, [isAuthenticated, pin, soundEnabled]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-4">
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
          }
          .animate-shake {
            animation: shake 0.2s ease-in-out 0s 3;
          }
        `}</style>
        <div className="w-full max-w-xs">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-orange-500 p-4 rounded-2xl mb-4 shadow-lg shadow-orange-500/20">
              <ChefHat className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-wider">STAFF ACCESS</h1>
            <p className={`text-sm mt-1 transition-colors duration-300 ${error ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
              {error ? 'パスコードが正しくありません' : 'パスコードを入力してください'}
            </p>
          </div>
          <div className={`flex justify-center gap-4 mb-10 ${error ? 'animate-shake' : ''}`}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${
                i < pin.length || error ? error ? 'bg-red-500 scale-125' : 'bg-orange-500 scale-110' : 'bg-gray-700'
              }`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} 
                disabled={error}
                onClick={() => handlePinClick(num.toString())} 
                className="h-20 rounded-full bg-gray-800 text-2xl font-bold hover:bg-gray-700 active:scale-95 transition shadow-lg border border-gray-700 disabled:opacity-50"
              >
                {num}
              </button>
            ))}
            <div className="col-start-2">
              <button 
                disabled={error}
                onClick={() => handlePinClick('0')} 
                className="w-full h-20 rounded-full bg-gray-800 text-2xl font-bold hover:bg-gray-700 active:scale-95 transition shadow-lg border border-gray-700 disabled:opacity-50"
              >0</button>
            </div>
            <div className="col-start-3">
              <button 
                disabled={error}
                onClick={handleDelete} 
                className="w-full h-20 rounded-full bg-transparent text-gray-400 hover:text-white flex items-center justify-center active:scale-95 transition disabled:opacity-50"
              ><Delete className="w-8 h-8" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans relative">
      {showMenuManager && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowMenuManager(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold flex items-center gap-2"><Store className="w-5 h-5 text-orange-600" /> 在庫管理 (売り切れ設定)</h2>
              <button onClick={() => setShowMenuManager(false)} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300"><X className="w-5 h-5 text-gray-600" /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {menu.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <img src={item.image} alt="" className={`w-12 h-12 rounded-lg object-cover ${item.available ? '' : 'grayscale opacity-50'}`} />
                    <div>
                      <p className={`font-bold ${item.available ? 'text-gray-800' : 'text-gray-400'}`}>{item.name}</p>
                      <p className="text-xs text-gray-500">¥{item.price}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleAvailability(item)} className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${item.available ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                    {item.available ? '販売中' : 'SOLD OUT'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <aside className="bg-gray-900 text-white w-full md:w-64 flex-shrink-0 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-orange-500 p-2 rounded-lg"><ChefHat className="w-6 h-6 text-white" /></div>
            <div><h1 className="text-xl font-bold leading-tight">キッチン<br/>管理画面</h1></div>
          </div>
          <nav className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
              <span className="text-gray-300 text-sm">支払い待ち</span>
              <span className="bg-red-500 text-white font-bold px-2 py-0.5 rounded text-xs">{counts.pending_payment}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
              <span className="text-gray-300 text-sm">受付待ち</span>
              <span className="bg-yellow-500 text-black font-bold px-2 py-0.5 rounded text-xs">{counts.pending}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
              <span className="text-gray-300 text-sm">調理中</span>
              <span className="bg-blue-500 text-white font-bold px-2 py-0.5 rounded text-xs">{counts.cooking}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
              <span className="text-gray-300 text-sm">提供待ち</span>
              <span className="bg-green-500 text-white font-bold px-2 py-0.5 rounded text-xs">{counts.ready}</span>
            </div>
            <button 
              onClick={() => setShowCompleted(!showCompleted)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${showCompleted ? 'bg-gray-700 border-gray-600' : 'bg-gray-800/30 border-gray-800 text-gray-500'}`}
            >
              <span className="text-sm">完了済みを表示</span>
              <span className={`${showCompleted ? 'bg-gray-500' : 'bg-gray-700'} text-white font-bold px-2 py-0.5 rounded text-xs`}>{counts.completed}</span>
            </button>
          </nav>
        </div>
        <div className="mt-8 md:mt-0 space-y-3 pt-6 border-t border-gray-800">
          <button 
            onClick={() => {
              const newState = !soundEnabled;
              setSoundEnabled(newState);
              if (newState) initAudio(); // ここでユーザー操作としてアンロック
            }}
            className={`w-full flex items-center justify-between p-3 rounded-lg text-sm font-bold transition ${soundEnabled ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            <div className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? '通知音 ON' : '通知音 OFF'}
            </div>
          </button>
          <button onClick={() => setShowMenuManager(true)} className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-bold text-gray-300 transition">
            <div className="flex items-center gap-2"><Settings className="w-4 h-4" /> 在庫管理</div>
          </button>
          <p className="text-xs text-center text-gray-500 mt-2">システム状態: <span className="text-green-500">● オンライン</span></p>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {displayOrders.map(order => (
            <div key={order.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all ${
              order.status === 'pending_payment' ? 'border-red-400 ring-4 ring-red-50 order-first' :
              order.status === 'pending' ? 'border-yellow-400 ring-4 ring-yellow-50' : 
              order.status === 'cooking' ? 'border-blue-400 ring-4 ring-blue-50' : 
              order.status === 'ready' ? 'border-green-400 ring-4 ring-green-50' :
              'border-gray-200 opacity-60 grayscale'
            }`}>
              <div className={`px-5 py-4 flex justify-between items-center ${
                order.status === 'pending_payment' ? 'bg-red-50' :
                order.status === 'pending' ? 'bg-yellow-50' : 
                order.status === 'cooking' ? 'bg-blue-50' : 
                order.status === 'ready' ? 'bg-green-50' :
                'bg-gray-100'
              }`}>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-gray-500">注文番号</span>
                    <span className="text-2xl font-black text-gray-800">#{order.id.toString().padStart(3, '0')}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 font-medium mt-1">
                    <Clock className="w-3 h-3" />
                    {getTimeElapsed(order.created_at)} ({parseDate(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})
                  </div>
                </div>
                {order.status === 'pending_payment' && <span className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm animate-pulse flex items-center gap-1"><Banknote className="w-3 h-3"/> 未払い ¥{order.total?.toLocaleString()}</span>}
                {order.status === 'pending' && <span className="bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">受付済 ¥{order.total?.toLocaleString()}</span>}
                {order.status === 'cooking' && <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1"><Flame className="w-3 h-3"/> 調理中 ¥{order.total?.toLocaleString()}</span>}
                {order.status === 'ready' && <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1"><CheckCircle className="w-3 h-3"/> 準備完了 ¥{order.total?.toLocaleString()}</span>}
                {order.status === 'completed' && <span className="bg-gray-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1">完了 ¥{order.total?.toLocaleString()}</span>}
              </div>
              <div className="p-5 flex-1 bg-white">
                <ul className="space-y-3">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-start text-gray-700">
                      <div className="flex gap-3">
                        <span className="flex-shrink-0 bg-gray-100 text-gray-900 font-bold w-6 h-6 flex items-center justify-center rounded text-sm">{item.qty}</span>
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-100">
                {order.status === 'pending_payment' && <button onClick={() => updateStatus(order.id, 'pending')} className="w-full bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-red-700 hover:scale-[1.02] transition active:scale-95 flex items-center justify-center gap-2"><Banknote className="w-5 h-5" /> 支払い確認</button>}
                {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'cooking')} className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-black hover:scale-[1.02] transition active:scale-95 flex items-center justify-center gap-2"><Flame className="w-5 h-5 text-orange-500" /> 調理開始</button>}
                {order.status === 'cooking' && <button onClick={() => updateStatus(order.id, 'ready')} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 hover:scale-[1.02] transition active:scale-95 flex items-center justify-center gap-2"><BellRing className="w-5 h-5" /> 調理完了・呼び出し</button>}
                {order.status === 'ready' && (
                  <div className="space-y-2">
                    <div className="text-center py-2 text-green-600 font-bold flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> 窓口でお呼び出し中</div>
                    <button onClick={() => updateStatus(order.id, 'completed')} className="w-full bg-gray-800 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-gray-900 hover:scale-[1.02] transition active:scale-95 flex items-center justify-center gap-2">受け渡し完了</button>
                  </div>
                )}
                {order.status === 'completed' && <div className="text-center py-2 text-gray-400 font-medium flex items-center justify-center gap-2">受け取り済み</div>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}