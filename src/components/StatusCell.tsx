import React, { useState, useEffect } from 'react';
import { Check, Save, X } from 'lucide-react';
import { OrderRecord } from '../types';

interface StatusCellProps {
  order: OrderRecord;
  onUpdate?: (updatedOrder: OrderRecord) => void;
  staffName: string;
}

export const StatusCell: React.FC<StatusCellProps> = ({ order, onUpdate, staffName }) => {
  const [currentStatus, setCurrentStatus] = useState(order.fulfillmentStatus || 'Pending');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const raw = order.fulfillmentStatus || 'Pending';
    setCurrentStatus(raw === 'Shipped' ? 'Fulfilled' : raw);
  }, [order.fulfillmentStatus]);

  const rawInit = order.fulfillmentStatus || 'Pending';
  const normInit = rawInit === 'Shipped' ? 'Fulfilled' : rawInit;
  const hasChanged = currentStatus !== normInit;

  const handleSaveStatus = () => {
    if (!hasChanged) return;

    const nowIso = new Date().toISOString();
    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: staffName,
      action: 'QUICK_STATUS_UPDATE',
      details: `Fulfillment status changed from "${normInit}" to "${currentStatus}"`,
      type: 'CHANGE_LOG'
    });

    const updated: OrderRecord = {
      ...order,
      fulfillmentStatus: currentStatus,
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    if (onUpdate) {
      onUpdate(updated);
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleCancel = () => {
    setCurrentStatus(normInit);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={currentStatus}
        onChange={(e) => setCurrentStatus(e.target.value)}
        className={`px-2 py-1 rounded-xl border text-[11px] font-bold focus:outline-none cursor-pointer transition-all ${
          currentStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' :
          currentStatus === 'Fulfilled' ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100' :
          currentStatus === 'Packed' ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' :
          'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
        } ${hasChanged ? 'ring-2 ring-emerald-500/40 border-emerald-500' : ''}`}
      >
        <option value="Pending">Pending</option>
        <option value="Packed">Packed</option>
        <option value="Fulfilled">Fulfilled</option>
        <option value="Delivered">Delivered</option>
      </select>

      {hasChanged && (
        <div className="flex items-center gap-1 animate-in fade-in duration-150">
          <button
            onClick={handleSaveStatus}
            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold shadow-sm transition-all cursor-pointer"
            title="Save status change to database"
          >
            <Save className="w-3 h-3" />
            <span>Save</span>
          </button>
          <button
            onClick={handleCancel}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Cancel and revert"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {justSaved && !hasChanged && (
        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
          <Check className="w-3 h-3" />
          <span>Saved</span>
        </span>
      )}
    </div>
  );
};
