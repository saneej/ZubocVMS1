import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { PackingStation } from './components/PackingStation';
import { SearchRetrieval } from './components/SearchRetrieval';
import { RecordingHistory } from './components/RecordingHistory';
import { AdminDashboard } from './components/AdminDashboard';
import { OrderDetailsPage } from './components/OrderDetailsPage';
import { SettingsModal } from './components/SettingsModal';
import { AddOrderModal } from './components/AddOrderModal';
import { UploadQueueBanner } from './components/UploadQueueBanner';
import { LoginPage } from './components/LoginPage';
import { OrderRecord, StaffMember, AppSettings } from './types';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, auth } from './firebase';
import { safeFetchJson } from './utils/api';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DEFAULT_STAFF: StaffMember = {
  id: 'Admin-01',
  name: 'David Admin',
  role: 'ADMIN',
  stationId: 'Packing-HQ'
};

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Map path to active tab
  const getActiveTab = (path: string) => {
    if (path === '/station') return 'station';
    if (path === '/orders' || path === '/search' || path === '/') return 'search';
    if (path === '/history') return 'history';
    if (path === '/admin') return 'admin';
    if (path.startsWith('/order/')) return 'search'; // Order detail counts as search context
    return 'search';
  };

  const activeTab = getActiveTab(location.pathname);
  
  // Authentication State
  const [currentStaff, setCurrentStaff] = useState<StaffMember>(() => {
    try {
      const saved = localStorage.getItem('zuboc_auth_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_STAFF;
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('zuboc_auth_user'));
  });

  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  const [settings, setSettings] = useState<AppSettings>({
    telegramBotToken: '',
    telegramChatId: '',
    hasToken: false,
    autoUpload: true,
    stationId: 'Packing-01'
  });

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [selectedOrderForPacking, setSelectedOrderForPacking] = useState<OrderRecord | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrdersAPI = async () => {
    try {
      const data = await safeFetchJson('/api/orders');
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error('Error fetching orders via API:', err);
    }
  };

  const fetchSettingsAPI = async () => {
    try {
      const data = await safeFetchJson('/api/settings');
      if (data) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Error fetching settings via API:', err);
    }
  };

  const fetchStaffsAPI = async () => {
    try {
      const data = await safeFetchJson('/api/staffs');
      if (Array.isArray(data)) {
        setStaffList(data);
      }
    } catch (err) {
      console.warn('Error fetching staffs via API:', err);
    }
  };

  useEffect(() => {
    Promise.all([fetchOrdersAPI(), fetchSettingsAPI(), fetchStaffsAPI()]).finally(() => {
      setIsLoading(false);
    });

    // Real-time listener for Firestore orders
    const ordersPath = 'orders';
    try {
      const q = query(collection(db, ordersPath));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: OrderRecord[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data() as OrderRecord;
            console.log(`Firestore listener: Received order ${data.orderId} with status ${data.fulfillmentStatus}`);
            list.push(data);
          });
          if (list.length > 0) {
            setOrders(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, ordersPath);
        }
      );
      return () => unsubscribe();
    } catch (err) {
      console.warn('Realtime Firestore subscription deferred to server API.');
    }
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

  const handleOrderCompleted = (newRecord: OrderRecord) => {
    setOrders(prev => [newRecord, ...prev.filter(o => o.orderId !== newRecord.orderId)]);
  };

  const handleUpdateOrder = async (updatedOrder: OrderRecord) => {
    // Optimistic update
    setOrders(prev => prev.map(o => o.orderId === updatedOrder.orderId ? updatedOrder : o));
    
    try {
      const res = await safeFetchJson(`/api/orders/${updatedOrder.orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });
      if (!res || !res.success) {
        throw new Error('Failed to update order on server');
      }
      if (res.record) {
        setOrders(prev => prev.map(o => o.orderId === res.record.orderId ? res.record : o));
      }
    } catch (err) {
      console.error('Error updating order:', err);
      // Revert on failure by re-fetching
      fetchOrdersAPI();
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const res = await safeFetchJson(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res && res.success) {
        setOrders(prev => prev.filter(o => o.orderId !== orderId));
      }
    } catch (err) {
      console.error('Error deleting order:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 font-sans">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-wider font-mono">LOADING ZUBOC VMS...</p>
      </div>
    );
  }

  // IF NOT LOGGED IN, RENDER LOGIN PAGE
  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Persistent Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => navigate(`/${tab === 'search' ? 'orders' : tab}`)}
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

      {/* Main Content Area */}
      <div className="lg:pl-64 flex-1 flex flex-col min-h-screen">
        
        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          currentStaff={currentStaff}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          setIsMobileOpen={setIsMobileOpen}
          onRefreshOrders={fetchOrdersAPI}
          onLogout={handleLogout}
          onOpenAddOrder={() => setIsAddOrderOpen(true)}
        />

        {/* Dynamic Page Views */}
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
            <Route path="/search" element={<Navigate to="/orders" replace />} />
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
            <Route path="/order/:orderId" element={
              <OrderDetailsPage
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
              />
            } />
            {/* Fallback to orders */}
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </main>

        <UploadQueueBanner />

        <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between px-6 gap-2">
          <div>Zuboc VMS — Enterprise Packing & Verification Portal</div>
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>OPERATOR: {currentStaff.name} ({currentStaff.role})</span>
            <span className="text-slate-300">|</span>
            <span>STATION: {settings.stationId || 'Packing-01'}</span>
          </div>
        </footer>

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
          // setSelectedOrderForPacking(rec); // Removed redirect
          fetchOrdersAPI();
        }}
        currentStaffId={currentStaff?.id}
        currentStaffName={currentStaff?.name}
      />

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
