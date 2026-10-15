import React, { useState } from 'react';
import { Download, RefreshCw, ExternalLink, History, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { OrderRecord } from '../types';

interface RecordingHistoryProps {
  orders: OrderRecord[];
  onRefresh: () => void;
  onDeleteOrder: (orderId: string) => void;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({ orders, onRefresh, onDeleteOrder }) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn font-sans">
      
      {/* Header Banner */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6 font-mono">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <History className="w-3.5 h-3.5" />
            <span>IMMUTABLE LOGISTICS AUDIT TRAIL</span>
          </div>
          <h1 className="text-2xl font-black text-white font-mono tracking-tight">
            RECORDING LOGS & TELEMETRY
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl font-mono">
            Chronological audit ledger of packing terminal recordings, operator IDs, station tokens, and Telegram channel dispatches.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs">
          <button
            onClick={exportCSV}
            className="px-4 py-2.5 bg-[#161c2b] hover:bg-[#1f273b] text-slate-200 border border-[#222c3e] rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>EXPORT CSV</span>
          </button>
          <button
            onClick={onRefresh}
            className="px-4 py-2.5 bg-[#161c2b] hover:bg-[#1f273b] text-cyan-400 border border-[#222c3e] rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>SYNC LOG</span>
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl overflow-hidden shadow-2xl font-mono">
        <div className="px-6 py-3.5 bg-[#06080d] border-b border-[#1f2738] text-xs font-bold text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>FULL LEDGER ENTRIES ({orders.length})</span>
          </div>
          <span className="text-[11px] text-slate-500">Zuboc Cryptographic Audit</span>
        </div>

        {orders.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 font-mono">
            No recording history entries found in vault.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#080b12] text-slate-400 uppercase font-semibold border-b border-[#1c2333] tracking-wider text-[11px]">
                <tr>
                  <th className="px-6 py-3.5">Order AWB / ID</th>
                  <th className="px-6 py-3.5">Station ID</th>
                  <th className="px-6 py-3.5">Operator</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Telegram Status</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181f2e]">
                {orders.map(order => (
                  <tr key={order.orderId} className="hover:bg-[#121724] transition-colors group">
                    <td className="px-6 py-4 font-bold text-white text-sm">{order.orderId}</td>
                    <td className="px-6 py-4 text-slate-300">{order.stationId}</td>
                    <td className="px-6 py-4 text-slate-300">{order.staffId}</td>
                    <td className="px-6 py-4 text-cyan-400 font-bold">{order.durationSeconds}s</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${order.uploadStatus === 'SUCCESS' ? 'bg-emerald-400 led-emerald' : 'bg-rose-400'}`}></span>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-[11px]">{new Date(order.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {order.telegramMessageLink && (
                          <a
                            href={order.telegramMessageLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-bold transition-all"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => setConfirmDeleteId(order.orderId)}
                          disabled={deletingId === order.orderId}
                          title="Delete Audit Entry"
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50"
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

      {/* Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
          <div className="bg-[#0e111a] border border-[#222c3f] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-extrabold text-white">DELETE AUDIT LEDGER ENTRY?</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete audit log entry for order <strong className="text-white">{confirmDeleteId}</strong>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1f2738] text-xs font-bold">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 bg-[#161c2b] text-slate-300 hover:text-white rounded-xl border border-[#222c3e] cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl cursor-pointer disabled:opacity-50"
              >
                {deletingId === confirmDeleteId ? 'DELETING...' : 'CONFIRM DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
