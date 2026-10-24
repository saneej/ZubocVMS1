import React, { useState, useEffect } from 'react';
import { 
  Factory, 
  Search, 
  CheckCircle2, 
  Play, 
  Download, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Paperclip, 
  Upload, 
  RefreshCw, 
  User, 
  ShieldCheck, 
  ChevronRight, 
  X, 
  FileCode,
  Tag,
  AlertCircle,
  Package,
  Layers,
  Send
} from 'lucide-react';
import { StaffMember, DepartmentWorkflow, OrderAttachment } from '../types';
import { safeFetchJson } from '../utils/api';
import { formatIST } from '../utils/time';
import { RequestRevisionModal } from './RequestRevisionModal';

interface ProductionWorkflowDashboardProps {
  currentStaff: StaffMember;
  onOpenOrderDetails?: (orderId: string) => void;
  onNavigateToCRE?: () => void;
}

export const ProductionWorkflowDashboard: React.FC<ProductionWorkflowDashboardProps> = ({
  currentStaff,
  onOpenOrderDetails,
  onNavigateToCRE
}) => {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('PENDING');
  const [ordersWithWorkflow, setOrdersWithWorkflow] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected order for manufacturing drawer
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [productionRemarks, setProductionRemarks] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<OrderAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchWorkflowOrders = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson('/api/workflow/orders');
      if (Array.isArray(data)) {
        setOrdersWithWorkflow(data);
      }
    } catch (err: any) {
      console.error('Error fetching production orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflowOrders();
    const interval = setInterval(fetchWorkflowOrders, 8000);
    return () => clearInterval(interval);
  }, []);

  // Filter queues
  const pendingOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    return wf?.isDesignRequired && wf?.workflowStatus === 'PRODUCTION_PENDING';
  });

  const inProgressOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    return wf?.isDesignRequired && ['PRODUCTION_IN_PROGRESS', 'PRODUCTION_REVISION_REQUESTED'].includes(wf?.workflowStatus || '');
  });

  const completedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    return wf?.isDesignRequired && wf?.workflowStatus === 'PRODUCTION_COMPLETED';
  });

  const handleStartManufacturing = async (orderItem: any) => {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/production-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderItem.orderId,
          staffId: currentStaff.id,
          staffName: currentStaff.name,
          action: 'START'
        })
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: `Manufacturing started for Order ${orderItem.orderId}` });
        await fetchWorkflowOrders();
        setActiveTab('IN_PROGRESS');
        setSelectedOrder(orderItem);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to start manufacturing' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteProduction = async (orderItem: any) => {
    if (!window.confirm(`Mark manufacturing as completed for Order ${orderItem.orderId}? This will notify CRE and make the order ready for packing and dispatch.`)) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/production-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderItem.orderId,
          staffId: currentStaff.id,
          staffName: currentStaff.name,
          action: 'COMPLETE',
          remarks: productionRemarks,
          evidenceFiles
        })
      });

      if (res && res.success) {
        setFeedback({ 
          type: 'success', 
          message: `Production completed! Order ${orderItem.orderId} returned to CRE workflow for packing and dispatch.` 
        });
        await fetchWorkflowOrders();
        setSelectedOrder(null);
        setActiveTab('COMPLETED');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to complete production' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedOrder) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      formData.append('orderId', selectedOrder.orderId);
      formData.append('category', 'PRODUCTION_EVIDENCE');
      formData.append('staffId', currentStaff.id);
      formData.append('staffName', currentStaff.name);

      const res = await safeFetchJson('/api/workflow/upload', {
        method: 'POST',
        body: formData
      });

      if (res && res.success && Array.isArray(res.files)) {
        setEvidenceFiles(prev => [...prev, ...res.files]);
        setFeedback({ type: 'success', message: `${res.files.length} production evidence file(s) attached.` });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Upload failed' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const currentList = activeTab === 'PENDING' 
    ? pendingOrders 
    : activeTab === 'IN_PROGRESS' 
      ? inProgressOrders 
      : completedOrders;

  const filteredItems = currentList.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    return !q || 
      item.orderId?.toLowerCase().includes(q) ||
      item.customerName?.toLowerCase().includes(q) ||
      item.productSku?.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-stone-900 to-amber-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-stone-900/10 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-200 border border-amber-400/30">
                Manufacturing Floor
              </span>
              <span className="text-xs text-stone-300 font-mono">
                Staff: {currentStaff.name} ({currentStaff.role})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Production & Manufacturing Control</h1>
            <p className="text-xs text-stone-300/80 max-w-xl font-medium">
              Review approved design blueprints, download manufacturing files, track production timestamps, and complete custom builds for CRE packing.
            </p>
          </div>

          <button
            onClick={fetchWorkflowOrders}
            className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer border border-white/10 self-start md:self-auto"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-300">Awaiting Production</div>
            <div className="text-2xl font-black mt-0.5 text-amber-300">{pendingOrders.length}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Submitted by Designers</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-300">In Manufacturing</div>
            <div className="text-2xl font-black mt-0.5 text-blue-300">{inProgressOrders.length}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Active on Floor</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-300">Completed Builds</div>
            <div className="text-2xl font-black mt-0.5 text-emerald-300">{completedOrders.length}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Sent to CRE Packing</div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200 animate-shake'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700">
            &times;
          </button>
        </div>
      )}

      {/* Tabs and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => { setActiveTab('PENDING'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'PENDING'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Awaiting Production</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'PENDING' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {pendingOrders.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('IN_PROGRESS'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'IN_PROGRESS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>In Manufacturing</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'IN_PROGRESS' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {inProgressOrders.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('COMPLETED'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Completed</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'COMPLETED' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {completedOrders.length}
            </span>
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Order ID, Client..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
      </div>

      {/* Grid: Order Cards & Production Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Orders Cards List */}
        <div className={`${selectedOrder ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4`}>
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Factory className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800">No Orders in this Production Stage</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Orders submitted by Designers ready for manufacturing will appear here.
              </p>
            </div>
          ) : (
            filteredItems.map(item => {
              const wf = item.workflow as DepartmentWorkflow | undefined;
              const isSelected = selectedOrder?.orderId === item.orderId;
              const activeFiles = wf?.activeDesignFiles || [];

              return (
                <div
                  key={item.orderId}
                  className={`bg-white rounded-3xl p-5 border transition-all duration-200 shadow-xs hover:shadow-md ${
                    isSelected 
                      ? 'border-amber-500 ring-2 ring-amber-500/10' 
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-900 text-sm">
                          {item.orderId}
                        </span>
                        {/* Clear Active Revision Identification */}
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Active Rev #{wf?.currentRevisionNumber || 1}</span>
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-700">
                        {item.customerName || 'Direct Client'} • <span className="text-slate-500 font-normal">{item.productSku || 'Custom Product'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {activeTab === 'PENDING' && (
                        <button
                          onClick={() => handleStartManufacturing(item)}
                          disabled={isSubmitting}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-amber-600/20 transition-all cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Production</span>
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedOrder(item)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          isSelected 
                            ? 'bg-amber-600 text-white' 
                            : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800'
                        }`}
                      >
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Design specifications summary */}
                  {wf?.designInstructions && (
                    <div className="mt-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <span className="font-black text-slate-900 block text-[10px] uppercase tracking-wider mb-0.5">
                        Design Instructions & Notes:
                      </span>
                      <p className="line-clamp-2 leading-relaxed">{wf.designInstructions}</p>
                    </div>
                  )}

                  {/* Active Design Files Direct Download Row */}
                  {activeFiles.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">
                        Files:
                      </span>
                      {activeFiles.map((f: OrderAttachment, idx: number) => (
                        <a
                          key={f.id || idx}
                          href={f.fileUrl}
                          download={f.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-xs font-bold border border-slate-200 hover:border-emerald-200 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 text-emerald-600" />
                          <span className="truncate max-w-[150px]">{f.fileName}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Meta Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Submitted {formatIST(wf?.designSubmittedAt || item.createdAt)}
                      </span>
                      {wf?.assignedDesignerName && (
                        <span className="flex items-center gap-1 text-slate-600 font-medium">
                          <User className="w-3 h-3 text-indigo-500" />
                          Designer: {wf.assignedDesignerName}
                        </span>
                      )}
                    </div>

                    {wf?.productionStartedAt && (
                      <span className="text-blue-600 font-bold">
                        Started {formatIST(wf.productionStartedAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Manufacturing Workspace & Actions */}
        {selectedOrder && (
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 border border-amber-300 shadow-xl space-y-5 sticky top-6">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-amber-700 text-base">
                    {selectedOrder.orderId}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Approved Rev #{selectedOrder.workflow?.currentRevisionNumber || 1}</span>
                  </span>
                </div>
                <h3 className="text-sm font-black text-slate-900 mt-1">Production Tracking & QC Controls</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedOrder.customerName} • Designer: {selectedOrder.workflow?.assignedDesignerName || 'Assigned'}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Approved Design Files Download Box */}
            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Approved Blueprint Files (Active Revision #{selectedOrder.workflow?.currentRevisionNumber || 1})</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-700 font-mono">DO NOT USE OUTDATED FILES</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(selectedOrder.workflow?.activeDesignFiles || []).map((file: OrderAttachment, idx: number) => (
                  <div key={file.id || idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-emerald-100 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <FileCode className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-slate-900 truncate">{file.fileName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({file.fileType})</span>
                    </div>
                    <a
                      href={file.fileUrl}
                      download={file.fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download Blueprint</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Production Remarks */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Production Floor Remarks & QC Checknotes
              </label>
              <textarea
                rows={3}
                value={productionRemarks}
                onChange={(e) => setProductionRemarks(e.target.value)}
                placeholder="Log material lot numbers, machine calibration, operator initials, or finish notes..."
                className="w-full px-4 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium"
              />
            </div>

            {/* Upload Production Evidence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Production Evidence / Inspection Photos <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach Photo</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleEvidenceUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              </div>

              {evidenceFiles.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {evidenceFiles.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <Paperclip className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{f.fileName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">({Math.round(f.fileSize / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Problem Reporting & Completion Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Report Design Issue</span>
              </button>

              <div className="w-full sm:w-auto flex items-center gap-2">
                {selectedOrder.workflow?.workflowStatus !== 'PRODUCTION_COMPLETED' ? (
                  <button
                    type="button"
                    onClick={() => handleCompleteProduction(selectedOrder)}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete & Send to Packing</span>
                  </button>
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-black flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Manufacturing Completed</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Revision Modal triggered by Production */}
      {selectedOrder && (
        <RequestRevisionModal
          isOpen={isRevisionModalOpen}
          onClose={() => setIsRevisionModalOpen(false)}
          order={selectedOrder}
          workflowStatus={selectedOrder.workflow?.workflowStatus}
          currentRevisionNumber={selectedOrder.workflow?.currentRevisionNumber || 1}
          requesterRole="PRODUCTION"
          currentStaffId={currentStaff.id}
          currentStaffName={currentStaff.name}
          onSuccess={() => {
            fetchWorkflowOrders();
            setSelectedOrder(null);
            setFeedback({ type: 'success', message: 'Design clarification routed to Designer & CRE notified.' });
          }}
        />
      )}
    </div>
  );
};
