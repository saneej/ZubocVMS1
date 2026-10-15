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
}
