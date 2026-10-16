import { safeFetchJson } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { formatIST } from '../utils/time';
import { Search, ExternalLink, RefreshCw, Download, Trash2, Filter, X, Truck, Scale, Tag, FileText, Edit3, History, CheckCircle2, User, Calendar, PackagePlus, FileSpreadsheet, Eye, Video, Camera, Upload } from 'lucide-react';
import { OrderRecord } from '../types';
import { Link } from 'react-router-dom';
import { exportOrdersToExcel, exportOrdersToCSV } from '../utils/excelExport';
import { uploadQueueManager } from '../utils/uploadQueue';
import { StatusCell } from './StatusCell';

interface SearchRetrievalProps {
  orders: OrderRecord[];
  onRefreshOrders: () => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateOrder?: (updatedOrder: OrderRecord) => void;
  onStartPacking?: (order: OrderRecord) => void;
  onOpenAddOrder?: () => void;
  currentStaffId?: string;
  currentStaffName?: string;
}

export const SearchRetrieval: React.FC<SearchRetrievalProps> = ({ 
  orders, 
  onRefreshOrders, 
  onDeleteOrder, 
  onUpdateOrder,
  onStartPacking,
  onOpenAddOrder,
  currentStaffId = 'Operator-ID',
  currentStaffName = 'Operator'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'PENDING'>('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);

  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [newOrderId, setNewOrderId] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newAwb, setNewAwb] = useState("");
  const [newCourier, setNewCourier] = useState("Delhivery");
  const [newSku, setNewSku] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newItemCount, setNewItemCount] = useState("1");
  const [newOrderTotal, setNewOrderTotal] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newRemarks, setNewRemarks] = useState("");

  const handleAddOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderId.trim()) {
      alert("Please enter an Order ID");
      return;
    }
    const orderRecord: OrderRecord = {
      orderId: newOrderId.trim().toUpperCase(),
      staffId: currentStaffName,
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
      remarks: newRemarks,
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
        setIsAddOrderOpen(false);
        setNewOrderId("");
        setNewCustomer("");
        setNewAwb("");
        setNewSku("");
        setNewWeight("");
        setNewItemCount("1");
        setNewOrderTotal("");
        setNewNotes("");
        setNewRemarks("");
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
  const [editRemarks, setEditRemarks] = useState('');
  const [editFulfillmentStatus, setEditFulfillmentStatus] = useState('Pending');
  
  const [activeLogTab, setActiveLogTab] = useState<'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG'>('EDIT_LOG');

  // Auto-calculate total when orderAmount or shippingAmount changes in edit modal
  useEffect(() => {
    const ord = parseFloat(editOrderAmount) || 0;
    const shp = parseFloat(editShippingAmount) || 0;
    if (ord > 0 || shp > 0) {
      setEditOrderTotal((ord + shp).toFixed(2));
    }
  }, [editOrderAmount, editShippingAmount]);

  // Fulfillment status distribution for summary
  const fulfillmentStats: Record<string, number> = {
    'Pending': 0,
    'Packed': 0,
    'Shipped': 0,
    'Fulfilled': 0,
    'Delivered': 0
  };
  orders.forEach(o => {
    const s = o.fulfillmentStatus || 'Pending';
    if (fulfillmentStats[s] !== undefined) {
      fulfillmentStats[s]++;
    }
  });

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
      (order.stationId && order.stationId.toLowerCase().includes(q));

    const matchesUploadStatus = 
      statusFilter === 'ALL' || 
      order.uploadStatus === statusFilter;

    const matchesFulfillment = 
      fulfillmentFilter === 'ALL' || 
      (order.fulfillmentStatus || 'Pending') === fulfillmentFilter;

    return matchesSearch && matchesUploadStatus && matchesFulfillment;
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
    setEditRemarks(order.remarks || '');
    setEditFulfillmentStatus(order.fulfillmentStatus || 'Pending');
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
          staffId: currentStaffName,
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
    checkChange('Remarks', editingOrder.remarks, editRemarks.trim());
    checkChange('Fulfillment Status', editingOrder.fulfillmentStatus, editFulfillmentStatus);

    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'USER_EDIT_ORDER',
      details: `Order details edited and saved by staff ${currentStaffId}`,
      type: 'EDIT_LOG'
    });

    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
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
      remarks: editRemarks.trim() || undefined,
      fulfillmentStatus: editFulfillmentStatus,
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

  const handleQuickStatusUpdate = async (order: OrderRecord, newStatus: string) => {
    if (!onUpdateOrder) return;
    const nowIso = new Date().toISOString();
    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'QUICK_STATUS_UPDATE',
      details: `Fulfillment status changed from "${order.fulfillmentStatus || 'Pending'}" to "${newStatus}"`,
      type: 'CHANGE_LOG'
    });

    const updated: OrderRecord = {
      ...order,
      fulfillmentStatus: newStatus,
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    onUpdateOrder(updated);
  };

  const handleQuickNoteUpdate = async (order: OrderRecord) => {
    const text = window.prompt(`Add a new chat note for Order ${order.orderId}:`);
    if (!text || !text.trim()) return;

    if (!onUpdateOrder) return;
    const nowIso = new Date().toISOString();
    
    const newChatNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      text: text.trim(),
      staffId: currentStaffName,
      timestamp: nowIso
    };

    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'ADD_CHAT_NOTE',
      details: `Quick note added via table: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
      type: 'EDIT_LOG'
    });

    const updated: OrderRecord = {
      ...order,
      chatNotes: [...(order.chatNotes || []), newChatNote],
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    onUpdateOrder(updated);
    fetch("/api/telegram/update-caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    }).catch(() => {});
  };

  const handleMarkAsPacked = async (order: OrderRecord, mediaFile: File) => {
    if (!onUpdateOrder) return;
    
    const isVideo = mediaFile.type.startsWith('video/');
    const isImage = mediaFile.type.startsWith('image/');
    
    if (!isVideo && !isImage) {
      alert("Invalid file type. Please upload an image or video.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const nowIso = new Date().toISOString();
      
      const evidenceType: 'VIDEO' | 'PHOTO' | 'PHOTO_VIDEO' = isVideo ? 'VIDEO' : 'PHOTO';

      const updated: OrderRecord = {
        ...order,
        recordingStatus: 'COMPLETED',
        uploadStatus: 'PENDING',
        evidenceType,
        photoDataUrl: isImage ? dataUrl : undefined,
        fulfillmentStatus: 'Packed',
        updatedAt: nowIso,
        recordingStartedAt: nowIso
      };

      // Create a manual upload task for the queue
      uploadQueueManager.addTask({
        orderId: order.orderId,
        staffId: currentStaffName,
        stationId: order.stationId || 'Manual-Upload',
        durationSeconds: 0,
        evidenceType,
        videoBlob: isVideo ? mediaFile : undefined,
        photoBlobs: isImage ? [mediaFile] : [],
        photoDataUrls: isImage ? [dataUrl] : [],
        recordingDate: nowIso,
        width: 0,
        height: 0,
        awbNumber: order.awbNumber,
        courier: order.courier,
        deliveryMethod: order.deliveryMethod,
        weight: order.weight,
        productSku: order.productSku,
        customerName: order.customerName,
        contactPerson: order.contactPerson,
        contactPhone: order.contactPhone,
        notes: order.notes
      });

      onUpdateOrder(updated);
      alert(`Order ${order.orderId} marked as Packed with ${isVideo ? 'video' : 'photo'} evidence.`);
    };
    reader.readAsDataURL(mediaFile);
  };

  const handleExportExcel = () => {
    exportOrdersToExcel(filteredOrders, 'zuboc_order_packings');
  };

  const handleExportCSV = () => {
    exportOrdersToCSV(filteredOrders, 'zuboc_order_packings');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 font-sans">
      <input
        type="file"
        id="manual-media-upload"
        className="hidden"
        accept="image/*,video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && (window as any).pendingMarkAsPackedOrder) {
            handleMarkAsPacked((window as any).pendingMarkAsPackedOrder, file);
            (window as any).pendingMarkAsPackedOrder = null;
            e.target.value = ''; // Reset input
          }
        }}
      />
      
      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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

          {/* Export & Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenAddOrder ? onOpenAddOrder() : setIsAddOrderOpen(true)}
              className="px-3 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Add Order</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel</span>
            </button>

            <button
              onClick={onRefreshOrders}
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Fulfillment Summary & Filters */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fulfillment:</span>
              <div className="flex flex-wrap gap-1.5">
                {['ALL', 'Pending', 'Packed', 'Shipped', 'Fulfilled', 'Delivered'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFulfillmentFilter(f)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                      fulfillmentFilter === f
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {f.toUpperCase()} ({f === 'ALL' ? orders.length : fulfillmentStats[f]})
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Telegram:</span>
              <div className="flex flex-wrap gap-1.5">
                {(['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
                <th className="p-3">Fulfillment</th>
                <th className="p-3">Recorded By</th>
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
                        <Link 
                          to={`/order/${order.orderId}`}
                          className="font-mono font-bold text-slate-900 text-xs hover:text-blue-600 hover:underline flex items-center gap-1 group"
                        >
                          <span>{order.orderId}</span>
                          <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {onStartPacking && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {/* Check if evidence exists in TG/system - check for non-empty values */}
                            {((order.telegramMessageLink && order.telegramMessageLink.trim() !== '') || 
                              (order.videoUrl && order.videoUrl.trim() !== '') || 
                              (order.photoUrls && order.photoUrls.some(url => url.trim() !== '')) || 
                              (order.photoDataUrl && order.photoDataUrl.trim() !== '')) ? (
                              <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Evidence in TG</span>
                              </div>
                            ) : (order.fulfillmentStatus === 'Pending' && (
                              <>
                                <button
                                  onClick={() => onStartPacking(order)}
                                  className="px-2 py-1 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Start packing this order"
                                >
                                  <Video className="w-3 h-3" />
                                  <span>Video</span>
                                </button>
                                <button
                                  onClick={() => {
                                    (window as any).pendingMarkAsPackedOrder = order;
                                    document.getElementById('manual-media-upload')?.click();
                                  }}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Mark as packed with photo or video from files"
                                >
                                  <Upload className="w-3 h-3" />
                                  <span>File</span>
                                </button>
                              </>
                            ))}
                          </div>
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
                      <div className="space-y-1.5">
                        <StatusCell order={order} onUpdate={onUpdateOrder} staffName={currentStaffName} />
                        
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleQuickNoteUpdate(order)}
                            className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded transition-all border ${
                              (order.notes || (order.chatNotes && order.chatNotes.length > 0)) ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-slate-400 bg-slate-50 border-slate-200 hover:text-slate-600'
                            }`}
                            title={order.notes || (order.chatNotes?.[order.chatNotes.length - 1]?.text) || 'Add Note'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[100px]">
                              {order.chatNotes && order.chatNotes.length > 0 
                                ? order.chatNotes[order.chatNotes.length - 1].text 
                                : order.notes || 'Notes'}
                            </span>
                            {order.chatNotes && order.chatNotes.length > 0 && (
                              <span className="bg-blue-600 text-white text-[8px] px-1 rounded-full min-w-[14px] text-center">
                                {order.chatNotes.length}
                              </span>
                            )}
                          </button>

                          {order.remarks && (
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[100px]">{order.remarks}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-3 font-mono text-xs">
                      <div className="text-slate-700 font-medium">{order.staffId}</div>
                      <div className="text-slate-400 text-[10px]">{formatIST(order.createdAt)}</div>
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

                  {/* Fulfillment Status */}
                  <div className="bg-blue-50/60 border border-blue-200 p-2 rounded-lg">
                    <label className="block text-[10px] font-bold text-blue-800 uppercase mb-0.5">Fulfillment Status</label>
                    <select
                      value={editFulfillmentStatus}
                      onChange={(e) => setEditFulfillmentStatus(e.target.value)}
                      className="w-full bg-white border border-blue-300 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Packed">Packed</option>
                      <option value="Shipped">Shipped</option>
                      <option value="Fulfilled">Fulfilled</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>

                  {/* Notes & Remarks */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Internal Notes</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add internal notes..."
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">QC Remarks</label>
                    <input
                      type="text"
                      value={editRemarks}
                      onChange={(e) => setEditRemarks(e.target.value)}
                      placeholder="QC Remarks..."
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
