import React, { useState } from 'react';
import { Download, RefreshCw, ExternalLink, Trash2 } from 'lucide-react';
import { OrderRecord } from '../types';

interface RecordingHistoryProps {
  orders: OrderRecord[];
  onRefresh: () => void;
  onDeleteOrder: (orderId: string) => void;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({ orders, onRefresh, onDeleteOrder }) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const exportCSV = () => {
    const headers = ['Order ID', 'Staff ID', 'Station ID', 'Duration (s)', 'Upload Status', 'Timestamp'];
    const rows = orders.map(o => [
      o.orderId,
      o.staffId,
      o.stationId,
      o.durationSeconds,
      o.uploadStatus,
      o.createdAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `zuboc_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (orderId: string) => {
    if (!window.confirm(`Delete record for order ${orderId}?`)) return;
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 font-sans">
      
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-slate-900 font-mono uppercase tracking-wider">
          Recording History ({orders.length})
        </h2>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT CSV</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm font-sans">
        {orders.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 font-mono">
            No history entries
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase tracking-wider">
                  <th className="p-4">Order ID</th>
                  <th className="p-4">Station</th>
                  <th className="p-4">Operator</th>
                  <th className="p-4">Duration</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date & Time</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {orders.map(order => (
                  <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-bold text-slate-900 text-sm">{order.orderId}</td>
                    <td className="p-4 text-slate-600">{order.stationId}</td>
                    <td className="p-4 text-slate-600">{order.staffId}</td>
                    <td className="p-4 font-bold text-slate-800">{order.durationSeconds}s</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 text-[11px]">{new Date(order.createdAt).toLocaleString()}</td>
                    <td className="p-4 text-right space-x-2">
                      {order.telegramMessageLink && (
                        <a
                          href={order.telegramMessageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-all"
                        >
                          <span>Telegram</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(order.orderId)}
                        disabled={deletingId === order.orderId}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
