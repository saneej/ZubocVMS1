import React, { useState } from 'react';
import { Download, RefreshCw, ExternalLink, History, FileText, Trash2 } from 'lucide-react';
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
    link.setAttribute('download', `zuboc_audit_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (orderId: string) => {
    if (window.confirm(`Are you sure you want to delete audit entry for order ${orderId}?`)) {
      setDeletingId(orderId);
      try {
        await onDeleteOrder(orderId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold tracking-wider">
              <History className="w-3.5 h-3.5" />
              <span>IMMUTABLE AUDIT TRAIL</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Recording History & Telemetry
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Complete chronological audit ledger of all packing sessions, video digests, operator IDs, and Telegram channel dispatch delivery status.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={exportCSV}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onRefresh}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sync Log</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 font-mono text-xs font-bold text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>FULL LEDGER ENTRIES ({orders.length})</span>
          </div>
          <span className="text-[11px] text-slate-500">Secure Management Console</span>
        </div>

        {orders.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 font-mono">
            No recording history entries found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/40 text-slate-400 uppercase font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="px-6 py-4">Order AWB / ID</th>
                  <th className="px-6 py-4">Station ID</th>
                  <th className="px-6 py-4">Operator</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Telegram Dispatch</th>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map(order => (
                  <tr key={order.orderId} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4 font-bold text-white text-sm">{order.orderId}</td>
                    <td className="px-6 py-4 text-slate-300">{order.stationId}</td>
                    <td className="px-6 py-4 text-slate-300">{order.staffId}</td>
                    <td className="px-6 py-4 text-cyan-400 font-bold">{order.durationSeconds}s</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${order.uploadStatus === 'SUCCESS' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-[11px]">{new Date(order.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-2">
                        {order.telegramMessageLink && (
                          <a
                            href={order.telegramMessageLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(order.orderId)}
                          disabled={deletingId === order.orderId}
                          title="Delete Record"
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
