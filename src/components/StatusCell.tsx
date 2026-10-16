import React from 'react';
import { OrderRecord } from '../types';

interface StatusCellProps {
  order: OrderRecord;
  onUpdate?: (updatedOrder: OrderRecord) => void;
  staffName: string;
}

export const StatusCell: React.FC<StatusCellProps> = ({ order, onUpdate, staffName }) => {
  const [currentStatus, setCurrentStatus] = useState(order.fulfillmentStatus || 'Pending');

  const handleSaveStatus = () => {
    if (currentStatus === (order.fulfillmentStatus || 'Pending')) return;

    const nowIso = new Date().toISOString();
    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: staffName,
      action: 'QUICK_STATUS_UPDATE',
      details: `Fulfillment status changed from "${order.fulfillmentStatus || 'Pending'}" to "${currentStatus}"`,
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
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={currentStatus}
        onChange={(e) => setCurrentStatus(e.target.value)}
        className={`px-2 py-1 rounded-xl border text-[11px] font-bold focus:outline-none cursor-pointer transition-all ${
          currentStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' :
          currentStatus === 'Shipped' ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100' :
          currentStatus === 'Fulfilled' ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100' :
          currentStatus === 'Packed' ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' :
          'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
        }`}
      >
        <option value="Pending">Pending</option>
        <option value="Packed">Packed</option>
        <option value="Shipped">Shipped</option>
        <option value="Fulfilled">Fulfilled</option>
        <option value="Delivered">Delivered</option>
      </select>
      {currentStatus !== (order.fulfillmentStatus || 'Pending') && (
        <button
          onClick={handleSaveStatus}
          className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
          title="Save status change"
        >
          <Check className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
