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
  X,
  Factory,
  RefreshCcw,
  Check
} from 'lucide-react';
import { OrderRecord, StaffMember, DepartmentWorkflow, OrderAttachment, DesignRevision, WorkflowPriority } from '../types';
import { safeFetchJson } from '../utils/api';
import { formatIST } from '../utils/time';
import { RequestRevisionModal } from './RequestRevisionModal';

interface DesignerDashboardProps {
  currentStaff: StaffMember;
  onOpenOrderDetails?: (orderId: string) => void;
}

export const DesignerDashboard: React.FC<DesignerDashboardProps> = ({
  currentStaff,
  onOpenOrderDetails
}) => {
  const isCREOrAdmin = currentStaff.role === 'ADMIN' || currentStaff.role === 'CRE';
  const [activeTab, setActiveTab] = useState<'UNASSIGNED' | 'MY_ORDERS' | 'CRE_REVIEW' | 'SUBMITTED' | 'ALL_DESIGN_PROJECTS'>('UNASSIGNED');
  const [ordersWithWorkflow, setOrdersWithWorkflow] = useState<any[]>([]);
  const [designersList, setDesignersList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  
  // Active selected order for designer / CRE review workspace drawer
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [designNotes, setDesignNotes] = useState('');
  const [designFiles, setDesignFiles] = useState<OrderAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal for CRE requesting revision from Designer
  const [revisionModalTarget, setRevisionModalTarget] = useState<any | null>(null);

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

  useEffect(() => {
    safeFetchJson('/api/staffs').then(data => {
      if (Array.isArray(data)) {
        setDesignersList(data.filter((s: StaffMember) => s.role === 'DESIGNER' || s.role === 'ADMIN'));
      }
    }).catch(() => {});
  }, []);

  // Filter queues
  // 1. Orders Sent to Design / Unassigned Pool (Any order marked DESIGN_PENDING or requiring design without an active assigned designer)
  const unassignedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const isDesignReq = Boolean(wf?.isDesignRequired || item.isDesignRequired || item.workflowStatus === 'DESIGN_PENDING' || wf?.workflowStatus === 'DESIGN_PENDING');
    if (!isDesignReq) return false;
    const status = wf?.workflowStatus || item.workflowStatus || '';
    
    // Status is explicitly DESIGN_PENDING -> Always shows in Unassigned / Orders Sent to Design!
    if (status === 'DESIGN_PENDING') return true;
    // Or no designer assigned and not submitted/in prod
    if (!wf?.assignedDesignerId && ['CRE_CREATED', ''].includes(status)) return true;
    return false;
  });

  // 2. Orders In Progress with Designers (For designers: their assigned orders; For CRE/Admin: all active design work)
  const myAssignedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const isDesignReq = Boolean(wf?.isDesignRequired || item.isDesignRequired || item.workflowStatus === 'DESIGN_PENDING' || wf?.workflowStatus === 'DESIGN_PENDING');
    if (!isDesignReq) return false;
    const status = wf?.workflowStatus || item.workflowStatus || '';
    
    if (isCREOrAdmin) {
      // For CRE & Admin, show all orders currently being designed
      return ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_REVISION_REQUESTED'].includes(status);
    }
    const isMine = wf?.assignedDesignerId === currentStaff.id;
    return isMine && ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_REVISION_REQUESTED'].includes(status);
  });

  // 3. Submitted by Designer and awaiting CRE review
  const creReviewOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const isDesignReq = Boolean(wf?.isDesignRequired || item.isDesignRequired || item.workflowStatus === 'DESIGN_PENDING' || wf?.workflowStatus === 'DESIGN_PENDING');
    if (!isDesignReq) return false;
    const status = wf?.workflowStatus || item.workflowStatus || '';
    return ['DESIGN_SUBMITTED', 'CRE_REVIEW_PENDING', 'SUBMITTED_TO_CRE'].includes(status);
  });

  // 4. Approved and sent to Production queue
  const submittedOrders = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const isDesignReq = Boolean(wf?.isDesignRequired || item.isDesignRequired);
    if (!isDesignReq) return false;
    const status = wf?.workflowStatus || item.workflowStatus || '';
    return ['PRODUCTION_PENDING', 'PRODUCTION_IN_PROGRESS', 'PRODUCTION_COMPLETED'].includes(status);
  });
  
  // 5. Complete Lifecycle Overview: Every order requiring design
  const allDesignProjects = ordersWithWorkflow.filter(item => {
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const isDesignReq = Boolean(wf?.isDesignRequired || item.isDesignRequired || item.workflowStatus === 'DESIGN_PENDING' || wf?.workflowStatus === 'DESIGN_PENDING');
    const status = wf?.workflowStatus || item.workflowStatus || '';
    return isDesignReq && [
      'DESIGN_PENDING',
      'DESIGN_ASSIGNED',
      'DESIGN_IN_PROGRESS',
      'DESIGN_REVISION_REQUESTED',
      'DESIGN_SUBMITTED',
      'CRE_REVIEW_PENDING',
      'SUBMITTED_TO_CRE',
      'PRODUCTION_PENDING',
      'PRODUCTION_IN_PROGRESS',
      'PRODUCTION_COMPLETED'
    ].includes(status);
  });

  // Concurrency-Safe Order Acceptance for Designers
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
        setOrdersWithWorkflow(prev => prev.map(o => o.orderId === orderItem.orderId ? { ...o, workflow: res.workflow } : o));
        setActiveTab('MY_ORDERS');
        openWorkspace({ ...orderItem, workflow: res.workflow });
        await fetchWorkflowOrders();
      } else {
        throw new Error(res?.error || 'Failed to accept order.');
      }
    } catch (err: any) {
      console.error('Accept order error:', err);
      setFeedback({ 
        type: 'error', 
        message: err?.message || 'This order has already been assigned to another Designer.' 
      });
      fetchWorkflowOrders();
    } finally {
      setAcceptingOrderId(null);
    }
  };

  // CRE & Admin: Assign an order directly to a specific designer
  const handleAssignOrder = async (orderItem: any, designerId: string, designerName: string) => {
    setAcceptingOrderId(orderItem.orderId);
    setFeedback(null);
    try {
      const res = await safeFetchJson('/api/workflow/assign-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderItem.orderId,
          designerId,
          designerName,
          staffId: currentStaff.id,
          staffName: currentStaff.name
        })
      });
      if (res && res.success) {
        setFeedback({ type: 'success', message: res.message || `Order ${orderItem.orderId} assigned to ${designerName}!` });
        await fetchWorkflowOrders();
      } else {
        throw new Error(res?.error || 'Failed to assign order');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to assign order' });
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
        setFeedback({ type: 'success', message: `${res.files.length} design file(s) uploaded successfully.` });
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
        setFeedback({ type: 'success', message: 'Design draft saved successfully!' });
        fetchWorkflowOrders();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save draft' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // DESIGNER: Submit completed design to CRE for Review & Approval
  const handleSubmitToCRE = async () => {
    if (!selectedOrder) return;
    if (designFiles.length === 0) {
      setFeedback({ type: 'error', message: 'Please upload at least one final CAD / Blueprint design file before submitting to CRE.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/submit-to-cre', {
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
        setFeedback({ type: 'success', message: res.message || 'Design successfully submitted to CRE for review!' });
        await fetchWorkflowOrders();
        setSelectedOrder(null);
        setActiveTab('SUBMITTED');
      } else {
        setFeedback({ type: 'error', message: res?.error || 'Failed to submit design to CRE' });
      }
    } catch (err: any) {
      console.error('Submit to CRE error:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to submit design to CRE' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // CRE: Review & Approve Design -> Send to Production Department
  const handleCREApproveToProduction = async (orderItem: any) => {
    const targetOrder = orderItem || selectedOrder;
    if (!targetOrder) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/workflow/cre-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrder.orderId,
          staffId: currentStaff.id,
          staffName: currentStaff.name,
          productionInstructions: 'Approved for Production',
          priority: targetOrder.workflow?.priority || 'NORMAL'
        })
      });

      if (res && res.success) {
        setFeedback({ 
          type: 'success', 
          message: res.message || `Order ${targetOrder.orderId} approved and sent to Production floor!` 
        });
        await fetchWorkflowOrders();
        if (selectedOrder?.orderId === targetOrder.orderId) {
          setSelectedOrder(null);
        }
      } else {
        throw new Error(res?.error || 'Failed to approve design');
      }
    } catch (err: any) {
      console.error('CRE approve error:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to approve design' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter current active list
  const currentList = activeTab === 'UNASSIGNED' 
    ? unassignedOrders 
    : activeTab === 'CRE_REVIEW'
      ? creReviewOrders
      : activeTab === 'MY_ORDERS' 
        ? myAssignedOrders 
        : activeTab === 'ALL_DESIGN_PROJECTS'
          ? allDesignProjects
          : submittedOrders;

  const filteredItems = currentList.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    const wf = item.workflow as DepartmentWorkflow | undefined;
    const matchesSearch = !q || 
      item.orderId?.toLowerCase().includes(q) ||
      item.customerName?.toLowerCase().includes(q) ||
      item.productSku?.toLowerCase().includes(q) ||
      wf?.designInstructions?.toLowerCase().includes(q) ||
      wf?.assignedDesignerName?.toLowerCase().includes(q);

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
      case 'CRE_REVIEW_PENDING':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-1">
          <Clock className="w-3 h-3 text-amber-700" />
          Awaiting CRE Review
        </span>;
      case 'PRODUCTION_PENDING':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold">Approved for Prod</span>;
      case 'PRODUCTION_IN_PROGRESS':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-indigo-50 text-indigo-700 border border-indigo-200">Manufacturing</span>;
      case 'PRODUCTION_COMPLETED':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-tight bg-teal-50 text-teal-800 border border-teal-200">Prod Completed</span>;
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
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Custom Order Design & Approval Hub</h1>
            <p className="text-xs text-indigo-200/80 max-w-xl font-medium">
              {isCREOrAdmin 
                ? 'Review submitted blueprints from designers, approve and send orders to Production, or request design adjustments.'
                : 'Accept orders from CRE, create technical drawings & CAD assets, upload to Cloudflare R2, and submit back to CRE for approval.'}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">Unassigned Pool</div>
            <div className="text-2xl font-black mt-0.5 text-amber-300">{unassignedOrders.length}</div>
            <div className="text-[10px] text-indigo-300 mt-0.5">Awaiting Designer Acceptance</div>
          </div>

          {isCREOrAdmin ? (
            <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-200">Awaiting CRE Review</div>
              <div className="text-2xl font-black mt-0.5 text-amber-400">{creReviewOrders.length}</div>
              <div className="text-[10px] text-indigo-300 mt-0.5">Submitted by Designers for Approval</div>
            </div>
          ) : (
            <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">My Active Work</div>
              <div className="text-2xl font-black mt-0.5 text-indigo-300">{myAssignedOrders.length}</div>
              <div className="text-[10px] text-indigo-300 mt-0.5">In Progress or Revisions</div>
            </div>
          )}

          <div className="bg-white/5 rounded-2xl p-3.5 backdrop-blur-md border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">
              {isCREOrAdmin ? 'Production Floor' : 'Sent to CRE'}
            </div>
            <div className="text-2xl font-black mt-0.5 text-emerald-300">
              {isCREOrAdmin ? submittedOrders.length : (creReviewOrders.length + submittedOrders.length)}
            </div>
            <div className="text-[10px] text-indigo-300 mt-0.5">
              {isCREOrAdmin ? 'In Manufacturing or Completed' : 'Under Review or Approved'}
            </div>
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
          
          {/* 1. Orders Sent to Design / Unassigned Pool */}
          <button
            onClick={() => { setActiveTab('UNASSIGNED'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'UNASSIGNED'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Orders Sent to Design</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'UNASSIGNED' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {unassignedOrders.length}
            </span>
          </button>

          {/* 2. In Progress / Assigned */}
          <button
            onClick={() => { setActiveTab('MY_ORDERS'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'MY_ORDERS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>{isCREOrAdmin ? 'In Progress with Designers' : 'My Assigned Orders'}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'MY_ORDERS' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {myAssignedOrders.length}
            </span>
          </button>

          {/* 3. CRE Review Tab */}
          <button
            onClick={() => { setActiveTab('CRE_REVIEW'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'CRE_REVIEW'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>Awaiting CRE Review</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'CRE_REVIEW' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
            }`}>
              {creReviewOrders.length}
            </span>
          </button>

          {/* 4. All Design Projects */}
          <button
            onClick={() => { setActiveTab('ALL_DESIGN_PROJECTS'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'ALL_DESIGN_PROJECTS'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>All Design Projects</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'ALL_DESIGN_PROJECTS' ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {allDesignProjects.length}
            </span>
          </button>

          {/* 5. Production Queue */}
          <button
            onClick={() => { setActiveTab('SUBMITTED'); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'SUBMITTED'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Production Floor</span>
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
              placeholder="Search order ID, client, designer..."
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
                {activeTab === 'CRE_REVIEW'
                  ? 'There are currently no designs awaiting CRE review.'
                  : activeTab === 'UNASSIGNED' 
                    ? 'There are currently no orders waiting for designer acceptance. New custom orders sent by CRE will appear here.'
                    : 'No orders matching this filter.'}
              </p>
            </div>
          ) : (
            filteredItems.map(item => {
              const wf = item.workflow as DepartmentWorkflow | undefined;
              const isSelected = selectedOrder?.orderId === item.orderId;
              const isRevisionRequested = wf?.workflowStatus === 'DESIGN_REVISION_REQUESTED';
              const isAwaitingCREReview = wf?.workflowStatus === 'DESIGN_SUBMITTED' || wf?.workflowStatus === 'CRE_REVIEW_PENDING';

              return (
                <div
                  key={item.orderId}
                  className={`bg-white rounded-3xl p-5 border transition-all duration-200 shadow-xs hover:shadow-md ${
                    isSelected 
                      ? 'border-indigo-600 ring-2 ring-indigo-600/10' 
                      : isAwaitingCREReview
                        ? 'border-amber-300 bg-amber-50/20'
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
                      {wf?.assignedDesignerName && (
                        <p className="text-[10px] font-bold text-indigo-700">
                          Assigned Designer: {wf.assignedDesignerName}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* For Designers: Accept Order */}
                      {!isCREOrAdmin && (wf?.workflowStatus === 'DESIGN_PENDING' || !wf?.assignedDesignerId) && (
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
                      )}

                      {/* For CRE & Admin: Quick Assign Designer Dropdown */}
                      {isCREOrAdmin && (wf?.workflowStatus === 'DESIGN_PENDING' || !wf?.assignedDesignerId) && (
                        <div className="flex items-center gap-1">
                          <select
                            onChange={(e) => {
                              const selected = designersList.find(d => d.id === e.target.value);
                              if (selected) {
                                handleAssignOrder(item, selected.id, selected.name);
                              }
                            }}
                            defaultValue=""
                            disabled={acceptingOrderId === item.orderId}
                            className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none cursor-pointer"
                          >
                            <option value="" disabled>Assign Designer...</option>
                            {designersList.map(d => (
                              <option key={d.id} value={d.id}>
                                Assign: {d.name} ({d.role})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Quick CRE Approval & Revision Buttons directly on card */}
                      {isCREOrAdmin && isAwaitingCREReview && (
                        <>
                          <button
                            onClick={() => handleCREApproveToProduction(item)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                            title="Approve Design and Send to Production"
                          >
                            <Factory className="w-3.5 h-3.5" />
                            <span>Approve to Prod</span>
                          </button>
                          <button
                            onClick={() => setRevisionModalTarget(item)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                            title="Request Revision from Designer"
                          >
                            <RefreshCcw className="w-3.5 h-3.5" />
                            <span>Revision</span>
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => openWorkspace(item)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                          isSelected 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600'
                        }`}
                      >
                        <span>{isCREOrAdmin ? 'Review' : 'Workspace'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Submitted Design Files Preview on Card */}
                  {wf?.activeDesignFiles && wf.activeDesignFiles.length > 0 && (
                    <div className="mt-3 p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-indigo-900 text-[10px] uppercase tracking-wider flex items-center gap-1">
                          <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                          Submitted Design Assets ({wf.activeDesignFiles.length})
                        </span>
                        <span className="text-[10px] text-indigo-600 font-mono font-medium">Rev #{wf.currentRevisionNumber || 1}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {wf.activeDesignFiles.map((f: OrderAttachment, fIdx: number) => (
                          <a
                            key={f.id || fIdx}
                            href={f.fileUrl}
                            download={f.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-100 rounded-lg border border-indigo-200 text-indigo-700 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            <Download className="w-3 h-3 text-indigo-600" />
                            <span className="truncate max-w-[140px]">{f.fileName}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

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
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Designer / CRE Review Workspace Drawer */}
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
                <h3 className="text-sm font-black text-slate-900 mt-1">
                  {isCREOrAdmin ? 'CRE Design Review & Approval' : 'Design Workspace & Blueprint Submissions'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedOrder.customerName} • Revision #{selectedOrder.workflow?.currentRevisionNumber || 1}
                </p>
                {selectedOrder.workflow?.assignedDesignerName && (
                  <p className="text-xs text-indigo-700 font-bold mt-1">
                    Designer: {selectedOrder.workflow.assignedDesignerName}
                  </p>
                )}
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* CRE Review Banner for CRE / Admin */}
            {isCREOrAdmin && (
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>CRE Decision Center</span>
                </div>
                <p className="text-xs text-amber-800">
                  Carefully review the submitted blueprints below. Once approved, you can send the order to Production, or request revisions from the designer.
                </p>
              </div>
            )}

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

            {/* Design Notes & Instructions */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {isCREOrAdmin ? 'Designer Specifications & Notes' : 'Designer Notes & Specifications'}
              </label>
              <textarea
                rows={3}
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                readOnly={isCREOrAdmin}
                placeholder="Add drawing specifications, material codes, or notes..."
                className="w-full px-4 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all font-medium"
              />
            </div>

            {/* Uploaded Design Files (Cloudflare R2 / Supabase) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Submitted Design Files (CAD / PDF / Blueprints) <span className="text-rose-500">*</span>
                </label>
                {!isCREOrAdmin && (
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload CAD / Blueprint</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.dwg,.dxf,.step,.stp,.ai,.psd,.jpg,.jpeg,.png,.zip"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>

              {isUploading && (
                <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl text-xs flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Uploading files to Cloudflare R2 storage...</span>
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
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center gap-1"
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                        {!isCREOrAdmin && (
                          <button
                            type="button"
                            onClick={() => setDesignFiles(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400 space-y-1">
                  <p className="font-bold text-slate-500">No blueprints attached yet</p>
                  <p className="text-[11px]">Vector drawings, PDF proofs, or CAD models (DWG, DXF, STEP)</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              {isCREOrAdmin ? (
                // CRE Approval Actions
                <div className="w-full flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setRevisionModalTarget(selectedOrder)}
                    className="px-4 py-2.5 rounded-xl border border-amber-300 hover:bg-amber-50 text-amber-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Request Revision</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCREApproveToProduction(selectedOrder)}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Approving...</span>
                      </>
                    ) : (
                      <>
                        <Factory className="w-4 h-4" />
                        <span>Approve & Send to Production</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                // Designer Submission Actions
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSubmitting || isUploading}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Draft</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitToCRE}
                    disabled={isSubmitting || isUploading || designFiles.length === 0}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Submitting to CRE...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit to CRE for Review</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CRE Request Revision Modal */}
      {revisionModalTarget && (
        <RequestRevisionModal
          isOpen={!!revisionModalTarget}
          onClose={() => setRevisionModalTarget(null)}
          order={revisionModalTarget}
          workflowStatus={revisionModalTarget.workflow?.workflowStatus}
          currentRevisionNumber={revisionModalTarget.workflow?.currentRevisionNumber || 1}
          requesterRole="CRE"
          onSuccess={() => {
            setRevisionModalTarget(null);
            fetchWorkflowOrders();
            setFeedback({ type: 'success', message: 'Revision request successfully sent back to the designer!' });
          }}
          currentStaffId={currentStaff.id}
          currentStaffName={currentStaff.name}
        />
      )}
    </div>
  );
};
