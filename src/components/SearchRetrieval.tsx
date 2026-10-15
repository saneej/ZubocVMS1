import React, { useState } from 'react';
import { Search, ExternalLink, RefreshCw, Video } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-cyan-400" />
            <span>TrackVid Evidence Portal</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Search historical order packing footage, verify Telegram delivery status, and launch video evidence.
          </p>
        </div>

        <button
          onClick={onRefreshOrders}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Order ID / Barcode AWB (e.g. ORD-123456)..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 font-mono text-xs font-bold text-slate-300 flex justify-between">
          <span>Matching Video Records ({filteredOrders.length})</span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 font-mono">
            No video records found matching "{searchTerm}".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Order AWB / ID</th>
                  <th className="px-6 py-4">Station</th>
                  <th className="px-6 py-4">Packer</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Recorded At</th>
                  <th className="px-6 py-4">Telegram Status</th>
                  <th className="px-6 py-4 text-right">Evidence Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-white text-sm">
                      {order.orderId}
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
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-sans">
                      {order.telegramMessageLink ? (
                        <a
                          href={order.telegramMessageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-bold transition-all"
                        >
                          <span>Open in Telegram</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-600">-</span>
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
