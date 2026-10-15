import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-medium">Connecting to PackVision VMS...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-slate-950">
      
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
          />
        )}

        {activeTab === 'history' && (
          <RecordingHistory
            orders={orders}
            onRefresh={fetchOrdersAPI}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={(newSet) => setSettings(newSet)}
      />

      <UploadQueueBanner />

      <footer className="bg-slate-900 border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        PackVision VMS — Enterprise Order Packing Evidence System
      </footer>

    </div>
  );
}
