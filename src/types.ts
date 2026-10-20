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
  fulfillmentStatus?: 'Pending' | 'Packed' | 'Shipped' | 'Fulfilled' | 'Delivered' | string;
  notes?: string;
  remarks?: string;
  chatNotes?: ChatNote[];
  auditLogs?: { timestamp: string; staffId: string; action: string; details: string; type: 'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG' }[];
  
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
  paymentGate?: PaymentGateInfo;
  productionStage?: ProductionStage;
  stageDueDates?: Record<string, string>;
  productionNotes?: string;
  isProductionDeckOrder?: boolean;

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

export interface StaffMember {
  id: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'PACKER';
  stationId: string;
  password?: string;
  email?: string;
  createdAt?: string;
}
