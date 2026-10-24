export interface ChatNote {
  id: string;
  text: string;
  staffId: string;
  staffName: string;
  timestamp: string;
}

export type ProductionStage = 
  | 'ORDER_CONFIRMATION'        // 1. Order Confirmation Date
  | 'DESIGNING_OUT'             // 2. Designing Out
  | 'CLIENT_APPROVAL'           // 3. Client Approval
  | 'PRODUCTION_SEND'           // 4. Production (Send)
  | 'PRODUCTION_CURATION'       // 5. Production (Arrival)/Curation
  | 'PHOTOSHOOT'                // 6. Photoshoot
  | 'DISPATCH'                  // 7. Dispatch
  // Legacy aliases for backward compatibility
  | 'PRE_PRODUCTION'
  | 'CURATION_ASSEMBLY'
  | 'QC_PACKED'
  | 'DISPATCHED';

export interface ZubocCustomisations {
  goldFoil?: boolean;
  digitalPrinting?: boolean;
  screenPrinting?: boolean;
  dieCutting?: boolean;
  waxStamp?: boolean;
  rubberStamp?: boolean;
  embosserStamp?: boolean;
  uvDtf?: boolean;
  seals?: boolean;
}

export interface SubAssemblyProgress {
  envelopeDieCutting?: boolean;
  screenPrinting?: boolean;
  goldFoiling?: boolean;
  waxSealApplied?: boolean;
  curationCompleted?: boolean;
  photoshootCompleted?: boolean;
  qcPackedCompleted?: boolean;
}

export interface ZubocTimeline {
  orderConfirmationDate?: string;
  designingOutDate?: string;
  clientApprovalDate?: string;
  productionSendDate?: string;
  productionArrivalDate?: string;
  assemblyCurationDate?: string;
  photoshootDate?: string;
  dispatchingDate?: string;
}

export type OrderSource = 'website' | 'amazon';

export function isAmazonOrder(order: any): boolean {
  if (!order) return false;
  const src = String(order.order_source || order.orderSource || '').toLowerCase().trim();
  if (src === 'amazon' || src.includes('amazon')) return true;
  const id = String(order.orderId || '').trim();
  if (/^40[0-9]-/i.test(id)) return true;
  if (/^171-/i.test(id)) return true;
  if (/^026-/i.test(id)) return true;
  if (/\d{3}-\d{7}-\d{7}/.test(id)) return true;
  if (/amazon/i.test(id)) return true;
  if (/amazon/i.test(String(order.courier || ''))) return true;
  return false;
}

export interface LineItem {
  name: string;
  price?: string | number;
  sku?: string;
  quantity?: number;
}

export interface PaymentGateInfo {
  totalBillingAmount?: number | string;
  advanceReceived?: number | string;
  balanceAmount?: number | string;
  balanceStatus?: 'COMPLETED' | 'PENDING';
  adminDispatchOverride?: boolean;
  overrideReason?: string;
  overrideBy?: string;
  overrideTimestamp?: string;
}

export interface OrderRecord {
  orderId: string;
  order_source?: OrderSource;
  orderSource?: OrderSource;
  order_number_num?: number;
  staffId: string;
  stationId: string;
  recordingStartedAt: string;
  recordingCompletedAt?: string;
  durationSeconds: number;
  recordingStatus: 'RECORDING' | 'COMPLETED' | 'FAILED' | 'PENDING';
  uploadStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  telegramChatId?: string;
  telegramMessageId?: string;
  telegramFileId?: string;
  telegramMessageLink?: string;
  videoUrl?: string;
  photoUrls?: string[];
  photoDataUrl?: string;
  evidenceType?: 'VIDEO' | 'PHOTO' | 'PHOTO_VIDEO';
  awbNumber?: string;
  courier?: string;
  deliveryMethod?: 'Normal' | 'Express' | 'Next day delivery (porter/SKS)' | string;
  weight?: string;
  productSku?: string;
  customerName?: string;
  contactPerson?: string;
  contactPhone?: string;
  fulfillFrom?: string;
  orderReceivedDate?: string;
  dispatchDate?: string;
  orderAmount?: string;
  shippingAmount?: string;
  orderTotal?: string;
  deliveredDate?: string;
  itemCount?: string | number;
  fulfillmentStatus?: 'Pending' | 'Packed' | 'Fulfilled' | 'Delivered' | string;
  notes?: string;
  remarks?: string;
  chatNotes?: ChatNote[];
  auditLogs?: { timestamp: string; staffId: string; action: string; details: string; type: 'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG' }[];
  
  // Shopify 26 Target Data Points
  email?: string;
  financialStatus?: string;
  subtotal?: string | number;
  shipping?: string | number;
  taxes?: string | number;
  total?: string | number;
  discountCode?: string;
  discountAmount?: string | number;
  shippingMethod?: string;
  shippingName?: string;
  shippingStreet?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingCompany?: string;
  shippingCity?: string;
  shippingZip?: string;
  shippingProvince?: string;
  shippingCountry?: string;
  shippingPhone?: string;
  lineItems?: LineItem[];
  
  // Zuboc Client Order & Production Tracking Form fields
  clientName?: string;
  product?: string;
  formFillingDate?: string;
  preparedBy?: string;
  checkedBy?: string;
  customisations?: ZubocCustomisations;
  subAssemblyProgress?: SubAssemblyProgress;
  timeline?: ZubocTimeline;
  promisedDeliveryDate?: string;
  dispatchScheduledDate?: string;
  dispatch_scheduled_date?: string;
  paymentGate?: PaymentGateInfo;
  productionStage?: ProductionStage;
  stageDueDates?: Record<string, string>;
  productionNotes?: string;
  isProductionDeckOrder?: boolean;
  isDispatched?: boolean;
  is_dispatched?: boolean;

  // Department Workflow (CRE, Designer, Production)
  isDesignRequired?: boolean;
  workflowStatus?: WorkflowStatus | string;
  assignedDesignerId?: string;
  assignedDesignerName?: string;
  activeRevisionNumber?: number;

  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  telegramBotToken: string;
  telegramChatId: string;
  telegramBotTokenMasked?: string;
  hasToken?: boolean;
  autoUpload: boolean;
  stationId: string;
  maxDailyDispatches?: number;
  tvAutoScroll?: boolean;
  tvScrollSpeed?: number;
}

export type StaffRole = 'ADMIN' | 'CRE' | 'DESIGNER' | 'PRODUCTION' | 'SUPERVISOR' | 'PACKER';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  stationId: string;
  password?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  isSupabaseAuth?: boolean;
  supabaseAuthId?: string;
}

export type WorkflowStatus = 
  | 'CRE_CREATED'
  | 'DESIGN_PENDING'
  | 'DESIGN_ASSIGNED'
  | 'DESIGN_IN_PROGRESS'
  | 'DESIGN_REVISION_REQUESTED'
  | 'DESIGN_SUBMITTED' // Submitted by Designer, Awaiting CRE Review
  | 'CRE_REVIEW_PENDING' // Alias for Awaiting CRE Review
  | 'PRODUCTION_PENDING' // Approved by CRE, Sent to Production
  | 'PRODUCTION_IN_PROGRESS'
  | 'PRODUCTION_REVISION_REQUESTED'
  | 'PRODUCTION_COMPLETED';

export type WorkflowPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface OrderAttachment {
  id: string;
  orderId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  category: 'CRE_REFERENCE' | 'DESIGN_FILE' | 'PRODUCTION_EVIDENCE' | 'REVISION_MARKUP';
  revisionNumber?: number;
  uploadedByStaffId: string;
  uploadedByStaffName: string;
  uploadedAt: string;
  notes?: string;
}

export interface DesignRevision {
  id: string;
  orderId: string;
  revisionNumber: number;
  designerId: string;
  designerName: string;
  designNotes?: string;
  files: OrderAttachment[];
  status: 'DRAFT' | 'SUBMITTED' | 'SUBMITTED_TO_CRE' | 'SUPERSEDED' | 'REVISION_REQUESTED' | 'APPROVED_FOR_PRODUCTION' | 'COMPLETED_IN_PRODUCTION';
  submittedAt?: string;
  revisionRequestedBy?: string;
  revisionReason?: string;
  revisionRequestedAt?: string;
  createdAt: string;
}

export interface ClarificationRequest {
  fromDepartment: 'DESIGN' | 'PRODUCTION';
  problemDescription: string;
  affectedComponent?: string;
  requestedBy: string;
  requestedAt: string;
  urgency: WorkflowPriority;
  attachments?: OrderAttachment[];
  isResolved?: boolean;
  resolutionNotes?: string;
}

export interface DepartmentWorkflow {
  orderId: string;
  isDesignRequired: boolean;
  workflowStatus: WorkflowStatus;
  priority: WorkflowPriority;
  designInstructions?: string;
  assignedDesignerId?: string;
  assignedDesignerName?: string;
  assignedAt?: string;
  currentRevisionNumber: number;
  activeDesignFiles: OrderAttachment[];
  creAttachments: OrderAttachment[];
  forwardedToDesignAt?: string;
  forwardedByStaffId?: string;
  forwardedByStaffName?: string;
  designSubmittedAt?: string;
  creApprovedAt?: string;
  creApprovedByStaffId?: string;
  creApprovedByStaffName?: string;
  creApprovalNotes?: string;
  productionStartedAt?: string;
  productionStartedByStaffId?: string;
  productionStartedByStaffName?: string;
  productionCompletedAt?: string;
  productionCompletedByStaffId?: string;
  productionCompletedByStaffName?: string;
  productionRemarks?: string;
  clarificationRequest?: ClarificationRequest;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAuditLog {
  id: string;
  orderId: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: string;
  fromStatus?: WorkflowStatus;
  toStatus?: WorkflowStatus;
  details: string;
  timestamp: string;
}

