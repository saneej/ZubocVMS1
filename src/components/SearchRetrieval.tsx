import React, { useState } from 'react';
import { formatIST } from '../utils/time';
import { Search, ExternalLink, RefreshCw, Download, Trash2, Filter, X, Truck, Scale, Tag, FileText } from 'lucide-react';
import { OrderRecord } from '../types';

interface SearchRetrievalProps {
  orders: OrderRecord[];
  onRefreshOrders: () => void;
  onDeleteOrder: (orderId: string) => void;
}

export const SearchRetrieval: React.FC<SearchRetrievalProps> = ({ orders, onRefreshOrders, onDeleteOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'PENDING'>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeVideoModal, setActiveVideoModal] = useState<OrderRecord | null>(null);

  const filteredOrders = orders.filter(order => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      order.orderId.toLowerCase().includes(q) ||
      (order.awbNumber && order.awbNumber.toLowerCase().includes(q)) ||
      (order.courier && order.courier.toLowerCase().includes(q)) ||
      (order.productSku && order.productSku.toLowerCase().includes(q)) ||
      (order.customerName && order.customerName.toLowerCase().includes(q)) ||
      (order.notes && order.notes.toLowerCase().includes(q)) ||
      order.staffId.toLowerCase().includes(q) ||
      order.stationId.toLowerCase().includes(q);

    const matchesStatus = 
      statusFilter === 'ALL' || 
      order.uploadStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (orderId: string) => {
    if (!window.confirm(`Delete recording for order ${orderId}?`)) return;
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
    } finally {
      setDeletingId(null);
    }
  };

  const exportFilteredCSV = () => {
    const headers = ['Order ID', 'AWB Number', 'Courier', 'Weight', 'Product SKU', 'Quantity', 'Customer', 'Notes', 'Station', 'Operator', 'Duration (s)', 'Upload Status', 'Telegram Link', 'Timestamp (IST)'];
    const rows = filteredOrders.map(o => [
      `"${o.orderId}"`,
      `"${o.awbNumber || ''}"`,
      `"${o.courier || ''}"`,
      `"${o.weight || ''}"`,
      `"${o.productSku || ''}"`,
      `"${o.itemCount || ''}"`,
      `"${o.customerName || ''}"`,
      `"${(o.notes || '').replace(/"/g, '""')}"`,
      `"${o.stationId}"`,
      `"${o.staffId}"`,
      o.durationSeconds,
      o.uploadStatus,
      `"${o.telegramMessageLink || ''}"`,
      `"${formatIST(o.createdAt)}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `zuboc_recordings_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 font-sans">
      
      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Search Bar */}
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Order ID or Staff..."
            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono w-full sm:w-auto">
          {(['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}

          <button
            onClick={exportFilteredCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>

      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase tracking-wider">
                <th className="p-3">Order ID & AWB</th>
                <th className="p-3">Courier</th>
                <th className="p-3">Weight</th>
                <th className="p-3">Item / SKU</th>
                <th className="p-3">Customer / City</th>
                <th className="p-3">Station & Operator</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date & Time (IST)</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 font-mono">
                    No recordings match query
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
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
                      {order.courier ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200 text-[11px]">
                          {order.courier}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
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
                        <div className="text-slate-800 font-medium">{order.customerName}</div>
                      ) : null}
                      {order.notes ? (
                        <div className="text-slate-500 text-[10px] italic flex items-center gap-1 mt-0.5">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]">{order.notes}</span>
                        </div>
                      ) : null}
                      {!order.customerName && !order.notes && (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-xs">
                      <div className="text-slate-700 font-medium">{order.stationId}</div>
                      <div className="text-slate-400 text-[10px]">{order.staffId}</div>
                    </td>

                    <td className="p-3 font-mono text-slate-600 text-xs">
                      {order.durationSeconds}s
                    </td>

                    <td className="p-3 font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>

                    <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {formatIST(order.createdAt)}
                    </td>
                    <td className="p-4 text-right space-x-2 font-mono">
                      {(order.telegramMessageLink || order.uploadStatus === 'SUCCESS') && (
                        <a
                          href={order.telegramMessageLink || 'https://t.me/'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200"
                        >
                          <span>Telegram</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(order.orderId)}
                        disabled={deletingId === order.orderId}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
