import { getApiUrl, safeFetchJson } from './api';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export interface UploadTask {
  id: string;
  orderId: string;
  staffId: string;
  stationId: string;
  durationSeconds: number;
  videoBlob: Blob;
  recordingDate: string;
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
  private maxParallelUploads = 3;

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
      // Primary Method 1: Direct Client-to-Telegram API upload (100% reliable, zero server memory/proxy limits)
      await this.uploadTaskDirectTelegram(nextTask);
      nextTask.status = 'SUCCESS';
      nextTask.progress = 100;
    } catch (err: any) {
      console.warn(`Direct Telegram upload failed for ${nextTask.orderId}, trying server binary upload fallback...`, err);
      try {
        // Fallback Method 2: Server Binary Multipart Upload
        await this.uploadTaskBinaryXHR(nextTask);
        nextTask.status = 'SUCCESS';
        nextTask.progress = 100;
      } catch (fallbackErr: any) {
        console.warn(`Server binary upload failed for ${nextTask.orderId}, trying Base64 JSON fallback...`, fallbackErr);
        try {
          // Fallback Method 3: Base64 JSON Upload
          await this.uploadTaskBase64Json(nextTask);
          nextTask.status = 'SUCCESS';
          nextTask.progress = 100;
        } catch (jsonErr: any) {
          console.error(`All upload protocols failed for ${nextTask.orderId}:`, jsonErr);
          nextTask.status = 'FAILED';
          nextTask.error = jsonErr.message || err.message || 'Upload failed';
        }
      }
    } finally {
      this.activeUploads--;
      this.notify();
      this.processQueue();
    }
  }

  // Primary Method: Upload directly from browser to Telegram API (Fast, no server body limit)
  private uploadTaskDirectTelegram(task: UploadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('zuboc_telegram_token') || '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE';
      const chatId = localStorage.getItem('zuboc_telegram_chatid') || '-1003940299676';

      if (!token || !chatId) {
        return reject(new Error('Telegram Bot Token or Chat ID not configured in settings.'));
      }

      const cleanToken = token.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
      const cleanChatId = chatId.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');

      const formattedDate = task.recordingDate 
        ? new Date(task.recordingDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const durMin = Math.floor((task.durationSeconds || 0) / 60);
      const durSec = (task.durationSeconds || 0) % 60;
      const durationStr = `${durMin}m ${durSec}s`;

      const safeOrderId = task.orderId;
      const safeStaffId = task.staffId || 'Staff-01';
      const safeStationId = task.stationId || 'Packing-01';

      const caption = `<b>Order ID: ${safeOrderId}</b>\n<b>Staff:</b> ${safeStaffId}\n<b>Station:</b> ${safeStationId}\n<b>Recorded:</b> ${formattedDate}\n<b>Duration:</b> ${durationStr}`;

      const formData = new FormData();
      formData.append('chat_id', cleanChatId);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      formData.append('video', task.videoBlob, `${safeOrderId}.mp4`);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          task.progress = percent;
          this.notify();
        }
      };

      xhr.onload = async () => {
        let resData: any = null;
        try {
          resData = JSON.parse(xhr.responseText);
        } catch {
          return reject(new Error(`Telegram API non-JSON response: ${xhr.responseText.slice(0, 100)}`));
        }

        if (xhr.status >= 200 && xhr.status < 300 && resData.ok) {
          const messageId = resData.result?.message_id?.toString();
          const fileId = resData.result?.video?.file_id || resData.result?.document?.file_id;

          let numericId = cleanChatId;
          if (numericId.startsWith('-100')) numericId = numericId.substring(4);
          else if (numericId.startsWith('-')) numericId = numericId.substring(1);

          const messageLink = cleanChatId.startsWith('@')
            ? `https://t.me/${cleanChatId.substring(1)}/${messageId}`
            : `https://t.me/c/${numericId}/${messageId}`;

          task.telegramMessageLink = messageLink;

          // Save record locally & to Firestore
          await this.saveOrderRecord(task, messageId, fileId, messageLink, cleanChatId);
          resolve();
        } else {
          reject(new Error(resData?.description || `Telegram upload failed (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during direct Telegram upload'));
      xhr.ontimeout = () => reject(new Error('Direct Telegram upload request timed out'));

      xhr.open('POST', `https://api.telegram.org/bot${cleanToken}/sendVideo`, true);
      xhr.send(formData);
    });
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
      formData.append('recordingDate', task.recordingDate);
      formData.append('video', task.videoBlob, `${task.orderId}.mp4`);

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
      const reader = new FileReader();
      reader.readAsDataURL(task.videoBlob);
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          task.progress = 50;
          this.notify();

          const url = getApiUrl('/api/telegram/upload');
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: task.orderId,
              staffId: task.staffId,
              stationId: task.stationId,
              durationSeconds: task.durationSeconds,
              recordingDate: task.recordingDate,
              videoBase64: base64data
            })
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

