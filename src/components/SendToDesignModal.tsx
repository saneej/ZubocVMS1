import React, { useState } from 'react';
import { X, Send, Palette, Factory, AlertCircle, CheckCircle2, Upload, Paperclip, FileText, Trash2, Clock, Sparkles } from 'lucide-react';
import { OrderRecord, OrderAttachment, WorkflowPriority } from '../types';
import { safeFetchJson } from '../utils/api';

interface SendToDesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderRecord | null;
  onSuccess: (updatedOrder?: OrderRecord) => void;
  currentStaffId?: string;
  currentStaffName?: string;
}

export const SendToDesignModal: React.FC<SendToDesignModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
  currentStaffId = 'CRE-01',
  currentStaffName = 'CRE Specialist'
}) => {
  const [priority, setPriority] = useState<WorkflowPriority>('NORMAL');
  const [instructions, setInstructions] = useState('');
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingDesign, setIsSubmittingDesign] = useState(false);
  const [isSubmittingProd, setIsSubmittingProd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      formData.append('orderId', order.orderId);
      formData.append('category', 'CRE_REFERENCE');
      formData.append('staffId', currentStaffId);
      formData.append('staffName', currentStaffName);

      const res = await safeFetchJson('/api/workflow/upload', {
        method: 'POST',
        body: formData
      });

      if (res && res.success && Array.isArray(res.files)) {
        setAttachments(prev => [...prev, ...res.files]);
      }
    } catch (err: any) {
      console.error('File upload error:', err);
      setError(err?.message || 'Failed to upload attachments');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSendToDesign = async () => {
    if (!instructions.trim()) {
      setError('Please provide design instructions or specifications for the Design department.');
      return;
    }

    setIsSubmittingDesign(true);
    setError(null);

    try {
      const payload = {
        orderId: order.orderId,
        designInstructions: instructions.trim(),
        priority,
        creAttachments: attachments,
        staffId: currentStaffId,
        staffName: currentStaffName
      };

      const res = await safeFetchJson('/api/workflow/send-to-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        onSuccess(order);
        onClose();
      } else {
        throw new Error(res?.error || 'Failed to forward order to Design');
      }
    } catch (err: any) {
      console.error('Send to design error:', err);
      setError(err?.message || 'Failed to forward order to Design department');
    } finally {
      setIsSubmittingDesign(false);
    }
  };

  const handleSendDirectToProduction = async () => {
    setIsSubmittingProd(true);
    setError(null);

    try {
      const payload = {
        orderId: order.orderId,
        productionInstructions: instructions.trim() || 'Direct to production - no design required',
        priority,
        creAttachments: attachments,
        staffId: currentStaffId,
        staffName: currentStaffName
      };

      const res = await safeFetchJson('/api/workflow/send-to-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        onSuccess({
          ...order,
          isDesignRequired: false,
          workflowStatus: 'PRODUCTION_PENDING'
        });
        onClose();
      } else {
        throw new Error(res?.error || 'Failed to send order directly to production');
      }
    } catch (err: any) {
      console.error('Send to production error:', err);
      setError(err?.message || 'Failed to send order directly to production');
    } finally {
      setIsSubmittingProd(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-2xl w-full p-6 text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold shadow-xs">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">Forward Order Workflow</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  CRE Control
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Order <span className="font-mono font-bold text-slate-800">{order.orderId}</span> • {order.customerName || 'Customer'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {/* Priority Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Urgency & Priority *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkflowPriority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    priority === p
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions / Remarks */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Instructions & Client Specifications
            </label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter design instructions (required for design) or production notes (for direct to production)..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-2xl p-3 text-xs text-slate-900 focus:outline-none"
            />
          </div>

          {/* File Attachments */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Reference Drawings & Attachments (optional)
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Files</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.dwg,.dxf,.step,.ai,.psd,.zip"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {isUploading && (
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs text-indigo-700 flex items-center gap-2 mb-2 font-medium">
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Uploading reference files...</span>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 mb-2">
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{file.fileName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({Math.round(file.fileSize / 1024)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(file.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons: Send to Design vs Send Directly to Production */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingDesign || isSubmittingProd}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendDirectToProduction}
                disabled={isSubmittingDesign || isSubmittingProd || isUploading}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmittingProd ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Factory className="w-4 h-4" />
                    <span>Send Directly to Production</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSendToDesign}
                disabled={isSubmittingDesign || isSubmittingProd || isUploading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmittingDesign ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Forwarding...</span>
                  </>
                ) : (
                  <>
                    <Palette className="w-4 h-4" />
                    <span>Send to Design Dept</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
