import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { PackingStation } from './components/PackingStation';
import { SearchRetrieval } from './components/SearchRetrieval';
import { RecordingHistory } from './components/RecordingHistory';
import { AdminDashboard } from './components/AdminDashboard';
import { DiagnosePage } from './components/DiagnosePage';
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
  const [activeTab, setActiveTab] = useState<'station' | 'search' | 'history' | 'admin' | 'diagnose'>('station');
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
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) {
        setOrders(prev => prev.filter(o => o.orderId !== orderId));
      }
    } catch (err) {
      console.error('Error deleting order:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08090c] flex flex-col items-center justify-center text-white font-mono">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">INITIALIZING ZUBOC VMS CONTROL ROOM...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090c] text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-slate-950 bg-tech-grid">
      
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentStaff={currentStaff}
        setCurrentStaff={setCurrentStaff}
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 pb-12">
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

        {activeTab === 'diagnose' && (
          <DiagnosePage
            settings={settings}
            orders={orders}
            onRefreshOrders={fetchOrdersAPI}
            onSaveSettings={(newSet) => setSettings(newSet)}
          />
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={(newSet) => setSettings(newSet)}
      />

      <UploadQueueBanner />

      <footer className="bg-[#050608] border-t border-[#181f2f] py-4 text-center text-[11px] text-slate-500 font-mono flex items-center justify-between px-6">
        <div>ZUBOC VMS — PHYSICAL LOGISTICS & EVIDENCE GATEWAY</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 led-emerald"></span>
          <span>SECURE TELEMETRY ACTIVE</span>
        </div>
      </footer>

    </div>
  );
}
