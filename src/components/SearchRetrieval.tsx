import React, { useState } from 'react';
import { Search, ExternalLink, RefreshCw } from 'lucide-react';
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      
      {/* Search Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Type Order ID (e.g. ORD-123456)..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-11 pr-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={onRefreshOrders}
          className="p-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Orders Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800 text-xs font-semibold text-zinc-400 flex justify-between">
          <span>Matching Orders ({filteredOrders.length})</span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No order recordings found matching "{searchTerm}".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950/50 text-zinc-500 uppercase font-mono border-b border-zinc-800">
                <tr>
                  <th className="px-5 py-3">Order ID</th>
                  <th className="px-5 py-3">Station</th>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Recorded At</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Telegram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white">
                      {order.orderId}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-400">
                      {order.stationId}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-400">
                      {order.staffId}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={order.uploadStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}>
                        {order.uploadStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {order.telegramMessageLink ? (
                        <a
                          href={order.telegramMessageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-sans font-medium"
                        >
                          <span>Open Video</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-zinc-600">-</span>
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
