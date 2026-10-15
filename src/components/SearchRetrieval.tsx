import React, { useState } from 'react';
import { Search, ExternalLink, RefreshCw, Download, Trash2, Filter, X } from 'lucide-react';
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
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.staffId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.stationId.toLowerCase().includes(searchTerm.toLowerCase());

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
    const headers = ['Order AWB / ID', 'Station', 'Operator', 'Duration (s)', 'Upload Status', 'Telegram Link', 'Timestamp'];
    const rows = filteredOrders.map(o => [
      o.orderId,
      o.stationId,
      o.staffId,
      o.durationSeconds,
      o.uploadStatus,
      o.telegramMessageLink || 'N/A',
      o.createdAt
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
                <th className="p-4">Order ID / AWB</th>
                <th className="p-4">Station</th>
                <th className="p-4">Operator</th>
                <th className="p-4">Duration</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-mono">
                    No recordings match query
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-900 text-sm">
                      {order.orderId}
                    </td>
                    <td className="p-4 font-mono text-slate-600">
                      {order.stationId}
                    </td>
                    <td className="p-4 font-medium text-slate-700">
                      {order.staffId}
                    </td>
                    <td className="p-4 font-mono text-slate-600">
                      {order.durationSeconds}s
                    </td>
                    <td className="p-4 font-mono">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
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
