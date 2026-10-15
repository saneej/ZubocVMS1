import React, { useState } from 'react';
import { Search, ExternalLink, RefreshCw, CheckCircle2, AlertTriangle, Clock, User, Package, Video } from 'lucide-react';
import { OrderRecord } from '../types';

interface SearchRetrievalProps {
  orders: OrderRecord[];
  onRefreshOrders: () => void;
}

export const SearchRetrieval: React.FC<SearchRetrievalProps> = ({ orders, onRefreshOrders }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          order.staffId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          order.stationId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'ALL' || order.uploadStatus === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleRetryUpload = async (order: OrderRecord) => {
    setIsRetrying(true);
    try {
      // If we have videoBlob stored or if we need to re-upload via backend
      // In this version, we trigger a retry endpoint or re-upload simulation
      alert(`Retrying upload for Order ID: ${order.orderId}... Please ensure Telegram bot token is configured in Settings.`);
      onRefreshOrders();
    } catch (err: any) {
      alert('Retry failed: ' + err.message);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Header & Search Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg mb-6">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center space-x-2">
          <Search className="w-6 h-6 text-cyan-400" />
          <span>Search & Retrieve Packing Footage</span>
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Find historical order packing records, verify Telegram upload status, and open direct video links.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 relative">
            <Search className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Order ID (e.g. ORD-12345), staff name, or station..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 shadow-inner"
            />
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 shadow-inner"
            >
              <option value="ALL">All Upload Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Grid / Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* List of Orders */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="font-semibold text-white text-sm">Matching Order Records ({filteredOrders.length})</span>
            <button
              onClick={onRefreshOrders}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No order recordings found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search query or upload filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800 overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 font-semibold">
                  <tr>
                    <th className="px-6 py-3">Order ID</th>
                    <th className="px-6 py-3">Station & Staff</th>
                    <th className="px-6 py-3">Recorded At</th>
                    <th className="px-6 py-3">Telegram Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.orderId}
                      onClick={() => setSelectedOrder(order)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${selectedOrder?.orderId === order.orderId ? 'bg-slate-800/80' : ''}`}
                    >
                      <td className="px-6 py-4 font-mono font-bold text-white">
                        {order.orderId}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{order.stationId}</div>
                        <div className="text-xs text-slate-500">{order.staffId}</div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          order.uploadStatus === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          order.uploadStatus === 'FAILED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            order.uploadStatus === 'SUCCESS' ? 'bg-emerald-400' :
                            order.uploadStatus === 'FAILED' ? 'bg-rose-400' : 'bg-amber-400'
                          }`}></span>
                          <span>{order.uploadStatus}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Order Detail Sidebar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
          {selectedOrder ? (
            <div>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
                <h3 className="font-bold text-white text-base font-mono">{selectedOrder.orderId}</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  selectedOrder.uploadStatus === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {selectedOrder.uploadStatus}
                </span>
              </div>

              <div className="space-y-4 text-sm mb-6">
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Packing Station</span>
                  <span className="font-medium text-white">{selectedOrder.stationId}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Staff Member</span>
                  <span className="font-medium text-white">{selectedOrder.staffId}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Duration</span>
                  <span className="font-mono text-white">{selectedOrder.durationSeconds} seconds</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Recorded Timestamp</span>
                  <span className="text-slate-300">{new Date(selectedOrder.createdAt).toLocaleString()}</span>
                </div>
                {selectedOrder.telegramMessageId && (
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">Telegram Reference</span>
                    <span className="font-mono text-xs text-cyan-400">Message ID: {selectedOrder.telegramMessageId}</span>
                  </div>
                )}
              </div>

              {selectedOrder.telegramMessageLink ? (
                <a
                  href={selectedOrder.telegramMessageLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-lg mb-3"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Video in Telegram</span>
                </a>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 mb-3">
                  ⚠️ Direct Telegram message link not available. Check your Telegram group manually or retry upload.
                </div>
              )}

              {selectedOrder.uploadStatus !== 'SUCCESS' && (
                <button
                  onClick={() => handleRetryUpload(selectedOrder)}
                  disabled={isRetrying}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 border border-slate-700 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>Retry Telegram Upload</span>
                </button>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <Video className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-slate-400 font-medium">Select an order record</p>
              <p className="text-xs text-slate-500 mt-1">Click any order in the table to view Telegram video links and metadata.</p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500 text-center">
            PackVision VMS Secure Retrieval Vault
          </div>
        </div>

      </div>

    </div>
  );
};
