export interface ChatNote {
  id: string;
  text: string;
  staffId: string;
  timestamp: string;
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
