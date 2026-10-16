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
import { OrderRecord, StaffMember, AppSettings } from './types';
import { collection, onSnapshot, query, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { safeFetchJson } from './utils/api';
import { cleanForFirestore } from './utils/firestoreHelper';
import { INITIAL_FALLBACK_ORDERS } from './utils/initialOrders';
import { INITIAL_STAFFS } from './utils/initialStaffs';

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
  const getActiveTab = (path: string): 'station' | 'search' | 'history' | 'admin' | 'calculator' => {
    if (path === '/station') return 'station';
    if (path === '/orders' || path === '/search' || path === '/') return 'search';
    if (path === '/calculator' || path === '/rate-calculator') return 'calculator';
    if (path === '/history') return 'history';
    if (path === '/admin' || path === '/insights') return 'admin';
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

  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    try {
      const cached = localStorage.getItem('zuboc_staffs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_STAFFS;
  });

  const [settings, setSettings] = useState<AppSettings>({
    telegramBotToken: '',
    telegramChatId: '',
    hasToken: false,
    autoUpload: true,
    stationId: 'Packing-01'
  });

  const [orders, setOrders] = useState<OrderRecord[]>(() => {
    try {
      const cached = localStorage.getItem('zuboc_orders_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading cached orders from localStorage:', e);
    }
    return INITIAL_FALLBACK_ORDERS;
  });

  const [isFirestoreQuotaExceeded, setIsFirestoreQuotaExceeded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [selectedOrderForPacking, setSelectedOrderForPacking] = useState<OrderRecord | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-sync orders state into localStorage on any change
  useEffect(() => {
    if (orders && orders.length > 0) {
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(orders));
      } catch (e) {
        console.warn('Error saving orders to localStorage:', e);
      }
    }
  }, [orders]);

  const fetchOrdersAPI = async () => {
    try {
      const data = await safeFetchJson('/api/orders');
      if (Array.isArray(data) && data.length > 0) {
        setOrders(prev => {
          const map = new Map<string, OrderRecord>();
          // Seed with incoming API orders
          data.forEach(o => {
            if (o && o.orderId) map.set(o.orderId, o);
          });
          // Preserve any local orders and edits that are newer
          prev.forEach(localOrd => {
            if (!localOrd || !localOrd.orderId) return;
            const remoteOrd = map.get(localOrd.orderId);
            if (!remoteOrd) {
              map.set(localOrd.orderId, localOrd);
            } else {
              const localTime = new Date(localOrd.updatedAt || localOrd.createdAt || 0).getTime();
              const remoteTime = new Date(remoteOrd.updatedAt || remoteOrd.createdAt || 0).getTime();
              if (localTime >= remoteTime) {
                map.set(localOrd.orderId, { ...remoteOrd, ...localOrd });
              }
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          try {
            localStorage.setItem('zuboc_orders_cache', JSON.stringify(merged));
          } catch {}
          return merged;
        });
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
      if (Array.isArray(data) && data.length > 0) {
        setStaffList(prev => {
          const map = new Map<string, StaffMember>();
          INITIAL_STAFFS.forEach(s => map.set(s.id.toLowerCase(), s));
          prev.forEach(s => map.set(s.id.toLowerCase(), s));
          data.forEach(s => map.set(s.id.toLowerCase(), s));
          const list = Array.from(map.values());
          try {
            localStorage.setItem('zuboc_staffs_cache', JSON.stringify(list));
          } catch {}
          return list;
        });
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
            list.push(doc.data() as OrderRecord);
          });
          if (list.length > 0) {
            setOrders(prev => {
              const map = new Map<string, OrderRecord>();
              list.forEach(o => map.set(o.orderId, o));
              // Merge local orders to keep offline edits
              prev.forEach(localOrd => {
                const remote = map.get(localOrd.orderId);
                if (!remote) {
                  map.set(localOrd.orderId, localOrd);
                } else {
                  const localTime = new Date(localOrd.updatedAt || 0).getTime();
                  const remoteTime = new Date(remote.updatedAt || 0).getTime();
                  if (localTime >= remoteTime) {
                    map.set(localOrd.orderId, { ...remote, ...localOrd });
                  }
                }
              });
              const merged = Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              try {
                localStorage.setItem('zuboc_orders_cache', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        },
        (error: any) => {
          if (error?.message?.includes('Quota') || error?.code === 'resource-exhausted') {
            setIsFirestoreQuotaExceeded(true);
            console.warn('Firestore daily read quota limit reached. Using persistent local storage & server backup.');
          } else {
            console.warn('Firestore subscription status:', error?.message);
          }
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

  const handleOrderCompleted = async (newRecord: OrderRecord) => {
    setOrders(prev => {
      const next = [newRecord, ...prev.filter(o => o.orderId !== newRecord.orderId)];
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      const docRef = doc(db, 'orders', newRecord.orderId);
      await setDoc(docRef, cleanForFirestore(newRecord), { merge: true });
    } catch (fsErr: any) {
      console.warn('Firestore client write on order completed:', fsErr?.message || fsErr);
      if (fsErr?.message?.includes('Quota') || fsErr?.code === 'resource-exhausted') {
        setIsFirestoreQuotaExceeded(true);
      }
    }

    try {
      await safeFetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      });
    } catch {}
  };

  const handleUpdateOrder = async (updatedOrder: OrderRecord) => {
    console.log('App: handleUpdateOrder called for', updatedOrder.orderId, 'Status:', updatedOrder.fulfillmentStatus);
    
    // 1. Immediate local state & localStorage persistence (Zero revert guarantee)
    setOrders(prev => {
      const next = prev.map(o => o.orderId === updatedOrder.orderId ? updatedOrder : o);
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Direct client-side Firestore write
    try {
      const docRef = doc(db, 'orders', updatedOrder.orderId);
      await setDoc(docRef, cleanForFirestore(updatedOrder), { merge: true });
      console.log('Firestore write succeeded for order:', updatedOrder.orderId);
    } catch (fsErr: any) {
      console.warn('Firestore write failed/offline (using local storage & server):', fsErr?.message || fsErr);
      if (fsErr?.message?.includes('Quota') || fsErr?.code === 'resource-exhausted') {
        setIsFirestoreQuotaExceeded(true);
      }
    }

    // 3. Secondary API write for Node Express server if running
    try {
      await safeFetchJson(`/api/orders/${updatedOrder.orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });
    } catch (apiErr) {
      console.warn('Server API order update skipped/deferred:', apiErr);
    }
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
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (fsErr: any) {
      console.warn('Firestore client delete error:', fsErr?.message || fsErr);
    }
    try {
      await safeFetchJson(`/api/orders/${orderId}`, { method: 'DELETE' });
    } catch (apiErr) {
      console.warn('Server API delete deferred');
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

        {isFirestoreQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-900 bg-amber-200/60 px-1.5 py-0.5 rounded text-[11px] uppercase tracking-wide">Backup & Cache Mode</span>
              <span>
                Firestore daily read quota limit reached for today. Orders & edits are actively saved in persistent Local Storage & Zuboc server backup. Free quota resets tomorrow.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0834100727/firestore/databases/ai-studio-packvisionvms-e5327fc1-c93a-4e08-b2b9-5787bd242adc/data?openUpgradeDialog=true"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-amber-900 underline hover:text-amber-950"
              >
                Manage / Upgrade Quota &rarr;
              </a>
              <button
                onClick={() => setIsFirestoreQuotaExceeded(false)}
                className="text-amber-600 hover:text-amber-900 font-bold ml-2 text-sm px-1 cursor-pointer"
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        )}

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
            <Route path="/insights" element={
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
            <Route path="/calculator" element={
              <ShippingRateCalculator
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffName={currentStaff?.name}
              />
            } />
            <Route path="/rate-calculator" element={<Navigate to="/calculator" replace />} />
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
