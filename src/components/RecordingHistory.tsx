import React from 'react';
import { Download, RefreshCw, ExternalLink } from 'lucide-react';
import { OrderRecord } from '../types';

interface RecordingHistoryProps {
  orders: OrderRecord[];
  onRefresh: () => void;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({ orders, onRefresh }) => {
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
    link.setAttribute('download', `vms_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Recording History Audit Log</h2>
          <p className="text-xs text-zinc-400">Recorded packing evidence and Telegram upload references</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300 font-mono">
            <thead className="bg-zinc-950 text-zinc-500 uppercase border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">Station</th>
                <th className="px-5 py-3">Staff</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Recorded At</th>
                <th className="px-5 py-3 text-right">Telegram</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {orders.map(order => (
                <tr key={order.orderId} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-white">{order.orderId}</td>
                  <td className="px-5 py-3.5 text-zinc-400">{order.stationId}</td>
                  <td className="px-5 py-3.5 text-zinc-400">{order.staffId}</td>
                  <td className="px-5 py-3.5 text-zinc-400">{order.durationSeconds}s</td>
                  <td className="px-5 py-3.5">
                    <span className={order.uploadStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}>
                      {order.uploadStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-500">{new Date(order.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right font-sans">
                    {order.telegramMessageLink ? (
                      <a
                        href={order.telegramMessageLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1 text-xs"
                      >
                        <span>View</span>
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
      </div>

    </div>
  );
};
