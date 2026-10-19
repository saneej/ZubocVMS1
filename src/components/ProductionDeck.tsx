import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Tv, 
  Flame, 
  Scissors, 
  Printer, 
  Layers, 
  Award, 
  Stamp, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Sparkles, 
  Maximize2, 
  Minimize2, 
  Play, 
  Pause, 
  RefreshCw, 
  Search, 
  Calendar, 
  DollarSign, 
  User, 
  FileText, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  ShieldAlert, 
  Sliders, 
  Printer as PrintIcon,
  QrCode,
  Save,
  CheckCircle,
  Truck,
  Camera,
  PackageCheck,
  PackagePlus
} from 'lucide-react';
import { 
  OrderRecord, 
  StaffMember, 
  AppSettings, 
  ProductionStage, 
  ZubocCustomisations, 
  SubAssemblyProgress, 
  ZubocTimeline, 
  PaymentGateInfo 
} from '../types';
import { getCurrentISTString } from '../utils/time';
import { BrowserQRCodeSvgWriter } from '@zxing/library';

interface ProductionDeckProps {
  orders: OrderRecord[];
  onUpdateOrder: (order: OrderRecord) => Promise<void> | void;
  onRefreshOrders?: () => void;
  currentStaff: StaffMember;
  settings: AppSettings;
  onOpenSettings?: () => void;
  onSaveCapacityLimit?: (limit: number) => void;
}

// Stage configuration definition
interface StageConfig {
  id: ProductionStage;
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: StageConfig[] = [
  {
    id: 'PRE_PRODUCTION',
    title: '1. Pre-Production & Print',
    subtitle: 'Die Cutting / Digital / Screen / Foiling',
    badgeBg: 'bg-amber-50 text-amber-700',
    badgeText: 'text-amber-700 border-amber-200',
    headerBorder: 'border-amber-200',
    icon: Sparkles
  },
  {
    id: 'CURATION_ASSEMBLY',
    title: '2. Curation & Assembly',
    subtitle: 'Pasting, folding, ribbon & wax sealing',
    badgeBg: 'bg-purple-50 text-purple-700',
    badgeText: 'text-purple-700 border-purple-200',
    headerBorder: 'border-purple-200',
    icon: Layers
  },
  {
    id: 'PHOTOSHOOT',
    title: '3. Photography Table',
    subtitle: 'High-res proofing in progress',
    badgeBg: 'bg-sky-50 text-sky-700',
    badgeText: 'text-sky-700 border-sky-200',
    headerBorder: 'border-sky-200',
    icon: Camera
  },
  {
    id: 'QC_PACKED',
    title: '4. QC & Packed',
    subtitle: 'Final inspection & ready',
    badgeBg: 'bg-emerald-50 text-emerald-700',
    badgeText: 'text-emerald-700 border-emerald-200',
    headerBorder: 'border-emerald-200',
    icon: PackageCheck
  },
  {
    id: 'DISPATCHED',
    title: '5. Dispatched',
    subtitle: 'Handed over to courier / transit',
    badgeBg: 'bg-stone-100 text-stone-700',
    badgeText: 'text-stone-700 border-stone-200',
    headerBorder: 'border-stone-200',
    icon: Truck
  }
];

// Normalize order data to Zuboc Tracking Form standard
function normalizeOrder(order: OrderRecord): {
  clientName: string;
  product: string;
  stage: ProductionStage;
  dueDate: string;
  dueStatus: 'DUE_TODAY' | 'DUE_TOMORROW' | 'DAYS_LEFT' | 'OVERDUE' | 'NO_DATE';
  dueDays: number;
  customisations: ZubocCustomisations;
  subAssembly: SubAssemblyProgress;
  timeline: ZubocTimeline;
  payment: PaymentGateInfo;
  totalAmount: number;
  advance: number;
  balance: number;
  isBalancePaid: boolean;
  notes: string;
} {
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

      if (dueDays < 0) {
        dueStatus = 'OVERDUE';
      } else if (dueDays === 0) {
        dueStatus = 'DUE_TODAY';
      } else if (dueDays === 1) {
        dueStatus = 'DUE_TOMORROW';
      } else {
        dueStatus = 'DAYS_LEFT';
      }
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

  const totalAmount = parseFloat(String(order.paymentGate?.totalBillingAmount || order.orderTotal || order.orderAmount || '18500').replace(/[^0-9.]/g, '')) || 0;
  const advance = parseFloat(String(order.paymentGate?.advanceReceived || (totalAmount > 0 ? totalAmount * 0.5 : '10000')).replace(/[^0-9.]/g, '')) || 0;
  const calculatedBalance = Math.max(0, totalAmount - advance);
  const balance = order.paymentGate?.balanceAmount !== undefined 
    ? parseFloat(String(order.paymentGate.balanceAmount).replace(/[^0-9.]/g, '')) || 0
    : calculatedBalance;
  
  const balanceStatus = order.paymentGate?.balanceStatus || (balance <= 0 ? 'COMPLETED' : 'PENDING');
  const isBalancePaid = balanceStatus === 'COMPLETED' || balance <= 0;

  const payment: PaymentGateInfo = {
    totalBillingAmount: totalAmount,
    advanceReceived: advance,
    balanceAmount: balance,
    balanceStatus,
    adminDispatchOverride: order.paymentGate?.adminDispatchOverride,
    overrideReason: order.paymentGate?.overrideReason,
    overrideBy: order.paymentGate?.overrideBy,
    overrideTimestamp: order.paymentGate?.overrideTimestamp
  };

  const timeline: ZubocTimeline = order.timeline || {
    orderConfirmationDate: order.orderReceivedDate || order.createdAt?.slice(0, 10),
    designingOutDate: order.orderReceivedDate,
    clientApprovalDate: order.createdAt?.slice(0, 10),
    productionSendDate: order.createdAt?.slice(0, 10),
    productionArrivalDate: order.createdAt?.slice(0, 10),
    assemblyCurationDate: order.dispatchDate,
    photoshootDate: order.dispatchDate,
    dispatchingDate: dueDate
  };

  const notes = order.productionNotes || order.remarks || order.notes || '';

  return {
    clientName,
    product,
    stage,
    dueDate,
    dueStatus,
    dueDays,
    customisations,
    subAssembly,
    timeline,
    payment,
    totalAmount,
    advance,
    balance,
    isBalancePaid,
    notes
  };
}

export const ProductionDeck: React.FC<ProductionDeckProps> = ({
  orders,
  onUpdateOrder,
  onRefreshOrders,
  currentStaff,
  settings,
  onSaveCapacityLimit
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isTvWallMode, setIsTvWallMode] = useState<boolean>(false);
  const [isAutoScrollActive, setIsAutoScrollActive] = useState<boolean>(true);
  const [scrollSpeed, setScrollSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [isUserHovering, setIsUserHovering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState<number>(3600);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedUrgencyFilter, setSelectedUrgencyFilter] = useState<'all' | 'dueToday' | 'balancePending'>('all');

  const [activeEditingOrder, setActiveEditingOrder] = useState<OrderRecord | null>(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState<boolean>(false);
  const [isCapacityModalOpen, setIsCapacityModalOpen] = useState<boolean>(false);
  const [maxDailyDispatches, setMaxDailyDispatches] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('zuboc_tv_capacity_limit');
      if (saved) return parseInt(saved, 10) || 8;
    } catch {}
    return settings.maxDailyDispatches || 8;
  });

  const [dispatchOverrideOrder, setDispatchOverrideOrder] = useState<OrderRecord | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>('Client VIP Credit Term Approved');
  const [overrideAdminName, setOverrideAdminName] = useState<string>(currentStaff.name || 'Admin Floor Supervisor');

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const updateTime = () => setCurrentTime(getCurrentISTString());
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setAutoRefreshCountdown(prev => {
        if (prev <= 1) {
          if (onRefreshOrders) {
            onRefreshOrders();
          }
          return 3600;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onRefreshOrders]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      console.warn('Fullscreen request failed:', e);
    }
  };

  useEffect(() => {
    if (!isAutoScrollActive || isUserHovering || !boardScrollRef.current) {
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
      return;
    }

    const speedStep = scrollSpeed === 'slow' ? 0.6 : scrollSpeed === 'fast' ? 2.2 : 1.2;
    const intervalMs = 40;

    scrollTimerRef.current = setInterval(() => {
      const el = boardScrollRef.current;
      if (!el) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 10) return;

      if (el.scrollTop >= maxScroll - 5) {
        el.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        el.scrollTop += speedStep;
      }
    }, intervalMs);

    return () => {
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
    };
  }, [isAutoScrollActive, isUserHovering, scrollSpeed]);

  const normalizedList = useMemo(() => {
    return orders.filter(ord => ord.isProductionDeckOrder).map(ord => ({
      raw: ord,
      norm: normalizeOrder(ord)
    }));
  }, [orders]);

  const activeOrdersCount = useMemo(() => {
    return normalizedList.filter(item => item.norm.stage !== 'DISPATCHED').length;
  }, [normalizedList]);

  const urgentDueTodayCount = useMemo(() => {
    return normalizedList.filter(
      item => item.norm.stage !== 'DISPATCHED' && (item.norm.dueStatus === 'DUE_TODAY' || item.norm.dueStatus === 'OVERDUE')
    ).length;
  }, [normalizedList]);

  const todayDateString = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  const dispatchesScheduledToday = useMemo(() => {
    return normalizedList.filter(item => {
      const isDueToday = item.norm.dueStatus === 'DUE_TODAY' || item.norm.dueDate === todayDateString;
      const isQcOrDispatched = item.norm.stage === 'QC_PACKED' || item.norm.stage === 'DISPATCHED';
      return isDueToday || (isQcOrDispatched && item.raw.dispatchDate === todayDateString);
    }).length;
  }, [normalizedList, todayDateString]);

  const capacityPercent = Math.min(100, Math.round((dispatchesScheduledToday / Math.max(1, maxDailyDispatches)) * 100));
  const isCapacityFull = dispatchesScheduledToday >= maxDailyDispatches;
  const isCapacityWarning = capacityPercent >= 60 && !isCapacityFull;

  const filteredList = useMemo(() => {
    let result = normalizedList;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.raw.orderId.toLowerCase().includes(q) ||
        item.norm.clientName.toLowerCase().includes(q) ||
        item.norm.product.toLowerCase().includes(q) ||
        item.norm.notes.toLowerCase().includes(q)
      );
    }

    if (selectedUrgencyFilter === 'dueToday') {
      result = result.filter(item => item.norm.dueStatus === 'DUE_TODAY' || item.norm.dueStatus === 'OVERDUE');
    } else if (selectedUrgencyFilter === 'balancePending') {
      result = result.filter(item => !item.norm.isBalancePaid);
    }

    return result;
  }, [normalizedList, searchQuery, selectedUrgencyFilter]);

  const stageColumns = useMemo(() => {
    const map: Record<ProductionStage, typeof normalizedList> = {
      PRE_PRODUCTION: [],
      CURATION_ASSEMBLY: [],
      PHOTOSHOOT: [],
      QC_PACKED: [],
      DISPATCHED: []
    };

    filteredList.forEach(item => {
      map[item.norm.stage].push(item);
    });

    return map;
  }, [filteredList]);

  const handleShiftStage = async (order: OrderRecord, direction: 'prev' | 'next') => {
    const norm = normalizeOrder(order);
    const stagesOrder: ProductionStage[] = ['PRE_PRODUCTION', 'CURATION_ASSEMBLY', 'PHOTOSHOOT', 'QC_PACKED', 'DISPATCHED'];
    const currentIndex = stagesOrder.indexOf(norm.stage);
    
    let targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= stagesOrder.length) return;

    const targetStage = stagesOrder[targetIndex];

    if (targetStage === 'DISPATCHED' && !norm.isBalancePaid && !norm.payment.adminDispatchOverride) {
      setDispatchOverrideOrder(order);
      return;
    }

    const updated: OrderRecord = {
      ...order,
      productionStage: targetStage,
      fulfillmentStatus: targetStage === 'DISPATCHED' ? 'Shipped' : targetStage === 'QC_PACKED' ? 'Packed' : 'Pending',
      updatedAt: new Date().toISOString()
    };

    await onUpdateOrder(updated);
  };

  const handleDropOnStage = async (targetStage: ProductionStage, orderId: string) => {
    const matchedItem = normalizedList.find(item => item.raw.orderId === orderId);
    if (!matchedItem) return;
    const order = matchedItem.raw;
    const norm = matchedItem.norm;

    if (targetStage === 'DISPATCHED' && !norm.isBalancePaid && !norm.payment.adminDispatchOverride) {
      setDispatchOverrideOrder(order);
      return;
    }

    const updated: OrderRecord = {
      ...order,
      productionStage: targetStage,
      fulfillmentStatus: targetStage === 'DISPATCHED' ? 'Shipped' : targetStage === 'QC_PACKED' ? 'Packed' : 'Pending',
      updatedAt: new Date().toISOString()
    };

    await onUpdateOrder(updated);
  };

  const handleConfirmDispatchOverride = async () => {
    if (!dispatchOverrideOrder) return;
    const now = new Date().toISOString();
    const updated: OrderRecord = {
      ...dispatchOverrideOrder,
      productionStage: 'DISPATCHED',
      fulfillmentStatus: 'Shipped',
      paymentGate: {
        ...(dispatchOverrideOrder.paymentGate || {}),
        adminDispatchOverride: true,
        overrideReason,
        overrideBy: overrideAdminName,
        overrideTimestamp: now
      },
      auditLogs: [
        ...(dispatchOverrideOrder.auditLogs || []),
        {
          timestamp: now,
          staffId: currentStaff.id,
          action: 'DISPATCH_OVERRIDE',
          details: `Dispatch authorized despite pending balance of ₹${normalizeOrder(dispatchOverrideOrder).balance}. Reason: ${overrideReason} (By ${overrideAdminName})`,
          type: 'CHANGE_LOG'
        }
      ],
      updatedAt: now
    };

    await onUpdateOrder(updated);
    setDispatchOverrideOrder(null);
  };

  const handleSaveCapacity = (newLimit: number) => {
    setMaxDailyDispatches(newLimit);
    try {
      localStorage.setItem('zuboc_tv_capacity_limit', String(newLimit));
    } catch {}
    if (onSaveCapacityLimit) onSaveCapacityLimit(newLimit);
    setIsCapacityModalOpen(false);
  };

  return (
    <div className={`flex flex-col min-h-screen font-sans antialiased selection:bg-[#832f5e] selection:text-white ${isTvWallMode ? 'bg-slate-950 text-slate-100' : 'bg-[#F4F6F9] text-slate-900'}`}>
      
      {!isTvWallMode && (
        <header className="sticky top-0 z-40 px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Left Title */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#832f5e] text-white flex items-center justify-center shadow-sm">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight font-sans">
                    Production TV Deck
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#832f5e]/10 text-[#832f5e] font-mono border border-[#832f5e]/20">
                    55&quot; TV MONITOR
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 font-medium">
                  Live workshop sub-assembly &amp; dispatch schedule
                </p>
              </div>
            </div>

            {/* Center Metrics & Capacity Bar */}
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Active Jobs */}
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border bg-stone-50 border-stone-200">
                <span className="text-[10px] font-bold uppercase text-stone-500">Active</span>
                <span className="text-base font-black font-mono leading-none">{activeOrdersCount}</span>
              </div>

              {/* Urgent / Due Today */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                urgentDueTodayCount > 0 
                  ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
                  : 'bg-stone-50 border-stone-200 text-stone-700'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold uppercase text-[10px]">Due Today:</span>
                  <span className="font-black font-mono">{urgentDueTodayCount}</span>
                </div>
              </div>

              {/* Daily Capacity Tracker */}
              <div 
                onClick={() => setIsCapacityModalOpen(true)}
                className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border cursor-pointer hover:border-[#832f5e] transition-colors bg-stone-50 border-stone-200"
                title="Click to adjust daily capacity limit"
              >
                <div className="flex flex-col min-w-[130px]">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
                    <span className="text-stone-500">Dispatches Today:</span>
                    <span className={`font-mono font-bold ${isCapacityFull ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {dispatchesScheduledToday}/{maxDailyDispatches}
                    </span>
                  </div>
                  <div className="w-full rounded-full h-1.5 overflow-hidden bg-stone-200">
                    <div 
                      className={`h-full rounded-full ${isCapacityFull ? 'bg-rose-600' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (dispatchesScheduledToday / maxDailyDispatches) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Right Action Tools */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNewOrderModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <PackagePlus className="w-4 h-4" />
                <span className="hidden sm:inline">New Job</span>
              </button>

              <button
                onClick={() => setIsAutoScrollActive(!isAutoScrollActive)}
                className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  isAutoScrollActive 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                    : 'bg-white border-stone-200 text-stone-600'
                }`}
                title="Toggle Auto-Scroll"
              >
                {isAutoScrollActive ? <Play className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" /> : <Pause className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => {
                  if (onRefreshOrders) onRefreshOrders();
                  setAutoRefreshCountdown(30);
                }}
                className="p-2 rounded-xl border text-xs flex items-center gap-1 transition-all cursor-pointer bg-white border-stone-200 text-stone-600"
                title="Refresh Orders"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="font-mono text-[11px]">{autoRefreshCountdown}s</span>
              </button>

              <button
                onClick={() => setIsTvWallMode(!isTvWallMode)}
                className="p-2 rounded-xl border text-xs transition-all cursor-pointer bg-white border-stone-200 text-stone-600 hover:text-stone-900"
                title="Toggle Wall TV Dark Mode"
              >
                <Tv className="w-4 h-4" />
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl border text-xs transition-all cursor-pointer bg-white border-stone-200 text-stone-600"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>

          </div>

          {/* Sub-bar: Search & Urgency Filters */}
          <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs border-stone-200/80">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search orders, client name, product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:border-[#832f5e] bg-white border-stone-200 text-slate-800 placeholder-stone-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: `All (${filteredList.length})` },
                { id: 'dueToday', label: `Due Today (${urgentDueTodayCount})` },
                { id: 'balancePending', label: 'Balance Pending' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedUrgencyFilter(tab.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedUrgencyFilter === tab.id
                      ? 'bg-[#832f5e] text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </header>
      )}

      {/* Floating Exit TV Wall mode button */}
      {isTvWallMode && (
        <button
          onClick={() => setIsTvWallMode(false)}
          className="fixed top-3 right-3 z-50 px-3.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 shadow-xl flex items-center gap-1.5 text-xs font-bold cursor-pointer backdrop-blur-md"
        >
          <Minimize2 className="w-4 h-4 text-amber-400" />
          <span>Exit TV Mode</span>
        </button>
      )}

      {/* =========================================================================
          MAIN KANBAN FLOW GRID
          ========================================================================= */}
      <main 
        ref={boardScrollRef}
        onMouseEnter={() => setIsUserHovering(true)}
        onMouseLeave={() => setIsUserHovering(false)}
        className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 min-w-[1300px]">
          {STAGES.map((stage) => {
            const columnItems = stageColumns[stage.id] || [];
            const Icon = stage.icon;

            return (
              <div 
                key={stage.id} 
                className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all hover:shadow-md"
              >
                {/* Stage Header */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/80">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${stage.badgeBg}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <h2 className={`font-extrabold text-xs uppercase tracking-wide font-sans ${isTvWallMode ? 'text-white' : 'text-stone-800'}`}>
                        {stage.title}
                      </h2>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black border ${stage.badgeText} ${stage.badgeBg}`}>
                      {columnItems.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 font-medium truncate">
                    {stage.subtitle}
                  </p>
                </div>

                {/* Cards List */}
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const orderId = e.dataTransfer.getData('text/plain');
                    if (orderId) handleDropOnStage(stage.id, orderId);
                  }}
                  className="flex-1 p-3 space-y-3 min-h-[500px] transition-colors hover:bg-slate-50/50 rounded-b-2xl"
                >
                  {columnItems.length === 0 ? (
                    <div className={`h-40 flex flex-col items-center justify-center border border-dashed rounded-xl p-4 text-center ${
                      isTvWallMode ? 'border-slate-800 text-slate-600' : 'border-stone-200 text-stone-400'
                    }`}>
                      <Icon className="w-7 h-7 mb-2 opacity-30" />
                      <span className="text-xs font-medium">No orders in stage</span>
                    </div>
                  ) : (
                    columnItems.map(({ raw, norm }) => (
                      <FloorOrderCard
                        key={raw.orderId}
                        order={raw}
                        norm={norm}
                        currentStage={stage.id}
                        isTvWallMode={isTvWallMode}
                        onCardClick={() => setActiveEditingOrder(raw)}
                        onShiftStage={(dir) => handleShiftStage(raw, dir)}
                      />
                    ))
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </main>

      {/* Operator Update Drawer */}
      {activeEditingOrder && (
        <OperatorUpdateDrawer
          order={activeEditingOrder}
          currentStaff={currentStaff}
          onClose={() => setActiveEditingOrder(null)}
          onSave={async (updated) => {
            await onUpdateOrder(updated);
            setActiveEditingOrder(null);
          }}
        />
      )}

      {/* New Floor Job Modal */}
      {isNewOrderModalOpen && (
        <NewFloorJobModal
          currentStaff={currentStaff}
          onClose={() => setIsNewOrderModalOpen(false)}
          onCreated={async (newOrder) => {
            await onUpdateOrder(newOrder);
            setIsNewOrderModalOpen(false);
          }}
        />
      )}

      {/* Capacity Settings Modal */}
      {isCapacityModalOpen && (
        <CapacitySettingsModal
          currentLimit={maxDailyDispatches}
          scheduledToday={dispatchesScheduledToday}
          onClose={() => setIsCapacityModalOpen(false)}
          onSave={handleSaveCapacity}
        />
      )}

      {/* Dispatch Override Modal */}
      {dispatchOverrideOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 text-slate-900 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-rose-600 uppercase">
                  Dispatch Blocked: Balance Pending
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Order #{dispatchOverrideOrder.orderId} has an outstanding balance.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 mb-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-600">Client Name:</span>
                <span className="font-bold text-stone-900">{normalizeOrder(dispatchOverrideOrder).clientName}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-rose-200">
                <span className="font-bold text-rose-800 uppercase">Outstanding Balance:</span>
                <span className="font-mono text-sm font-black text-rose-700">
                  ₹{normalizeOrder(dispatchOverrideOrder).balance.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-xs">
              <div>
                <label className="font-bold text-stone-700 uppercase text-[11px]">Supervisor Name:</label>
                <input
                  type="text"
                  value={overrideAdminName}
                  onChange={(e) => setOverrideAdminName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white border border-stone-300 text-xs focus:outline-none focus:border-[#832f5e]"
                />
              </div>
              <div>
                <label className="font-bold text-stone-700 uppercase text-[11px]">Reason for Release:</label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. VIP Credit Term Approved"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white border border-stone-300 text-xs focus:outline-none focus:border-[#832f5e]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDispatchOverrideOrder(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatchOverride}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wide cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Override &amp; Dispatch</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// =============================================================================
// CLEAN MINIMAL ORDER CARD
// =============================================================================
interface FloorOrderCardProps {
  order: OrderRecord;
  norm: ReturnType<typeof normalizeOrder>;
  currentStage: ProductionStage;
  isTvWallMode: boolean;
  onCardClick: () => void;
  onShiftStage: (dir: 'prev' | 'next') => void;
}

const FloorOrderCard: React.FC<FloorOrderCardProps> = ({
  order,
  norm,
  currentStage,
  isTvWallMode,
  onCardClick,
  onShiftStage
}) => {
  const customisationList = [
    { key: 'goldFoil', label: 'Gold Foil', icon: Sparkles, active: norm.customisations.goldFoil, done: norm.subAssembly.goldFoiling },
    { key: 'dieCutting', label: 'Die Cut', icon: Scissors, active: norm.customisations.dieCutting, done: norm.subAssembly.envelopeDieCutting },
    { key: 'screenPrinting', label: 'Screen Print', icon: Layers, active: norm.customisations.screenPrinting, done: norm.subAssembly.screenPrinting },
    { key: 'digitalPrinting', label: 'Digital', icon: Printer, active: norm.customisations.digitalPrinting, done: true },
    { key: 'waxStamp', label: 'Wax Stamp', icon: Flame, active: norm.customisations.waxStamp, done: norm.subAssembly.waxSealApplied },
    { key: 'seals', label: 'Seals', icon: Award, active: norm.customisations.seals, done: norm.subAssembly.waxSealApplied }
  ].filter(c => c.active);

  const renderDuePill = () => {
    switch (norm.dueStatus) {
      case 'OVERDUE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
            OVERDUE ({Math.abs(norm.dueDays)}D)
          </span>
        );
      case 'DUE_TODAY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white uppercase tracking-wider animate-pulse">
            DUE TODAY
          </span>
        );
      case 'DUE_TOMORROW':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            DUE TOMORROW
          </span>
        );
      case 'DAYS_LEFT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-600">
            {norm.dueDays}D LEFT
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', order.orderId);
      }}
      className={`
        group rounded-xl border transition-all duration-150 shadow-xs hover:shadow-md cursor-grab active:cursor-grabbing overflow-hidden p-3.5 space-y-2.5
        ${isTvWallMode 
          ? 'bg-slate-800/90 border-slate-700 hover:border-slate-500 text-slate-100' 
          : 'bg-white border-stone-200 hover:border-stone-300 text-slate-900'
        }
      `}
      onClick={onCardClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-[#832f5e]">
          #{order.orderId}
        </span>
        {renderDuePill()}
      </div>

      {order.stageDueDates?.[currentStage] && (
        <div className="text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
          <Clock className="w-3 h-3 text-amber-600" />
          <span>Step Target: {order.stageDueDates[currentStage]}</span>
        </div>
      )}

      <div>
        <h3 className="font-bold text-sm tracking-tight leading-snug">
          {norm.clientName}
        </h3>
        <p className="text-xs text-stone-400 font-medium truncate mt-0.5">
          {norm.product}
        </p>
      </div>

      {customisationList.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {customisationList.map(c => {
            const Icon = c.icon;
            return (
              <span
                key={c.key}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${
                  c.done
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : isTvWallMode ? 'bg-slate-900 text-slate-300 border border-slate-700' : 'bg-stone-100 text-stone-600'
                }`}
              >
                <Icon className="w-2.5 h-2.5" />
                <span>{c.label}</span>
              </span>
            );
          })}
        </div>
      )}

      <div>
        {norm.isBalancePaid ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Paid</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <DollarSign className="w-3 h-3 text-rose-600" />
            <span>₹{norm.balance.toLocaleString()} Due (Hold)</span>
          </span>
        )}
      </div>

      <div 
        className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          disabled={currentStage === 'PRE_PRODUCTION'}
          onClick={() => onShiftStage('prev')}
          className="p-1 rounded hover:bg-stone-100 disabled:opacity-20 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span className="text-[10px] font-mono text-stone-400">Tap to edit</span>

        <button
          disabled={currentStage === 'DISPATCHED'}
          onClick={() => onShiftStage('next')}
          className="p-1 rounded hover:bg-stone-100 disabled:opacity-20 cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// Operator Drawer & Modals (Clean Minimal Light Theme)
interface OperatorUpdateDrawerProps {
  order: OrderRecord;
  currentStaff: StaffMember;
  onClose: () => void;
  onSave: (order: OrderRecord) => Promise<void>;
}

const OperatorUpdateDrawer: React.FC<OperatorUpdateDrawerProps> = ({
  order,
  currentStaff,
  onClose,
  onSave
}) => {
  const norm = normalizeOrder(order);

  const [clientName, setClientName] = useState<string>(norm.clientName);
  const [product, setProduct] = useState<string>(norm.product);
  const [formFillingDate, setFormFillingDate] = useState<string>(order.formFillingDate || new Date().toISOString().slice(0, 10));
  const [preparedBy, setPreparedBy] = useState<string>(order.preparedBy || currentStaff.name);
  const [checkedBy, setCheckedBy] = useState<string>(order.checkedBy || 'Supervisor');
  const [customisations, setCustomisations] = useState<ZubocCustomisations>(norm.customisations);
  const [subAssembly, setSubAssembly] = useState<SubAssemblyProgress>(norm.subAssembly);
  const [currentStage, setCurrentStage] = useState<ProductionStage>(norm.stage);
  const [timeline, setTimeline] = useState<ZubocTimeline>(norm.timeline);
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState<string>(norm.dueDate || '');
  const [totalBillingAmount, setTotalBillingAmount] = useState<number>(norm.totalAmount);
  const [advanceReceived, setAdvanceReceived] = useState<number>(norm.advance);
  const [balanceAmount, setBalanceAmount] = useState<number>(norm.balance);
  const [balanceStatus, setBalanceStatus] = useState<'COMPLETED' | 'PENDING'>(norm.payment.balanceStatus || 'PENDING');
  const [remarks, setRemarks] = useState<string>(norm.notes);
  const [stageDueDates, setStageDueDates] = useState<Record<string, string>>(order.stageDueDates || {});

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calc = Math.max(0, totalBillingAmount - advanceReceived);
    setBalanceAmount(calc);
    if (calc <= 0) setBalanceStatus('COMPLETED');
  }, [totalBillingAmount, advanceReceived]);

  useEffect(() => {
    if (!qrRef.current) return;
    try {
      qrRef.current.innerHTML = '';
      const svgWriter = new BrowserQRCodeSvgWriter();
      const svg = svgWriter.write(`ZUBOC-JOB:${order.orderId}|CLIENT:${clientName}|DUE:${promisedDeliveryDate}`, 110, 110);
      qrRef.current.appendChild(svg);
    } catch {}
  }, [order.orderId, clientName, promisedDeliveryDate]);

  const handleToggleSubAssembly = (field: keyof SubAssemblyProgress) => {
    const nextSub = { ...subAssembly, [field]: !subAssembly[field] };
    setSubAssembly(nextSub);
    if (field === 'curationCompleted' && nextSub.curationCompleted) setCurrentStage('PHOTOSHOOT');
    else if (field === 'photoshootCompleted' && nextSub.photoshootCompleted && balanceStatus === 'COMPLETED') setCurrentStage('QC_PACKED');
  };

  const handleFormSave = async () => {
    setIsSaving(true);
    const now = new Date().toISOString();
    const updatedRecord: OrderRecord = {
      ...order,
      clientName,
      product,
      customerName: clientName,
      productSku: product,
      formFillingDate,
      preparedBy,
      checkedBy,
      customisations,
      subAssemblyProgress: subAssembly,
      productionStage: currentStage,
      stageDueDates,
      timeline,
      promisedDeliveryDate,
      dispatchDate: promisedDeliveryDate,
      productionNotes: remarks,
      remarks,
      notes: remarks,
      paymentGate: {
        totalBillingAmount,
        advanceReceived,
        balanceAmount,
        balanceStatus
      },
      fulfillmentStatus: currentStage === 'DISPATCHED' ? 'Shipped' : currentStage === 'QC_PACKED' ? 'Packed' : 'Pending',
      updatedAt: now
    };

    try {
      await onSave(updatedRecord);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
      <div className="bg-white text-slate-900 w-full max-w-xl h-full overflow-y-auto border-l border-stone-200 shadow-2xl flex flex-col font-sans">
        
        <div className="p-4 border-b border-stone-200 bg-[#F9F8F6] sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#832f5e] text-white">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase">Zuboc Tracking Form</h2>
              <span className="text-xs font-mono text-stone-500">#{order.orderId}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg bg-stone-200 text-stone-700 hover:bg-stone-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1 text-xs">
          
          {/* Stage Selector */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <label className="font-bold uppercase text-stone-700">Production Stage</label>
            <div className="grid grid-cols-5 gap-1">
              {STAGES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentStage(s.id)}
                  className={`p-2 rounded-lg text-[10px] font-bold text-center cursor-pointer ${
                    currentStage === s.id ? 'bg-[#832f5e] text-white shadow-xs' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  Step {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Step Target / Due Dates */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <label className="font-bold uppercase text-stone-700">Step Target / Due Dates</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STAGES.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-stone-200">
                  <span className="text-[11px] font-bold text-stone-700 truncate max-w-[130px]" title={s.title}>{s.title}</span>
                  <input
                    type="date"
                    value={stageDueDates[s.id] || ''}
                    onChange={(e) => setStageDueDates({ ...stageDueDates, [s.id]: e.target.value })}
                    className="px-2 py-1 rounded border border-stone-300 text-[11px] font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 1. Basic Info */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
            <h3 className="font-bold uppercase text-[#832f5e]">1. Basic Order Info</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-stone-500 font-medium">Client Name</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-bold focus:outline-none focus:border-[#832f5e]"
                />
              </div>
              <div>
                <label className="text-stone-500 font-medium">Product Title</label>
                <input
                  type="text"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300 focus:outline-none focus:border-[#832f5e]"
                />
              </div>
            </div>
          </div>

          {/* 2. Customisation Checkboxes */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
            <h3 className="font-bold uppercase text-[#832f5e]">2. Customisation Badges</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: 'goldFoil', label: 'Gold Foil' },
                { k: 'dieCutting', label: 'Die Cut' },
                { k: 'screenPrinting', label: 'Screen Print' },
                { k: 'digitalPrinting', label: 'Digital Print' },
                { k: 'waxStamp', label: 'Wax Stamp' },
                { k: 'seals', label: 'Wax Seals' }
              ].map(({ k, label }) => {
                const checked = Boolean(customisations[k as keyof ZubocCustomisations]);
                return (
                  <label key={k} className="flex items-center gap-1.5 p-2 rounded-lg bg-white border border-stone-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setCustomisations({ ...customisations, [k]: e.target.checked })}
                      className="rounded text-[#832f5e]"
                    />
                    <span className="font-medium">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 3. Sub-Assembly Checklist */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
            <h3 className="font-bold uppercase text-[#832f5e]">3. Sub-Assembly Floor Checkpoints</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: 'envelopeDieCutting', label: 'Die Cutting Done' },
                { k: 'screenPrinting', label: 'Screen Print Done' },
                { k: 'goldFoiling', label: 'Gold Foil Done' },
                { k: 'waxSealApplied', label: 'Wax Seal Applied' },
                { k: 'curationCompleted', label: 'Curation Completed' },
                { k: 'photoshootCompleted', label: 'Photoshoot Completed' }
              ].map(({ k, label }) => {
                const checked = Boolean(subAssembly[k as keyof SubAssemblyProgress]);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleToggleSubAssembly(k as keyof SubAssemblyProgress)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left cursor-pointer font-medium ${
                      checked ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600'
                    }`}
                  >
                    <span>{label}</span>
                    {checked && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Payment Gate */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
            <h3 className="font-bold uppercase text-[#832f5e]">4. Payment &amp; Delivery Gate</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-stone-500">Total Billing (₹)</label>
                <input
                  type="number"
                  value={totalBillingAmount}
                  onChange={(e) => setTotalBillingAmount(parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="text-stone-500">Advance (₹)</label>
                <input
                  type="number"
                  value={advanceReceived}
                  onChange={(e) => setAdvanceReceived(parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="text-stone-500">Balance (₹)</label>
                <input
                  type="number"
                  value={balanceAmount}
                  disabled
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-300 font-mono font-bold text-rose-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-stone-500">Balance Status</label>
                <select
                  value={balanceStatus}
                  onChange={(e) => setBalanceStatus(e.target.value as any)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-bold"
                >
                  <option value="COMPLETED">Paid (Completed)</option>
                  <option value="PENDING">Pending (Hold)</option>
                </select>
              </div>
              <div>
                <label className="text-stone-500">Promised Delivery Date</label>
                <input
                  type="date"
                  value={promisedDeliveryDate}
                  onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="text-stone-500">Remarks / Notes</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-stone-300"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
            <div>
              <h4 className="font-bold uppercase text-stone-700">Mobile Traveler QR</h4>
              <p className="text-[11px] text-stone-500">Scan for mobile station update</p>
            </div>
            <div ref={qrRef} className="p-1 bg-white rounded border border-stone-200" />
          </div>

        </div>

        <div className="p-4 border-t border-stone-200 bg-[#F9F8F6] sticky bottom-0 z-20 flex items-center justify-between">
          <span className="text-xs font-mono text-stone-500">
            {saveSuccess ? <strong className="text-emerald-600">✓ Saved!</strong> : `Operator: ${currentStaff.name}`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-stone-200 text-stone-700 font-bold">
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleFormSave}
              className="px-5 py-2 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

// New Job Modal & Capacity Modal
interface NewFloorJobModalProps {
  currentStaff: StaffMember;
  onClose: () => void;
  onCreated: (order: OrderRecord) => Promise<void>;
}

const NewFloorJobModal: React.FC<NewFloorJobModalProps> = ({ currentStaff, onClose, onCreated }) => {
  const [orderId, setOrderId] = useState(`ZUB-${Date.now().toString().slice(-6)}`);
  const [clientName, setClientName] = useState('');
  const [product, setProduct] = useState('Bespoke Wedding Suite');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10));
  const [totalBillingAmount, setTotalBillingAmount] = useState(24500);
  const [advanceReceived, setAdvanceReceived] = useState(12000);
  const [notes, setNotes] = useState('');
  const [customisations, setCustomisations] = useState<ZubocCustomisations>({
    goldFoil: true, digitalPrinting: true, screenPrinting: true, dieCutting: true, waxStamp: true, rubberStamp: false, embosserStamp: false, seals: true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !clientName) return;

    const now = new Date().toISOString();
    const balance = Math.max(0, totalBillingAmount - advanceReceived);

    const newRecord: OrderRecord = {
      orderId,
      staffId: currentStaff.id,
      stationId: 'Floor-Deck',
      recordingStartedAt: now,
      durationSeconds: 0,
      recordingStatus: 'PENDING',
      uploadStatus: 'PENDING',
      isProductionDeckOrder: true,
      clientName,
      product,
      customerName: clientName,
      productSku: product,
      formFillingDate: now.slice(0, 10),
      preparedBy: currentStaff.name,
      checkedBy: 'Supervisor',
      customisations,
      subAssemblyProgress: {
        envelopeDieCutting: false,
        screenPrinting: false,
        goldFoiling: false,
        waxSealApplied: false,
        curationCompleted: false,
        photoshootCompleted: false,
        qcPackedCompleted: false
      },
      productionStage: 'PRE_PRODUCTION',
      promisedDeliveryDate,
      dispatchDate: promisedDeliveryDate,
      stageDueDates: {
        PRE_PRODUCTION: promisedDeliveryDate,
        CURATION_ASSEMBLY: promisedDeliveryDate,
        PHOTOSHOOT: promisedDeliveryDate,
        QC_PACKED: promisedDeliveryDate,
        DISPATCHED: promisedDeliveryDate
      },
      paymentGate: { 
        totalBillingAmount, 
        advanceReceived, 
        balanceAmount: balance, 
        balanceStatus: balance <= 0 ? 'COMPLETED' : 'PENDING' 
      },
      fulfillmentStatus: 'Pending',
      productionNotes: notes,
      remarks: notes,
      notes,
      createdAt: now,
      updatedAt: now
    };

    await onCreated(newRecord);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-2xl font-sans text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-4">
          <h3 className="text-sm font-extrabold uppercase">New Floor Job Traveler</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg bg-stone-100"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-stone-600">Job ID *</label>
              <input type="text" required value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full mt-1 px-3 py-1.5 rounded-lg border border-stone-300 font-mono font-bold" />
            </div>
            <div>
              <label className="font-bold text-stone-600">Client Name *</label>
              <input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="w-full mt-1 px-3 py-1.5 rounded-lg border border-stone-300 font-bold" />
            </div>
          </div>

          <div>
            <label className="font-bold text-stone-600">Product Title</label>
            <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} className="w-full mt-1 px-3 py-1.5 rounded-lg border border-stone-300" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-stone-600">Delivery</label>
              <input type="date" required value={promisedDeliveryDate} onChange={(e) => setPromisedDeliveryDate(e.target.value)} className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-stone-300" />
            </div>
            <div>
              <label className="font-bold text-stone-600">Total (₹)</label>
              <input type="number" value={totalBillingAmount} onChange={(e) => setTotalBillingAmount(parseFloat(e.target.value) || 0)} className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono" />
            </div>
            <div>
              <label className="font-bold text-stone-600">Advance (₹)</label>
              <input type="number" value={advanceReceived} onChange={(e) => setAdvanceReceived(parseFloat(e.target.value) || 0)} className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono" />
            </div>
          </div>

          <div>
            <label className="font-bold text-stone-600 block mb-1">Customisations</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { k: 'goldFoil', label: 'Gold Foil' },
                { k: 'dieCutting', label: 'Die Cut' },
                { k: 'screenPrinting', label: 'Screen Print' },
                { k: 'waxStamp', label: 'Wax Stamp' }
              ].map(({ k, label }) => (
                <label key={k} className="flex items-center gap-1.5 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={Boolean(customisations[k as keyof ZubocCustomisations])}
                    onChange={(e) => setCustomisations({ ...customisations, [k]: e.target.checked })}
                    className="rounded text-[#832f5e]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-stone-600">Remarks</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full mt-1 px-3 py-1.5 rounded-lg border border-stone-300" />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-stone-100 font-bold">Cancel</button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white font-bold uppercase tracking-wide cursor-pointer">Create Job</button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface CapacitySettingsModalProps {
  currentLimit: number;
  scheduledToday: number;
  onClose: () => void;
  onSave: (limit: number) => void;
}

const CapacitySettingsModal: React.FC<CapacitySettingsModalProps> = ({ currentLimit, scheduledToday, onClose, onSave }) => {
  const [limit, setLimit] = useState<number>(currentLimit);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-sm w-full p-6 text-slate-900 shadow-2xl font-sans text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-3">
          <h3 className="text-sm font-extrabold uppercase">Dispatch Capacity</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg bg-stone-100"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-stone-500 mb-3">
          Sets maximum permitted orders scheduled for dispatch per day.
        </p>

        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 mb-4 space-y-1">
          <div className="flex justify-between">
            <span className="text-stone-500">Scheduled Today:</span>
            <span className="font-mono font-bold">{scheduledToday} orders</span>
          </div>
        </div>

        <div className="mb-5">
          <label className="font-bold text-stone-700 uppercase block mb-1">Max Daily Dispatches:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)}
            className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono font-bold text-sm"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-stone-100 font-bold">Cancel</button>
          <button type="button" onClick={() => onSave(limit)} className="px-5 py-2 rounded-xl bg-[#832f5e] text-white font-bold">Save</button>
        </div>
      </div>
    </div>
  );
};
