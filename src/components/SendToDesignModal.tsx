import React, { useState } from 'react';
import { X, Send, Palette, AlertCircle, CheckCircle2, Upload, Paperclip, FileText, Trash2, Clock, Sparkles } from 'lucide-react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructions.trim()) {
      setError('Please provide design instructions or specifications for the Design department.');
      return;
    }

    setIsSubmitting(true);
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
      setIsSubmitting(false);
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
                <h2 className="text-lg font-black text-slate-900">Forward to Design Department</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  CRE Workflow
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
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          
          {/* Priority Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Design Urgency & Priority <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkflowPriority[]).map((p) => {
                const isSelected = priority === p;
                const colors = {
                  LOW: isSelected ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200',
                  NORMAL: isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200',
                  HIGH: isSelected ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200',
                  URGENT: isSelected ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                };
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${colors[p]}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Design Instructions */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Design Instructions & Client Specifications <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Custom gold foil stamp with client initials 'R&A'. Dimensions 50x50mm on burgundy box cover. Vector curve provided in reference..."
              className="w-full px-4 py-3 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium leading-relaxed"
            />
          </div>

          {/* Attachments Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Drawings & Reference Attachments <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
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

            {attachments.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
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
            ) : (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                Support for PDF, CAD (DWG, DXF, STEP), JPG, PNG, AI, PSD, and ZIP specs.
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Forwarding...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send to Design Department</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
