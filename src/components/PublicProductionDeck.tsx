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
  RefreshCw,
  X,
  User,
  Calendar,
  FileText,
  Tag,
  Check,
  Printer,
  Scissors,
  Flame,
  Award,
  Zap,
  Info,
  MessageSquare
} from 'lucide-react';
import { 
  OrderRecord, 
  ProductionStage, 
  ZubocCustomisations, 
  SubAssemblyProgress, 
  ZubocTimeline, 
  PaymentGateInfo 
} from '../types';
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

  const customisations: ZubocCustomisations = order.customisations || {
    goldFoil: Boolean(order.notes?.toLowerCase().includes('gold') || order.notes?.toLowerCase().includes('foil')),
    digitalPrinting: true,
    screenPrinting: Boolean(order.notes?.toLowerCase().includes('screen')),
    dieCutting: Boolean(order.notes?.toLowerCase().includes('die') || order.notes?.toLowerCase().includes('cut')),
    waxStamp: Boolean(order.notes?.toLowerCase().includes('wax')),
    rubberStamp: false,
    embosserStamp: Boolean(order.notes?.toLowerCase().includes('emboss')),
    seals: Boolean(order.notes?.toLowerCase().includes('seal'))
  };

  const subAssembly: SubAssemblyProgress = order.subAssemblyProgress || {
    envelopeDieCutting: stage !== 'PRE_PRODUCTION',
    screenPrinting: stage !== 'PRE_PRODUCTION',
    goldFoiling: stage !== 'PRE_PRODUCTION',
    waxSealApplied: stage === 'PHOTOSHOOT' || stage === 'QC_PACKED' || stage === 'DISPATCHED',
    curationCompleted: stage === 'PHOTOSHOOT' || stage === 'QC_PACKED' || stage === 'DISPATCHED',
    photoshootCompleted: stage === 'QC_PACKED' || stage === 'DISPATCHED',
    qcPackedCompleted: stage === 'QC_PACKED' || stage === 'DISPATCHED'
  };

  const completedTasks = Object.values(subAssembly).filter(Boolean).length;
  const totalTasks = Object.keys(subAssembly).length;
  const progressPercent = Math.min(100, Math.round((completedTasks / Math.max(1, totalTasks)) * 100));

  const totalAmount = parseFloat(String(order.paymentGate?.totalBillingAmount || order.orderTotal || order.orderAmount || '18500').replace(/[^0-9.]/g, '')) || 0;
  const advance = parseFloat(String(order.paymentGate?.advanceReceived || (totalAmount > 0 ? totalAmount * 0.5 : '10000')).replace(/[^0-9.]/g, '')) || 0;
  const balance = Math.max(0, totalAmount - advance);
  const balanceStatus = order.paymentGate?.balanceStatus || (balance <= 0 ? 'COMPLETED' : 'PENDING');
  const isBalancePaid = balanceStatus === 'COMPLETED' || balance <= 0;

  const notes = order.productionNotes || order.remarks || order.notes || '';
  const courier = order.courier || '';
  const awbNumber = order.awbNumber || '';

  return {
    clientName,
    product,
    stage,
    dueDate,
    dueStatus,
    dueDays,
    customisations,
    subAssembly,
    completedTasks,
    totalTasks,
    progressPercent,
    totalAmount,
    advance,
    balance,
    isBalancePaid,
    balanceStatus,
    notes,
    courier,
    awbNumber
  };
}

export const PublicProductionDeck: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const fetchPublicOrders = async () => {
    setIsSyncing(true);
    try {
      const cached = localStorage.getItem('zuboc_orders_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOrders(parsed.filter((o: OrderRecord) => o.isProductionDeckOrder));
          }
        } catch {}
      }

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
    const timer = setInterval(() => {
      setCurrentTime(getCurrentISTString());
    }, 1000);
    setCurrentTime(getCurrentISTString());

    const refreshTimer = setInterval(() => {
      fetchPublicOrders();
    }, 5000);

    const handleFocus = () => fetchPublicOrders();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const stageColumns = useMemo(() => {
    const map: Record<ProductionStage, { raw: OrderRecord; norm: ReturnType<typeof normalizeOrder> }[]> = {
      PRE_PRODUCTION: [],
      CURATION_ASSEMBLY: [],
      PHOTOSHOOT: [],
      QC_PACKED: [],
      DISPATCHED: []
    };

    orders.forEach(ord => {
      const norm = normalizeOrder(ord);
      if (map[norm.stage]) {
        map[norm.stage].push({ raw: ord, norm });
      }
    });

    return map;
  }, [orders]);

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased selection:bg-slate-900 selection:text-white">
      
      {/* Header Bar - Glassmorphism Restyle */}
      <header className="px-6 py-5 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-5">
          <div className="transition-transform hover:scale-105 active:scale-95 cursor-pointer">
            <img 
              src="/zuboc-com-svg-1-1.png" 
              alt="Zuboc Flow Logo" 
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className="hidden sm:block h-8 w-px bg-slate-200/80 mx-1" />
          <div className="hidden sm:block">
            <h1 className="text-[13px] font-black uppercase tracking-[0.2em] text-slate-900 leading-tight">
              Live Production Schedule
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Real-time Workshop Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/50 backdrop-blur-md border border-slate-200/60 text-[11px] font-black text-slate-600 tracking-tight shadow-sm">
            <Clock className="w-4 h-4 text-purple-600" />
            <span>{currentTime || 'IST'}</span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-50/80 backdrop-blur-md border border-emerald-200/60 text-emerald-800 text-[11px] font-black tracking-tight shadow-sm">
            <div className="relative">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block" />
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-30" />
            </div>
            <span>{orders.length} ACTIVE JOBS</span>
          </div>

          <button
            onClick={fetchPublicOrders}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-slate-950/20 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'SYNCING...' : 'REFRESH'}</span>
          </button>
        </div>
      </header>

      {/* Main Kanban Grid */}
      <main className="flex-1 p-8 overflow-x-auto">
        {isLoading ? (
          <div className="h-[60vh] flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Synchronizing Flow State...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 w-full max-w-[2000px] mx-auto">
            {STAGES.map((stage) => {
              const columnItems = stageColumns[stage.id] || [];
              const Icon = stage.icon;

              return (
                <div 
                  key={stage.id}
                  className="flex flex-col rounded-[2rem] bg-white/40 backdrop-blur-sm border border-slate-200/50 shadow-sm overflow-hidden min-w-[280px]"
                >
                  {/* Stage Header - Glassmorphism Column */}
                  <div className="p-5 border-b border-slate-200/40 bg-white/60 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl shadow-sm border ${stage.badgeBg}`}>
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h2 className="font-black text-[11px] uppercase tracking-[0.15em] text-slate-900 leading-none">
                          {stage.title.split('. ')[1]}
                        </h2>
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-1.5">
                          {stage.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="w-7 h-7 flex items-center justify-center rounded-xl text-[11px] font-black bg-slate-950 text-white shadow-md shadow-slate-950/20">
                      {columnItems.length}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="flex-1 p-3 space-y-3 min-h-[500px]">
                    {columnItems.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-stone-300 text-xs font-mono italic">
                        No orders in stage
                      </div>
                    ) : (
                      columnItems.map(({ raw, norm }) => (
                        <div 
                          key={raw.orderId}
                          onClick={() => setSelectedOrder(raw)}
                          className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 shadow-xs hover:shadow-md hover:border-[#832f5e]/40 transition-all cursor-pointer group relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#832f5e] opacity-0 group-hover:opacity-100 transition-opacity" />

                          {/* Top Row: Order ID & Urgency Pill */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-black text-[#832f5e] group-hover:underline">
                              #{raw.orderId}
                            </span>
                            
                            {norm.dueStatus === 'OVERDUE' && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">
                                {Math.abs(norm.dueDays)}D OVERDUE
                              </span>
                            )}
                            {norm.dueStatus === 'DUE_TODAY' && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-rose-600 text-white animate-pulse">
                                DUE TODAY
                              </span>
                            )}
                            {norm.dueStatus === 'DAYS_LEFT' && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                                {norm.dueDays}D LEFT
                              </span>
                            )}
                          </div>

                          {/* Stage Promised Date */}
                          {norm.dueDate && (
                            <div className="text-[10px] font-mono text-amber-900 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/80 flex items-center gap-1.5 w-fit font-extrabold">
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Promised: {norm.dueDate}</span>
                            </div>
                          )}

                          {/* Client Name & Product */}
                          <div>
                            <h3 className="font-extrabold text-sm tracking-tight text-slate-900 line-clamp-1 group-hover:text-[#832f5e] transition-colors">
                              {norm.clientName}
                            </h3>
                            <p className="text-xs text-stone-500 font-medium line-clamp-1">
                              {norm.product}
                            </p>
                          </div>

                          {/* Craft / Customisation Badges */}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {norm.customisations.goldFoil && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200/80 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Gold Foil</span>
                              </span>
                            )}
                            {norm.customisations.screenPrinting && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center gap-1">
                                <Layers className="w-2.5 h-2.5" />
                                <span>Screen Print</span>
                              </span>
                            )}
                            {norm.customisations.dieCutting && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60 flex items-center gap-1">
                                <Scissors className="w-2.5 h-2.5" />
                                <span>Die Cut</span>
                              </span>
                            )}
                            {norm.customisations.waxStamp && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60 flex items-center gap-1">
                                <Flame className="w-2.5 h-2.5" />
                                <span>Wax Seal</span>
                              </span>
                            )}
                            {norm.customisations.digitalPrinting && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60 flex items-center gap-1">
                                <Printer className="w-2.5 h-2.5" />
                                <span>Digital</span>
                              </span>
                            )}
                            {norm.customisations.seals && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-teal-50 text-teal-700 border border-teal-200/60 flex items-center gap-1">
                                <Award className="w-2.5 h-2.5" />
                                <span>Seals</span>
                              </span>
                            )}
                          </div>

                          {/* Sub-Assembly Progress Bar */}
                          <div className="space-y-1 pt-1 border-t border-stone-100">
                            <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 font-mono">
                              <span>Assembly Progress:</span>
                              <span className="text-stone-700">{norm.completedTasks}/{norm.totalTasks} Done</span>
                            </div>
                            <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-[#832f5e] h-full rounded-full transition-all duration-300"
                                style={{ width: `${norm.progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Financial / Payment Gate Status */}
                          <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[11px] font-mono">
                            <span className="text-stone-500 font-semibold">
                              Billing: <strong className="text-slate-900">₹{norm.totalAmount.toLocaleString('en-IN')}</strong>
                            </span>
                            {norm.isBalancePaid ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                PAID
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                Bal: ₹{norm.balance.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>

                          {/* Courier & Logistics if present */}
                          {(norm.courier || norm.awbNumber) && (
                            <div className="text-[10px] font-mono text-stone-600 bg-stone-50 px-2 py-1 rounded-lg border border-stone-200 flex items-center justify-between">
                              <span className="font-bold">{norm.courier || 'Courier'}</span>
                              <span className="text-slate-900 font-mono">{norm.awbNumber ? `#${norm.awbNumber}` : 'Assigned'}</span>
                            </div>
                          )}

                          {/* Notes Excerpt */}
                          {norm.notes && (
                            <p className="text-[10px] text-stone-500 italic bg-amber-50/40 p-1.5 rounded border border-amber-100 line-clamp-1">
                              &ldquo;{norm.notes}&rdquo;
                            </p>
                          )}
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

      {/* Detail Modal */}
      {selectedOrder && (
        <PublicOrderDetailsModal 
          order={selectedOrder} 
          onClose={() => setSelectedOrder(null)} 
        />
      )}

      {/* Footer */}
      <footer className="py-4 px-6 bg-white border-t border-stone-200 text-center text-xs text-stone-400 flex items-center justify-between">
        <a 
          href="https://saneejified.me" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="font-mono text-[10px] font-medium text-stone-400 hover:text-[#832f5e] transition-colors"
        >
          crafted by saneejified
        </a>
        <span className="font-mono text-[11px] font-bold text-slate-700">{currentTime || 'Synced'}</span>
      </footer>

    </div>
  );
};

// Modal Component for Full Public Order Details
interface PublicOrderDetailsModalProps {
  order: OrderRecord;
  onClose: () => void;
}

const PublicOrderDetailsModal: React.FC<PublicOrderDetailsModalProps> = ({ order, onClose }) => {
  const norm = normalizeOrder(order);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 rounded-3xl max-w-lg w-full p-6 text-slate-900 shadow-2xl font-sans text-xs space-y-5 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black font-mono text-[#832f5e]">#{order.orderId}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200">
                {norm.stage.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-900">{norm.clientName}</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product & Specifications */}
        <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-stone-500 font-bold uppercase text-[10px]">Product / Suite</span>
            <span className="font-extrabold text-slate-900 text-xs">{norm.product}</span>
          </div>
          {norm.dueDate && (
            <div className="flex items-center justify-between text-amber-900 font-mono font-bold">
              <span>Promised Dispatch:</span>
              <span>{norm.dueDate}</span>
            </div>
          )}
        </div>

        {/* Customisations Breakdown */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-black uppercase text-stone-500 tracking-wider">Craft &amp; Customisations</h4>
          <div className="grid grid-cols-2 gap-2 font-medium">
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${norm.customisations.goldFoil ? 'bg-amber-50 border-amber-200 text-amber-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-400 opacity-60'}`}>
              <Sparkles className={`w-4 h-4 ${norm.customisations.goldFoil ? 'text-amber-500' : ''}`} />
              <span>Gold Foil</span>
            </div>
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${norm.customisations.screenPrinting ? 'bg-blue-50 border-blue-200 text-blue-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-400 opacity-60'}`}>
              <Layers className={`w-4 h-4 ${norm.customisations.screenPrinting ? 'text-blue-500' : ''}`} />
              <span>Screen Print</span>
            </div>
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${norm.customisations.dieCutting ? 'bg-purple-50 border-purple-200 text-purple-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-400 opacity-60'}`}>
              <Scissors className={`w-4 h-4 ${norm.customisations.dieCutting ? 'text-purple-500' : ''}`} />
              <span>Die Cutting</span>
            </div>
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${norm.customisations.waxStamp ? 'bg-rose-50 border-rose-200 text-rose-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-400 opacity-60'}`}>
              <Flame className={`w-4 h-4 ${norm.customisations.waxStamp ? 'text-rose-500' : ''}`} />
              <span>Wax Seal</span>
            </div>
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${norm.customisations.digitalPrinting ? 'bg-slate-100 border-slate-200 text-slate-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-400 opacity-60'}`}>
              <Printer className={`w-4 h-4 ${norm.customisations.digitalPrinting ? 'text-slate-500' : ''}`} />
              <span>Digital</span>
            </div>
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${norm.customisations.seals ? 'bg-teal-50 border-teal-200 text-teal-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-400 opacity-60'}`}>
              <Award className={`w-4 h-4 ${norm.customisations.seals ? 'text-teal-500' : ''}`} />
              <span>Seals</span>
            </div>
          </div>
        </div>

        {/* Payment Gate Summary */}
        <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5 font-mono">
          <div className="flex justify-between text-stone-600">
            <span>Total Billing:</span>
            <span className="font-bold text-slate-900">₹{norm.totalAmount.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>Advance Received:</span>
            <span className="font-bold text-emerald-700">₹{norm.advance.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-1.5 font-extrabold text-xs">
            <span>Balance Due:</span>
            <span className={norm.isBalancePaid ? 'text-emerald-600' : 'text-rose-600'}>
              ₹{norm.balance.toLocaleString('en-IN')} ({norm.isBalancePaid ? 'PAID' : 'PENDING'})
            </span>
          </div>
        </div>

        {/* Production Notes */}
        {norm.notes && (
          <div className="space-y-1">
            <h4 className="text-[11px] font-black uppercase text-stone-500 tracking-wider">Workshop Notes</h4>
            <p className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-stone-700 font-medium text-xs leading-relaxed">
              {norm.notes}
            </p>
          </div>
        )}

        {/* Chronological Remarks / Chat Log */}
        {order.chatNotes && order.chatNotes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-black uppercase text-[#832f5e] flex items-center gap-2">
              <MessageSquare className="w-3 h-3" />
              Live Status Remarks
            </h4>
            <div className="space-y-2 p-3 rounded-2xl bg-slate-50 border border-slate-100 max-h-40 overflow-y-auto">
              {order.chatNotes.map((note) => (
                <div key={note.id} className="flex flex-col border-b border-white pb-2 last:border-0">
                  <p className="text-[11px] text-slate-800 leading-relaxed font-medium">{note.text}</p>
                  <div className="flex items-center gap-2 mt-1 text-[9px] text-stone-400 font-bold uppercase tracking-tight">
                    <span>{note.staffName}</span>
                    <span>•</span>
                    <span>{new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{new Date(note.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default PublicProductionDeck;
