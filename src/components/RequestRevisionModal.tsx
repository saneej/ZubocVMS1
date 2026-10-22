import React, { useState } from 'react';
import { X, RefreshCcw, AlertTriangle, AlertCircle, Paperclip, Upload, Trash2, FileText } from 'lucide-react';
import { OrderRecord, OrderAttachment, WorkflowStatus } from '../types';
import { safeFetchJson } from '../utils/api';

interface RequestRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderRecord | null;
  workflowStatus?: WorkflowStatus | string;
  currentRevisionNumber?: number;
  requesterRole: 'CRE' | 'PRODUCTION';
  onSuccess: () => void;
  currentStaffId?: string;
  currentStaffName?: string;
}

export const RequestRevisionModal: React.FC<RequestRevisionModalProps> = ({
  isOpen,
  onClose,
  order,
  workflowStatus,
  currentRevisionNumber = 1,
  requesterRole,
  onSuccess,
  currentStaffId = 'Reviewer-01',
  currentStaffName = 'Reviewer'
}) => {
  const [reason, setReason] = useState('');
  const [instructions, setInstructions] = useState('');
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const isProductionInProgress = workflowStatus === 'PRODUCTION_IN_PROGRESS';

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
      formData.append('category', 'REVISION_MARKUP');
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
      setError(err?.message || 'Failed to upload markup files');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for the revision request.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        orderId: order.orderId,
        requesterRole,
        requesterId: currentStaffId,
        requesterName: currentStaffName,
        reason: reason.trim(),
        instructions: instructions.trim(),
        attachments
      };

      const res = await safeFetchJson('/api/workflow/revision-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        onSuccess();
        onClose();
      } else {
        throw new Error(res?.error || 'Failed to submit revision request');
      }
    } catch (err: any) {
      console.error('Revision request error:', err);
      setError(err?.message || 'Failed to submit revision request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-xl w-full p-6 text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
              <RefreshCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">Request Design Revision</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                  {requesterRole} Request
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Order <span className="font-mono font-bold text-slate-800">{order.orderId}</span> • Current Revision #{currentRevisionNumber}
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

        {/* Warning banner if production is in progress */}
        {isProductionInProgress && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">Notice: Production is Already in Progress</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Submitting a revision request will notify the manufacturing team immediately. The previous active revision will be flagged to prevent manufacturing from outdated files.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Revision Reason / Problem Description <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Dimensions require 2mm adjustment or client changed foil color"
              className="w-full px-4 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Detailed Revision Instructions
            </label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Specific details on what needs to be changed in the drawing or CAD model..."
              className="w-full px-4 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Markups & Reference Files <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.dwg,.dxf,.step"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {attachments.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{file.fileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter(a => a.id !== file.id))}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4" />
                  <span>Submit Revision Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
