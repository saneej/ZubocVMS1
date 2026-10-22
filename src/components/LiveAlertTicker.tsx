import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Clock, ShieldCheck, Flame, Calendar, RefreshCw } from 'lucide-react';
import { OrderRecord } from '../types';
import { safeFetchJson } from '../utils/api';

export type DispatchAlertCategory = 'OVERDUE' | 'DUE_TODAY' | 'DUE_TOMORROW';

export interface LiveAlertItem {
  orderId: string;
  clientName: string;
  product: string;
  dispatchDate: string;
  category: DispatchAlertCategory;
  isOverdue: boolean;
  isDueToday: boolean;
  isDueTomorrow: boolean;
  daysOverdue: number;
}

interface LiveAlertTickerProps {
  orders?: OrderRecord[];
  pollingIntervalMs?: number; // Defaults to 60000 ms (1 min)
  className?: string;
}

function getTodayIsoString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowIsoString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateStr(dateInput?: string | null): string | null {
  if (!dateInput) return null;
  const str = String(dateInput).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  if (str.includes('T')) {
    const parts = str.split('T');
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return parts[0];
  }

  const ddmmyyyyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = ddmmyyyyMatch[2].padStart(2, '0');
    const year = ddmmyyyyMatch[3];
    return `${year}-${month}-${day}`;
  }

  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function parseAlertItemsFromOrders(ordersList: OrderRecord[]): LiveAlertItem[] {
  const todayIso = getTodayIsoString();
  const tomorrowIso = getTomorrowIsoString();
  const todayMs = new Date(todayIso).getTime();

  const alertMap = new Map<string, LiveAlertItem>();

  ordersList.forEach(order => {
    if (order.isDispatched || order.is_dispatched) return;
    if (order.productionStage === 'DISPATCHED') return;

    const fullStatus = (order.fulfillmentStatus || '').toLowerCase();
    if (fullStatus === 'shipped' || fullStatus === 'delivered' || fullStatus === 'dispatched' || fullStatus === 'fulfilled') return;

    // STRICTLY check for explicit planned dispatch date (prioritizing dispatchScheduledDate)
    const rawDate = order.dispatchScheduledDate || order.dispatch_scheduled_date || order.dispatchDate || order.promisedDeliveryDate || order.stageDueDates?.DISPATCH || order.timeline?.dispatchingDate;
    const normalizedDate = normalizeDateStr(rawDate);
    if (!normalizedDate) return;

    const orderMs = new Date(normalizedDate).getTime();
    if (isNaN(orderMs)) return;

    // Ignore dates beyond tomorrow
    if (normalizedDate > tomorrowIso) return;

    let category: DispatchAlertCategory;
    let isOverdue = false;
    let isDueToday = false;
    let isDueTomorrow = false;
    let daysOverdue = 0;

    if (normalizedDate < todayIso) {
      category = 'OVERDUE';
      isOverdue = true;
      const diffMs = todayMs - orderMs;
      daysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    } else if (normalizedDate === todayIso) {
      category = 'DUE_TODAY';
      isDueToday = true;
    } else if (normalizedDate === tomorrowIso) {
      category = 'DUE_TOMORROW';
      isDueTomorrow = true;
    } else {
      return;
    }

    const rawId = String(order.orderId || 'N/A').replace(/^#+/, '');
    const clientName = order.customerName || order.clientName || order.contactPerson || `Client #${rawId}`;
    const product = order.product || order.productSku || 'Stationery Job';

    alertMap.set(rawId, {
      orderId: rawId,
      clientName,
      product,
      dispatchDate: normalizedDate,
      category,
      isOverdue,
      isDueToday,
      isDueTomorrow,
      daysOverdue
    });
  });

  const alertItems = Array.from(alertMap.values());

  // Logical sorting: OVERDUE pills first, followed by DUE TODAY, and then DUE TOMORROW
  const categoryOrder: Record<DispatchAlertCategory, number> = {
    OVERDUE: 1,
    DUE_TODAY: 2,
    DUE_TOMORROW: 3
  };

  alertItems.sort((a, b) => {
    if (categoryOrder[a.category] !== categoryOrder[b.category]) {
      return categoryOrder[a.category] - categoryOrder[b.category];
    }
    if (a.dispatchDate !== b.dispatchDate) {
      return a.dispatchDate.localeCompare(b.dispatchDate);
    }
    return a.orderId.localeCompare(b.orderId);
  });

  return alertItems;
}

export const LiveAlertTicker: React.FC<LiveAlertTickerProps> = ({
  orders: propOrders,
  pollingIntervalMs = 60000,
  className = ''
}) => {
  const [fetchedOrders, setFetchedOrders] = useState<OrderRecord[]>([]);

  const loadLatestOrders = async () => {
    try {
      const res = await safeFetchJson('/api/orders');
      if (res && Array.isArray(res) && res.length > 0) {
        setFetchedOrders(res);
      }
    } catch (err) {
      console.warn('LiveAlertTicker polling warning:', err);
    }
  };

  useEffect(() => {
    if (!propOrders || propOrders.length === 0) {
      loadLatestOrders();
    }

    const interval = setInterval(() => {
      loadLatestOrders();
    }, pollingIntervalMs);

    return () => clearInterval(interval);
  }, [pollingIntervalMs, propOrders]);

  const currentOrders = useMemo(() => {
    if (propOrders && propOrders.length > 0) return propOrders;
    return fetchedOrders;
  }, [propOrders, fetchedOrders]);

  const alertItems = useMemo(() => {
    return parseAlertItemsFromOrders(currentOrders);
  }, [currentOrders]);

  const overdueCount = useMemo(() => alertItems.filter(i => i.category === 'OVERDUE').length, [alertItems]);
  const dueTodayCount = useMemo(() => alertItems.filter(i => i.category === 'DUE_TODAY').length, [alertItems]);
  const dueTomorrowCount = useMemo(() => alertItems.filter(i => i.category === 'DUE_TOMORROW').length, [alertItems]);

  const headerCounters = useMemo(() => {
    const list: { key: string; label: string; className: string }[] = [];
    if (overdueCount > 0) {
      list.push({ key: 'overdue', label: `${overdueCount} Overdue`, className: 'text-rose-400 font-black' });
    }
    if (dueTodayCount > 0) {
      list.push({ key: 'today', label: `${dueTodayCount} Due Today`, className: 'text-amber-400 font-black' });
    }
    if (dueTomorrowCount > 0) {
      list.push({ key: 'tomorrow', label: `${dueTomorrowCount} Due Tomorrow`, className: 'text-emerald-400 font-black' });
    }
    return list;
  }, [overdueCount, dueTodayCount, dueTomorrowCount]);

  return (
    <div className={`w-full select-none z-30 ${className}`}>
      {alertItems.length > 0 ? (
        /* Minimal, Modern & Attractive Slim Bar (Below Header) */
        <div className="bg-slate-950/95 backdrop-blur-md text-white border-b border-slate-800/80 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          
          {/* Left Title Label & Categorized Counters */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block animate-ping opacity-75 absolute" />
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block shadow-sm shadow-rose-500" />
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm font-black uppercase tracking-[0.2em] text-slate-200">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>DISPATCH ATTENTION</span>
            </div>
            
            {headerCounters.length > 0 && (
              <>
                <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />
                <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {headerCounters.map((counter, idx) => (
                    <React.Fragment key={counter.key}>
                      {idx > 0 && <span className="text-slate-600">•</span>}
                      <span className={counter.className}>{counter.label}</span>
                    </React.Fragment>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right Horizontal Minimal Order ID Pills (Sorted: OVERDUE -> DUE TODAY -> DUE TOMORROW) */}
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto max-w-full">
            {alertItems.map((item) => {
              const isOverdue = item.category === 'OVERDUE';
              const isToday = item.category === 'DUE_TODAY';
              const isTomorrow = item.category === 'DUE_TOMORROW';

              return (
                <div
                  key={item.orderId}
                  className={`flex items-center gap-2 px-3 py-1 rounded-xl border text-xs md:text-sm font-mono font-bold tracking-tight shadow-sm transition-all hover:scale-105 ${
                    isOverdue
                      ? 'bg-rose-950/80 border-rose-500/60 text-rose-200 shadow-rose-950/50'
                      : isToday
                      ? 'bg-amber-950/80 border-amber-500/60 text-amber-200 shadow-amber-950/40'
                      : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200 shadow-emerald-950/40'
                  }`}
                  title={`${item.clientName} (${item.product}) • Due: ${item.dispatchDate}`}
                >
                  {isOverdue ? (
                    <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse fill-rose-400 shrink-0" />
                  ) : isToday ? (
                    <Clock className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20 shrink-0" />
                  ) : (
                    <Calendar className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20 shrink-0" />
                  )}

                  <span className="font-black font-mono text-sm md:text-base">#{item.orderId.replace(/^#+/, '')}</span>

                  <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                    isOverdue
                      ? 'bg-rose-600 text-white'
                      : isToday
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-600 text-white'
                  }`}>
                    {isOverdue
                      ? `OVERDUE ${item.daysOverdue > 1 ? `${item.daysOverdue}D` : ''}`
                      : isToday
                      ? 'DUE TODAY'
                      : 'DUE TOMORROW'}
                  </span>
                </div>
              );
            })}
          </div>

        </div>
      ) : (
        /* Minimal Clean State */
        <div className="bg-emerald-950/60 backdrop-blur-md text-emerald-300 border-b border-emerald-900/40 py-2 px-6 flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wider shadow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All scheduled dispatches up to date</span>
        </div>
      )}
    </div>
  );
};
