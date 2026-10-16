import { safeFetchJson } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { formatIST } from '../utils/time';
import { Search, ExternalLink, RefreshCw, Download, Trash2, Filter, X, Truck, Scale, Tag, FileText, Edit3, History, CheckCircle2, User, Calendar, PackagePlus, FileSpreadsheet } from 'lucide-react';
import { OrderRecord } from '../types';
import { exportOrdersToExcel, exportOrdersToCSV } from '../utils/excelExport';

interface SearchRetrievalProps {
  orders: OrderRecord[];
  onRefreshOrders: () => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateOrder?: (updatedOrder: OrderRecord) => void;
  onStartPacking?: (order: OrderRecord) => void;
  onOpenPreEnter?: () => void;
  currentStaffId?: string;
}

export const SearchRetrieval: React.FC<SearchRetrievalProps> = ({ 
  orders, 
  onRefreshOrders, 
  onDeleteOrder, 
  onUpdateOrder,
  onStartPacking,
  onOpenPreEnter,
  currentStaffId = 'Staff-01'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'PENDING'>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);

  const [isPreEnterOpen, setIsPreEnterOpen] = useState(false);
  const [newOrderId, setNewOrderId] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newAwb, setNewAwb] = useState("");
  const [newCourier, setNewCourier] = useState("Delhivery");
  const [newSku, setNewSku] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newItemCount, setNewItemCount] = useState("1");
  const [newOrderTotal, setNewOrderTotal] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const handlePreEnterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderId.trim()) {
      alert("Please enter an Order ID");
      return;
    }
    const orderRecord: OrderRecord = {
      orderId: newOrderId.trim().toUpperCase(),
      staffId: currentStaffId,
      stationId: "Order-Department",
      recordingStartedAt: new Date().toISOString(),
      durationSeconds: 0,
      recordingStatus: "PENDING",
      uploadStatus: "PENDING",
      awbNumber: newAwb,
      courier: newCourier,
      weight: newWeight,
      productSku: newSku,
      customerName: newCustomer,
      itemCount: newItemCount,
      orderTotal: newOrderTotal,
      notes: newNotes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      const res = await safeFetchJson("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderRecord)
      });
      if (res && res.success) {
        onRefreshOrders();
        setIsPreEnterOpen(false);
        setNewOrderId("");
        setNewCustomer("");
        setNewAwb("");
        setNewSku("");
        setNewWeight("");
        setNewItemCount("1");
        setNewOrderTotal("");
        setNewNotes("");
      } else {
        alert("Failed to save pre-entered order");
      }
    } catch (err) {
      console.error("Error pre-entering order:", err);
      alert("Error pre-entering order");
    }
  };

  
  // All editable order fields
  const [editAwb, setEditAwb] = useState('');
  const [editCourier, setEditCourier] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editItemCount, setEditItemCount] = useState<string | number>('1');
  const [editCustomer, setEditCustomer] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editOrderReceivedDate, setEditOrderReceivedDate] = useState('');
  const [editDispatchDate, setEditDispatchDate] = useState('');
  const [editOrderAmount, setEditOrderAmount] = useState('');
  const [editShippingAmount, setEditShippingAmount] = useState('');
  const [editOrderTotal, setEditOrderTotal] = useState('');
  const [editDeliveredDate, setEditDeliveredDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  
  const [activeLogTab, setActiveLogTab] = useState<'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG'>('EDIT_LOG');

  // Auto-calculate total when orderAmount or shippingAmount changes in edit modal
  useEffect(() => {
    const ord = parseFloat(editOrderAmount) || 0;
    const shp = parseFloat(editShippingAmount) || 0;
    if (ord > 0 || shp > 0) {
      setEditOrderTotal((ord + shp).toFixed(2));
    }
  }, [editOrderAmount, editShippingAmount]);

  const filteredOrders = orders.filter(order => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      order.orderId.toLowerCase().includes(q) ||
      (order.awbNumber && order.awbNumber.toLowerCase().includes(q)) ||
      (order.courier && order.courier.toLowerCase().includes(q)) ||
      (order.productSku && order.productSku.toLowerCase().includes(q)) ||
      (order.customerName && order.customerName.toLowerCase().includes(q)) ||
      (order.notes && order.notes.toLowerCase().includes(q)) ||
      order.staffId.toLowerCase().includes(q) ||
      order.stationId.toLowerCase().includes(q);

    const matchesStatus = 
      statusFilter === 'ALL' || 
      order.uploadStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (orderId: string) => {
    if (!window.confirm(`Delete recording for order ${orderId}?`)) return;
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
    } finally {
      setDeletingId(null);
    }
  };

  const openEditModal = (order: OrderRecord) => {
    setEditingOrder(order);
    setEditAwb(order.awbNumber || '');
    setEditCourier(order.courier || '');
    setEditWeight(order.weight || '');
    setEditSku(order.productSku || '');
    setEditItemCount(order.itemCount || '1');
    setEditCustomer(order.customerName || '');
    setEditContactPerson(order.contactPerson || '');
    setEditContactPhone(order.contactPhone || '');
    setEditOrderReceivedDate(order.orderReceivedDate || '');
    setEditDispatchDate(order.dispatchDate || '');
    setEditOrderAmount(order.orderAmount || '');
    setEditShippingAmount(order.shippingAmount || '');
    setEditOrderTotal(order.orderTotal || '');
    setEditDeliveredDate(order.deliveredDate || '');
    setEditNotes(order.notes || '');
  };

  const handleSaveOrderEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || !onUpdateOrder) return;

    const nowIso = new Date().toISOString();
    const newLogs = [...(editingOrder.auditLogs || [])];

    // Check changes for change logs
    const checkChange = (fieldName: string, oldVal: any, newVal: any) => {
      if (oldVal !== newVal) {
        newLogs.push({
          timestamp: nowIso,
          staffId: currentStaffId,
          action: `UPDATE_${fieldName.toUpperCase()}`,
          details: `${fieldName} changed from "${oldVal || 'None'}" to "${newVal || 'None'}"`,
          type: 'CHANGE_LOG'
        });
      }
    };

    checkChange('AWB Number', editingOrder.awbNumber, editAwb.trim());
    checkChange('Courier', editingOrder.courier, editCourier.trim());
    checkChange('Weight', editingOrder.weight, editWeight.trim());
    checkChange('SKU', editingOrder.productSku, editSku.trim());
    checkChange('Quantity', editingOrder.itemCount, editItemCount);
    checkChange('Customer', editingOrder.customerName, editCustomer.trim());
    checkChange('Contact Person', editingOrder.contactPerson, editContactPerson.trim());
    checkChange('Contact Phone', editingOrder.contactPhone, editContactPhone.trim());
    checkChange('Received Date', editingOrder.orderReceivedDate, editOrderReceivedDate);
    checkChange('Despatch Date', editingOrder.dispatchDate, editDispatchDate);
    checkChange('Order Amount', editingOrder.orderAmount, editOrderAmount.trim());
    checkChange('Shipping Amount', editingOrder.shippingAmount, editShippingAmount.trim());
    checkChange('Total Amount', editingOrder.orderTotal, editOrderTotal.trim());
    checkChange('Delivered Date', editingOrder.deliveredDate, editDeliveredDate);
    checkChange('Notes', editingOrder.notes, editNotes.trim());

    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffId,
      action: 'USER_EDIT_ORDER',
      details: `Order details edited and saved by staff ${currentStaffId}`,
      type: 'EDIT_LOG'
    });

    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffId,
      action: 'USER_ACTION',
      details: `User action logged for order ${editingOrder.orderId}`,
      type: 'USER_LOG'
    });

    const updated: OrderRecord = {
      ...editingOrder,
      awbNumber: editAwb.trim() || undefined,
      courier: editCourier.trim() || undefined,
      weight: editWeight.trim() || undefined,
      productSku: editSku.trim() || undefined,
      itemCount: editItemCount,
      customerName: editCustomer.trim() || undefined,
      contactPerson: editContactPerson.trim() || undefined,
      contactPhone: editContactPhone.trim() || undefined,
      orderReceivedDate: editOrderReceivedDate || undefined,
      dispatchDate: editDispatchDate || undefined,
      orderAmount: editOrderAmount.trim() || undefined,
      shippingAmount: editShippingAmount.trim() || undefined,
      orderTotal: editOrderTotal.trim() || undefined,
      deliveredDate: editDeliveredDate || undefined,
      notes: editNotes.trim() || undefined,
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    onUpdateOrder(updated);
    fetch("/api/telegram/update-caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    }).catch(() => {});
    setEditingOrder(null);
  };

  const handleExportExcel = () => {
    exportOrdersToExcel(filteredOrders, 'zuboc_order_packings');
  };

  const handleExportCSV = () => {
    exportOrdersToCSV(filteredOrders, 'zuboc_order_packings');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 font-sans">
      
      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Search Bar */}
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Order ID, AWB, Customer..."
            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono w-full sm:w-auto">
          {(['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}

          <button
            onClick={() => onOpenPreEnter ? onOpenPreEnter() : setIsPreEnterOpen(true)}
            className="px-3 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <PackagePlus className="w-3.5 h-3.5" />
            <span>Pre-Enter Order</span>
          </button>

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
            <span>CSV</span>
          </button>
        </div>

      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase tracking-wider">
                <th className="p-3">Order ID & AWB</th>
                <th className="p-3">Courier</th>
                <th className="p-3">Amounts (₹)</th>
                <th className="p-3">Item / SKU</th>
                <th className="p-3">Customer & Dates</th>
                <th className="p-3">Station & Operator</th>
                <th className="p-3">Status</th>
                <th className="p-3">Recorded Time</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-mono">
                    No recordings match query
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="font-mono font-bold text-slate-900 text-xs">{order.orderId}</div>
                        {onStartPacking && (
                          <button
                            onClick={() => onStartPacking(order)}
                            className="px-2 py-0.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Start packing this order"
                          >
                            <PackagePlus className="w-3 h-3" />
                            <span>Start Packing</span>
                          </button>
                        )}
                      </div>
                      {order.awbNumber ? (
                        <div className="font-mono text-[11px] text-blue-600 font-medium">AWB: {order.awbNumber}</div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">No AWB</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-xs">
                      {order.courier ? (
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200">
                          {order.courier}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {order.weight && <div className="text-[10px] text-slate-500 mt-0.5">Wt: {order.weight}</div>}
                    </td>

                    <td className="p-3 font-mono text-xs">
                      {order.orderTotal ? (
                        <div className="font-bold text-slate-900">₹{order.orderTotal}</div>
                      ) : order.orderAmount ? (
                        <div className="font-bold text-slate-900">₹{order.orderAmount}</div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {order.shippingAmount && <div className="text-[10px] text-slate-500">Ship: ₹{order.shippingAmount}</div>}
                    </td>

                    <td className="p-3 font-mono text-xs">
                      {order.productSku ? (
                        <div>
                          <div className="font-bold text-slate-800">{order.productSku}</div>
                          {order.itemCount && <span className="text-[10px] text-slate-500">Qty: {order.itemCount}</span>}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3 text-xs">
                      <div className="text-slate-800 font-bold">{order.customerName || '—'}</div>
                      <div className="text-[10px] text-slate-500 space-y-0.5 mt-0.5 font-mono">
                        {order.orderReceivedDate && <div>Recv: {order.orderReceivedDate}</div>}
                        {order.dispatchDate && <div>Desp: {order.dispatchDate}</div>}
                        {order.deliveredDate ? (
                          <div className="text-emerald-700 font-bold">Deliv: {order.deliveredDate}</div>
                        ) : (
                          <div className="text-amber-600">Deliv: Pending</div>
                        )}
                      </div>
                    </td>

                    <td className="p-3 font-mono text-xs">
                      <div className="text-slate-700 font-medium">{order.stationId}</div>
                      <div className="text-slate-400 text-[10px]">{order.staffId}</div>
                    </td>

                    <td className="p-3 font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {order.uploadStatus}
                      </span>
                    </td>

                    <td className="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {formatIST(order.createdAt)}
                    </td>

                    <td className="p-3 text-right space-x-1.5 font-mono whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(order)}
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-blue-600 font-bold px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 cursor-pointer"
                        title="Edit details & view logs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit / Logs</span>
                      </button>

                      {(order.telegramMessageLink || order.uploadStatus === 'SUCCESS') && (
                        <a
                          href={order.telegramMessageLink || 'https://t.me/'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200"
                          title="View on Telegram"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      <button
                        onClick={() => handleDelete(order.orderId)}
                        disabled={deletingId === order.orderId}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-block"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FULL EDIT ORDER & AUDIT LOGS MODAL */}
      {editingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider">
                  Edit All Order Details & Audit Logs • {editingOrder.orderId}
                </h3>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Form Section */}
              <form onSubmit={handleSaveOrderEdit} id="edit-order-form" className="space-y-4 font-mono text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  
                  {/* AWB */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">AWB / Tracking</label>
                    <input
                      type="text"
                      value={editAwb}
                      onChange={(e) => setEditAwb(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Courier */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Courier Partner</label>
                    <input
                      type="text"
                      value={editCourier}
                      onChange={(e) => setEditCourier(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Weight */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Weight</label>
                    <input
                      type="text"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* SKU */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Item / SKU</label>
                    <input
                      type="text"
                      value={editSku}
                      onChange={(e) => setEditSku(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Qty */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Quantity</label>
                    <input
                      type="text"
                      value={editItemCount}
                      onChange={(e) => setEditItemCount(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Customer */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Customer / City</label>
                    <input
                      type="text"
                      value={editCustomer}
                      onChange={(e) => setEditCustomer(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Contact Person */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Contact Person</label>
                    <input
                      type="text"
                      value={editContactPerson}
                      onChange={(e) => setEditContactPerson(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Contact Phone */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Contact Phone</label>
                    <input
                      type="text"
                      value={editContactPhone}
                      onChange={(e) => setEditContactPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Received Date */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Order Received Date</label>
                    <input
                      type="date"
                      value={editOrderReceivedDate}
                      onChange={(e) => setEditOrderReceivedDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Despatch Date */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Despatch Date</label>
                    <input
                      type="date"
                      value={editDispatchDate}
                      onChange={(e) => setEditDispatchDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Order Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Order Amount (₹)</label>
                    <input
                      type="text"
                      value={editOrderAmount}
                      onChange={(e) => setEditOrderAmount(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Shipping Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Shipping Amount (₹)</label>
                    <input
                      type="text"
                      value={editShippingAmount}
                      onChange={(e) => setEditShippingAmount(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Total Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Total Amount (₹)</label>
                    <input
                      type="text"
                      value={editOrderTotal}
                      onChange={(e) => setEditOrderTotal(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Delivered Date */}
                  <div className="bg-emerald-50/60 border border-emerald-200 p-2 rounded-lg">
                    <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-0.5">Delivered Date</label>
                    <input
                      type="date"
                      value={editDeliveredDate}
                      onChange={(e) => setEditDeliveredDate(e.target.value)}
                      className="w-full bg-white border border-emerald-300 focus:border-emerald-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Notes / QC Remarks</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                </div>
              </form>

              {/* Audit Logs Section */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-800 uppercase">
                    <History className="w-4 h-4 text-blue-600" />
                    <span>System Audit Trail & Logs</span>
                  </div>
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-mono">
                    {(['EDIT_LOG', 'CHANGE_LOG', 'USER_LOG'] as const).map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveLogTab(tab)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          activeLogTab === tab
                            ? 'bg-white text-blue-600 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-200 font-mono text-xs rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto">
                  {(!editingOrder.auditLogs || editingOrder.auditLogs.filter(l => l.type === activeLogTab).length === 0) ? (
                    <div className="text-slate-500 text-center py-4">
                      No {activeLogTab.toLowerCase().replace('_', ' ')}s recorded for this order yet. Edit and save changes to record logs.
                    </div>
                  ) : (
                    editingOrder.auditLogs
                      .filter(l => l.type === activeLogTab)
                      .map((log, idx) => (
                        <div key={idx} className="border-b border-slate-800 pb-2 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Staff: <strong className="text-blue-400">{log.staffId}</strong> • Action: <strong className="text-emerald-400">{log.action}</strong></span>
                            <span>{formatIST(log.timestamp)}</span>
                          </div>
                          <div className="text-white text-xs">{log.details}</div>
                        </div>
                      ))
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 font-mono">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="submit"
                form="edit-order-form"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md"
              >
                SAVE ALL CHANGES & LOG
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
