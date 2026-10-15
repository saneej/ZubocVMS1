import { getApiUrl, safeFetchJson } from './api';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export interface UploadTask {
  id: string;
  orderId: string;
  staffId: string;
  stationId: string;
  durationSeconds: number;
  evidenceType?: 'VIDEO' | 'PHOTO' | 'PHOTO_VIDEO';
  videoBlob?: Blob | null;
  photoBlobs?: Blob[];
  photoDataUrls?: string[];
  recordingDate: string;
  width?: number;
  height?: number;
  progress: number; // 0 to 100
  status: 'QUEUED' | 'UPLOADING' | 'SUCCESS' | 'FAILED';
  error?: string;
  telegramMessageLink?: string;
}

type QueueListener = (tasks: UploadTask[]) => void;

class UploadQueueManager {
  private tasks: UploadTask[] = [];
  private listeners: QueueListener[] = [];
  private activeUploads = 0;
  private maxParallelUploads = 4;

  public subscribe(listener: QueueListener) {
    this.listeners.push(listener);
    listener([...this.tasks]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l([...this.tasks]));
  }

  public addTask(taskData: Omit<UploadTask, 'id' | 'progress' | 'status'>) {
    const task: UploadTask = {
      ...taskData,
      id: `${taskData.orderId}_${Date.now()}`,
      progress: 0,
      status: 'QUEUED'
    };

    this.tasks = this.tasks.filter(t => t.orderId !== taskData.orderId || t.status === 'SUCCESS');
    this.tasks.unshift(task);
    this.notify();
    this.processQueue();
  }

  public retryTask(taskId: string) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'QUEUED';
      task.progress = 0;
      task.error = undefined;
      this.notify();
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.activeUploads >= this.maxParallelUploads) return;

    const nextTask = this.tasks.find(t => t.status === 'QUEUED');
    if (!nextTask) return;

    nextTask.status = 'UPLOADING';
    this.activeUploads++;
    this.notify();

    try {
      // Primary Method 1: Server Binary Upload with automatic FFmpeg H.264 transcoding + Thumbnail
      await this.uploadTaskBinaryXHR(nextTask);
      nextTask.status = 'SUCCESS';
      nextTask.progress = 100;
    } catch (err: any) {
      console.warn(`Server binary upload failed for ${nextTask.orderId}, trying Base64 JSON fallback...`, err);
      try {
        // Fallback Method 2: Base64 JSON Upload via Server
        await this.uploadTaskBase64Json(nextTask);
        nextTask.status = 'SUCCESS';
        nextTask.progress = 100;
      } catch (fallbackErr: any) {
        console.warn(`Server JSON upload failed for ${nextTask.orderId}, trying Direct Client-to-Telegram upload...`, fallbackErr);
        try {
          // Fallback Method 3: Direct Client-to-Telegram API upload (supports video & photo blobs)
          await this.uploadTaskDirectTelegram(nextTask);
          nextTask.status = 'SUCCESS';
          nextTask.progress = 100;
        } catch (directErr: any) {
          console.error(`All upload protocols failed for ${nextTask.orderId}:`, directErr);
          nextTask.status = 'FAILED';
          nextTask.error = directErr.message || fallbackErr.message || err.message || 'Upload failed';
        }
      }
    } finally {
      this.activeUploads--;
      this.notify();
      this.processQueue();
    }
  }

  // Primary Method: Upload directly from browser to Telegram API (Fast, no server body limit)
  private async uploadTaskDirectTelegram(task: UploadTask): Promise<void> {
    const token = localStorage.getItem('zuboc_telegram_token') || '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE';
    const chatId = localStorage.getItem('zuboc_telegram_chatid') || '-1003940299676';

    if (!token || !chatId) {
      throw new Error('Telegram Bot Token or Chat ID not configured in settings.');
    }

    const cleanToken = token.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
    const cleanChatId = chatId.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');

    const formattedDate = task.recordingDate 
      ? new Date(task.recordingDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const safeOrderId = task.orderId;
    const safeStaffId = task.staffId || 'Staff-01';
    const safeStationId = task.stationId || 'Packing-01';

    let primaryMessageId = '';
    let primaryFileId = '';
    let primaryMessageLink = '';

    // CASE 1: Video Upload (Video Only OR Photo+Video)
    if (task.videoBlob) {
      await new Promise<void>((resolve, reject) => {
        const durMin = Math.floor((task.durationSeconds || 0) / 60);
        const durSec = (task.durationSeconds || 0) % 60;
        const durationStr = `${durMin}m ${durSec}s`;

        const caption = `<b>Order ID: ${safeOrderId}</b>\n<b>Staff:</b> ${safeStaffId}\n<b>Station:</b> ${safeStationId}\n<b>Recorded:</b> ${formattedDate}\n<b>Duration:</b> ${durationStr}${task.photoBlobs?.length ? `\n<b>Photos Attached:</b> ${task.photoBlobs.length}` : ''}`;

        const formData = new FormData();
        formData.append('chat_id', cleanChatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
        
        const isMp4 = task.videoBlob?.type?.includes('mp4');
        if (isMp4) {
          formData.append('supports_streaming', 'true');
        }
        
        if (task.width && task.height && task.width > 0 && task.height > 0) {
          formData.append('width', task.width.toString());
          formData.append('height', task.height.toString());
        }
        if (task.durationSeconds > 0) {
          formData.append('duration', Math.round(task.durationSeconds).toString());
        }

        const ext = isMp4 ? 'mp4' : 'webm';
        formData.append('video', task.videoBlob!, `${safeOrderId}.${ext}`);

        if (task.photoBlobs && task.photoBlobs.length > 0) {
          formData.append('thumb', task.photoBlobs[0], `${safeOrderId}_thumb.jpg`);
        }

        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            task.progress = Math.round((event.loaded / event.total) * (task.photoBlobs?.length ? 70 : 100));
            this.notify();
          }
        };

        xhr.onload = () => {
          try {
            const resData = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && resData.ok) {
              primaryMessageId = resData.result?.message_id?.toString();
              primaryFileId = resData.result?.video?.file_id || resData.result?.document?.file_id;
              resolve();
            } else {
              reject(new Error(resData?.description || `Video upload failed (HTTP ${xhr.status})`));
            }
          } catch {
            reject(new Error('Invalid response from Telegram video upload'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during Telegram video upload'));
        xhr.open('POST', `https://api.telegram.org/bot${cleanToken}/sendVideo`, true);
        xhr.send(formData);
      });
    }

    // CASE 2: Photo Upload (Photo Only OR snapshots attached to Photo+Video)
    if (task.photoBlobs && task.photoBlobs.length > 0) {
      for (let i = 0; i < task.photoBlobs.length; i++) {
        const photoBlob = task.photoBlobs[i];
        await new Promise<void>((resolve, reject) => {
          const photoCaption = task.videoBlob 
            ? `<b>📷 Photo Snapshot #${i + 1} • Order ID: ${safeOrderId}</b>\n<b>Staff:</b> ${safeStaffId} • <b>Station:</b> ${safeStationId}`
            : `<b>📷 Photo Evidence • Order ID: ${safeOrderId}</b>\n<b>Staff:</b> ${safeStaffId}\n<b>Station:</b> ${safeStationId}\n<b>Captured:</b> ${formattedDate}`;

          const photoForm = new FormData();
          photoForm.append('chat_id', cleanChatId);
          photoForm.append('caption', photoCaption);
          photoForm.append('parse_mode', 'HTML');
          photoForm.append('photo', photoBlob, `${safeOrderId}_photo_${i + 1}.jpg`);

          const xhr = new XMLHttpRequest();
          xhr.onload = () => {
            try {
              const resData = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300 && resData.ok) {
                if (!primaryMessageId) {
                  primaryMessageId = resData.result?.message_id?.toString();
                  primaryFileId = resData.result?.photo?.[resData.result.photo.length - 1]?.file_id;
                }
                resolve();
              } else {
                reject(new Error(resData?.description || `Photo upload failed (HTTP ${xhr.status})`));
              }
            } catch {
              reject(new Error('Invalid response from Telegram photo upload'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during Telegram photo upload'));
          xhr.open('POST', `https://api.telegram.org/bot${cleanToken}/sendPhoto`, true);
          xhr.send(photoForm);
        });
      }
    }

    // Build Telegram message link
    let numericId = cleanChatId;
    if (numericId.startsWith('-100')) numericId = numericId.substring(4);
    else if (numericId.startsWith('-')) numericId = numericId.substring(1);

    if (primaryMessageId) {
      primaryMessageLink = cleanChatId.startsWith('@')
        ? `https://t.me/${cleanChatId.substring(1)}/${primaryMessageId}`
        : `https://t.me/c/${numericId}/${primaryMessageId}`;
    }

    task.telegramMessageLink = primaryMessageLink;

    // Save record locally & to Firestore
    await this.saveOrderRecord(task, primaryMessageId, primaryFileId, primaryMessageLink, cleanChatId);
  }

  // Fallback 2: Server Binary Multipart Upload
  private uploadTaskBinaryXHR(task: UploadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      formData.append('orderId', task.orderId);
      formData.append('staffId', task.staffId);
      formData.append('stationId', task.stationId);
      formData.append('durationSeconds', task.durationSeconds.toString());
      if (task.width && task.height && task.width > 0 && task.height > 0) {
        formData.append('width', task.width.toString());
        formData.append('height', task.height.toString());
      }
      formData.append('evidenceType', task.evidenceType || (task.videoBlob ? 'VIDEO' : 'PHOTO'));

      if (task.videoBlob) {
        formData.append('video', task.videoBlob, `${task.orderId}.mp4`);
      }
      if (task.photoBlobs && task.photoBlobs.length > 0) {
        formData.append('photo', task.photoBlobs[0], `${task.orderId}.jpg`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          task.progress = percentComplete;
          this.notify();
        }
      };

      xhr.onload = async () => {
        let res: any = null;
        try {
          res = JSON.parse(xhr.responseText);
        } catch {
          res = null;
        }

        if (xhr.status >= 200 && xhr.status < 300 && res && res.success) {
          if (res.record?.telegramMessageLink) {
            task.telegramMessageLink = res.record.telegramMessageLink;
          }
          await this.saveOrderRecord(
            task, 
            res.record?.telegramMessageId, 
            res.record?.telegramFileId, 
            res.record?.telegramMessageLink, 
            res.record?.telegramChatId
          );
          resolve();
        } else {
          const errText = res?.error || (xhr.responseText.includes('A server error') ? 'Server API temporarily unavailable' : `Server HTTP ${xhr.status}`);
          reject(new Error(errText));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during server binary upload'));
      xhr.ontimeout = () => reject(new Error('Server binary upload request timed out'));

      const uploadEndpoint = getApiUrl('/api/telegram/upload');
      xhr.open('POST', uploadEndpoint, true);
      xhr.send(formData);
    });
  }

  // Fallback 3: Base64 JSON Upload via Server
  private async uploadTaskBase64Json(task: UploadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload: any = {
        orderId: task.orderId,
        staffId: task.staffId,
        stationId: task.stationId,
        durationSeconds: task.durationSeconds,
        recordingDate: task.recordingDate,
        width: task.width || 1920,
        height: task.height || 1080,
        evidenceType: task.evidenceType || (task.videoBlob ? 'VIDEO' : 'PHOTO'),
        photoBase64: task.photoDataUrls?.[0]
      };

      if (!task.videoBlob) {
        const url = getApiUrl('/api/telegram/upload');
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            if (data.record?.telegramMessageLink) task.telegramMessageLink = data.record.telegramMessageLink;
            this.saveOrderRecord(task, data.record?.telegramMessageId, data.record?.telegramFileId, data.record?.telegramMessageLink, data.record?.telegramChatId);
            task.progress = 100;
            resolve();
          })
          .catch(reject);
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(task.videoBlob);
      reader.onloadend = async () => {
        try {
          payload.videoBase64 = reader.result as string;
          task.progress = 50;
          this.notify();

          const url = getApiUrl('/api/telegram/upload');
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const rawText = await res.text();
          let data: any = null;
          try {
            data = JSON.parse(rawText);
          } catch {
            throw new Error(`Server API response unreadable (HTTP ${res.status})`);
          }

          if (!res.ok || !data || !data.success) {
            throw new Error(data?.error || `Server HTTP ${res.status}`);
          }

          if (data.record?.telegramMessageLink) {
            task.telegramMessageLink = data.record.telegramMessageLink;
          }

          await this.saveOrderRecord(
            task, 
            data.record?.telegramMessageId, 
            data.record?.telegramFileId, 
            data.record?.telegramMessageLink, 
            data.record?.telegramChatId
          );

          task.progress = 100;
          resolve();
        } catch (err: any) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read video blob'));
    });
  }

  private async saveOrderRecord(task: UploadTask, messageId?: string, fileId?: string, messageLink?: string, chatId?: string) {
    const now = new Date().toISOString();
    const updatedRecord = {
      orderId: task.orderId,
      staffId: task.staffId || 'Staff-01',
      stationId: task.stationId || 'Packing-01',
      durationSeconds: task.durationSeconds || 0,
      evidenceType: task.evidenceType || (task.videoBlob && task.photoBlobs?.length ? 'PHOTO_VIDEO' : task.videoBlob ? 'VIDEO' : 'PHOTO'),
      photoDataUrl: task.photoDataUrls?.[0],
      photoUrls: task.photoDataUrls || [],
      recordingStartedAt: task.recordingDate || now,
      recordingCompletedAt: now,
      recordingStatus: 'COMPLETED',
      uploadStatus: 'SUCCESS',
      telegramChatId: chatId || localStorage.getItem('zuboc_telegram_chatid') || '-1003940299676',
      telegramMessageId: messageId,
      telegramFileId: fileId,
      telegramMessageLink: messageLink,
      createdAt: now,
      updatedAt: now
    };

    // 1. Update LocalStorage orders store
    try {
      let orders: any[] = [];
      const localStr = localStorage.getItem('zuboc_orders_store');
      if (localStr) {
        try { orders = JSON.parse(localStr); } catch {}
      }
      const existingIdx = orders.findIndex((o: any) => o.orderId === task.orderId);
      if (existingIdx >= 0) {
        orders[existingIdx] = { ...orders[existingIdx], ...updatedRecord };
      } else {
        orders.unshift(updatedRecord);
      }
      localStorage.setItem('zuboc_orders_store', JSON.stringify(orders));
    } catch (e) {
      console.warn('LocalStorage save warning:', e);
    }

    // 2. Update Firestore database
    if (db) {
      try {
        await setDoc(doc(db, 'orders', task.orderId), updatedRecord, { merge: true });
      } catch (e) {
        console.warn('Firestore order save warning:', e);
      }
    }

    // 3. Post to backend server API silently
    try {
      safeFetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      }).catch(() => {});
    } catch {}
  }

  public getTasks() {
    return [...this.tasks];
  }
}

export const uploadQueueManager = new UploadQueueManager();

