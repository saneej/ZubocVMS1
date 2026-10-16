import React, { useState } from 'react';
import { formatIST } from '../utils/time';
import { Download, RefreshCw, ExternalLink, Trash2, Truck, Scale, Tag, FileText, FileSpreadsheet, Eye } from 'lucide-react';
import { OrderRecord } from '../types';
import { Link } from 'react-router-dom';
import { exportOrdersToExcel, exportOrdersToCSV } from '../utils/excelExport';

interface RecordingHistoryProps {
  orders: OrderRecord[];
  onRefresh: () => void;
  onDeleteOrder: (orderId: string) => void;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({ orders, onRefresh, onDeleteOrder }) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleExportExcel = () => {
    exportOrdersToExcel(orders, 'zuboc_recording_history');
  };

  const handleExportCSV = () => {
    exportOrdersToCSV(orders, 'zuboc_recording_history');
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
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Export complete order details to formatted Excel (.xlsx) file"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>EXPORT EXCEL</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            title="Export as UTF-8 CSV"
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
                  <th className="p-3">Order ID & AWB</th>
                  <th className="p-3">Courier</th>
                  <th className="p-3">Weight</th>
                  <th className="p-3">Item / SKU</th>
                  <th className="p-3">Customer / City</th>
                  <th className="p-3">Station & Operator</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date & Time (IST)</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {orders.map(order => (
                  <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <Link 
                        to={`/order/${order.orderId}`}
                        className="font-bold text-slate-900 text-xs hover:text-blue-600 hover:underline flex items-center gap-1 group"
                      >
                        <span>{order.orderId}</span>
                        <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      {order.awbNumber ? (
                        <div className="text-[11px] text-blue-600 flex items-center gap-1 mt-0.5">
                          <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                          <span>{order.awbNumber}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    <td className="p-3 text-xs">
                      {order.courier ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200 text-[11px]">
                          {order.courier}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3 text-xs">
                      {order.weight ? (
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Scale className="w-3 h-3 text-emerald-600" />
                          {order.weight}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3 text-xs">
                      {order.productSku ? (
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-purple-600" />
                            <span>{order.productSku}</span>
                          </div>
                          {order.itemCount && (
                            <span className="text-[10px] text-slate-500 font-sans">Qty: {order.itemCount}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="p-3 text-xs font-sans">
                      {order.customerName ? (
                        <div className="text-slate-800 font-medium">{order.customerName}</div>
                      ) : null}
                      {order.notes ? (
                        <div className="text-slate-500 text-[10px] italic flex items-center gap-1 mt-0.5">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]">{order.notes}</span>
                        </div>
                      ) : null}
                      {!order.customerName && !order.notes && (
                        <span className="text-slate-400 text-[10px] font-mono">—</span>
                      )}
                    </td>

                    <td className="p-3 text-xs">
                      <div className="text-slate-700 font-medium">{order.stationId}</div>
                      <div className="text-slate-400 text-[10px]">{order.staffId}</div>
                    </td>

                    <td className="p-3 font-bold text-slate-800 text-xs">{order.durationSeconds}s</td>

                    <td className="p-3 text-[10px]">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>

                    <td className="p-3 text-slate-500 text-[11px] whitespace-nowrap">{formatIST(order.createdAt)}</td>

                    <td className="p-3 text-right space-x-2">
                      {(order.telegramMessageLink || order.uploadStatus === 'SUCCESS') && (
                        <a
                          href={order.telegramMessageLink || 'https://t.me/'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-all"
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
