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
import { DesignerDashboard } from './components/DesignerDashboard';
import { ProductionWorkflowDashboard } from './components/ProductionWorkflowDashboard';
import { UsersPage } from './components/UsersPage';
import { LiveAlertTicker } from './components/LiveAlertTicker';
import { OrderRecord, StaffMember, AppSettings, isAmazonOrder } from './types';
import { collection, query, doc, setDoc, deleteDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { safeFetchJson } from './utils/api';
import { supabase, cleanForSupabase } from './supabase';
import { cleanForFirestore } from './utils/firestoreHelper';
import { INITIAL_FALLBACK_ORDERS } from './utils/initialOrders';


const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles: string[];
  currentStaff: StaffMember | null;
  redirectTo?: string;
}> = ({ children, allowedRoles, currentStaff, redirectTo = '/orders' }) => {
  if (!currentStaff || !allowedRoles.includes(currentStaff.role)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales' | 'designer' | 'production-workflow' | 'users'>('station');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/production-deck')) setActiveTab('deck');
    else if (path.includes('/designer')) setActiveTab('designer');
    else if (path.includes('/production-workflow')) setActiveTab('production-workflow');
    else if (path.includes('/users')) setActiveTab('users');
    else if (path.includes('/station')) setActiveTab('station');
    else if (path.includes('/calculator')) setActiveTab('calculator');
    else if (path.includes('/admin') || path.includes('/insights')) setActiveTab('admin');
    else if (path.includes('/history')) setActiveTab('history');
    else if (path.includes('/sales')) setActiveTab('sales');
    else setActiveTab('search');
  }, [location]);

  const [orders, setOrders] = useState<OrderRecord[]>(() => {
    try {
      const cached = localStorage.getItem('zuboc_orders_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_FALLBACK_ORDERS;
  });
  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    try {
      const cached = localStorage.getItem('zuboc_staffs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Fixed: should be true initially
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
    const allOrdersMap: Record<string, OrderRecord> = {};

    // 1. Fetch Express backend server orders (in-memory & local backup)
    try {
      const serverResponse = await safeFetchJson('/api/orders');
      if (Array.isArray(serverResponse)) {
        for (const o of serverResponse) {
          if (o && o.orderId) allOrdersMap[o.orderId] = o;
        }
      }
    } catch {}

    // 2. Fetch direct Supabase client-side orders only as fallback if backend is empty
    if (Object.keys(allOrdersMap).length === 0) {
      try {
        const { data: supaOrders, error: supaErr } = await supabase
          .from('orders')
          .select('orderId, staffId, stationId, recordingStartedAt, recordingCompletedAt, durationSeconds, recordingStatus, uploadStatus, evidenceType, videoUrl, photoUrls, awbNumber, courier, deliveryMethod, weight, productSku, customerName, contactPerson, contactPhone, orderReceivedDate, dispatchDate, deliveredDate, orderAmount, shippingAmount, orderTotal, itemCount, fulfillmentStatus, notes, remarks, clientName, product, promisedDeliveryDate, productionStage, stageDueDates, productionNotes, isProductionDeckOrder, isDesignRequired, workflowStatus, assignedDesignerId, assignedDesignerName, createdAt, updatedAt, order_source, orderSource, order_number_num, email')
          .order('createdAt', { ascending: false });
        if (!supaErr && Array.isArray(supaOrders)) {
          for (const o of supaOrders) {
            if (o && o.orderId) {
              allOrdersMap[o.orderId] = { ...(allOrdersMap[o.orderId] || {}), ...o };
            }
          }
        }
      } catch {}
    }

    const mergedList = Object.values(allOrdersMap).map(o => {
      if (isAmazonOrder(o)) {
        return { ...o, order_source: 'amazon' as const, orderSource: 'amazon' as const };
      }
      return { ...o, order_source: o.order_source || 'website', orderSource: o.orderSource || 'website' };
    }).sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
    if (mergedList.length > 0) {
      setOrders(mergedList);
      try { localStorage.setItem('zuboc_orders_cache', JSON.stringify(mergedList)); } catch {}
    }
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
        (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const rawRecord = payload.new as OrderRecord;
            if (rawRecord && rawRecord.orderId) {
              const isAmazon = isAmazonOrder(rawRecord);
              const record: OrderRecord = {
                ...rawRecord,
                order_source: isAmazon ? 'amazon' : (rawRecord.order_source || 'website'),
                orderSource: isAmazon ? 'amazon' : (rawRecord.orderSource || 'website'),
              };
              setOrders(prev => {
                const filtered = prev.filter(o => o.orderId !== record.orderId);
                const next = [record, ...filtered];
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
        (payload: any) => {
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

    // Polling every 30 seconds as background fallback (realtime websockets handle live updates)
    const syncInterval = setInterval(() => {
      fetchOrdersAPI();
      fetchStaffsAPI();
    }, 30000);

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
    if (staff.role === 'DESIGNER') {
      navigate('/designer');
    } else if (staff.role === 'PRODUCTION') {
      navigate('/production-workflow');
    } else if (staff.role === 'ADMIN') {
      navigate('/admin');
    } else {
      navigate('/orders');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zuboc_auth_user');
    setIsLoggedIn(false);
  };

  const handleOrderCompleted = async (newRecord: OrderRecord) => {
    const isAmazon = isAmazonOrder(newRecord);
    const finalRecord: OrderRecord = {
      ...newRecord,
      order_source: isAmazon ? 'amazon' : (newRecord.order_source || 'website'),
      orderSource: isAmazon ? 'amazon' : (newRecord.orderSource || 'website'),
      createdAt: newRecord.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Update React state and browser cache immediately (Always at index 0 / TOP)
    setOrders(prev => {
      const next = [finalRecord, ...prev.filter(o => o.orderId !== finalRecord.orderId)];
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
        body: JSON.stringify(finalRecord)
      });
      broadcastSync();
    } catch {}

    // 3. Write directly to Supabase client-side as well
    try {
      const supaPayload = cleanForSupabase(finalRecord);
      if (supaPayload && supaPayload.orderId) {
        const { isDesignRequired, workflowStatus, assignedDesignerId, assignedDesignerName, ...corePayload } = supaPayload as any;
        await supabase.from('orders').upsert(corePayload, { onConflict: 'orderId' });
        if (isDesignRequired !== undefined || workflowStatus) {
          await supabase.from('department_order_workflow').upsert({
            orderId: finalRecord.orderId,
            isDesignRequired: Boolean(isDesignRequired || workflowStatus === 'DESIGN_PENDING'),
            workflowStatus: workflowStatus || (isDesignRequired ? 'DESIGN_PENDING' : 'CRE_CREATED'),
            assignedDesignerId: assignedDesignerId || null,
            assignedDesignerName: assignedDesignerName || null,
            updatedAt: new Date().toISOString()
          }, { onConflict: 'orderId' });
        }
      }
    } catch {}

    // 4. Switch channel filter tab so newly added order is immediately visible
    window.dispatchEvent(new CustomEvent('zuboc_switch_channel', { 
      detail: isAmazon ? 'amazon' : 'website' 
    }));
  };

  const handleUpdateOrder = async (updatedOrder: OrderRecord) => {
    if (!updatedOrder || !updatedOrder.orderId) return;

    // 1. Update React state and browser cache immediately (Instant UI update)
    setOrders(prev => {
      const idx = prev.findIndex(o => 
        o.orderId === updatedOrder.orderId || 
        o.orderId?.toLowerCase() === updatedOrder.orderId?.toLowerCase() ||
        o.orderId?.replace(/^#/, '') === updatedOrder.orderId?.replace(/^#/, '')
      );
      let next: OrderRecord[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], ...updatedOrder };
      } else {
        next = [updatedOrder, ...prev];
      }
      try {
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Persist to Express backend
    try {
      const safeId = encodeURIComponent(updatedOrder.orderId);
      await safeFetchJson(`/api/orders/${safeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });
    } catch (apiErr) {
      console.warn('Backend order update notice:', apiErr);
    }

    // 3. Persist directly to Supabase client-side for dual-guarantee database write
    try {
      const supaPayload = cleanForSupabase(updatedOrder);
      if (supaPayload && supaPayload.orderId) {
        const { isDesignRequired, workflowStatus, assignedDesignerId, assignedDesignerName, ...corePayload } = supaPayload as any;
        await supabase.from('orders').upsert(corePayload, { onConflict: 'orderId' });
        if (isDesignRequired !== undefined || workflowStatus) {
          await supabase.from('department_order_workflow').upsert({
            orderId: updatedOrder.orderId,
            isDesignRequired: Boolean(isDesignRequired || workflowStatus === 'DESIGN_PENDING'),
            workflowStatus: workflowStatus || (isDesignRequired ? 'DESIGN_PENDING' : 'CRE_CREATED'),
            assignedDesignerId: assignedDesignerId || null,
            assignedDesignerName: assignedDesignerName || null,
            updatedAt: new Date().toISOString()
          }, { onConflict: 'orderId' });
        }
      }
    } catch (supaErr) {
      console.warn('Supabase client-side order update notice:', supaErr);
    }

    broadcastSync();
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
    } catch (apiErr) {
      console.warn('API delete notice:', apiErr);
    }
    try {
      await supabase.from('orders').delete().eq('orderId', orderId);
    } catch (supaErr) {
      console.warn('Supabase direct delete notice:', supaErr);
    }
    broadcastSync();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 font-sans">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-wider font-mono">LOADING ZUBOC FLOW...</p>
      </div>
    );
  }

  if (!isLoggedIn || !currentStaff) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => navigate(tab === 'search' ? '/orders' : tab === 'deck' ? '/production-deck' : tab === 'designer' ? '/designer' : tab === 'production-workflow' ? '/production-workflow' : tab === 'users' ? '/users' : `/${tab}`)}
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
        {(location.pathname.includes('/orders') || 
           location.pathname.includes('/production-deck') || 
           location.pathname.includes('/public-deck')) && (
          <LiveAlertTicker orders={orders} />
        )}
        {isFirestoreQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>Firestore daily read quota limit reached. Backup & Cache Mode Active.</span>
            <button onClick={() => setIsFirestoreQuotaExceeded(false)} className="text-amber-600 font-bold">&times;</button>
          </div>
        )}
        <main className="flex-1 pb-16">
          <Routes>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="station" element={
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
            <Route path="orders" element={
              currentStaff?.role === 'DESIGNER' ? <Navigate to="/designer" replace /> :
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
            <Route path="order/:orderId" element={
              currentStaff?.role === 'DESIGNER' ? <Navigate to="/designer" replace /> :
              <OrderDetailsPage
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
                currentStaffRole={currentStaff?.role}
              />
            } />
            <Route path="orders/:orderId" element={
              currentStaff?.role === 'DESIGNER' ? <Navigate to="/designer" replace /> :
              <OrderDetailsPage
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffId={currentStaff?.id}
                currentStaffName={currentStaff?.name}
                currentStaffRole={currentStaff?.role}
              />
            } />
            <Route path="history" element={
              <RecordingHistory
                orders={currentStaff.role === 'DESIGNER'
                  ? orders.filter(o => {
                      const isMine = o.assignedDesignerId === currentStaff.id ||
                        (o.assignedDesignerName && o.assignedDesignerName.toLowerCase() === currentStaff.name.toLowerCase()) ||
                        (o.staffId && o.staffId.toLowerCase() === currentStaff.name.toLowerCase());
                      return isMine;
                    })
                  : orders
                }
                onRefresh={fetchOrdersAPI}
                onDeleteOrder={handleDeleteOrder}
              />
            } />
            <Route path="admin" element={
              <ProtectedRoute allowedRoles={['ADMIN']} currentStaff={currentStaff}>
                {currentStaff && (
                  <AdminDashboard
                    orders={orders}
                    settings={settings}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onUpdateOrder={handleUpdateOrder}
                    currentStaffId={currentStaff.id}
                    currentStaffName={currentStaff.name}
                  />
                )}
              </ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={['ADMIN']} currentStaff={currentStaff}>
                <UsersPage />
              </ProtectedRoute>
            } />
            <Route path="production-deck" element={
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
            <Route path="calculator" element={
              <ShippingRateCalculator
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
                currentStaffName={currentStaff?.name}
              />
            } />
            <Route path="sales" element={
              <SalesReports
                orders={orders}
              />
            } />
            <Route path="designer" element={
              <DesignerDashboard currentStaff={currentStaff} />
            } />
            <Route path="production-workflow" element={
              <ProductionWorkflowDashboard
                currentStaff={currentStaff}
                onNavigateToCRE={() => navigate('/orders')}
              />
            } />
            <Route path="*" element={<Navigate to="orders" replace />} />
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
      {/* UserManagementModal removed */}
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/public-deck" element={<PublicProductionDeck />} />
        <Route path="/diagnose" element={<DiagnosePage />} />
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
