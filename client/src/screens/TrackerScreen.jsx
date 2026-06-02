import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Clock, Flame, Utensils, ArrowLeft, CheckCircle, Home, XCircle, Heart, Banknote } from 'lucide-react';
import { socket } from '../socket';

export default function TrackerScreen() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLatestStatus = async () => {
      try {
        setLoading(true);
        const url = token ? `/api/orders/${id}?token=${token}` : `/api/orders/${id}`;
        const res = await axios.get(url);
        const latestOrder = res.data;
        setOrder(latestOrder);
        
        // 部屋に参加
        socket.emit('join_order', { id: latestOrder.id, token: latestOrder.token });
        
        // 履歴もサーバーの最新状態で同期しておく
        const currentHistory = JSON.parse(localStorage.getItem('camper_order_history') || '[]');
        const newHistory = currentHistory.map(o => o.id === latestOrder.id ? latestOrder : o);
        localStorage.setItem('camper_order_history', JSON.stringify(newHistory.slice(0, 50)));
      } catch (err) {
        console.error("Failed to fetch order status", err);
        if (err.response && (err.response.status === 403 || err.response.status === 404)) {
          setError("注文が見つからないか、アクセス権がありません。URLを確認してください。");
        } else {
          setError("データの取得に失敗しました。しばらく時間を置いてからお試しください。");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchLatestStatus();

    // ステータス更新監視
    const handleStatusUpdate = ({ id: updatedId, status }) => {
      if (parseInt(id) === updatedId) {
        setOrder(prev => {
          if (!prev) return prev;
          return { ...prev, status };
        });
      }
    };

    const onConnect = () => {
      if (order?.id && order?.token) {
        socket.emit('join_order', { id: order.id, token: order.token });
      } else if (id && token) {
        socket.emit('join_order', { id: parseInt(id), token });
      }
    };

    socket.on('order_status_updated', handleStatusUpdate);
    socket.on('connect', onConnect);

    return () => {
      socket.off('order_status_updated', handleStatusUpdate);
      socket.off('connect', onConnect);
    };
  }, [id, token, order?.id, order?.token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-100 p-6 rounded-full mb-6">
          <XCircle className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-2">Oops!</h2>
        <p className="text-gray-500 mb-8">{error}</p>
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 bg-gray-900 text-white px-8 py-3 rounded-2xl font-bold shadow-lg active:scale-95 transition"
        >
          <Home className="w-5 h-5" /> メニューへ戻る
        </button>
      </div>
    );
  }

  // 完了（受け取り済み）の場合の特別なサンクスページ
  if (order.status === 'completed') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-orange-100 rounded-full scale-150 animate-ping opacity-20"></div>
          <div className="bg-orange-500 p-8 rounded-full shadow-2xl relative z-10">
            <Heart className="w-16 h-16 text-white" />
          </div>
        </div>
        <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tighter">Thank You!</h1>
        <p className="text-xl font-bold text-gray-800 mb-2">ご注文ありがとうございました</p>
        <p className="text-gray-500 max-w-xs mx-auto mb-12 leading-relaxed">
          できたてのお味はいかがでしたか？<br/>またのご来店をスタッフ一同、<br/>心よりお待ちしております！
        </p>
        <button 
          onClick={() => navigate('/')}
          className="w-full max-w-xs flex items-center justify-center gap-2 bg-gray-900 text-white py-4 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition"
        >
          <Home className="w-6 h-6" /> メニューへ戻る
        </button>
      </div>
    );
  }

  const steps = [
    { status: 'pending_payment', label: '支払い待ち', icon: Banknote },
    { status: 'pending', label: '受付済', icon: Clock },
    { status: 'cooking', label: '調理中', icon: Flame },
    { status: 'ready', label: 'できあがり', icon: Utensils },
  ];
  const currentStepIndex = steps.findIndex(s => s.status === order.status);
  const activeIndex = currentStepIndex === -1 ? (order.status === 'ready' ? 2 : 0) : currentStepIndex;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden">
      {/* ナビゲーション */}
      <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-center text-white">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-1 bg-black/20 backdrop-blur px-3 py-2 rounded-full text-sm font-bold hover:bg-black/40 transition"
        >
          <ArrowLeft className="w-4 h-4" /> メニュー
        </button>
      </div>

      {/* 背景 */}
      <div className={`absolute top-0 left-0 w-full h-1/2 transition-colors duration-700 ${
        order.status === 'ready' ? 'bg-green-500' :
        order.status === 'pending_payment' ? 'bg-red-500' :
        'bg-orange-500'
      } rounded-b-[4rem] shadow-lg z-0`}></div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 pt-12">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-sm flex flex-col items-center transform transition-all">
          <div className="mb-6 text-center">
            <span className="bg-gray-100 text-gray-400 px-4 py-1 rounded-full text-[10px] font-black tracking-[0.2em] uppercase">
              ORDER #{order.id.toString().padStart(3, '0')}
            </span>
          </div>

          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner transition-colors duration-700 ${
            order.status === 'ready' ? 'bg-green-100 text-green-600' : 
            order.status === 'cooking' ? 'bg-orange-100 text-orange-600' : 
            order.status === 'pending_payment' ? 'bg-red-100 text-red-600' :
            'bg-yellow-100 text-yellow-600'
          }`}>
            {order.status === 'ready' ? <CheckCircle className="w-12 h-12" /> :
             order.status === 'cooking' ? <Flame className="w-12 h-12 animate-pulse" /> :
             order.status === 'pending_payment' ? <Banknote className="w-12 h-12 animate-bounce" /> :
             <Clock className="w-12 h-12" />}
          </div>

          <h2 className="text-2xl font-black text-gray-800 mb-2 text-center tracking-tight">
            {order.status === 'ready' ? 'できあがりました！' :
             order.status === 'cooking' ? 'ただいま調理中...' :
             order.status === 'pending_payment' ? 'お支払いをお願いします' :
             'ご注文を確認しています'}
          </h2>
          <p className="text-gray-500 text-center text-sm mb-10 leading-relaxed font-medium">
            {order.status === 'ready' ? 'キッチンカーの窓口までお越しください。' :
             order.status === 'cooking' ? 'おいしく作っています。もう少々お待ちください。' :
             order.status === 'pending_payment' ? 'レジにて代金をお支払いください。\nスタッフが確認後、調理を開始します。' :
             'スタッフが準備を開始します。'}
          </p>

          <div className="w-full flex justify-between relative mb-8 px-2">
            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -z-10 rounded-full -translate-y-1/2"></div>
            <div 
              className="absolute top-1/2 left-0 h-1 bg-orange-500 -z-10 rounded-full transition-all duration-700 -translate-y-1/2"
              style={{ width: `${(activeIndex / 3) * 100}%` }}
            ></div>
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx <= activeIndex;
              const isCurrent = idx === activeIndex;
              return (
                <div key={step.status} className="flex flex-col items-center bg-white px-2">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs transition-all duration-500 ${
                    isActive ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-400'
                  } ${isCurrent ? 'scale-110 ring-4 ring-orange-100' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[10px] mt-2 font-black ${
                    isActive ? 'text-gray-900' : 'text-gray-300'
                  }`}>{step.label}</span>
                </div>
              );
            })}
          </div>

          {order.status === 'ready' && (
            <div className="w-full mt-4 animate-bounce-in">
               <p className="text-center text-[10px] text-gray-400 font-bold mb-4 uppercase tracking-widest">おいしく召し上がれ！</p>
               <button 
                onClick={() => navigate('/')}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                ホームへ戻る
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}