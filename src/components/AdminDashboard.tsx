import React, { useState } from 'react';
import { Send, CheckCircle2, BarChart3, Settings, ShieldCheck, Truck, Scale, Tag, ExternalLink, Package, Search, Download, FileSpreadsheet } from 'lucide-react';
import { OrderRecord, AppSettings } from '../types';
import { safeFetchJson } from '../utils/api';
import { formatIST } from '../utils/time';
import { exportOrdersToExcel, exportOrdersToCSV } from '../utils/excelExport';

interface AdminDashboardProps {
  orders: OrderRecord[];
  settings: AppSettings;
  onOpenSettings: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ orders, settings, onOpenSettings }) => {
  const [isSendingDemo, setIsSendingDemo] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const totalOrders = orders.length;
  const successfulUploads = orders.filter(o => o.uploadStatus === 'SUCCESS').length;
  const failedUploads = orders.filter(o => o.uploadStatus === 'FAILED').length;
  const successRate = totalOrders > 0 ? Math.round((successfulUploads / totalOrders) * 100) : 100;

  // Courier partner distribution
  const courierStats: Record<string, number> = {};
  orders.forEach(o => {
    const c = o.courier?.trim() || 'Unassigned';
    courierStats[c] = (courierStats[c] || 0) + 1;
  });

  const filteredOrders = orders.filter(o => {
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
  });

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
      
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 font-mono uppercase tracking-wider">
            Shipment & Evidence Dashboard
          </h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Real-time package metrics, courier dispatch tracking, and Telegram evidence sync
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={handleSendDemoMessage}
            disabled={isSendingDemo}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 text-blue-600" />
            <span>{isSendingDemo ? 'Pinging...' : 'TEST BOT'}</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>SETTINGS</span>
          </button>
        </div>
      </div>

      {demoStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{demoStatus}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Total Packages</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-extrabold text-slate-900">{totalOrders}</span>
            <Package className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Telegram Evidence Sent</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-extrabold text-emerald-600">{successfulUploads}</span>
            <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
              {successRate}%
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Active Couriers</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-extrabold text-purple-600">{Object.keys(courierStats).filter(k => k !== 'Unassigned').length}</span>
            <Truck className="w-5 h-5 text-purple-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Telegram Channel</span>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {settings.hasToken ? 'ONLINE' : 'CONFIGURED'}
            </span>
            <ShieldCheck className="w-5 h-5 text-slate-400" />
          </div>
        </div>

      </div>

      {/* Courier Partners Distribution */}
      {Object.keys(courierStats).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2.5 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-extrabold text-slate-800 uppercase flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>Courier Partners Breakdown</span>
            </h3>
            <span className="text-slate-400 text-[11px]">Packages by carrier</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(courierStats).map(([courier, count]) => (
              <div 
                key={courier} 
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
                  courier === 'Unassigned' 
                    ? 'bg-slate-50 border-slate-200 text-slate-600' 
                    : 'bg-blue-50/60 border-blue-200 text-blue-900 font-bold'
                }`}
              >
                <span>{courier}</span>
                <span className="bg-white px-1.5 py-0.2 rounded-full text-[10px] font-extrabold border border-slate-200 text-slate-800">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Package Details Store Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden font-mono">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-slate-900 text-sm uppercase">
              Stored Package Details & Evidence Records
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
              {filteredOrders.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by Order, AWB, SKU, Courier..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none"
              />
            </div>

            <button
              onClick={() => exportOrdersToExcel(filteredOrders, 'zuboc_admin_packages')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Export complete order details to formatted Excel (.xlsx) file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>EXPORT EXCEL</span>
            </button>

            <button
              onClick={() => exportOrdersToCSV(filteredOrders, 'zuboc_admin_packages')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              title="Export as UTF-8 CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="p-3">Order ID & AWB</th>
                <th className="p-3">Courier</th>
                <th className="p-3">Weight</th>
                <th className="p-3">Item / SKU</th>
                <th className="p-3">Customer / City</th>
                <th className="p-3">Station & Staff</th>
                <th className="p-3">Time (IST)</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans text-xs">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-mono">
                    No package records found matching query
                  </td>
                </tr>
              ) : (
                filteredOrders.slice(0, 50).map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="font-mono font-bold text-slate-900 text-xs">{order.orderId}</div>
                      {order.awbNumber ? (
                        <div className="font-mono text-[11px] text-blue-600 flex items-center gap-1 mt-0.5">
                          <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                          <span>{order.awbNumber}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        {order.courier ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200 text-[11px] w-fit">
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

                    <td className="p-3 font-mono text-xs">
                      {order.weight ? (
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Scale className="w-3 h-3 text-emerald-600" />
                          {order.weight}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-xs">
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

                    <td className="p-3 text-xs">
                      {order.customerName ? (
                        <span className="text-slate-700 font-medium">{order.customerName}</span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-[11px] text-slate-600">
                      <div>{order.stationId}</div>
                      <div className="text-slate-400 text-[10px]">{order.staffId}</div>
                    </td>

                    <td className="p-3 font-mono text-[11px] text-slate-500">
                      {formatIST(order.createdAt)}
                    </td>

                    <td className="p-3 font-mono text-[10px]">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono text-xs">
                      {(order.telegramMessageLink || order.uploadStatus === 'SUCCESS') && (
                        <a
                          href={order.telegramMessageLink || 'https://t.me/'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 text-[11px]"
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

      {/* Bot & Station Config summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 uppercase">Telegram Config</h3>
          <button
            onClick={onOpenSettings}
            className="text-blue-600 hover:underline font-bold"
          >
            Edit Settings
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-slate-500 text-[10px] font-bold block uppercase">Telegram Chat ID</span>
            <span className="text-slate-900 font-bold text-sm">{settings.telegramChatId || 'Not Configured'}</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-slate-500 text-[10px] font-bold block uppercase">Bot Token Status</span>
            <span className={`font-bold text-sm ${settings.hasToken ? 'text-emerald-600' : 'text-amber-600'}`}>
              {settings.hasToken ? 'ACTIVE' : 'DEFAULT TOKEN'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
