import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { PackingStation } from './components/PackingStation';
import { SearchRetrieval } from './components/SearchRetrieval';
import { RecordingHistory } from './components/RecordingHistory';
import { AdminDashboard } from './components/AdminDashboard';
import { OrderDetailsPage } from './components/OrderDetailsPage';
import { ShippingRateCalculator } from './components/ShippingRateCalculator';
import { SettingsModal } from './components/SettingsModal';
import { AddOrderModal } from './components/AddOrderModal';
import { UploadQueueBanner } from './components/UploadQueueBanner';
import { LoginPage } from './components/LoginPage';
import { ProductionDeck } from './components/ProductionDeck';
import { PublicProductionDeck } from './components/PublicProductionDeck';
import { DiagnosePage } from './components/DiagnosePage';
import { SalesReports } from './components/SalesReports';
import { OrderRecord, StaffMember, AppSettings } from './types';
import { collection, query, doc, setDoc, deleteDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { safeFetchJson } from './utils/api';
import { supabase } from './supabase';
import { cleanForFirestore } from './utils/firestoreHelper';
import { INITIAL_FALLBACK_ORDERS } from './utils/initialOrders';
import { INITIAL_STAFFS } from './utils/initialStaffs';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales'>('station');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/production-deck')) setActiveTab('deck');
    else if (path.includes('/station')) setActiveTab('station');
    else if (path.includes('/calculator')) setActiveTab('calculator');
    else if (path.includes('/admin') || path.includes('/insights')) setActiveTab('admin');
    else if (path.includes('/history')) setActiveTab('history');
    else if (path.includes('/sales')) setActiveTab('sales');
    else setActiveTab('search');
  }, [location]);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>(INITIAL_STAFFS);
  const [currentStaff, setCurrentStaff] = useState<StaffMember>(INITIAL_STAFFS[0]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAddOrderOpen, setIsAddOrderOpen] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [selectedOrderForPacking, setSelectedOrderForPacking] = useState<OrderRecord | null>(null);
  const [isFirestoreQuotaExceeded, setIsFirestoreQuotaExceeded] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>({
    stationId: 'Packing-01',
    maxDailyDispatches: 8,
    telegramBotToken: '',
    telegramChatId: '',
    autoUpload: false
  });

  const fetchOrdersAPI = async () => {
    try {
      const serverResponse = await safeFetchJson('/api/orders');
      if (Array.isArray(serverResponse) && serverResponse.length > 0) {
        setOrders(serverResponse);
        try { localStorage.setItem('zuboc_orders_cache', JSON.stringify(serverResponse)); } catch {}
        return;
      }
    } catch {}

    try {
      const { data: supaOrders } = await supabase
        .from('orders')
        .select('*')
        .order('createdAt', { ascending: false });
      if (Array.isArray(supaOrders) && supaOrders.length > 0) {
        setOrders(supaOrders);
        try { localStorage.setItem('zuboc_orders_cache', JSON.stringify(supaOrders)); } catch {}
      }
    } catch {}
  };

  const fetchStaffsAPI = async () => {
    try {
      const response = await safeFetchJson('/api/staffs');
      if (Array.isArray(response) && response.length > 0) {
        setStaffList(response);
        try { localStorage.setItem('zuboc_staffs_cache', JSON.stringify(response)); } catch {}
        return;
      }
    } catch {}

    try {
      const { data: supaStaffs } = await supabase.from('staffs').select('*');
      if (Array.isArray(supaStaffs) && supaStaffs.length > 0) {
        setStaffList(supaStaffs);
        try { localStorage.setItem('zuboc_staffs_cache', JSON.stringify(supaStaffs)); } catch {}
      }
    } catch {}
  };

  const broadcastSync = () => {
    try {
      const bc = new BroadcastChannel('zuboc_flow_sync');
      bc.postMessage({ type: 'SYNC_REFRESH' });
      bc.close();
    } catch {}
  };

  // Realtime Supabase WebSockets listener + Polling + Focus + BroadcastChannel
  useEffect(() => {
    const channel = supabase
      .channel('flow-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const record = payload.new as OrderRecord;
            if (record && record.orderId) {
              setOrders(prev => {
                const idx = prev.findIndex(o => o.orderId === record.orderId);
                let next: OrderRecord[];
                if (idx >= 0) {
                  next = [...prev];
                  next[idx] = { ...next[idx], ...record };
                } else {
                  next = [record, ...prev];
                }
                try { localStorage.setItem('zuboc_orders_cache', JSON.stringify(next)); } catch {}
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.orderId;
            if (deletedId) {
              setOrders(prev => {
                const next = prev.filter(o => o.orderId !== deletedId);
                try { localStorage.setItem('zuboc_orders_cache', JSON.stringify(next)); } catch {}
                return next;
              });
            }
          }
        }
      )
      .subscribe();

    const staffChannel = supabase
      .channel('flow-staffs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staffs' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const stf = payload.new as StaffMember;
            if (stf && stf.id) {
              setStaffList(prev => {
                const idx = prev.findIndex(s => s.id === stf.id);
                let next: StaffMember[];
                if (idx >= 0) {
                  next = [...prev];
                  next[idx] = { ...next[idx], ...stf };
                } else {
                  next = [...prev, stf];
                }
                try { localStorage.setItem('zuboc_staffs_cache', JSON.stringify(next)); } catch {}
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setStaffList(prev => {
                const next = prev.filter(s => s.id !== deletedId);
                try { localStorage.setItem('zuboc_staffs_cache', JSON.stringify(next)); } catch {}
                return next;
              });
            }
          }
        }
      )
      .subscribe();

    // Polling every 4 seconds guarantees cross-browser sync even if WebSocket drops
    const syncInterval = setInterval(() => {
      fetchOrdersAPI();
      fetchStaffsAPI();
    }, 4000);

    const handleFocus = () => {
      fetchOrdersAPI();
      fetchStaffsAPI();
    };
    window.addEventListener('focus', handleFocus);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOrdersAPI();
        fetchStaffsAPI();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('zuboc_flow_sync');
      bc.onmessage = (msg) => {
        if (msg.data?.type === 'SYNC_REFRESH') {
          fetchOrdersAPI();
          fetchStaffsAPI();
        }
      };
    } catch {}

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(staffChannel);
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (bc) bc.close();
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const cachedUser = localStorage.getItem('zuboc_auth_user');
        if (cachedUser) {
          setCurrentStaff(JSON.parse(cachedUser));
          setIsLoggedIn(true);
        }
        await fetchOrdersAPI();
        await fetchStaffsAPI();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleLoginSuccess = (staff: StaffMember) => {
    setCurrentStaff(staff);
    setIsLoggedIn(true);
    localStorage.setItem('zuboc_auth_user', JSON.stringify(staff));
  };

  const handleLogout = () => {
    localStorage.removeItem('zuboc_auth_user');
    setIsLoggedIn(false);
  };

  const handleOrderCompleted = async (newRecord: OrderRecord) => {
    // 1. Update React state and browser cache immediately (Instant UI)
    setOrders(prev => {
      const next = [newRecord, ...prev.filter(o => o.orderId !== newRecord.orderId)];
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Single-source persistence via server
    try {
      await safeFetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      });
      broadcastSync();
    } catch {}
  };

  const handleUpdateOrder = async (updatedOrder: OrderRecord) => {
    // 1. Update React state and browser cache immediately
    setOrders(prev => {
      const next = prev.map(o => o.orderId === updatedOrder.orderId ? updatedOrder : o);
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Single-source persistence via server
    try {
      await safeFetchJson(`/api/orders/${updatedOrder.orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });
      broadcastSync();
    } catch (apiErr) {}
  };

  const handleDeleteOrder = async (orderId: string) => {
    setOrders(prev => {
      const next = prev.filter(o => o.orderId !== orderId);
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(next));
      } catch {}
      return next;
    });
    try {
      await safeFetchJson(`/api/orders/${orderId}`, { method: 'DELETE' });
      broadcastSync();
    } catch (apiErr) {}
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 font-sans">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-wider font-mono">LOADING ZUBOC FLOW...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => navigate(tab === 'search' ? '/orders' : tab === 'deck' ? '/production-deck' : `/${tab}`)}
        currentStaff={currentStaff}
        setCurrentStaff={(st) => {
          setCurrentStaff(st);
          localStorage.setItem('zuboc_auth_user', JSON.stringify(st));
        }}
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        staffList={staffList}
        onLogout={handleLogout}
      />
      <div className="lg:pl-64 flex-1 flex flex-col min-h-screen">
        <TopHeader
          activeTab={activeTab}
          currentStaff={currentStaff}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          setIsMobileOpen={setIsMobileOpen}
          onRefreshOrders={fetchOrdersAPI}
          onLogout={handleLogout}
          onOpenAddOrder={() => setIsAddOrderOpen(true)}
          onOpenDeck={() => navigate('/production-deck')}
        />
        {isFirestoreQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>Firestore daily read quota limit reached. Backup & Cache Mode Active.</span>
            <button onClick={() => setIsFirestoreQuotaExceeded(false)} className="text-amber-600 font-bold">&times;</button>
          </div>
        )}
        <main className="flex-1 pb-16">
          <Routes>
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/station" element={
              <PackingStation
                currentStaff={currentStaff}
                settings={settings}
                onOrderCompleted={handleOrderCompleted}
                existingOrders={orders}
                onOpenAddOrder={() => setIsAddOrderOpen(true)}
                selectedOrderForPacking={selectedOrderForPacking}
                onClearSelectedPackingOrder={() => setSelectedOrderForPacking(null)}
              />
            } />
            <Route path="/orders" element={
              <SearchRetrieval
                orders={orders}
                onRefreshOrders={fetchOrdersAPI}
                onDeleteOrder={handleDeleteOrder}
                onUpdateOrder={handleUpdateOrder}
                onStartPacking={(ord) => {
                  setSelectedOrderForPacking(ord);
                  navigate('/station');
                }}
                onOpenAddOrder={() => setIsAddOrderOpen(true)}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
              />
            } />
            <Route path="/order/:orderId" element={
              <OrderDetailsPage
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
              />
            } />
            <Route path="/orders/:orderId" element={
              <OrderDetailsPage
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
              />
            } />
            <Route path="/history" element={
              <RecordingHistory
                orders={orders}
                onRefresh={fetchOrdersAPI}
                onDeleteOrder={handleDeleteOrder}
              />
            } />
            <Route path="/admin" element={
              currentStaff.role === 'ADMIN' ? (
                <AdminDashboard
                  orders={orders}
                  settings={settings}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onUpdateOrder={handleUpdateOrder}
                  currentStaffId={currentStaff?.id}
                  currentStaffName={currentStaff?.name}
                />
              ) : (
                <Navigate to="/orders" replace />
              )
            } />
            <Route path="/production-deck" element={
              <ProductionDeck
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                onRefreshOrders={fetchOrdersAPI}
                currentStaff={currentStaff}
                settings={settings}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onSaveCapacityLimit={(limit) => {
                  setSettings(prev => ({ ...prev, maxDailyDispatches: limit }));
                }}
              />
            } />
            <Route path="/calculator" element={
              <ShippingRateCalculator
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffName={currentStaff?.name}
              />
            } />
            <Route path="/sales" element={
              <SalesReports
                orders={orders}
              />
            } />
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </main>
        <UploadQueueBanner />
      </div>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={(newSet) => setSettings(newSet)}
        currentStaff={currentStaff}
        onStaffUpdated={fetchStaffsAPI}
        onStaffChanged={(st) => {
          setCurrentStaff(st);
          localStorage.setItem('zuboc_auth_user', JSON.stringify(st));
        }}
      />
      <AddOrderModal
        isOpen={isAddOrderOpen}
        onClose={() => setIsAddOrderOpen(false)}
        onSuccess={(rec) => {
          handleOrderCompleted(rec);
          fetchOrdersAPI();
        }}
        currentStaffId={currentStaff?.id}
        currentStaffName={currentStaff?.name}
      />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/public-deck" element={<PublicProductionDeck />} />
        <Route path="/diagnose" element={<DiagnosePage />} />
        <Route path="*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
