import React, { useState, useEffect, useMemo } from 'react';
import { 
  Tv, 
  Sparkles, 
  Layers, 
  Camera, 
  PackageCheck, 
  Truck, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  DollarSign, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { OrderRecord, ProductionStage, ZubocCustomisations } from '../types';
import { getCurrentISTString } from '../utils/time';
import { safeFetchJson } from '../utils/api';

interface StageConfig {
  id: ProductionStage;
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeText: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: StageConfig[] = [
  {
    id: 'PRE_PRODUCTION',
    title: '1. Pre-Production',
    subtitle: 'Die Cutting / Digital / Screen',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    badgeText: 'text-amber-700',
    icon: Sparkles
  },
  {
    id: 'CURATION_ASSEMBLY',
    title: '2. Curation & Assembly',
    subtitle: 'Pasting, folding & sealing',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    badgeText: 'text-purple-700',
    icon: Layers
  },
  {
    id: 'PHOTOSHOOT',
    title: '3. Photography',
    subtitle: 'High-res proofing',
    badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
    badgeText: 'text-sky-700',
    icon: Camera
  },
  {
    id: 'QC_PACKED',
    title: '4. QC & Packed',
    subtitle: 'Final inspection',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeText: 'text-emerald-700',
    icon: PackageCheck
  },
  {
    id: 'DISPATCHED',
    title: '5. Dispatched',
    subtitle: 'In transit / courier',
    badgeBg: 'bg-stone-100 text-stone-700 border-stone-200',
    badgeText: 'text-stone-700',
    icon: Truck
  }
];

function normalizeOrder(order: OrderRecord) {
  const clientName = order.clientName || order.customerName || order.contactPerson || `Client #${order.orderId}`;
  const product = order.product || order.productSku || 'Bespoke Luxury Stationery';

  let stage: ProductionStage = order.productionStage || 'PRE_PRODUCTION';
  if (!order.productionStage) {
    if (order.fulfillmentStatus === 'Shipped' || order.fulfillmentStatus === 'Delivered') {
      stage = 'DISPATCHED';
    } else if (order.fulfillmentStatus === 'Packed' || order.recordingStatus === 'COMPLETED') {
      stage = 'QC_PACKED';
    } else {
      stage = 'PRE_PRODUCTION';
    }
  }

  const stageSpecificDueDate = order.stageDueDates?.[stage];
  const dueDate = stageSpecificDueDate || order.promisedDeliveryDate || order.dispatchDate || order.deliveredDate || order.orderReceivedDate || '';
  
  let dueStatus: 'DUE_TODAY' | 'DUE_TOMORROW' | 'DAYS_LEFT' | 'OVERDUE' | 'NO_DATE' = 'NO_DATE';
  let dueDays = 0;

  if (dueDate) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dueDate);
      target.setHours(0, 0, 0, 0);
      
      const diffMs = target.getTime() - today.getTime();
      dueDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (dueDays < 0) dueStatus = 'OVERDUE';
      else if (dueDays === 0) dueStatus = 'DUE_TODAY';
      else if (dueDays === 1) dueStatus = 'DUE_TOMORROW';
      else dueStatus = 'DAYS_LEFT';
    } catch {
      dueStatus = 'NO_DATE';
    }
  }

  const totalAmount = parseFloat(String(order.paymentGate?.totalBillingAmount || order.orderTotal || order.orderAmount || '18500').replace(/[^0-9.]/g, '')) || 0;
  const advance = parseFloat(String(order.paymentGate?.advanceReceived || (totalAmount > 0 ? totalAmount * 0.5 : '10000')).replace(/[^0-9.]/g, '')) || 0;
  const balance = Math.max(0, totalAmount - advance);
  const balanceStatus = order.paymentGate?.balanceStatus || (balance <= 0 ? 'COMPLETED' : 'PENDING');
  const isBalancePaid = balanceStatus === 'COMPLETED' || balance <= 0;

  return {
    clientName,
    product,
    stage,
    dueDate,
    dueStatus,
    dueDays,
    balance,
    isBalancePaid
  };
}

export const PublicProductionDeck: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3600); // 1 hour

  const fetchPublicOrders = async () => {
    setIsSyncing(true);
    try {
      // 1. Try local cache first for instant display
      const cached = localStorage.getItem('zuboc_orders_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOrders(parsed.filter((o: OrderRecord) => o.isProductionDeckOrder));
          }
        } catch {}
      }

      // 2. Fetch from server API (reads from server memory, 0 Firestore quota used)
      const res = await safeFetchJson('/api/orders');
      if (res && Array.isArray(res) && res.length > 0) {
        setOrders(res.filter((o: OrderRecord) => o.isProductionDeckOrder));
        localStorage.setItem('zuboc_orders_cache', JSON.stringify(res));
      }
    } catch (e) {
      console.warn('Public fetch warning:', e);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchPublicOrders();
    const timeTimer = setInterval(() => setCurrentTime(getCurrentISTString()), 1000);
    const refreshTimer = setInterval(() => {
      fetchPublicOrders();
      setCountdown(3600);
    }, 3600000); // 1 hour
    const countTimer = setInterval(() => {
      setCountdown(c => (c > 1 ? c - 1 : 3600));
    }, 1000);

    return () => {
      clearInterval(timeTimer);
      clearInterval(refreshTimer);
      clearInterval(countTimer);
    };
  }, []);

  const handleManualSync = () => {
    fetchPublicOrders();
    setCountdown(3600);
  };

  const normalizedList = useMemo(() => {
    return orders.map(ord => ({
      raw: ord,
      norm: normalizeOrder(ord)
    }));
  }, [orders]);

  const activeOrdersCount = useMemo(() => {
    return normalizedList.filter(item => item.norm.stage !== 'DISPATCHED').length;
  }, [normalizedList]);

  const stageColumns = useMemo(() => {
    const map: Record<ProductionStage, typeof normalizedList> = {
      PRE_PRODUCTION: [],
      CURATION_ASSEMBLY: [],
      PHOTOSHOOT: [],
      QC_PACKED: [],
      DISPATCHED: []
    };

    normalizedList.forEach(item => {
      if (map[item.norm.stage]) {
        map[item.norm.stage].push(item);
      }
    });

    return map;
  }, [normalizedList]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 flex flex-col font-sans antialiased selection:bg-[#832f5e] selection:text-white">
      
      {/* Minimal Clean Header with Manual Sync Button */}
      <header className="px-6 py-5 bg-white border-b border-stone-200/60 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
        <div className="flex items-center gap-5">
          <img 
            src="https://zuboc.com/cdn/shop/files/zuboc_logo_1.svg?v=1748579899&width=500" 
            alt="Zuboc Logo" 
            className="h-7 w-auto object-contain"
          />
          <div className="h-4 w-px bg-stone-200"></div>
          <span className="text-xs font-bold uppercase tracking-widest text-stone-500 font-mono hidden sm:inline">
            Live Production Schedule
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-stone-100 text-stone-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Active: {activeOrdersCount}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Click to sync now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>

          <span className="text-stone-400 text-[11px] hidden lg:inline">
            Next: {formatCountdown(countdown)}
          </span>
        </div>
      </header>

      {/* Main Minimal Kanban Grid */}
      <main className="flex-1 p-6 overflow-x-auto">
        {isLoading ? (
          <div className="h-96 flex flex-col items-center justify-center text-stone-400">
            <div className="w-6 h-6 border-2 border-[#832f5e] border-t-transparent rounded-full animate-spin mb-2"></div>
            <p className="text-xs font-mono uppercase tracking-widest text-stone-400">Loading...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 min-w-[1250px]">
            {STAGES.map((stage) => {
              const columnItems = stageColumns[stage.id] || [];
              const Icon = stage.icon;

              return (
                <div 
                  key={stage.id}
                  className="flex flex-col rounded-2xl bg-white border border-stone-200/80 shadow-2xs overflow-hidden"
                >
                  {/* Clean Stage Header */}
                  <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg border ${stage.badgeBg}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h2 className="font-bold text-xs uppercase tracking-wider text-stone-800">
                          {stage.title.split('. ')[1]}
                        </h2>
                        <p className="text-[10px] text-stone-400 font-medium">
                          {stage.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-stone-100 text-stone-700">
                      {columnItems.length}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="flex-1 p-3 space-y-2.5 min-h-[480px]">
                    {columnItems.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-stone-300 text-xs font-mono">
                        No orders
                      </div>
                    ) : (
                      columnItems.map(({ raw, norm }) => (
                        <div 
                          key={raw.orderId}
                          className="rounded-xl border border-stone-200/80 bg-white p-3.5 space-y-2 shadow-2xs hover:border-stone-300 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#832f5e]">
                              #{raw.orderId}
                            </span>
                            {norm.dueStatus === 'OVERDUE' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                {Math.abs(norm.dueDays)}D OVERDUE
                              </span>
                            )}
                            {norm.dueStatus === 'DUE_TODAY' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-600 text-white animate-pulse">
                                TODAY
                              </span>
                            )}
                            {norm.dueStatus === 'DAYS_LEFT' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-stone-100 text-stone-600">
                                {norm.dueDays}D LEFT
                              </span>
                            )}
                          </div>

                          {raw.stageDueDates?.[norm.stage] && (
                            <div className="text-[10px] font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 flex items-center gap-1 w-fit font-bold">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>{raw.stageDueDates[norm.stage]}</span>
                            </div>
                          )}

                          <div>
                            <h3 className="font-bold text-xs tracking-tight text-slate-900 truncate">
                              {norm.clientName}
                            </h3>
                            <p className="text-[11px] text-stone-400 font-medium truncate">
                              {norm.product}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="py-4 px-6 bg-white border-t border-stone-200/60 text-center text-xs text-stone-400 flex items-center justify-between">
        <span className="font-mono text-[11px]">Zuboc Luxury Stationery • Public Live Schedule</span>
        <span className="font-mono text-[11px]">{currentTime || 'Synced'}</span>
      </footer>

    </div>
  );
};
export default PublicProductionDeck;
