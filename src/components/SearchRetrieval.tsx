import React, { useState } from 'react';
import { Search, ExternalLink, RefreshCw, Video, ShieldCheck, Database, Filter } from 'lucide-react';
import { OrderRecord } from '../types';

interface SearchRetrievalProps {
  orders: OrderRecord[];
  onRefreshOrders: () => void;
}

export const SearchRetrieval: React.FC<SearchRetrievalProps> = ({ orders, onRefreshOrders }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOrders = orders.filter(order => {
    return order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
           order.staffId.toLowerCase().includes(searchTerm.toLowerCase()) ||
           order.stationId.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>CRYPTOGRAPHIC EVIDENCE VAULT</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>Zuboc Evidence Retrieval</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Instantly retrieve immutable packing video evidence, verify Telegram dispatch logs, and audit end-to-end fulfillment compliance across all active stations.
            </p>
          </div>

          <button
            onClick={onRefreshOrders}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-all shadow-lg hover:shadow-cyan-500/10 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync Vault Records</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-xl">
        <div className="relative">
          <Search className="w-5 h-5 text-cyan-400 absolute left-4 top-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Order ID, AWB Barcode, Staff ID, or Station (e.g., ORD-9982)..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-white text-sm font-mono focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 font-mono text-xs font-bold text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>ARCHIVED EVIDENCE RECORDS ({filteredOrders.length})</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Immutable Storage Mode Active
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto text-slate-500">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-400">No video records found matching "{searchTerm}"</p>
            <p className="text-xs text-slate-600 font-mono">Try searching with a different Order ID or AWB barcode.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/40 text-slate-400 uppercase font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="px-6 py-4">Order AWB / ID</th>
                  <th className="px-6 py-4">Station</th>
                  <th className="px-6 py-4">Operator</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Recorded Timestamp</th>
                  <th className="px-6 py-4">Telegram Dispatch</th>
                  <th className="px-6 py-4 text-right">Evidence Stream</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4 font-bold text-white text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                        <span>{order.orderId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {order.stationId}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {order.staffId}
                    </td>
                    <td className="px-6 py-4 text-cyan-400 font-bold">
                      {order.durationSeconds}s
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 ${
                        order.uploadStatus === 'SUCCESS' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-500/10' 
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${order.uploadStatus === 'SUCCESS' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-sans">
                      {order.telegramMessageLink ? (
                        <a
                          href={order.telegramMessageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 hover:from-cyan-500/20 hover:to-emerald-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-cyan-500/20 group-hover:scale-105"
                        >
                          <span>Play Video</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-600 font-mono text-[11px]">Pending Upload</span>
                      )}
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
