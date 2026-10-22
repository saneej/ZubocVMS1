import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Download, 
  Upload, 
  Paperclip, 
  Send, 
  RefreshCw, 
  Save, 
  History, 
  UserCheck, 
  Eye, 
  Layers, 
  ArrowRight, 
  Sparkles,
  HelpCircle,
  FileCode,
  Tag,
  ChevronRight,
  ExternalLink,
  X
} from 'lucide-react';
import { OrderRecord, StaffMember, DepartmentWorkflow, OrderAttachment, DesignRevision, WorkflowPriority } from '../types';
import { safeFetchJson } from '../utils/api';
import { formatIST } from '../utils/time';

interface DesignerDashboardProps {
  currentStaff: StaffMember;
  onOpenOrderDetails?: (orderId: string) => void;
}

export const DesignerDashboard: React.FC<DesignerDashboardProps> = ({
  currentStaff,
  onOpenOrderDetails
}) => {
  const [activeTab, setActiveTab] = useState<'UNASSIGNED' | 'MY_ORDERS' | 'SUBMITTED'>('UNASSIGNED');
  const [ordersWithWorkflow, setOrdersWithWorkflow] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  
  // Active selected order for designer workspace drawer
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [designNotes, setDesignNotes] = useState('');
  const [designFiles, setDesignFiles] = useState<OrderAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchWorkflowOrders = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson('/api/workflow/orders');
      if (Array.isArray(data)) {
        setOrdersWithWorkflow(data);
      }
    } catch (err: any) {
      console.error('Error fetching designer orders:', err);
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
  const unassignedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    return wf?.isDesignRequired && wf?.workflowStatus === 'DESIGN_PENDING' && !wf?.assignedDesignerId;
  });

  const myAssignedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    if (!wf?.isDesignRequired) return false;
    const isMine = wf?.assignedDesignerId === currentStaff.id || currentStaff.role === 'ADMIN';
    return isMine && ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_REVISION_REQUESTED'].includes(wf?.workflowStatus || '');
  });

  const submittedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    if (!wf?.isDesignRequired) return false;
    const isMine = wf?.assignedDesignerId === currentStaff.id || currentStaff.role === 'ADMIN';
    return isMine && ['DESIGN_SUBMITTED', 'PRODUCTION_PENDING', 'PRODUCTION_IN_PROGRESS', 'PRODUCTION_COMPLETED'].includes(wf?.workflowStatus || '');
  });

  // Concurrency-Safe Order Acceptance
  const handleAcceptOrder = async (orderItem: any) => {
    setAcceptingOrderId(orderItem.orderId);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/accept-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderItem.orderId,
          designerId: currentStaff.id,
          designerName: currentStaff.name
        })
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: res.message || `Order ${orderItem.orderId} assigned to you!` });
        await fetchWorkflowOrders();
        // Automatically switch to my orders tab and open workspace
        setActiveTab('MY_ORDERS');
        openWorkspace(orderItem);
      } else {
        throw new Error(res?.error || 'Failed to accept order.');
      }
    } catch (err: any) {
      console.error('Accept order error:', err);
      setFeedback({ 
        type: 'error', 
        message: err?.message || 'This order has already been assigned to another Designer.' 
      });
      // Refresh to update unassigned list
      fetchWorkflowOrders();
    } finally {
      setAcceptingOrderId(null);
    }
  };

  const openWorkspace = (orderItem: any) => {
    setSelectedOrder(orderItem);
    const wf = orderItem.workflow as DepartmentWorkflow | undefined;
    setDesignNotes(wf?.designInstructions || '');
    setDesignFiles(wf?.activeDesignFiles || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedOrder) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      formData.append('orderId', selectedOrder.orderId);
      formData.append('category', 'DESIGN_FILE');
      formData.append('staffId', currentStaff.id);
      formData.append('staffName', currentStaff.name);

      const res = await safeFetchJson('/api/workflow/upload', {
        method: 'POST',
        body: formData
      });

      if (res && res.success && Array.isArray(res.files)) {
        setDesignFiles(prev => [...prev, ...res.files]);
        setFeedback({ type: 'success', message: `${res.files.length} design file(s) uploaded.` });
      }
    } catch (err: any) {
      console.error('Upload design files error:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to upload design files' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          designerId: currentStaff.id,
          designerName: currentStaff.name,
          designNotes,
          files: designFiles
        })
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: 'Work in progress saved successfully!' });
        fetchWorkflowOrders();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save draft' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitToProduction = async () => {
    if (!selectedOrder) return;
    if (designFiles.length === 0) {
      setFeedback({ type: 'error', message: 'Please upload at least one final design file before submitting to Production.' });
      return;
    }

    if (!window.confirm(`Submit completed design with ${designFiles.length} file(s) to the Production department?`)) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/design-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          designerId: currentStaff.id,
          designerName: currentStaff.name,
          designNotes,
          files: designFiles
        })
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: res.message || 'Design successfully submitted to Production!' });
        await fetchWorkflowOrders();
        setSelectedOrder(null);
        setActiveTab('SUBMITTED');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to submit design to Production' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter current active list
  const currentList = activeTab === 'UNASSIGNED' 
    ? unassignedOrders 
    : activeTab === 'MY_ORDERS' 
      ? myAssignedOrders 
      : submittedOrders;

  const filteredItems = currentList.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const matchesSearch = !q || 
      item.orderId?.toLowerCase().includes(q) ||
      item.customerName?.toLowerCase().includes(q) ||
      item.productSku?.toLowerCase().includes(q) ||
      wf?.designInstructions?.toLowerCase().includes(q);

    const matchesPriority = priorityFilter === 'ALL' || wf?.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">Urgent</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">High</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">Low</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">Normal</span>;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'DESIGN_PENDING':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-amber-50 text-amber-700 border border-amber-200">Awaiting Acceptance</span>;
      case 'DESIGN_ASSIGNED':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-blue-50 text-blue-700 border border-blue-200">Assigned</span>;
      case 'DESIGN_IN_PROGRESS':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-purple-50 text-purple-700 border border-purple-200">In Progress</span>;
      case 'DESIGN_REVISION_REQUESTED':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">Revision Requested</span>;
      case 'DESIGN_SUBMITTED':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-emerald-50 text-emerald-700 border border-emerald-200">Submitted to Prod</span>;
      default:
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-slate-100 text-slate-700">{status || 'Created'}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-900/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                Design Studio Portal
              </span>
              <span className="text-xs text-indigo-300 font-mono">
                Operator: {currentStaff.name} ({currentStaff.role})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Custom Order Design & Revision Hub</h1>
            <p className="text-xs text-indigo-200/80 max-w-xl font-medium">
              Accept orders from CRE, create technical drawings, manage revisions, and submit approved designs to the Production floor.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchWorkflowOrders}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer border border-white/10"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">Unassigned Pool</div>
            <div className="text-2xl font-black mt-0.5 text-amber-300">{unassignedOrders.length}</div>
            <div className="text-[10px] text-indigo-300 mt-0.5">Awaiting Designer Acceptance</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">My Active Work</div>
            <div className="text-2xl font-black mt-0.5 text-indigo-300">{myAssignedOrders.length}</div>
            <div className="text-[10px] text-indigo-300 mt-0.5">In Progress or Revisions</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">Submitted to Prod</div>
            <div className="text-2xl font-black mt-0.5 text-emerald-300">{submittedOrders.length}</div>
            <div className="text-[10px] text-indigo-300 mt-0.5">Ready or In Manufacturing</div>
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

      {/* Tabs and Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => { setActiveTab('UNASSIGNED'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'UNASSIGNED'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Unassigned Pool</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'UNASSIGNED' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {unassignedOrders.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('MY_ORDERS'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'MY_ORDERS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>My Assigned Orders</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'MY_ORDERS' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {myAssignedOrders.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('SUBMITTED'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'SUBMITTED'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Production Queue</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'SUBMITTED' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {submittedOrders.length}
            </span>
          </button>
        </div>

        {/* Search & Priority Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order ID, client..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Orders List & Workspace Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Orders Cards List */}
        <div className={`${selectedOrder ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4`}>
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Palette className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800">No Orders in this View</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {activeTab === 'UNASSIGNED' 
                  ? 'There are currently no orders waiting for designer acceptance. New custom orders sent by CRE will appear here.'
                  : 'No active orders assigned to you matching this filter.'}
              </p>
            </div>
          ) : (
            filteredItems.map(item => {
              const wf = item.workflow as DepartmentWorkflow | undefined;
              const isSelected = selectedOrder?.orderId === item.orderId;
              const isRevisionRequested = wf?.workflowStatus === 'DESIGN_REVISION_REQUESTED';

              return (
                <div
                  key={item.orderId}
                  className={`bg-white rounded-3xl p-5 border transition-all duration-200 shadow-xs hover:shadow-md ${
                    isSelected 
                      ? 'border-indigo-600 ring-2 ring-indigo-600/10' 
                      : isRevisionRequested 
                        ? 'border-rose-300 bg-rose-50/20' 
                        : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-900 text-sm">
                          {item.orderId}
                        </span>
                        {getPriorityBadge(wf?.priority)}
                        {getStatusBadge(wf?.workflowStatus)}
                      </div>
                      <p className="text-xs font-bold text-slate-700">
                        {item.customerName || 'Direct Client'} • <span className="text-slate-500 font-normal">{item.productSku || 'Custom Product'}</span>
                      </p>
                    </div>

                    {/* Actions */}
                    {activeTab === 'UNASSIGNED' ? (
                      <button
                        onClick={() => handleAcceptOrder(item)}
                        disabled={acceptingOrderId === item.orderId}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {acceptingOrderId === item.orderId ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Assigning...</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Accept Order</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => openWorkspace(item)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                          isSelected 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600'
                        }`}
                      >
                        <span>Workspace</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* CRE Design Instructions */}
                  {wf?.designInstructions && (
                    <div className="mt-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <span className="font-black text-slate-900 block text-[10px] uppercase tracking-wider mb-0.5">
                        CRE Instructions:
                      </span>
                      <p className="line-clamp-2 leading-relaxed">{wf.designInstructions}</p>
                    </div>
                  )}

                  {/* Clarification or revision request alert */}
                  {wf?.clarificationRequest && (
                    <div className="mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                      <span className="font-black block text-[10px] uppercase tracking-wider mb-0.5">
                        Revision Requested by {wf.clarificationRequest.fromDepartment}:
                      </span>
                      <p className="font-medium">{wf.clarificationRequest.problemDescription}</p>
                    </div>
                  )}

                  {/* Footer Meta */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatIST(wf?.forwardedToDesignAt || item.createdAt)}
                      </span>
                      {wf?.creAttachments && wf.creAttachments.length > 0 && (
                        <span className="flex items-center gap-1 text-indigo-600 font-bold">
                          <Paperclip className="w-3 h-3" />
                          {wf.creAttachments.length} reference file(s)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px]">Rev #{wf?.currentRevisionNumber || 1}</span>
                      {wf?.assignedDesignerName && (
                        <span className="font-medium text-slate-600">Assigned: {wf.assignedDesignerName}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Designer Workspace Drawer */}
        {selectedOrder && (
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 border border-indigo-200 shadow-xl space-y-5 sticky top-6">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-indigo-600 text-base">
                    {selectedOrder.orderId}
                  </span>
                  {getPriorityBadge(selectedOrder.workflow?.priority)}
                  {getStatusBadge(selectedOrder.workflow?.workflowStatus)}
                </div>
                <h3 className="text-sm font-black text-slate-900 mt-1">Design Workspace & File Submissions</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedOrder.customerName} • Revision #{selectedOrder.workflow?.currentRevisionNumber || 1}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Original CRE Reference Attachments */}
            {selectedOrder.workflow?.creAttachments && selectedOrder.workflow.creAttachments.length > 0 && (
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 block">
                  Original CRE Reference Attachments ({selectedOrder.workflow.creAttachments.length})
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedOrder.workflow.creAttachments.map((att: OrderAttachment) => (
                    <div key={att.id} className="flex items-center justify-between p-2 rounded-xl bg-white border border-indigo-100 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{att.fileName}</span>
                      </div>
                      <a
                        href={att.fileUrl}
                        download={att.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Design Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Designer Notes & Specifications
              </label>
              <textarea
                rows={3}
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                placeholder="Add drawing specifications, material codes, or notes for the production team..."
                className="w-full px-4 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium"
              />
            </div>

            {/* Uploaded Design Files */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Final Design Files (CAD / PDF / Images) <span className="text-rose-500">*</span>
                </label>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Design File</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.dwg,.dxf,.step,.stp,.ai,.psd,.jpg,.jpeg,.png,.zip"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              </div>

              {isUploading && (
                <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl text-xs flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Uploading CAD and design assets...</span>
                </div>
              )}

              {designFiles.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {designFiles.map((f, i) => (
                    <div key={f.id || i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate">{f.fileName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({f.fileType})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={f.fileUrl}
                          download={f.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-500 hover:text-indigo-600"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setDesignFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400 space-y-1">
                  <p className="font-bold text-slate-500">No design files attached yet</p>
                  <p className="text-[11px]">Upload vector art, PDF proof, or 3D/CAD models (DWG, DXF, STEP)</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSubmitting || isUploading}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Progress</span>
              </button>

              <button
                type="button"
                onClick={handleSubmitToProduction}
                disabled={isSubmitting || isUploading || designFiles.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit to Production</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
