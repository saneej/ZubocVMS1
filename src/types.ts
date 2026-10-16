export interface ChatNote {
  id: string;
  text: string;
  staffId: string;
  timestamp: string;
}

export type ProductionStage = 
  | 'PRE_PRODUCTION'      // 1. Pre-Production & Print (Die Cutting / Digital / Screen / Foiling / Stamp Making)
  | 'CURATION_ASSEMBLY'   // 2. In-House Curation & Assembly (Pasting, folding, ribbon work, wax sealing)
  | 'PHOTOSHOOT'          // 3. Photography Table (Photoshoot in progress)
  | 'QC_PACKED'           // 4. QC & Packed (Awaiting Dispatch)
  | 'DISPATCHED';         // 5. Dispatched

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
  productionNotes?: string;

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
