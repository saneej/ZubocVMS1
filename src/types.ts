export interface OrderRecord {
  orderId: string;
  staffId: string;
  stationId: string;
  recordingStartedAt: string;
  recordingCompletedAt?: string;
  durationSeconds: number;
  recordingStatus: 'RECORDING' | 'COMPLETED' | 'FAILED';
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
  notes?: string;
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
