import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { PackingStation } from './components/PackingStation';
import { SearchRetrieval } from './components/SearchRetrieval';
import { RecordingHistory } from './components/RecordingHistory';
import { AdminDashboard } from './components/AdminDashboard';
import { SettingsModal } from './components/SettingsModal';
import { UploadQueueBanner } from './components/UploadQueueBanner';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'station' | 'search' | 'history' | 'admin'>('station');
  const [currentStaff, setCurrentStaff] = useState<StaffMember>({
    id: 'Staff-01',
    name: 'Alex Packer',
    role: 'PACKER',
    stationId: 'Packing-01'
  });
  const [settings, setSettings] = useState<AppSettings>({
    telegramBotToken: '',
    telegramChatId: '',
    hasToken: false,
    autoUpload: true,
    stationId: 'Packing-01'
  });
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  useEffect(() => {
    Promise.all([fetchOrdersAPI(), fetchSettingsAPI()]).finally(() => {
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

  const handleOrderCompleted = (newRecord: OrderRecord) => {
    setOrders(prev => [newRecord, ...prev.filter(o => o.orderId !== newRecord.orderId)]);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Persistent Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentStaff={currentStaff}
        setCurrentStaff={setCurrentStaff}
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
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
        />

        {/* Dynamic Page Views */}
        <main className="flex-1 pb-16">
          {activeTab === 'station' && (
            <PackingStation
              currentStaff={currentStaff}
              settings={settings}
              onOrderCompleted={handleOrderCompleted}
              existingOrders={orders}
            />
          )}

          {activeTab === 'search' && (
            <SearchRetrieval
              orders={orders}
              onRefreshOrders={fetchOrdersAPI}
              onDeleteOrder={handleDeleteOrder}
            />
          )}

          {activeTab === 'history' && (
            <RecordingHistory
              orders={orders}
              onRefresh={fetchOrdersAPI}
              onDeleteOrder={handleDeleteOrder}
            />
          )}

          {activeTab === 'admin' && (
            <AdminDashboard
              orders={orders}
              settings={settings}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}
        </main>

        <UploadQueueBanner />

        <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between px-6 gap-2">
          <div>ZUBOC VMS — Enterprise Physical Logistics Portal</div>
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>SYSTEM OPERATIONAL</span>
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
      />

    </div>
  );
}
