import React, { useState } from 'react';
import { Search, ExternalLink, RefreshCw, ShieldCheck, Database, Trash2, Filter, Play, CheckCircle2, AlertTriangle, Download, X } from 'lucide-react';
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
  const [confirmDeleteModalId, setConfirmDeleteModalId] = useState<string | null>(null);
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
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
    } finally {
      setDeletingId(null);
      setConfirmDeleteModalId(null);
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
    link.setAttribute('download', `zuboc_evidence_vault_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn font-sans">
      
      {/* Header Banner */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>CRYPTOGRAPHIC EVIDENCE VAULT</span>
          </div>
          <h1 className="text-2xl font-black text-white font-mono tracking-tight">
            EVIDENCE RETRIEVAL & AUDIT
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl font-mono">
            Query immutable packing video recordings, inspect Telegram delivery status, and manage evidence lifecycle records.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
          <button
            onClick={exportFilteredCSV}
            className="px-4 py-2.5 bg-[#161c2b] hover:bg-[#1f273b] text-slate-200 border border-[#222c3e] rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>EXPORT CSV</span>
          </button>
          <button
            onClick={onRefreshOrders}
            className="px-4 py-2.5 bg-[#161c2b] hover:bg-[#1f273b] text-cyan-400 border border-[#222c3e] rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>SYNC VAULT</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Order AWB, Staff ID, Station..."
            className="w-full bg-[#06080d] border border-[#21293a] rounded-xl pl-10 pr-4 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 bg-[#06080d] p-1 rounded-xl border border-[#1b2232] text-xs">
          {(['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-3.5 bg-[#06080d] border-b border-[#1f2738] font-mono text-xs font-bold text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>ARCHIVED EVIDENCE RECORDS ({filteredOrders.length})</span>
          </div>
          <span className="text-[11px] text-slate-500">Zuboc Cryptographic Ledger</span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-16 text-center space-y-3 font-mono">
            <div className="w-12 h-12 rounded-2xl bg-[#141a26] border border-[#222c3e] flex items-center justify-center mx-auto text-slate-500">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-300">No records found matching filters</p>
            <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#080b12] text-slate-400 uppercase font-semibold border-b border-[#1c2333] tracking-wider text-[11px]">
                <tr>
                  <th className="px-6 py-3.5">Order AWB / ID</th>
                  <th className="px-6 py-3.5">Station</th>
                  <th className="px-6 py-3.5">Operator</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Telegram Dispatch</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181f2e]">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-[#121724] transition-colors group">
                    <td className="px-6 py-4 font-bold text-white text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>{order.orderId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{order.stationId}</td>
                    <td className="px-6 py-4 text-slate-300">{order.staffId}</td>
                    <td className="px-6 py-4 text-emerald-400 font-bold">{order.durationSeconds}s</td>
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 ${
                        order.uploadStatus === 'SUCCESS' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${order.uploadStatus === 'SUCCESS' ? 'bg-emerald-400 led-emerald' : 'bg-rose-400'}`}></span>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-2 font-mono">
                        {order.telegramMessageLink && (
                          <a
                            href={order.telegramMessageLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all"
                          >
                            <span>Open Telegram</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => setConfirmDeleteModalId(order.orderId)}
                          disabled={deletingId === order.orderId}
                          title="Delete Evidence Record"
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

      {/* Delete Confirmation Modal */}
      {confirmDeleteModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
          <div className="bg-[#0e111a] border border-[#222c3f] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-extrabold text-white">DELETE EVIDENCE RECORD?</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete evidence for order <strong className="text-white">{confirmDeleteModalId}</strong>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1f2738] text-xs font-bold">
              <button
                onClick={() => setConfirmDeleteModalId(null)}
                className="px-4 py-2 bg-[#161c2b] text-slate-300 hover:text-white rounded-xl border border-[#222c3e] cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteModalId)}
                disabled={deletingId === confirmDeleteModalId}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl cursor-pointer disabled:opacity-50"
              >
                {deletingId === confirmDeleteModalId ? 'DELETING...' : 'CONFIRM DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
