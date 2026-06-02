import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import StaffView from './StaffView';
import MenuScreen from './screens/MenuScreen';
import HistoryScreen from './screens/HistoryScreen';
import TrackerScreen from './screens/TrackerScreen';
import { socket } from './socket';

// 画面遷移時にスクロールトップに戻すためのコンポーネント
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  // アプリ全体でソケットイベントを監視してlocalStorageを更新
  useEffect(() => {
    const handleStatusUpdate = ({ id, status }) => {
      const saved = localStorage.getItem('camper_order_history');
      if (saved) {
        const history = JSON.parse(saved);
        const updatedHistory = history.map(order => 
          order.id === id ? { ...order, status } : order
        );
        // パフォーマンス維持のため、最新50件のみ保持
        localStorage.setItem('camper_order_history', JSON.stringify(updatedHistory.slice(0, 50)));
      }
    };

    const joinExistingOrders = () => {
      const saved = localStorage.getItem('camper_order_history');
      if (saved) {
        const history = JSON.parse(saved);
        history.forEach(order => {
          // 進行中の注文(completed以外)のみルームに参加して通知を受け取る
          if (order.id && order.token && order.status !== 'completed') {
            socket.emit('join_order', { id: order.id, token: order.token });
          }
        });
      }
    };

    socket.on('order_status_updated', handleStatusUpdate);
    socket.on('connect', joinExistingOrders);
    
    // 初回実行
    joinExistingOrders();

    return () => {
      socket.off('order_status_updated', handleStatusUpdate);
      socket.off('connect', joinExistingOrders);
    };
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* 顧客用ルート */}
        <Route path="/" element={<MenuScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/tracker/:id" element={<TrackerScreen />} />

        {/* スタッフ用ルート */}
        <Route path="/staff" element={<StaffView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
