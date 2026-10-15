import React, { useState } from 'react';
import { History, Download, Filter, RefreshCw, ExternalLink, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { OrderRecord } from '../types';

interface RecordingHistoryProps {
  orders: OrderRecord[];
  onRefresh: () => void;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({ orders, onRefresh }) => {
  const [filterStation, setFilterStation] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const filtered = orders.filter(o => {
    const matchStation = filterStation === 'ALL' || o.stationId === filterStation;
    const matchStatus = filterStatus === 'ALL' || o.uploadStatus === filterStatus;
    return matchStation && matchStatus;
  });

  const exportCSV = () => {
    const headers = ['Order ID', 'Staff ID', 'Station ID', 'Duration (s)', 'Recording Status', 'Upload Status', 'Telegram Message ID', 'Timestamp'];
    const rows = filtered.map(o => [
      o.orderId,
      o.staffId,
      o.stationId,
      o.durationSeconds,
      o.recordingStatus,
      o.uploadStatus,
      o.telegramMessageId || '',
      o.createdAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `packvision_vms_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stations = Array.from(new Set(orders.map(o => o.stationId)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <History className="w-6 h-6 text-cyan-400" />
            <span>Complete Recording History</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Full audit trail of all order packing videos recorded across warehouse stations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={exportCSV}
            className="bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center space-x-2 border border-slate-700 transition-colors cursor-pointer shadow"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onRefresh}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold px-4 py-2.5 rounded-xl flex items-center space-x-2 transition-colors cursor-pointer shadow"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh Audit Log</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center space-x-2 text-sm text-slate-300">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span>Filters:</span>
        </div>

        <div>
          <select
            value={filterStation}
            onChange={(e) => setFilterStation(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Stations</option>
            {stations.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 ml-auto">
          Showing {filtered.length} of {orders.length} recordings
        </div>
      </div>

      {/* History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Station</th>
                <th className="px-6 py-4">Staff ID</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Upload Status</th>
                <th className="px-6 py-4">Recorded Date</th>
                <th className="px-6 py-4 text-right">Telegram Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(order => (
                <tr key={order.orderId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-white">
                    {order.orderId}
                  </td>
                  <td className="px-6 py-4 font-medium text-white">
                    {order.stationId}
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    {order.staffId}
                  </td>
                  <td className="px-6 py-4 font-mono text-cyan-400">
                    {order.durationSeconds}s
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      order.uploadStatus === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      order.uploadStatus === 'FAILED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      <span>{order.uploadStatus}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {new Date(order.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {order.telegramMessageLink ? (
                      <a
                        href={order.telegramMessageLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View in Telegram</span>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Not linked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
