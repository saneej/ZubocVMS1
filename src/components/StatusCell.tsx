import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { OrderRecord } from '../types';

interface StatusCellProps {
  order: OrderRecord;
  onUpdate: (updatedOrder: OrderRecord) => void;
  staffName: string;
}

export const StatusCell: React.FC<StatusCellProps> = ({ order, onUpdate, staffName }) => {
  const [localStatus, setLocalStatus] = useState(order.fulfillmentStatus || 'Pending');

  useEffect(() => {
    setLocalStatus(order.fulfillmentStatus || 'Pending');
  }, [order.fulfillmentStatus]);

  const handleStatusChange = (newStatus: string) => {
    setLocalStatus(newStatus);
  };

  const handleSave = () => {
    const nowIso = new Date().toISOString();
    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: staffName,
      action: 'QUICK_STATUS_UPDATE',
      details: `Fulfillment status changed from "${order.fulfillmentStatus || 'Pending'}" to "${localStatus}"`,
      type: 'CHANGE_LOG'
    });

    const updated: OrderRecord = {
      ...order,
      fulfillmentStatus: localStatus,
      auditLogs: newLogs,
      updatedAt: nowIso
    };
    onUpdate(updated);
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={localStatus}
        onChange={(e) => handleStatusChange(e.target.value)}
        className={`px-1.5 py-1 rounded border text-[10px] font-bold focus:outline-none cursor-pointer ${
          localStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          localStatus === 'Shipped' ? 'bg-blue-50 text-blue-700 border-blue-200' :
          localStatus === 'Fulfilled' ? 'bg-purple-50 text-purple-700 border-purple-200' :
          localStatus === 'Packed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
          'bg-slate-50 text-slate-600 border-slate-200'
        }`}
      >
        <option value="Pending">Pending</option>
        <option value="Packed">Packed</option>
        <option value="Shipped">Shipped</option>
        <option value="Fulfilled">Fulfilled</option>
        <option value="Delivered">Delivered</option>
      </select>
      
      {localStatus !== (order.fulfillmentStatus || 'Pending') && (
        <button
          onClick={handleSave}
          className="p-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-md cursor-pointer transition-colors"
          title="Save fulfillment status"
        >
          <Check className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
