import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OrderRecord } from '../types';
import { safeFetchJson } from '../utils/api';
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
  Camera,
  Video,
  Upload
} from 'lucide-react';
import { uploadQueueManager } from '../utils/uploadQueue';
import { StatusCell } from './StatusCell';

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
  
  const order = orders.find(o => o.orderId === orderId);
  const [activeLogTab, setActiveLogTab] = useState<'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG'>('EDIT_LOG');
  
  const isLoading = !order && orders.length === 0; // Only show loading if we don't have order AND orders not loaded
  const error = !order && orders.length > 0 ? 'Order not found' : null;

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order || !onUpdateOrder) return;
    const nowIso = new Date().toISOString();
    const newLogs = [...(order.auditLogs || [])];
    newLogs.push({
      timestamp: nowIso,
      staffId: currentStaffName,
      action: 'QUICK_STATUS_UPDATE',
      details: `Fulfillment status changed from "${order.fulfillmentStatus || 'Pending'}" to "${newStatus}" via Order Page`,
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

  const handleMarkAsPacked = async (mediaFile: File) => {
    if (!order || !onUpdateOrder) return;
    
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
      <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-4">
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
      
      {/* Breadcrumb / Nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to List</span>
        </button>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${
            order.uploadStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
            order.uploadStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' :
            'bg-amber-100 text-amber-800'
          }`}>
            Upload: {order.uploadStatus}
          </span>
        </div>
      </div>

      {/* Main Order Card Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#832f5e]"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 font-mono">{order.orderId}</h1>
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

            <div className="flex items-center gap-2">
                {((order.telegramMessageLink && order.telegramMessageLink.trim() !== '') || 
                  (order.videoUrl && order.videoUrl.trim() !== '') || 
                  (order.photoUrls && order.photoUrls.some(url => url.trim() !== '')) || 
                  (order.photoDataUrl && order.photoDataUrl.trim() !== '')) ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Evidence already in Telegram</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Shipment & Customer Info */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
            
            {/* Shipment Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-500" />
                    Shipment Information
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Courier Partner</span>
                      <span className="text-slate-900 font-bold text-sm">{order.courier || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">AWB Number</span>
                      <span className="text-blue-600 font-mono font-bold text-sm">{order.awbNumber || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Package Weight</span>
                      <span className="text-emerald-700 font-bold text-sm flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5" />
                        {order.weight || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Station & Staff</span>
                      <div className="text-right">
                        <div className="text-slate-900 font-bold text-sm">{order.stationId}</div>
                        <div className="text-slate-400 text-xs">{order.staffId}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-purple-500" />
                    Order Details
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Product SKU</span>
                      <span className="text-slate-900 font-bold text-sm">{order.productSku || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Item Quantity</span>
                      <span className="text-slate-900 font-bold text-sm">{order.itemCount || '1'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Order Total</span>
                      <span className="text-slate-900 font-bold text-sm">₹{order.orderTotal || order.orderAmount || '0.00'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-500" />
                    Customer Details
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Customer Name</span>
                      <span className="text-slate-900 font-bold text-sm">{order.customerName || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Contact Person</span>
                      <span className="text-slate-900 font-bold text-sm">{order.contactPerson || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Phone Number</span>
                      <span className="text-slate-900 font-bold text-sm">{order.contactPhone || '—'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    Timeline & Dates
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Order Received</span>
                      <span className="text-slate-900 font-bold text-sm">{order.orderReceivedDate || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Despatch Date</span>
                      <span className="text-slate-900 font-bold text-sm">{order.dispatchDate || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500 text-sm">Delivered Date</span>
                      <span className={`text-sm font-bold ${order.deliveredDate ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {order.deliveredDate || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes & Remarks Section */}
            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Chat-like Notes Section */}
              <div className="space-y-3 flex flex-col h-[400px]">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Internal Order Chat / Notes
                </h3>
                
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-4 overflow-y-auto space-y-4 font-sans text-sm custom-scrollbar">
                  {(!order.chatNotes || order.chatNotes.length === 0) && !order.notes ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-center px-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                        <FileText className="w-5 h-5" />
                      </div>
                      <p>No chat history yet. Start by adding a note below.</p>
                    </div>
                  ) : (
                    <>
                      {/* Legacy Note as first message if exists */}
                      {order.notes && (
                        <div className="flex flex-col items-start max-w-[85%]">
                          <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl rounded-tl-none shadow-xs text-slate-700 leading-relaxed italic">
                            {order.notes}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 px-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Initial Note</span>
                          </div>
                        </div>
                      )}

                      {/* Chat Notes */}
                      {order.chatNotes?.map((note) => (
                        <div 
                          key={note.id} 
                          className={`flex flex-col max-w-[85%] ${note.staffId === currentStaffId ? 'ml-auto items-end' : 'items-start'}`}
                        >
                          <div className={`px-4 py-2.5 rounded-2xl shadow-xs leading-relaxed ${
                            note.staffId === currentStaffId 
                              ? 'bg-blue-600 text-white rounded-tr-none' 
                              : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                          }`}>
                            {note.text}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 px-1">
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${
                              note.staffId === currentStaffId ? 'text-blue-500' : 'text-slate-400'
                            }`}>
                              {note.staffId}
                            </span>
                            <span className="text-slate-300 text-[10px]">•</span>
                            <span className="text-[10px] text-slate-400 font-medium">{formatIST(note.timestamp)}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Note Input */}
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
                      staffId: currentStaffId,
                      timestamp: new Date().toISOString()
                    };

                    const updatedNotes = [...(order.chatNotes || []), newNote];
                    const updatedOrder: any = {
                      ...order,
                      chatNotes: updatedNotes,
                      updatedAt: new Date().toISOString()
                    };

                    // Optimistic update
                    input.value = '';

                    try {
                      await onUpdateOrder?.(updatedOrder);
                      // Record log
                      const logs = [...(order.auditLogs || [])];
                      logs.push({
                        timestamp: newNote.timestamp,
                        staffId: currentStaffName,
                        action: 'ADD_CHAT_NOTE',
                        details: `Added new chat note: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
                        type: 'EDIT_LOG'
                      });
                      await onUpdateOrder?.({ ...updatedOrder, auditLogs: logs });
                    } catch (err) {
                      console.error('Failed to add note:', err);
                      alert('Failed to save note. Please try again.');
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="note-text"
                    autoComplete="off"
                    placeholder="Type a new note..."
                    className="flex-1 bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/10"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-sm shadow-blue-100 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  >
                    ADD
                  </button>
                </form>
              </div>

              <div className="space-y-3 flex flex-col">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  QC Remarks & Observations
                </h3>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 min-h-[80px] flex-1">
                  {order.remarks ? (
                    <p className="text-sm text-slate-800 leading-relaxed font-medium">"{order.remarks}"</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No QC remarks recorded.</p>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Audit Logs & System Info */}
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col h-full max-h-[600px]">
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
              {(!order.auditLogs || order.auditLogs.filter(l => l.type === activeLogTab).length === 0) ? (
                <div className="text-slate-400 text-center py-12 px-4 italic border-2 border-dashed border-slate-50 rounded-2xl">
                  No {activeLogTab.toLowerCase().replace('_', ' ')}s recorded for this order.
                </div>
              ) : (
                order.auditLogs
                  .filter(l => l.type === activeLogTab)
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((log, idx) => (
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
