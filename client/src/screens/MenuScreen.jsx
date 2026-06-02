import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Plus, Minus, Star, ChevronRight, History, ChevronUp, Flame, X, BellRing } from 'lucide-react';
import { socket } from '../socket';

export default function MenuScreen() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({});
  const [activeCategory, setActiveCategory] = useState('all');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState(null); // 'ready', 'active', or null
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // エラー表示を数秒後に消す
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const checkActiveOrders = () => {
    const history = JSON.parse(localStorage.getItem('camper_order_history') || '[]');
    if (history.some(o => o.status === 'ready')) {
      setActiveStatus('ready');
    } else if (history.some(o => ['pending', 'cooking'].includes(o.status))) {
      setActiveStatus('active');
    } else {
      setActiveStatus(null);
    }
  };

  const fetchMenu = async () => {
    try {
      const res = await axios.get('/api/menu');
      if (Array.isArray(res.data)) {
        setMenu(res.data);
      } else {
        console.error("API returned invalid data format:", res.data);
        setMenu([]);
      }
    } catch (err) {
      console.error("Failed to fetch menu", err);
      setMenu([]);
    }
  };

  const addToCart = (item) => {
    setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  };

  const removeFromCart = (item) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[item.id] > 1) newCart[item.id]--;
      else delete newCart[item.id];
      return newCart;
    });
  };

  const calculateTotal = () => {
    let subtotal = 0;
    let potatoCount = 0;
    let eligibleDrinkCount = 0;

    Object.entries(cart).reduce((_, [id, qty]) => {
      const item = menu.find(m => m.id === parseInt(id));
      if (item) {
        subtotal += item.price * qty;
        
        if (item.name.includes('ポテト')) {
          potatoCount += qty;
        }
        if (item.category === 'drink' && !item.name.includes('コーラ') && !item.name.includes('お茶')) {
          eligibleDrinkCount += qty;
        }
      }
      return null;
    }, 0);

    const discountSets = Math.min(potatoCount, eligibleDrinkCount);
    const discountAmount = discountSets * 100;

    return { total: subtotal - discountAmount, discount: discountAmount };
  };

  const submitOrder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const items = Object.entries(cart).map(([id, qty]) => {
      const item = menu.find(m => m.id === parseInt(id));
      return { ...item, qty };
    });

    try {
      const { total } = calculateTotal();
      const res = await axios.post('/api/orders', {
        items,
        total
      });
      
      const newOrder = res.data;
      const history = JSON.parse(localStorage.getItem('camper_order_history') || '[]');
      const newHistory = [newOrder, ...history].slice(0, 50);
      localStorage.setItem('camper_order_history', JSON.stringify(newHistory));
      
      setCart({});
      setIsCartOpen(false);
      navigate(`/tracker/${newOrder.id}?token=${newOrder.token}`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || "注文の送信に失敗しました";
      setErrorMessage(errorMsg);
      // カートを閉じてエラーを見やすくする
      setIsCartOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchMenu();
    checkActiveOrders();

    const onStatusUpdate = () => {
      // localStorageの更新（App.jsx側）を待ってからチェック
      setTimeout(checkActiveOrders, 100);
    };

    socket.on('order_status_updated', onStatusUpdate);
    // メニュー更新（売り切れなど）を監視
    const onMenuUpdate = () => fetchMenu();
    socket.on('menu_updated', onMenuUpdate);

    return () => {
      socket.off('order_status_updated', onStatusUpdate);
      socket.off('menu_updated', onMenuUpdate);
    };
  }, []);

  const { total: totalAmount, discount: discountAmount } = calculateTotal();
  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const filteredMenu = (Array.isArray(menu) ? menu : []).filter(item => 
    activeCategory === 'all' ? true : item.category === activeCategory
  );

  const categories = [
    { id: 'all', label: 'すべて' },
    { id: 'food', label: 'ポテト' },
    { id: 'drink', label: 'ドリンク' },
    { id: 'side', label: 'その他' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans relative">
      {/* Error Message Toast */}
      {errorMessage && (
        <div className="fixed top-4 left-4 right-4 z-[100] animate-slide-down">
          <div className="bg-red-600 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between">
            <span className="font-bold text-sm">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative h-64 bg-gray-900 overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1565123409695-7b5ef63a48b9?w=800&auto=format&fit=crop&q=80" 
          alt="Food Truck" 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-6 w-full flex justify-between items-end">
          <div>
            <span className="inline-block px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full mb-2 shadow-md">営業中</span>
            <h1 className="text-3xl font-extrabold text-white leading-tight">Camper<br/>Kitchen.</h1>
            <p className="text-gray-300 text-sm mt-1">できたてを、その場で。</p>
          </div>
          <button 
            onClick={() => navigate('/history')}
            className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white hover:bg-white/30 transition"
          >
            <History className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Active Order Notification */}
      {activeStatus && (
        <div 
          onClick={() => navigate('/history')}
          className={`${activeStatus === 'ready' ? 'bg-green-600' : 'bg-orange-500'} text-white px-4 py-3 flex justify-between items-center cursor-pointer transition-colors duration-500 shadow-lg relative z-20`}
        >
          <div className="flex items-center gap-3">
            {activeStatus === 'ready' ? (
              <div className="bg-white/20 p-1.5 rounded-full animate-bounce">
                <BellRing className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="bg-white/20 p-1.5 rounded-full animate-pulse">
                <Flame className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-black leading-tight">
                {activeStatus === 'ready' ? 'お受取り可能な注文があります！' : '注文状況をリアルタイムで確認中...'}
              </p>
              <p className="text-[10px] opacity-80 font-medium">
                {activeStatus === 'ready' ? 'カウンターまでお越しください' : 'できたてをご用意しています'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider">履歴</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100">
        <div className="flex gap-2 p-4 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                activeCategory === cat.id 
                  ? 'bg-gray-900 text-white shadow-md transform scale-105' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Grid */}
      <main className="max-w-md mx-auto p-4 grid gap-6">
        {filteredMenu.map(item => (
          <div key={item.id} className={`bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col transform transition ${item.available ? 'hover:scale-[1.01]' : 'opacity-60 grayscale pointer-events-none'}`}>
            <div className="relative h-48">
              <img src={item.image} alt={item.name} className={`w-full h-full object-cover transition-all duration-500 ${item.available ? '' : 'grayscale-[0.9] blur-[1px]'}`} />
              {item.available ? (
                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  ¥{item.price}
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                  <div className="bg-red-600 text-white px-6 py-2 rounded-full font-black text-xl transform -rotate-12 border-4 border-white shadow-2xl tracking-tighter">
                    SOLD OUT
                  </div>
                  <p className="text-white/80 text-[10px] font-bold tracking-widest uppercase">本日分は終了しました</p>
                </div>
              )}
            </div>
            
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{item.name}</h3>
                  <div className="flex gap-1 text-orange-400 mt-1">
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                  </div>
                </div>
              </div>
              
              <div className="mt-auto pt-4 flex items-center justify-between">
                {/* 売り切れの場合はボタンを表示しない、または無効化 */}
                {!item.available ? (
                  <div className="w-full py-3 bg-gray-200 text-gray-500 text-sm rounded-xl font-bold flex items-center justify-center">
                    売り切れ
                  </div>
                ) : cart[item.id] ? (
                  <div className="flex items-center gap-4 bg-gray-50 rounded-full px-2 py-1 border border-gray-100">
                    <button onClick={() => removeFromCart(item)} className="w-8 h-8 rounded-full bg-white text-gray-800 shadow-sm flex items-center justify-center hover:bg-gray-100 transition active:scale-90">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-gray-900 w-4 text-center">{cart[item.id]}</span>
                    <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-full bg-gray-900 text-white shadow-md flex items-center justify-center hover:bg-gray-800 transition active:scale-90">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => addToCart(item)} 
                    className="w-full py-3 bg-gray-100 text-gray-900 text-sm rounded-xl font-bold hover:bg-gray-200 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    カートに追加 <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* Cart Bar & Modal */}
      {cartItemCount > 0 && (
        <>
          {isCartOpen && (
            <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setIsCartOpen(false)}>
              <div 
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 pb-32 animate-slide-up"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">カートの内容</h2>
                  <button onClick={() => setIsCartOpen(false)} className="p-2 bg-gray-100 rounded-full">
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = menu.find(m => m.id === parseInt(id));
                    if (!item) return null;
                    return (
                      <div key={id} className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-3">
                          <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          <div>
                            <p className="font-bold text-gray-800">{item.name}</p>
                            <p className="text-sm text-gray-500">¥{item.price}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => removeFromCart(item)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><Minus className="w-3 h-3"/></button>
                          <span className="font-bold w-4 text-center">{qty}</span>
                          <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center"><Plus className="w-3 h-3"/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="fixed bottom-6 left-4 right-4 z-50">
            <div className="bg-gray-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-white/10">
              <div 
                className="flex items-center gap-4 flex-1 cursor-pointer"
                onClick={() => setIsCartOpen(!isCartOpen)}
              >
                <div className="relative bg-orange-500 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg">
                  <ShoppingBag className="w-6 h-6 text-white" />
                  <span className="absolute -top-2 -right-2 bg-red-500 border-2 border-gray-900 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                    {cartItemCount}
                  </span>
                </div>
                <div className="flex flex-col">
                  {discountAmount > 0 && (
                    <span className="text-[10px] bg-red-500 text-white px-1.5 rounded animate-pulse font-bold w-max mb-0.5">
                      セット割 -¥{discountAmount}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    合計金額 <ChevronUp className={`w-3 h-3 transition-transform ${isCartOpen ? 'rotate-180' : ''}`} />
                  </span>
                  <span className="text-xl font-bold">¥{totalAmount.toLocaleString()}</span>
                </div>
              </div>
              
              <button 
                onClick={submitOrder}
                disabled={isSubmitting}
                className={`${isSubmitting ? 'bg-gray-400' : 'bg-white hover:bg-gray-100'} text-gray-900 px-6 py-3 rounded-xl font-bold transition active:scale-95 flex items-center gap-2 shadow-lg ml-4`}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>注文 <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
