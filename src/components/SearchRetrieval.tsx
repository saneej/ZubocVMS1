import { safeFetchJson } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { formatIST, formatDateForInput } from '../utils/time';
import { Search, ExternalLink, RefreshCw, Download, Trash2, Filter, X, Truck, Scale, Tag, FileText, Edit3, History, CheckCircle2, User, Calendar, PackagePlus, FileSpreadsheet, Eye, Video, Camera, Upload, Save, Globe, ShoppingCart, Palette, Sparkles } from 'lucide-react';
import { OrderRecord, isAmazonOrder } from '../types';
import { Link } from 'react-router-dom';
import { exportOrdersToExcel, exportOrdersToCSV } from '../utils/excelExport';
import { exportOrdersToPDF, exportSingleOrderPDF } from '../utils/pdfExport';
import { uploadQueueManager } from '../utils/uploadQueue';
import { StatusCell } from './StatusCell';
import { watermarkPhoto } from '../utils/watermark';
import { ImportShopifyCsvModal } from './ImportShopifyCsvModal';
import { SendToDesignModal } from './SendToDesignModal';

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
  const [channelFilter, setChannelFilter] = useState<'website' | 'amazon' | 'ALL'>('website');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'PENDING'>('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('ALL');
  const [workflowFilter, setWorkflowFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);

  // Listen for channel switch requests (e.g. when an Amazon order is created)
  useEffect(() => {
    const handleSwitch = (e: any) => {
      const targetChannel = e?.detail;
      if (targetChannel === 'amazon' || targetChannel === 'website' || targetChannel === 'ALL') {
        setChannelFilter(targetChannel);
      }
    };
    window.addEventListener('zuboc_switch_channel', handleSwitch);
    return () => window.removeEventListener('zuboc_switch_channel', handleSwitch);
  }, []);

  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [isShopifyCsvModalOpen, setIsShopifyCsvModalOpen] = useState(false);
  const [designOrderModalTarget, setDesignOrderModalTarget] = useState<OrderRecord | null>(null);
  const [newOrderSource, setNewOrderSource] = useState<'website' | 'amazon'>('website');
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
    const cleanId = newOrderId.trim();
    if (!cleanId) {
      alert("Please enter an Order ID");
      return;
    }
    const digits = cleanId.replace(/\D/g, '');
    const order_number_num = digits ? parseInt(digits, 10) : undefined;
    const isAmazon = newOrderSource === 'amazon' || isAmazonOrder({ orderId: cleanId, order_source: newOrderSource, courier: newCourier });
    const finalSource: 'amazon' | 'website' = isAmazon ? 'amazon' : 'website';

    const orderRecord: OrderRecord = {
      orderId: cleanId,
      order_source: finalSource,
      orderSource: finalSource,
      order_number_num,
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
      if (onUpdateOrder) {
        await onUpdateOrder(orderRecord);
      }
      setChannelFilter(finalSource);
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
  const [editDispatchScheduledDate, setEditDispatchScheduledDate] = useState('');
  const [editDispatchDate, setEditDispatchDate] = useState('');
  const [editOrderAmount, setEditOrderAmount] = useState('');
  const [editShippingAmount, setEditShippingAmount] = useState('');
  const [editOrderTotal, setEditOrderTotal] = useState('');
  const [editDeliveredDate, setEditDeliveredDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editFulfillmentStatus, setEditFulfillmentStatus] = useState('Pending');
  const [editIsProductionDeckOrder, setEditIsProductionDeckOrder] = useState(false);
  
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
    'Fulfilled': 0,
    'Delivered': 0
  };
  orders.forEach(o => {
    let s = o.fulfillmentStatus || 'Pending';
    if (s === 'Shipped') s = 'Fulfilled';
    if (fulfillmentStats[s] !== undefined) {
      fulfillmentStats[s]++;
    }
  });

  // Channel counts
  const websiteOrdersCount = orders.filter(o => !isAmazonOrder(o)).length;
  const amazonOrdersCount = orders.filter(o => isAmazonOrder(o)).length;

  // Workflow counts
  const creReviewCount = orders.filter(o => ['DESIGN_SUBMITTED', 'CRE_REVIEW_PENDING', 'SUBMITTED_TO_CRE'].includes(o.workflowStatus || '')).length;
  const inDesignCount = orders.filter(o => ['DESIGN_PENDING', 'DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_REVISION_REQUESTED'].includes(o.workflowStatus || '')).length;
  const inProductionCount = orders.filter(o => ['PRODUCTION_PENDING', 'PRODUCTION_IN_PROGRESS', 'PRODUCTION_COMPLETED'].includes(o.workflowStatus || '')).length;

  const filteredOrders = orders.filter(order => {
    if (!order) return false;

    // Channel Filter
    const isAmazon = isAmazonOrder(order);
    const isWebsite = !isAmazon;

    if (channelFilter === 'website' && !isWebsite) return false;
    if (channelFilter === 'amazon' && !isAmazon) return false;

    const q = searchTerm.toLowerCase().trim();
    const qClean = q.replace(/^#+/, '');
    const matchesSearch = !q ||
      (order.orderId ? String(order.orderId).toLowerCase().includes(q) || String(order.orderId).toLowerCase().replace(/^#+/, '').includes(qClean) : false) ||
      (order.awbNumber ? String(order.awbNumber).toLowerCase().includes(q) : false) ||
      (order.courier ? String(order.courier).toLowerCase().includes(q) : false) ||
      (order.productSku ? String(order.productSku).toLowerCase().includes(q) : false) ||
      (order.customerName ? String(order.customerName).toLowerCase().includes(q) : false) ||
      (order.contactPerson ? String(order.contactPerson).toLowerCase().includes(q) : false) ||
      (order.contactPhone ? String(order.contactPhone).toLowerCase().includes(q) : false) ||
      (order.notes ? String(order.notes).toLowerCase().includes(q) : false) ||
      (order.remarks ? String(order.remarks).toLowerCase().includes(q) : false) ||
      (order.email ? String(order.email).toLowerCase().includes(q) : false) ||
      (order.staffId ? String(order.staffId).toLowerCase().includes(q) : false) ||
      (order.stationId ? String(order.stationId).toLowerCase().includes(q) : false);

    const matchesUploadStatus = 
      statusFilter === 'ALL' || 
      order.uploadStatus === statusFilter;

    const currentFulfillment = (order.fulfillmentStatus === 'Shipped') ? 'Fulfilled' : (order.fulfillmentStatus || 'Pending');
    const matchesFulfillment = 
      fulfillmentFilter === 'ALL' || 
      currentFulfillment === fulfillmentFilter;

    const wfStatus = order.workflowStatus || '';
    const matchesWorkflow =
      workflowFilter === 'ALL' ||
      (workflowFilter === 'CRE_REVIEW' && ['DESIGN_SUBMITTED', 'CRE_REVIEW_PENDING', 'SUBMITTED_TO_CRE'].includes(wfStatus)) ||
      (workflowFilter === 'DESIGN' && ['DESIGN_PENDING', 'DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_REVISION_REQUESTED'].includes(wfStatus)) ||
      (workflowFilter === 'PRODUCTION' && ['PRODUCTION_PENDING', 'PRODUCTION_IN_PROGRESS', 'PRODUCTION_COMPLETED'].includes(wfStatus)) ||
      (workflowFilter === 'NEEDS_DESIGN' && Boolean(order.isDesignRequired));

    return matchesSearch && matchesUploadStatus && matchesFulfillment && matchesWorkflow;
  });

  // Sorting: Every newly added order is listed at the VERY TOP
  filteredOrders.sort((a, b) => {
    if (!a || !b) return 0;

    // 1. Primary: Sort by createdAt/updatedAt/recordingStartedAt/orderReceivedDate DESC so newly added orders are ALWAYS listed at the top
    const getRecency = (o: OrderRecord) => {
      const dt = o.createdAt || o.updatedAt || o.recordingStartedAt || o.orderReceivedDate;
      const t = dt ? new Date(dt).getTime() : 0;
      return isNaN(t) ? 0 : t;
    };
    const timeA = getRecency(a);
    const timeB = getRecency(b);

    if (timeA !== timeB) {
      return timeB - timeA; // Descending: newest created on top
    }

    // 2. Secondary tie-breaker: order number descending
    const getNum = (o: OrderRecord) => {
      if (!o) return -1;
      if (typeof o.order_number_num === 'number' && !isNaN(o.order_number_num)) {
        return o.order_number_num;
      }
      const digits = String(o.orderId || '').replace(/\D/g, '');
      return digits ? parseInt(digits, 10) : -1;
    };
    return getNum(b) - getNum(a);
  });

  const handleDelete = async (orderId: string) => {
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
    setEditOrderReceivedDate(formatDateForInput(order.orderReceivedDate));
    setEditDispatchScheduledDate(formatDateForInput(order.dispatchScheduledDate || order.dispatch_scheduled_date || order.dispatchDate));
    setEditDispatchDate(formatDateForInput(order.dispatchDate));
    setEditOrderAmount(order.orderAmount || '');
    setEditShippingAmount(order.shippingAmount || '');
    setEditOrderTotal(order.orderTotal || '');
    setEditDeliveredDate(formatDateForInput(order.deliveredDate));
    setEditNotes(order.notes || '');
    setEditRemarks(order.remarks || '');
    setEditFulfillmentStatus(order.fulfillmentStatus || 'Pending');
    setEditIsProductionDeckOrder(Boolean(order.isProductionDeckOrder));
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
    checkChange('Dispatch Scheduled Date', editingOrder.dispatchScheduledDate, editDispatchScheduledDate);
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
      dispatchScheduledDate: editDispatchScheduledDate || undefined,
      dispatch_scheduled_date: editDispatchScheduledDate || undefined,
      dispatchDate: editDispatchDate || editDispatchScheduledDate || undefined,
      orderAmount: editOrderAmount.trim() || undefined,
      shippingAmount: editShippingAmount.trim() || undefined,
      orderTotal: editOrderTotal.trim() || undefined,
      deliveredDate: editDeliveredDate || undefined,
      notes: editNotes.trim() || undefined,
      remarks: editRemarks.trim() || undefined,
      fulfillmentStatus: editFulfillmentStatus,
      isProductionDeckOrder: editIsProductionDeckOrder,
      auditLogs: newLogs,
      updatedAt: nowIso
    };

    onUpdateOrder(updated);
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
      staffId: currentStaffId || currentStaffName,
      staffName: currentStaffName,
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
  };

  const handleMarkAsPacked = async (order: OrderRecord, mediaFile: File) => {
    if (!onUpdateOrder) return;
    
    const isVideo = mediaFile.type.startsWith('video/');
    const isImage = mediaFile.type.startsWith('image/');
    
    if (!isVideo && !isImage) {
      alert("Invalid file type. Please upload an image or video.");
      return;
    }

    const nowIso = new Date().toISOString();
    const evidenceType: 'VIDEO' | 'PHOTO' | 'PHOTO_VIDEO' = isVideo ? 'VIDEO' : 'PHOTO';

    let watermarkedDataUrl: string | undefined = undefined;
    let watermarkedBlob: Blob = mediaFile;

    if (isImage) {
      try {
        const wmResult = await watermarkPhoto(mediaFile, order.orderId);
        watermarkedDataUrl = wmResult.dataUrl;
        watermarkedBlob = wmResult.blob;
      } catch (err) {
        console.warn('Failed to watermark photo, falling back to original file:', err);
      }
    }

    const processUpload = (fallbackDataUrl?: string) => {
      const finalDataUrl = watermarkedDataUrl || fallbackDataUrl;

      const updated: OrderRecord = {
        ...order,
        recordingStatus: 'COMPLETED',
        uploadStatus: 'PENDING',
        evidenceType,
        photoDataUrl: isImage ? finalDataUrl : undefined,
        photoUrls: isImage && finalDataUrl ? [finalDataUrl] : undefined,
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
        photoBlobs: isImage ? [watermarkedBlob] : [],
        photoDataUrls: isImage && finalDataUrl ? [finalDataUrl] : [],
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

    if (isImage && watermarkedDataUrl) {
      processUpload(watermarkedDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => processUpload(e.target?.result as string);
      reader.readAsDataURL(mediaFile);
    }
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
        
        {/* Channel Filter Tabs (Website vs Amazon) */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono mr-2">
            Channel:
          </span>
          <button
            onClick={() => setChannelFilter('website')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              channelFilter === 'website'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Website ({websiteOrdersCount})</span>
          </button>

          <button
            onClick={() => setChannelFilter('amazon')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              channelFilter === 'amazon'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Amazon ({amazonOrdersCount})</span>
          </button>

          <button
            onClick={() => setChannelFilter('ALL')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              channelFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>All Channels ({orders.length})</span>
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar + Refresh */}
          <div className="flex items-center gap-2 w-full md:w-80 lg:w-96">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Order ID, AWB, Customer..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-[#832f5e] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
              />
            </div>
            <button
              onClick={onRefreshOrders}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer shrink-0"
              title="Refresh orders list"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Export & Actions Grid */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setIsShopifyCsvModalOpen(true)}
              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              title="Import orders from Shopify CSV export"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Import Shopify CSV</span>
            </button>

            <button
              onClick={() => onOpenAddOrder ? onOpenAddOrder() : setIsAddOrderOpen(true)}
              className="px-3 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <PackagePlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Add Order</span>
            </button>

            <button
              onClick={() => exportOrdersToPDF(filteredOrders, 'Order Fulfillment Report')}
              className="px-3 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              title="Download attractive PDF report"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Export PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Export Excel</span>
            </button>
          </div>
        </div>

        <ImportShopifyCsvModal
          isOpen={isShopifyCsvModalOpen}
          onClose={() => setIsShopifyCsvModalOpen(false)}
          onSuccess={(count, importedOrders) => {
            if (importedOrders && importedOrders.length > 0 && onUpdateOrder) {
              importedOrders.forEach(ord => onUpdateOrder(ord));
            }
            onRefreshOrders();
          }}
          existingOrderIds={orders.map(o => o.orderId)}
        />

        {/* Fulfillment Summary & Filter Pills Section */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          
          {/* Fulfillment Status Row */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Fulfillment Status
              </span>
              {fulfillmentFilter !== 'ALL' && (
                <button
                  onClick={() => setFulfillmentFilter('ALL')}
                  className="text-[10px] text-[#832f5e] font-bold hover:underline cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap">
              {['ALL', 'Pending', 'Packed', 'Fulfilled', 'Delivered'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFulfillmentFilter(f)}
                  className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                    fulfillmentFilter === f
                      ? 'bg-[#832f5e] text-white border-[#832f5e] shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.toUpperCase()} ({f === 'ALL' ? orders.length : (fulfillmentStats[f] || 0)})
                </button>
              ))}
            </div>
          </div>

          {/* Department & Design Workflow Row */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <Palette className="w-3 h-3 text-purple-600" />
                Department Workflow
              </span>
              {workflowFilter !== 'ALL' && (
                <button
                  onClick={() => setWorkflowFilter('ALL')}
                  className="text-[10px] text-[#832f5e] font-bold hover:underline cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap">
              <button
                onClick={() => setWorkflowFilter('ALL')}
                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  workflowFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ALL ORDERS ({orders.length})
              </button>
              
              <button
                onClick={() => setWorkflowFilter('CRE_REVIEW')}
                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  workflowFilter === 'CRE_REVIEW'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : creReviewCount > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 font-extrabold'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {creReviewCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                <span>AWAITING CRE REVIEW ({creReviewCount})</span>
              </button>

              <button
                onClick={() => setWorkflowFilter('DESIGN')}
                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  workflowFilter === 'DESIGN'
                    ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                IN DESIGN ({inDesignCount})
              </button>

              <button
                onClick={() => setWorkflowFilter('PRODUCTION')}
                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  workflowFilter === 'PRODUCTION'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                PRODUCTION ({inProductionCount})
              </button>
            </div>
          </div>

          {/* Telegram Status Row */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Telegram Dispatch Status
              </span>
              {statusFilter !== 'ALL' && (
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className="text-[10px] text-[#832f5e] font-bold hover:underline cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap">
              {(['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {st}
                </button>
              ))}
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
                          to={`/order/${encodeURIComponent(order.orderId)}`}
                          className="font-mono font-bold text-slate-900 text-xs hover:text-blue-600 hover:underline flex items-center gap-1 group"
                        >
                          <span>{order.orderId}</span>
                          <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {order.isProductionDeckOrder && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#832f5e]/10 text-[#832f5e] border border-[#832f5e]/20 font-mono shrink-0">
                            TV DECK
                          </span>
                        )}
                        {order.isDesignRequired && (() => {
                          const s = order.workflowStatus || 'DESIGN_PENDING';
                          const isCreReview = ['DESIGN_SUBMITTED', 'CRE_REVIEW_PENDING', 'SUBMITTED_TO_CRE'].includes(s);
                          const isRevision = s === 'DESIGN_REVISION_REQUESTED';
                          const isProdPending = s === 'PRODUCTION_PENDING';
                          const isProdActive = s === 'PRODUCTION_IN_PROGRESS';
                          const isProdDone = s === 'PRODUCTION_COMPLETED';

                          let badgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
                          let label = s.replace(/_/g, ' ');

                          if (isCreReview) {
                            badgeClass = 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse font-black';
                            label = 'AWAITING CRE REVIEW';
                          } else if (isRevision) {
                            badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                            label = 'REVISION REQUESTED';
                          } else if (isProdPending) {
                            badgeClass = 'bg-blue-50 text-blue-800 border-blue-200 font-bold';
                            label = 'CRE APPROVED • PROD QUEUED';
                          } else if (isProdActive) {
                            badgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200 font-bold';
                            label = 'IN PRODUCTION';
                          } else if (isProdDone) {
                            badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold';
                            label = 'PRODUCTION READY';
                          }

                          return (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] border font-mono shrink-0 flex items-center gap-1 ${badgeClass}`}>
                              <Palette className="w-2.5 h-2.5" />
                              <span>{label}</span>
                            </span>
                          );
                        })()}
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
                        onClick={() => setDesignOrderModalTarget(order)}
                        className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded-lg border cursor-pointer text-xs transition-colors ${
                          order.isDesignRequired
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200'
                        }`}
                        title={order.isDesignRequired ? `Design Workflow: ${order.workflowStatus || 'Active'}` : 'Forward order to Design Department'}
                      >
                        <Palette className="w-3.5 h-3.5" />
                        <span>{order.isDesignRequired ? 'In Design' : 'To Design'}</span>
                      </button>

                      <button
                        onClick={() => exportSingleOrderPDF(order)}
                        className="inline-flex items-center gap-1 text-[#832f5e] hover:text-[#6c234b] font-bold px-2 py-1 bg-[#832f5e]/10 hover:bg-[#832f5e]/20 rounded-lg border border-[#832f5e]/20 cursor-pointer"
                        title="Download Dispatch & Audit Slip PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF Slip</span>
                      </button>

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
                      placeholder="e.g. Saneej - Valanchery"
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
                      placeholder="e.g. Saneej"
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
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Order Received Date</label>
                      {editOrderReceivedDate && (
                        <button
                          type="button"
                          onClick={() => setEditOrderReceivedDate('')}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                        >
                          Clear Date
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={editOrderReceivedDate}
                      onChange={(e) => setEditOrderReceivedDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Dispatch Scheduled Date */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] font-bold text-amber-800 uppercase">Dispatch Scheduled Date (Due Date)</label>
                      {editDispatchScheduledDate && (
                        <button
                          type="button"
                          onClick={() => setEditDispatchScheduledDate('')}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                        >
                          Clear Date
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={editDispatchScheduledDate}
                      onChange={(e) => setEditDispatchScheduledDate(e.target.value)}
                      className="w-full bg-amber-50/50 border border-amber-300 focus:border-amber-600 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Despatch Date */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Despatch Date</label>
                      {editDispatchDate && (
                        <button
                          type="button"
                          onClick={() => setEditDispatchDate('')}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                        >
                          Clear Date
                        </button>
                      )}
                    </div>
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

                  {/* Production TV Deck Toggle */}
                  <div className="col-span-full pt-1">
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#832f5e]/5 border border-[#832f5e]/20 cursor-pointer font-bold text-slate-900 text-xs">
                      <input
                        type="checkbox"
                        checked={editIsProductionDeckOrder}
                        onChange={(e) => setEditIsProductionDeckOrder(e.target.checked)}
                        className="w-4 h-4 rounded text-[#832f5e] focus:ring-[#832f5e] cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-[#832f5e]">Display on Production TV Deck Schedule</span>
                        <span className="text-[10px] font-normal text-stone-500">Enable if this order requires workshop sub-assembly and live monitoring</span>
                      </div>
                    </label>
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

      {/* Send to Design Workflow Modal */}
      <SendToDesignModal
        isOpen={!!designOrderModalTarget}
        onClose={() => setDesignOrderModalTarget(null)}
        order={designOrderModalTarget}
        onSuccess={(updatedOrder) => {
          const target = updatedOrder || designOrderModalTarget;
          if (target && onUpdateOrder) {
            onUpdateOrder({
              ...target,
              isDesignRequired: true,
              workflowStatus: 'DESIGN_PENDING'
            });
          }
          setDesignOrderModalTarget(null);
          onRefreshOrders();
        }}
        currentStaffId={currentStaffId}
        currentStaffName={currentStaffName}
      />

    </div>
  );
};
