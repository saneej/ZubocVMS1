import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OrderRecord } from '../types';
import { formatIST } from '../utils/time';
import { 
  ArrowLeft, 
  Package, 
  Truck, 
  Scale, 
  Tag, 
  User, 
  Calendar, 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  History,
  Edit3,
  Zap,
  Video,
  Upload,
  Check,
  X,
  Save,
  AlertCircle,
  Download,
  Tv
} from 'lucide-react';
import { uploadQueueManager } from '../utils/uploadQueue';
import { StatusCell } from './StatusCell';
import { watermarkPhoto } from '../utils/watermark';
import { exportSingleOrderPDF } from '../utils/pdfExport';
import { safeFetchJson } from '../utils/api';

interface OrderDetailsPageProps {
  orders?: OrderRecord[];
  onUpdateOrder?: (updatedOrder: OrderRecord) => void;
  currentStaffId?: string;
  currentStaffName?: string;
}

export const OrderDetailsPage: React.FC<OrderDetailsPageProps> = ({ 
  orders = [],
  onUpdateOrder, 
  currentStaffId = 'Operator-ID',
  currentStaffName = 'Operator'
}) => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [fetchedOrder, setFetchedOrder] = useState<OrderRecord | null>(null);
  const [isApiLoading, setIsApiLoading] = useState<boolean>(true);
  
  // Robust order lookup: 1) props, 2) localStorage cache, 3) fetched order
  const order = React.useMemo(() => {
    if (!orderId) return null;
    let decodedId = orderId;
    try {
      decodedId = decodeURIComponent(orderId);
    } catch {}
    const rawClean = decodedId.trim().toLowerCase();
    const noHash = rawClean.replace(/^#/, '');

    const matchesId = (candidate?: string) => {
      if (!candidate) return false;
      const c = candidate.trim().toLowerCase();
      const cNoHash = c.replace(/^#/, '');
      return c === rawClean || cNoHash === noHash || c === noHash || cNoHash === rawClean;
    };
    
    // 1. Search in orders prop
    const foundInProps = orders.find(o => matchesId(o.orderId));
    if (foundInProps) return foundInProps;
    
    // 2. Search in fetchedOrder state
    if (fetchedOrder && matchesId(fetchedOrder.orderId)) {
      return fetchedOrder;
    }
    
    // 3. Search in localStorage cache
    try {
      const cached = localStorage.getItem('zuboc_orders_cache') || localStorage.getItem('zuboc_orders_store');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const cachedFound = parsed.find((o: OrderRecord) => matchesId(o.orderId));
          if (cachedFound) return cachedFound;
        }
      }
    } catch {}
    
    return null;
  }, [orders, orderId, fetchedOrder]);

  // If not found in memory/cache, fetch from server API
  useEffect(() => {
    let isMounted = true;
    if (orderId) {
      setIsApiLoading(true);
      const safeParam = encodeURIComponent(orderId.trim());
      
      // Try direct API fetch first
      fetch(`/api/orders/${safeParam}`)
        .then(async r => {
          if (r.ok) return r.json();
          return safeFetchJson(`/api/orders/${safeParam}`);
        })
        .then(res => {
          if (!isMounted) return;
          if (res && res.orderId) {
            setFetchedOrder(res);
          } else if (Array.isArray(res)) {
            const found = res.find((o: any) => o.orderId === orderId || o.orderId?.toLowerCase() === orderId.toLowerCase());
            if (found) setFetchedOrder(found);
          }
        })
        .catch(err => {
          console.warn('Failed to load order details:', err);
        })
        .finally(() => {
          if (isMounted) setIsApiLoading(false);
        });
    } else {
      setIsApiLoading(false);
    }
    return () => { isMounted = false; };
  }, [orderId]);

  const [activeLogTab, setActiveLogTab] = useState<'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG'>('EDIT_LOG');

  // Page-level Edit State
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editingSection, setEditingSection] = useState<'shipment' | 'order' | 'customer' | 'timeline' | null>(null);

  // Form State for editing
  const [formData, setFormData] = useState<Partial<OrderRecord>>({});
  
  // Dedicated Notes & Remarks State
  const [internalNoteInput, setInternalNoteInput] = useState('');
  const [isEditingInternalNote, setIsEditingInternalNote] = useState(false);
  const [qcRemarksInput, setQcRemarksInput] = useState('');
  const [isEditingQcRemarks, setIsEditingQcRemarks] = useState(false);

  // Success Feedback Toast
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const quickCouriers = ['Delhivery', 'Blue Dart', 'DTDC', 'Shiprocket', 'Ekart', 'Xpressbees', 'India Post'];

  // Sync Form Data when Order changes or when entering Edit mode
  useEffect(() => {
    if (order) {
      setFormData({
        courier: order.courier || '',
        awbNumber: order.awbNumber || '',
        weight: order.weight || '',
        stationId: order.stationId || '',
        staffId: order.staffId || '',
        deliveryMethod: order.deliveryMethod || 'Normal',
        productSku: order.productSku || '',
        itemCount: order.itemCount || '1',
        orderTotal: order.orderTotal || order.orderAmount || '',
        customerName: order.customerName || '',
        contactPerson: order.contactPerson || '',
        contactPhone: order.contactPhone || '',
        orderReceivedDate: order.orderReceivedDate || '',
        dispatchDate: order.dispatchDate || '',
        deliveredDate: order.deliveredDate || '',
        notes: order.notes || '',
        remarks: order.remarks || ''
      });
      setInternalNoteInput(order.notes || '');
      setQcRemarksInput(order.remarks || '');
    }
  }, [order]);

  const showSuccessFeedback = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 3500);
  };

  // Helper to save any updated fields
  const handleSaveFields = async (updatedFields: Partial<OrderRecord>, actionDescription: string) => {
    if (!order || !onUpdateOrder) return;
    setIsSaving(true);

    const nowIso = new Date().toISOString();
    const existingLogs = order.auditLogs || [];
    const newLog = {
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'EDIT_ORDER_DETAILS',
      details: actionDescription,
      type: 'EDIT_LOG' as const
    };

    const updatedOrder: OrderRecord = {
      ...order,
      ...updatedFields,
      auditLogs: [...existingLogs, newLog],
      updatedAt: nowIso
    };

    try {
      await onUpdateOrder(updatedOrder);
      setIsSaving(false);
      setIsEditingAll(false);
      setEditingSection(null);
      setIsEditingInternalNote(false);
      setIsEditingQcRemarks(false);
      showSuccessFeedback('Changes saved successfully to dashboard!');
    } catch (err) {
      setIsSaving(false);
      alert('Failed to save changes. Please try again.');
    }
  };

  // Handle saving full form
  const handleSaveFullForm = () => {
    handleSaveFields(formData, `Updated order details for ${order?.orderId || 'Order'}`);
  };

  // Handle saving internal note
  const handleSaveInternalNote = () => {
    const cleanNote = internalNoteInput.trim();
    handleSaveFields({ notes: cleanNote }, `Updated internal note to "${cleanNote.substring(0, 30)}${cleanNote.length > 30 ? '...' : ''}"`);
  };

  // Handle saving QC remarks
  const handleSaveQcRemarks = () => {
    const cleanRemarks = qcRemarksInput.trim();
    handleSaveFields({ remarks: cleanRemarks }, `Updated QC remarks to "${cleanRemarks.substring(0, 30)}${cleanRemarks.length > 30 ? '...' : ''}"`);
  };

  const isLoading = !order && isApiLoading;
  const error = !order && !isLoading ? 'Order not found' : null;

  const handleMarkAsPacked = async (mediaFile: File) => {
    if (!order || !onUpdateOrder) return;
    
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 font-mono">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p>Loading Order Details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-4 font-sans">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Order Not Found</h2>
        <p className="text-slate-500">{error || "The order you're looking for doesn't exist or was deleted."}</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>
      </div>
    );
  }

  const isSectionEditing = (section: 'shipment' | 'order' | 'customer' | 'timeline') => {
    return isEditingAll || editingSection === section;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      <input
        type="file"
        id="detail-media-upload"
        className="hidden"
        accept="image/*,video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleMarkAsPacked(file);
            e.target.value = '';
          }
        }}
      />
      
      {/* Save Success Banner */}
      {saveSuccessMsg && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 font-sans">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-xs font-extrabold tracking-wide">{saveSuccessMsg}</span>
        </div>
      )}

      {/* Breadcrumb / Nav Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to List</span>
        </button>

        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${
            order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
            order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
            'bg-amber-100 text-amber-800'
          }`}>
            Upload: {order.uploadStatus}
          </span>

          <button
            onClick={() => exportSingleOrderPDF(order)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            title="Download Dispatch & Packing Certificate PDF"
          >
            <Download className="w-4 h-4" />
            <span>PDF Slip</span>
          </button>

          {!isEditingAll ? (
            <button
              onClick={() => setIsEditingAll(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl font-bold text-xs shadow-md shadow-[#832f5e]/20 transition-all cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit All Fields</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsEditingAll(false);
                  setEditingSection(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleSaveFullForm}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save All Changes'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Order Card Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#832f5e]"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 font-mono">{order.orderId}</h1>
              {(() => {
                const src = (order.order_source || order.orderSource || 'website').toLowerCase();
                const isWeb = src === 'website';
                return (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    isWeb ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {isWeb ? '🌐 Website (Shopify)' : '📦 Amazon'}
                  </span>
                );
              })()}
              {order.deliveryMethod && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-black uppercase tracking-tight">
                  <Zap className="w-3 h-3" />
                  {order.deliveryMethod}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Created on {formatIST(order.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Fulfillment Status</label>
              <StatusCell order={order} onUpdate={onUpdateOrder} staffName={currentStaffName} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Deck Visibility</label>
              <button
                onClick={() => handleSaveFields({ isProductionDeckOrder: !order.isProductionDeckOrder }, `${!order.isProductionDeckOrder ? 'Enabled' : 'Disabled'} Production Deck listing`)}
                disabled={isSaving}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-[11px] uppercase tracking-tight transition-all border cursor-pointer ${
                  order.isProductionDeckOrder 
                    ? 'bg-purple-50 text-[#832f5e] border-purple-200 shadow-sm shadow-purple-100' 
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
              >
                <Tv className={`w-3.5 h-3.5 ${order.isProductionDeckOrder ? 'text-[#832f5e]' : 'text-slate-300'}`} />
                <span>{order.isProductionDeckOrder ? 'Listed in Production Deck' : 'List in Production Deck'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {((order.telegramMessageLink && order.telegramMessageLink.trim() !== '') || 
                (order.videoUrl && order.videoUrl.trim() !== '') || 
                (order.photoUrls && order.photoUrls.some((url: string) => url.trim() !== '')) || 
                (order.photoDataUrl && order.photoDataUrl.trim() !== '')) ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Evidence in Telegram</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/station')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-[#832f5e]/20 cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>RECORD (VIDEO)</span>
                  </button>
                  <button
                    onClick={() => document.getElementById('detail-media-upload')?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-emerald-200 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>UPLOAD (FILE)</span>
                  </button>
                </>
              )}
            </div>

            {order.telegramMessageLink && (
              <a
                href={order.telegramMessageLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-200 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>View on Telegram</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Details & Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Shipment, Order, Customer & Timeline Info */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Shipment Info & Order Details Column */}
              <div className="space-y-6">
                
                {/* 1. Shipment Information */}
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-500" />
                      Shipment Information
                    </h3>
                    {!isEditingAll && (
                      <button
                        onClick={() => setEditingSection(editingSection === 'shipment' ? null : 'shipment')}
                        className="text-[11px] font-bold text-[#832f5e] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {editingSection === 'shipment' ? <X className="w-3.5 h-3.5 text-slate-500" /> : <Edit3 className="w-3.5 h-3.5" />}
                        <span>{editingSection === 'shipment' ? 'Cancel' : 'Edit'}</span>
                      </button>
                    )}
                  </div>

                  {!isSectionEditing('shipment') ? (
                    <div className="space-y-3 text-sm font-sans">
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Courier Partner</span>
                        <span className="text-slate-900 font-bold text-xs">{order.courier || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">AWB Number</span>
                        <span className="text-blue-600 font-mono font-bold text-xs">{order.awbNumber || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Package Weight</span>
                        <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5" />
                          {order.weight || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Station & Staff</span>
                        <div className="text-right">
                          <div className="text-slate-900 font-bold text-xs">{order.stationId}</div>
                          <div className="text-slate-400 text-[10px]">{order.staffId}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Courier Partner</label>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {quickCouriers.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setFormData({ ...formData, courier: c })}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                formData.courier === c ? 'bg-[#832f5e] text-white border-[#832f5e]' : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={formData.courier || ''}
                          onChange={(e) => setFormData({ ...formData, courier: e.target.value })}
                          placeholder="Courier name..."
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">AWB / Tracking Number</label>
                        <input
                          type="text"
                          value={formData.awbNumber || ''}
                          onChange={(e) => setFormData({ ...formData, awbNumber: e.target.value })}
                          placeholder="AWB barcode..."
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Package Weight</label>
                        <input
                          type="text"
                          value={formData.weight || ''}
                          onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                          placeholder="e.g. 0.45 kg"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Station ID</label>
                          <input
                            type="text"
                            value={formData.stationId || ''}
                            onChange={(e) => setFormData({ ...formData, stationId: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Staff ID / Name</label>
                          <input
                            type="text"
                            value={formData.staffId || ''}
                            onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => handleSaveFields({
                            courier: formData.courier,
                            awbNumber: formData.awbNumber,
                            weight: formData.weight,
                            stationId: formData.stationId,
                            staffId: formData.staffId
                          }, 'Updated shipment information')}
                          disabled={isSaving}
                          className="px-3.5 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Shipment Info</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Order Details */}
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Tag className="w-4 h-4 text-purple-500" />
                      Order Details
                    </h3>
                    {!isEditingAll && (
                      <button
                        onClick={() => setEditingSection(editingSection === 'order' ? null : 'order')}
                        className="text-[11px] font-bold text-[#832f5e] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {editingSection === 'order' ? <X className="w-3.5 h-3.5 text-slate-500" /> : <Edit3 className="w-3.5 h-3.5" />}
                        <span>{editingSection === 'order' ? 'Cancel' : 'Edit'}</span>
                      </button>
                    )}
                  </div>

                  {!isSectionEditing('order') ? (
                    <div className="space-y-3 text-sm font-sans">
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Product SKU</span>
                        <span className="text-slate-900 font-bold text-xs">{order.productSku || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Item Quantity</span>
                        <span className="text-slate-900 font-bold text-xs">{order.itemCount || '1'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Order Total</span>
                        <span className="text-slate-900 font-bold text-xs">₹{order.orderTotal || order.orderAmount || '0.00'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Product SKU</label>
                        <input
                          type="text"
                          value={formData.productSku || ''}
                          onChange={(e) => setFormData({ ...formData, productSku: e.target.value })}
                          placeholder="e.g. ZB-TEE-L"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Item Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={formData.itemCount || '1'}
                            onChange={(e) => setFormData({ ...formData, itemCount: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Order Total (₹)</label>
                          <input
                            type="text"
                            value={formData.orderTotal || ''}
                            onChange={(e) => setFormData({ ...formData, orderTotal: e.target.value })}
                            placeholder="568.00"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => handleSaveFields({
                            productSku: formData.productSku,
                            itemCount: formData.itemCount,
                            orderTotal: formData.orderTotal
                          }, 'Updated product SKU and item totals')}
                          disabled={isSaving}
                          className="px-3.5 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Order Details</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Customer Details & Timeline Column */}
              <div className="space-y-6">
                
                {/* 3. Customer Details */}
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <User className="w-4 h-4 text-emerald-500" />
                      Customer Details
                    </h3>
                    {!isEditingAll && (
                      <button
                        onClick={() => setEditingSection(editingSection === 'customer' ? null : 'customer')}
                        className="text-[11px] font-bold text-[#832f5e] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {editingSection === 'customer' ? <X className="w-3.5 h-3.5 text-slate-500" /> : <Edit3 className="w-3.5 h-3.5" />}
                        <span>{editingSection === 'customer' ? 'Cancel' : 'Edit'}</span>
                      </button>
                    )}
                  </div>

                  {!isSectionEditing('customer') ? (
                    <div className="space-y-3 text-sm font-sans">
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Customer Name</span>
                        <span className="text-slate-900 font-bold text-xs">{order.customerName || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Contact Person</span>
                        <span className="text-slate-900 font-bold text-xs">{order.contactPerson || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Phone Number</span>
                        <span className="text-slate-900 font-bold text-xs">{order.contactPhone || '—'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Customer Name / City</label>
                        <input
                          type="text"
                          value={formData.customerName || ''}
                          onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                          placeholder="e.g. Saneej - Valanchery"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Contact Person Name</label>
                        <input
                          type="text"
                          value={formData.contactPerson || ''}
                          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                          placeholder="e.g. Saneej"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Phone Number</label>
                        <input
                          type="text"
                          value={formData.contactPhone || ''}
                          onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                          placeholder="e.g. +91 9876543210"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => handleSaveFields({
                            customerName: formData.customerName,
                            contactPerson: formData.contactPerson,
                            contactPhone: formData.contactPhone
                          }, 'Updated customer contact details')}
                          disabled={isSaving}
                          className="px-3.5 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Customer Details</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shipping Address Details Card */}
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Truck className="w-4 h-4 text-indigo-500" />
                      Shipping Address
                    </h3>
                  </div>
                  <div className="space-y-2 text-xs font-sans text-slate-700">
                    {order.email && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Email</span>
                        <span className="font-medium text-slate-900">{order.email}</span>
                      </div>
                    )}
                    {order.shippingName && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Recipient Name</span>
                        <span className="font-bold text-slate-900">{order.shippingName}</span>
                      </div>
                    )}
                    <div className="py-1 border-b border-slate-100 space-y-0.5">
                      <span className="text-slate-500 block">Full Address</span>
                      <p className="font-medium text-slate-900 leading-relaxed">
                        {[
                          order.shippingStreet || order.shippingAddress1,
                          order.shippingAddress2,
                          order.shippingCity,
                          order.shippingProvince,
                          order.shippingZip,
                          order.shippingCountry
                        ].filter(Boolean).join(', ') || order.notes || '—'}
                      </p>
                    </div>
                    {order.shippingPhone && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Phone</span>
                        <span className="font-mono font-bold text-slate-900">{order.shippingPhone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Timeline & Dates */}
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-500" />
                      Timeline & Dates
                    </h3>
                    {!isEditingAll && (
                      <button
                        onClick={() => setEditingSection(editingSection === 'timeline' ? null : 'timeline')}
                        className="text-[11px] font-bold text-[#832f5e] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {editingSection === 'timeline' ? <X className="w-3.5 h-3.5 text-slate-500" /> : <Edit3 className="w-3.5 h-3.5" />}
                        <span>{editingSection === 'timeline' ? 'Cancel' : 'Edit'}</span>
                      </button>
                    )}
                  </div>

                  {!isSectionEditing('timeline') ? (
                    <div className="space-y-3 text-sm font-sans">
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Order Received</span>
                        <span className="text-slate-900 font-bold text-xs">{order.orderReceivedDate || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Despatch Date</span>
                        <span className="text-slate-900 font-bold text-xs">{order.dispatchDate || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Delivered Date</span>
                        <span className={`text-xs font-bold ${order.deliveredDate ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {order.deliveredDate || 'Pending'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Order Received Date</label>
                        <input
                          type="date"
                          value={formData.orderReceivedDate || ''}
                          onChange={(e) => setFormData({ ...formData, orderReceivedDate: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Despatch Date</label>
                        <input
                          type="date"
                          value={formData.dispatchDate || ''}
                          onChange={(e) => setFormData({ ...formData, dispatchDate: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Delivered Date</label>
                        <input
                          type="date"
                          value={formData.deliveredDate || ''}
                          onChange={(e) => setFormData({ ...formData, deliveredDate: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                        />
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => handleSaveFields({
                            orderReceivedDate: formData.orderReceivedDate,
                            dispatchDate: formData.dispatchDate,
                            deliveredDate: formData.deliveredDate
                          }, 'Updated order timeline dates')}
                          disabled={isSaving}
                          className="px-3.5 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Timeline Dates</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* 5 & 6. Internal Order Notes & QC Remarks Section */}
            <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Internal Notes & Chat Section */}
              <div className="space-y-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Internal Order Notes
                  </h3>
                  {!isEditingInternalNote ? (
                    <button
                      onClick={() => setIsEditingInternalNote(true)}
                      className="text-[11px] font-bold text-[#832f5e] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Main Note</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditingInternalNote(false)}
                      className="text-[11px] font-bold text-slate-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>

                {/* Main Internal Note Box */}
                {!isEditingInternalNote ? (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
                    {order.notes ? (
                      <p className="text-xs text-slate-800 leading-relaxed font-medium font-sans">
                        {order.notes}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic font-sans">
                        No primary internal note set. Click "Edit Main Note" to add special handling instructions.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3 space-y-2">
                    <textarea
                      rows={3}
                      value={internalNoteInput}
                      onChange={(e) => setInternalNoteInput(e.target.value)}
                      placeholder="Enter main internal notes or special package handling instructions..."
                      className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingInternalNote(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveInternalNote}
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Internal Note</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Chat Notes Stream */}
                <div className="space-y-2 flex-1 flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Chat & Discussion Feed
                  </span>
                  
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-3.5 max-h-[280px] overflow-y-auto space-y-3 font-sans text-xs custom-scrollbar">
                    {(!order.chatNotes || order.chatNotes.length === 0) ? (
                      <div className="h-28 flex flex-col items-center justify-center text-slate-400 italic text-center px-4">
                        <p className="text-xs">No chat notes posted yet.</p>
                      </div>
                    ) : (
                      order.chatNotes?.map((note: any) => (
                        <div 
                          key={note.id} 
                          className={`flex flex-col max-w-[90%] ${note.staffId === currentStaffId ? 'ml-auto items-end' : 'items-start'}`}
                        >
                          <div className={`px-3.5 py-2 rounded-2xl shadow-2xs leading-relaxed ${
                            note.staffId === currentStaffId 
                              ? 'bg-[#832f5e] text-white rounded-tr-none' 
                              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                          }`}>
                            {note.text}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 px-1 text-[9px]">
                            <span className={`font-bold uppercase ${note.staffId === currentStaffId ? 'text-[#832f5e]' : 'text-slate-400'}`}>
                              {note.staffId}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400">{formatIST(note.timestamp)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Chat Note Form */}
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const input = form.elements.namedItem('note-text') as HTMLInputElement;
                      const text = input.value.trim();
                      if (!text) return;

                      const newNote = {
                        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        text,
                        staffId: currentStaffName || currentStaffId,
                        timestamp: new Date().toISOString()
                      };

                      const updatedNotes = [...(order.chatNotes || []), newNote];
                      input.value = '';

                      handleSaveFields({ chatNotes: updatedNotes }, `Added chat note: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
                    }}
                    className="flex gap-2 pt-1"
                  >
                    <input
                      name="note-text"
                      autoComplete="off"
                      placeholder="Type a quick discussion message..."
                      className="flex-1 bg-white border border-slate-200 focus:border-[#832f5e] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-2xs transition-all cursor-pointer flex items-center justify-center shrink-0"
                    >
                      ADD
                    </button>
                  </form>
                </div>

              </div>

              {/* QC Remarks Section */}
              <div className="space-y-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    QC Remarks & Observations
                  </h3>
                  {!isEditingQcRemarks ? (
                    <button
                      onClick={() => setIsEditingQcRemarks(true)}
                      className="text-[11px] font-bold text-[#832f5e] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit QC Remarks</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditingQcRemarks(false)}
                      className="text-[11px] font-bold text-slate-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>

                {!isEditingQcRemarks ? (
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 min-h-[100px] flex-1">
                    {order.remarks ? (
                      <p className="text-xs text-slate-800 leading-relaxed font-medium">"{order.remarks}"</p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No QC remarks recorded. Click "Edit QC Remarks" to record quality check observations.</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3 space-y-2 flex-1 flex flex-col">
                    <textarea
                      rows={4}
                      value={qcRemarksInput}
                      onChange={(e) => setQcRemarksInput(e.target.value)}
                      placeholder="Record quality check pass observations or issues..."
                      className="w-full flex-1 bg-white border border-slate-300 focus:border-emerald-600 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setIsEditingQcRemarks(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveQcRemarks}
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save QC Remarks</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>

        {/* Right Column: Audit Logs & System Info */}
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col h-full min-h-[500px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <History className="w-4 h-4 text-blue-600" />
                <span>Audit Trail</span>
              </div>
              
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-[9px] font-mono">
                {(['EDIT_LOG', 'CHANGE_LOG', 'USER_LOG'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveLogTab(tab)}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                      activeLogTab === tab
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.split('_')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 font-mono text-[11px] custom-scrollbar">
              {(!order.auditLogs || order.auditLogs.filter((l: any) => l.type === activeLogTab).length === 0) ? (
                <div className="text-slate-400 text-center py-12 px-4 italic border-2 border-dashed border-slate-50 rounded-2xl">
                  No {activeLogTab.toLowerCase().replace('_', ' ')}s recorded for this order.
                </div>
              ) : (
                order.auditLogs
                  .filter((l: any) => l.type === activeLogTab)
                  .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((log: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5 transition-all hover:border-blue-200">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                        <span className="text-blue-600">{log.staffId}</span>
                        <span>{formatIST(log.timestamp)}</span>
                      </div>
                      <div className="text-slate-800 font-bold leading-tight uppercase tracking-tighter text-[10px]">
                        {log.action}
                      </div>
                      <div className="text-slate-600 text-[10px] leading-normal font-sans">
                        {log.details}
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => navigate('/admin')}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ADMIN VIEW
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
