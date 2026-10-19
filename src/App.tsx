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
import { OrderRecord, StaffMember, AppSettings } from './types';
import { collection, query, doc, setDoc, deleteDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { safeFetchJson } from './utils/api';
import { cleanForFirestore } from './utils/firestoreHelper';
import { INITIAL_FALLBACK_ORDERS } from './utils/initialOrders';
import { INITIAL_STAFFS } from './utils/initialStaffs';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck'>('station');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/production-deck')) setActiveTab('deck');
    else if (path.includes('/station')) setActiveTab('station');
    else if (path.includes('/calculator')) setActiveTab('calculator');
    else if (path.includes('/admin') || path.includes('/insights')) setActiveTab('admin');
    else if (path.includes('/history')) setActiveTab('history');
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
    // 1. Always try loading from cache first (0 network, 0 quota)
    const cached = localStorage.getItem('zuboc_orders_cache');
    let hasCached = false;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrders(parsed);
          hasCached = true;
        }
      } catch {}
    }

    // 2. Try server API (consumes 0 Firestore reads because server serves from memory)
    try {
      const response = await safeFetchJson('/api/orders');
      if (response && Array.isArray(response) && response.length > 0) {
        setOrders(response);
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(response));
        return;
      }
    } catch {}

    // 3. Only query direct Firestore if cache was completely empty and quota not exceeded
    if (!hasCached && !isFirestoreQuotaExceeded) {
      try {
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(25));
        const snap = await getDocs(q);
        const fsOrders = snap.docs.map((d: any) => d.data() as OrderRecord);
        if (fsOrders.length > 0) {
          setOrders(fsOrders);
          localStorage.setItem('zuboc_orders_cache', JSON.stringify(fsOrders));
        }
      } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota') || e?.message?.includes('quota')) {
          setIsFirestoreQuotaExceeded(true);
        }
      }
    }
  };

  const fetchStaffsAPI = async () => {
    try {
      const response = await safeFetchJson('/api/staffs');
      if (response && Array.isArray(response)) {
        setStaffList(response);
      }
    } catch {}
  };

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

    // 2. Single-source persistence via server (eliminates duplicate Firestore writes)
    try {
      await safeFetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      });
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
    } catch (apiErr) {}
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 font-sans">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-wider font-mono">LOADING ZUBOC VMS...</p>
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
              <AdminDashboard
                orders={orders}
                settings={settings}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onUpdateOrder={handleUpdateOrder}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
              />
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
