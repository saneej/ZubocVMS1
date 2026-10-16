import React, { useState, useMemo } from 'react';
import { 
  Send, 
  CheckCircle2, 
  BarChart3, 
  Settings, 
  ShieldCheck, 
  Truck, 
  Scale, 
  Tag, 
  ExternalLink, 
  Package, 
  Search, 
  Download, 
  FileSpreadsheet, 
  Zap, 
  FileText, 
  Eye, 
  PackageCheck,
  TrendingUp,
  ArrowUpDown,
  Filter,
  Users,
  Clock,
  XCircle,
  Percent,
  Check
} from 'lucide-react';
import { OrderRecord, AppSettings } from '../types';
import { safeFetchJson } from '../utils/api';
import { Link } from 'react-router-dom';
import { formatIST } from '../utils/time';
import { exportOrdersToExcel, exportOrdersToCSV } from '../utils/excelExport';
import { exportOrdersToPDF } from '../utils/pdfExport';
import { ImportShopifyCsvModal } from './ImportShopifyCsvModal';

interface AdminDashboardProps {
  orders: OrderRecord[];
  settings: AppSettings;
  onOpenSettings: () => void;
  onUpdateOrder?: (updatedOrder: OrderRecord) => void;
  currentStaffId?: string;
  currentStaffName?: string;
}

type FulfillmentSortMode = 'workflow' | 'count_desc' | 'count_asc' | 'alpha';
type TableSortField = 'date_desc' | 'date_asc' | 'orderId' | 'status' | 'courier' | 'weight';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  orders, 
  settings, 
  onOpenSettings, 
  onUpdateOrder, 
  currentStaffId = 'Admin-01', 
  currentStaffName = 'Admin' 
}) => {
  const [isSendingDemo, setIsSendingDemo] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  
  // Interactive Filters
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedCourierFilter, setSelectedCourierFilter] = useState<string>('ALL');
  
  // Sorting Controls
  const [fulfillmentSortMode, setFulfillmentSortMode] = useState<FulfillmentSortMode>('workflow');
  const [tableSortField, setTableSortField] = useState<TableSortField>('date_desc');

  const handleQuickStatusUpdate = async (order: OrderRecord, newStatus: string) => {
    if (!onUpdateOrder) return;
    const nowIso = new Date().toISOString();
    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'QUICK_STATUS_UPDATE',
      details: `Fulfillment status changed from "${order.fulfillmentStatus || 'Pending'}" to "${newStatus}"`,
      type: 'CHANGE_LOG'
    });

    const updated: OrderRecord = {
      ...order,
      fulfillmentStatus: newStatus,
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    onUpdateOrder(updated);
  };

  const handleQuickNoteUpdate = async (order: OrderRecord) => {
    const text = window.prompt(`Add a new chat note for Order #${order.orderId}:`);
    if (!text || !text.trim()) return;

    if (!onUpdateOrder) return;
    const nowIso = new Date().toISOString();
    
    const newChatNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      text: text.trim(),
      staffId: currentStaffName,
      timestamp: nowIso
    };

    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'ADD_CHAT_NOTE',
      details: `Quick note added from Insights: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
      type: 'EDIT_LOG'
    });

    const updated: OrderRecord = {
      ...order,
      chatNotes: [...(order.chatNotes || []), newChatNote],
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    onUpdateOrder(updated);
  };

  const totalOrders = orders.length;
  const successfulUploads = orders.filter(o => o.uploadStatus === 'SUCCESS').length;
  const failedUploads = orders.filter(o => o.uploadStatus === 'FAILED').length;
  const successRate = totalOrders > 0 ? Math.round((successfulUploads / totalOrders) * 100) : 100;

  // Compute Fulfillment Pipeline Metrics
  const rawFulfillmentStats: Record<string, number> = {
    'Pending': 0,
    'Packed': 0,
    'Shipped': 0,
    'Fulfilled': 0,
    'Delivered': 0
  };

  orders.forEach(o => {
    const s = o.fulfillmentStatus || 'Pending';
    rawFulfillmentStats[s] = (rawFulfillmentStats[s] || 0) + 1;
  });

  // Calculate completed/fulfilled total
  const completedCount = (rawFulfillmentStats['Fulfilled'] || 0) + (rawFulfillmentStats['Delivered'] || 0);
  const completionRate = totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;

  // Sorted Fulfillment Pipeline Cards
  const sortedFulfillmentStats = useMemo(() => {
    const entries = Object.entries(rawFulfillmentStats).map(([status, count]) => ({
      status,
      count,
      pct: totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0
    }));

    if (fulfillmentSortMode === 'count_desc') {
      return entries.sort((a, b) => b.count - a.count);
    }
    if (fulfillmentSortMode === 'count_asc') {
      return entries.sort((a, b) => a.count - b.count);
    }
    if (fulfillmentSortMode === 'alpha') {
      return entries.sort((a, b) => a.status.localeCompare(b.status));
    }

    // Default: Standard Logistics Workflow Order
    const workflowRank: Record<string, number> = {
      'Pending': 1,
      'Packed': 2,
      'Shipped': 3,
      'Fulfilled': 4,
      'Delivered': 5
    };

    return entries.sort((a, b) => (workflowRank[a.status] || 99) - (workflowRank[b.status] || 99));
  }, [rawFulfillmentStats, totalOrders, fulfillmentSortMode]);

  // Courier Partner Distribution (Sorted by Volume)
  const sortedCourierStats = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const c = o.courier?.trim() || 'Unassigned';
      map[c] = (map[c] || 0) + 1;
    });

    return Object.entries(map)
      .map(([courier, count]) => ({
        courier,
        count,
        pct: totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders, totalOrders]);

  // Staff Leaderboard
  const sortedStaffStats = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const st = o.staffId?.trim() || 'System';
      map[st] = (map[st] || 0) + 1;
    });

    return Object.entries(map)
      .map(([staff, count]) => ({
        staff,
        count,
        pct: totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders, totalOrders]);

  // Delivery Method Breakdown
  const deliveryMethodStats = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const m = o.deliveryMethod?.trim() || 'Normal';
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map);
  }, [orders]);

  // Filtered & Sorted Orders List for Table
  const filteredAndSortedOrders = useMemo(() => {
    return orders
      .filter(o => {
        // Status filter
        if (selectedStatusFilter !== 'ALL' && (o.fulfillmentStatus || 'Pending') !== selectedStatusFilter) {
          return false;
        }

        // Courier filter
        if (selectedCourierFilter !== 'ALL') {
          const courierVal = o.courier?.trim() || 'Unassigned';
          if (courierVal !== selectedCourierFilter) return false;
        }

        // Search text
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          o.orderId.toLowerCase().includes(q) ||
          (o.awbNumber && o.awbNumber.toLowerCase().includes(q)) ||
          (o.courier && o.courier.toLowerCase().includes(q)) ||
          (o.productSku && o.productSku.toLowerCase().includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.notes && o.notes.toLowerCase().includes(q)) ||
          o.staffId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (tableSortField === 'date_asc') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (tableSortField === 'orderId') {
          return a.orderId.localeCompare(b.orderId);
        }
        if (tableSortField === 'status') {
          return (a.fulfillmentStatus || 'Pending').localeCompare(b.fulfillmentStatus || 'Pending');
        }
        if (tableSortField === 'courier') {
          return (a.courier || '').localeCompare(b.courier || '');
        }
        if (tableSortField === 'weight') {
          const wA = parseFloat(a.weight || '0') || 0;
          const wB = parseFloat(b.weight || '0') || 0;
          return wB - wA;
        }
        // Default: date_desc
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [orders, selectedStatusFilter, selectedCourierFilter, searchQuery, tableSortField]);

  const handleSendDemoMessage = async () => {
    setIsSendingDemo(true);
    setDemoStatus(null);
    try {
      const data = await safeFetchJson('/api/telegram/test-connection', { method: 'POST' });
      if (data && data.success) {
        setDemoStatus('Test ping sent to Telegram!');
      } else {
        setDemoStatus('Error: ' + (data?.error || 'Ping failed'));
      }
    } catch (err: any) {
      setDemoStatus('Error: ' + (err.message || 'Ping failed'));
    } finally {
      setIsSendingDemo(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#832f5e]/10 text-[#832f5e] rounded-2xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">
                Operations & Fulfillment Insights
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Live package volume, sorted status analytics, carrier performance, and staff activity
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
            title="Import orders from Shopify CSV export"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">IMPORT CSV</span>
          </button>

          <button
            onClick={handleSendDemoMessage}
            disabled={isSendingDemo}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 text-[#832f5e] shrink-0" />
            <span className="truncate">{isSendingDemo ? 'Pinging...' : 'TEST BOT'}</span>
          </button>

          <button
            onClick={() => exportOrdersToPDF(filteredAndSortedOrders, 'Fulfillment & Operations Report')}
            className="px-3.5 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            title="Download executive PDF manifest report"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">EXPORT PDF</span>
          </button>

          <button
            onClick={() => exportOrdersToExcel(filteredAndSortedOrders, 'zuboc_fulfillment_insights')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">EXPORT EXCEL</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="col-span-2 sm:col-span-1 px-3.5 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">SETTINGS</span>
          </button>
        </div>
      </div>

      <ImportShopifyCsvModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onSuccess={() => {
          // Trigger refresh if available
          window.location.reload();
        }}
        existingOrderIds={orders.map(o => o.orderId)}
      />

      {demoStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-xs text-blue-900 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{demoStatus}</span>
        </div>
      )}

      {/* Top Key Performance Indicators Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Orders Logged</span>
            <Package className="w-4 h-4 text-[#832f5e]" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900">
            {totalOrders}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Total registered packages in system</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Fulfillment Completion</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black font-mono text-emerald-600">{completedCount}</span>
            <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full font-mono">
              {completionRate}% Rate
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Fulfilled & Delivered dispatches</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Evidence Sync Rate</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black font-mono text-purple-600">{successfulUploads}</span>
            <span className="text-xs font-extrabold text-purple-800 bg-purple-100 border border-purple-300 px-2.5 py-0.5 rounded-full font-mono">
              {successRate}% Sync
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Telegram evidence links generated</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Active Carriers</span>
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-black font-mono text-blue-600">
            {sortedCourierStats.filter(c => c.courier !== 'Unassigned').length}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Active courier partners mapped</p>
        </div>

      </div>

      {/* Sorted Fulfillment Pipeline Breakdown Module */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2 font-sans">
              <PackageCheck className="w-4 h-4 text-[#832f5e]" />
              Fulfillment Pipeline Breakdown & Stats
            </h2>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              Click any status card below to filter orders in the details table instantly
            </p>
          </div>

          {/* Sort Controls for Fulfillment Stats */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1 font-mono">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              Sort Stats By:
            </span>
            <select
              value={fulfillmentSortMode}
              onChange={(e) => setFulfillmentSortMode(e.target.value as FulfillmentSortMode)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20 cursor-pointer font-sans"
            >
              <option value="workflow">Workflow Stage (Pending → Delivered)</option>
              <option value="count_desc">Highest Volume First</option>
              <option value="count_asc">Lowest Volume First</option>
              <option value="alpha">Status Name (A - Z)</option>
            </select>
          </div>
        </div>

        {/* Status Pipeline Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {sortedFulfillmentStats.map((item) => {
            const isSelected = selectedStatusFilter === item.status;
            let themeClass = 'border-slate-200 bg-slate-50 hover:border-slate-300 text-slate-900';
            let badgeTheme = 'bg-slate-200 text-slate-800';
            let barColor = 'bg-slate-400';

            if (item.status === 'Delivered') {
              themeClass = isSelected ? 'border-emerald-600 bg-emerald-500 text-white shadow-md' : 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 text-emerald-950';
              badgeTheme = isSelected ? 'bg-white text-emerald-900' : 'bg-emerald-100 text-emerald-800';
              barColor = isSelected ? 'bg-white' : 'bg-emerald-500';
            } else if (item.status === 'Shipped') {
              themeClass = isSelected ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-blue-200 bg-blue-50/60 hover:border-blue-300 text-blue-950';
              badgeTheme = isSelected ? 'bg-white text-blue-900' : 'bg-blue-100 text-blue-800';
              barColor = isSelected ? 'bg-white' : 'bg-blue-500';
            } else if (item.status === 'Fulfilled') {
              themeClass = isSelected ? 'border-purple-600 bg-purple-600 text-white shadow-md' : 'border-purple-200 bg-purple-50/60 hover:border-purple-300 text-purple-950';
              badgeTheme = isSelected ? 'bg-white text-purple-900' : 'bg-purple-100 text-purple-800';
              barColor = isSelected ? 'bg-white' : 'bg-purple-500';
            } else if (item.status === 'Packed') {
              themeClass = isSelected ? 'border-amber-600 bg-amber-600 text-white shadow-md' : 'border-amber-200 bg-amber-50/60 hover:border-amber-300 text-amber-950';
              badgeTheme = isSelected ? 'bg-white text-amber-900' : 'bg-amber-100 text-amber-800';
              barColor = isSelected ? 'bg-white' : 'bg-amber-500';
            } else if (item.status === 'Pending') {
              themeClass = isSelected ? 'border-[#832f5e] bg-[#832f5e] text-white shadow-md' : 'border-rose-200 bg-rose-50/60 hover:border-rose-300 text-rose-950';
              badgeTheme = isSelected ? 'bg-white text-[#832f5e]' : 'bg-rose-100 text-rose-800';
              barColor = isSelected ? 'bg-white' : 'bg-rose-500';
            }

            return (
              <div
                key={item.status}
                onClick={() => setSelectedStatusFilter(isSelected ? 'ALL' : item.status)}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all space-y-2 select-none ${themeClass}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider">{item.status}</span>
                  <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full ${badgeTheme}`}>
                    {item.pct}%
                  </span>
                </div>

                <div className="text-2xl font-black font-mono">
                  {item.count} <span className="text-xs font-normal opacity-80">orders</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${item.pct}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Filter Badge Bar */}
        {selectedStatusFilter !== 'ALL' && (
          <div className="pt-2 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#832f5e]" />
              Table filtered by Status: <strong className="text-[#832f5e] uppercase">{selectedStatusFilter}</strong>
            </span>
            <button
              onClick={() => setSelectedStatusFilter('ALL')}
              className="text-xs font-extrabold text-slate-500 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs cursor-pointer flex items-center gap-1 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Clear Filter</span>
            </button>
          </div>
        )}
      </div>

      {/* Analytics Grid: Courier Volume & Staff Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Courier Volume Breakdown */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2 font-sans">
              <Truck className="w-4 h-4 text-blue-600" />
              Courier Partner Dispatch Share
            </h3>
            <span className="text-[10px] font-mono font-bold text-slate-400">
              Sorted by Highest Volume
            </span>
          </div>

          <div className="space-y-3">
            {sortedCourierStats.map((item) => (
              <div 
                key={item.courier}
                onClick={() => setSelectedCourierFilter(selectedCourierFilter === item.courier ? 'ALL' : item.courier)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedCourierFilter === item.courier
                    ? 'bg-blue-50/80 border-blue-400 font-bold'
                    : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>{item.courier}</span>
                    <span className="font-mono text-slate-900">{item.count} orders ({item.pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${item.pct}%` }}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Staff Productivity Leaderboard */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2 font-sans">
              <Users className="w-4 h-4 text-[#832f5e]" />
              Staff Operator Activity
            </h3>
            <span className="text-[10px] font-mono font-bold text-slate-400">
              Packages Processed
            </span>
          </div>

          <div className="space-y-3">
            {sortedStaffStats.map((item) => (
              <div key={item.staff} className="p-3 rounded-2xl bg-slate-50/50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#832f5e]"></span>
                    {item.staff}
                  </span>
                  <span className="font-mono text-slate-900">{item.count} packages ({item.pct}%)</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#832f5e] h-full rounded-full" style={{ width: `${item.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Package Details Store & Search Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden font-sans">
        
        {/* Table Filter & Search Controls Header */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/40">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider font-sans">
              Package Records & Evidence Logs ({filteredAndSortedOrders.length})
            </h3>
            <p className="text-slate-500 text-xs font-medium">
              Real-time dispatch history with inline status editing & note sync
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Order, AWB, SKU, Courier..."
                className="w-full bg-white border border-slate-300 focus:border-[#832f5e] rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
              />
            </div>

            {/* Table Sort Dropdown */}
            <select
              value={tableSortField}
              onChange={(e) => setTableSortField(e.target.value as TableSortField)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20 cursor-pointer"
            >
              <option value="date_desc">Sort: Newest First</option>
              <option value="date_asc">Sort: Oldest First</option>
              <option value="orderId">Sort: Order ID (A-Z)</option>
              <option value="status">Sort: Fulfillment Status</option>
              <option value="courier">Sort: Courier Name</option>
              <option value="weight">Sort: Weight (Heaviest)</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Packed">Packed</option>
              <option value="Shipped">Shipped</option>
              <option value="Fulfilled">Fulfilled</option>
              <option value="Delivered">Delivered</option>
            </select>

            <button
              onClick={() => exportOrdersToCSV(filteredAndSortedOrders, 'zuboc_fulfillment_insights')}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-mono font-bold">
                <th className="p-3.5">Order ID & AWB</th>
                <th className="p-3.5">Courier</th>
                <th className="p-3.5">Weight</th>
                <th className="p-3.5">Item / SKU</th>
                <th className="p-3.5">Customer / City</th>
                <th className="p-3.5">Station & Staff</th>
                <th className="p-3.5">Recorded Time (IST)</th>
                <th className="p-3.5">Fulfillment Status</th>
                <th className="p-3.5">Sync</th>
                <th className="p-3.5 text-right">Evidence Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans text-xs">
              {filteredAndSortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 font-mono">
                    No order records found matching selected filters.
                  </td>
                </tr>
              ) : (
                filteredAndSortedOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <Link 
                        to={`/order/${order.orderId}`}
                        className="font-mono font-bold text-slate-900 text-xs hover:text-[#832f5e] hover:underline flex items-center gap-1 group"
                      >
                        <span>#{order.orderId}</span>
                        <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#832f5e]" />
                      </Link>
                      {order.awbNumber ? (
                        <div className="font-mono text-[11px] text-blue-600 flex items-center gap-1 mt-0.5 font-bold">
                          <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                          <span>{order.awbNumber}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    <td className="p-3.5 font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        {order.courier ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-extrabold border border-blue-200 text-[10px] w-fit">
                            {order.courier}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                        {order.deliveryMethod && (
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5 text-amber-500" />
                            {order.deliveryMethod}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5 font-mono text-xs">
                      {order.weight ? (
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Scale className="w-3 h-3 text-emerald-600" />
                          {order.weight}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3.5 font-mono text-xs">
                      {order.productSku ? (
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-purple-600" />
                            <span>{order.productSku}</span>
                          </div>
                          {order.itemCount && (
                            <span className="text-[10px] text-slate-500">Qty: {order.itemCount}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3.5 text-xs">
                      {order.customerName ? (
                        <span className="text-slate-700 font-bold">{order.customerName}</span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3.5 font-mono text-[11px] text-slate-600">
                      <div className="font-bold">{order.stationId}</div>
                      <div className="text-slate-400 text-[10px]">{order.staffId}</div>
                    </td>

                    <td className="p-3.5 font-mono text-[11px] text-slate-500">
                      {formatIST(order.createdAt)}
                    </td>

                    <td className="p-3.5 text-xs">
                      <div className="space-y-1.5 min-w-[130px]">
                        <select
                          value={order.fulfillmentStatus || 'Pending'}
                          onChange={(e) => handleQuickStatusUpdate(order, e.target.value)}
                          className={`w-full px-2 py-1 rounded-xl border text-[10px] font-extrabold focus:outline-none cursor-pointer ${
                            order.fulfillmentStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                            order.fulfillmentStatus === 'Shipped' ? 'bg-blue-50 text-blue-800 border-blue-300' :
                            order.fulfillmentStatus === 'Fulfilled' ? 'bg-purple-50 text-purple-800 border-purple-300' :
                            order.fulfillmentStatus === 'Packed' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                            'bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Packed">Packed</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Fulfilled">Fulfilled</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                        
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleQuickNoteUpdate(order)}
                            className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg transition-all border ${
                              (order.notes || (order.chatNotes && order.chatNotes.length > 0)) 
                                ? 'text-[#832f5e] bg-[#832f5e]/10 border-[#832f5e]/20' 
                                : 'text-slate-400 bg-slate-50 border-slate-200 hover:text-slate-600'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[100px]">
                              {order.chatNotes && order.chatNotes.length > 0 
                                ? order.chatNotes[order.chatNotes.length - 1].text 
                                : order.notes || 'Add Note'}
                            </span>
                            {order.chatNotes && order.chatNotes.length > 0 && (
                              <span className="bg-[#832f5e] text-white text-[8px] px-1 rounded-full min-w-[14px] text-center font-mono">
                                {order.chatNotes.length}
                              </span>
                            )}
                          </button>

                          {order.remarks && (
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="truncate max-w-[100px]">{order.remarks}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 font-mono text-[10px]">
                      <span className={`px-2 py-0.5 rounded-full font-extrabold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>

                    <td className="p-3.5 text-right font-mono text-xs">
                      {(order.telegramMessageLink || order.uploadStatus === 'SUCCESS') && (
                        <a
                          href={order.telegramMessageLink || 'https://t.me/'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#832f5e] hover:underline font-bold px-2.5 py-1 bg-[#832f5e]/10 hover:bg-[#832f5e]/20 rounded-lg border border-[#832f5e]/20 text-[11px]"
                        >
                          <span>Telegram</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
