import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, ArrowLeft, ChevronRight } from 'lucide-react';
import { socket } from '../socket';

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [orderHistory, setOrderHistory] = useState(() => {
    const saved = localStorage.getItem('camper_order_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const handleStatusUpdate = ({ id, status }) => {
      setOrderHistory(prev => {
        return prev.map(order => 
          order.id === id ? { ...order, status } : order
        );
      });
    };

    socket.on('order_status_updated', handleStatusUpdate);

    return () => {
      socket.off('order_status_updated', handleStatusUpdate);
    };
  }, []);

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return '受付済';
      case 'cooking': return '調理中';
      case 'ready': return 'お渡し可';
      default: return status;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'cooking': return 'text-orange-600 bg-orange-100';
      case 'ready': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
       <header className="flex items-center mb-6 sticky top-0 bg-gray-50 z-10 py-2">
        <button onClick={() => navigate('/')} className="p-2 rounded-full bg-white shadow-sm mr-4">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-bold text-gray-800">注文履歴</h1>
      </header>

      <div className="space-y-4 pb-20">
        {orderHistory.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <History className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>履歴はありません</p>
          </div>
        ) : (
          orderHistory.map(order => (
            <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition" 
                 onClick={() => navigate(`/tracker/${order.id}?token=${order.token || ''}`)}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-xs font-bold text-gray-400">ORDER #{order.id}</span>
                  <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
              </div>
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-gray-700">
                    <span>{item.name} x{item.qty}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between font-bold text-gray-800">
                <span>合計</span>
                <span>¥{order.total}</span>
              </div>
              <div className="mt-3 text-center">
                <span className="text-orange-500 text-sm font-bold flex items-center justify-center gap-1">
                  詳細・状況を見る <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
