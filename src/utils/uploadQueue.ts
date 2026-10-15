import { getApiUrl } from './api';

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
      // Primary: Binary FormData XHR via Server API
      await this.uploadTaskBinaryXHR(nextTask);
      nextTask.status = 'SUCCESS';
      nextTask.progress = 100;
    } catch (err: any) {
      console.warn(`Server API upload failed for ${nextTask.orderId}, trying direct client-to-Telegram upload...`, err);
      try {
        // Secondary: Direct Client-to-Telegram Upload (bypasses Vercel 4.5MB serverless body limit)
        await this.uploadTaskDirectTelegram(nextTask);
        nextTask.status = 'SUCCESS';
        nextTask.progress = 100;
      } catch (directErr: any) {
        console.warn(`Direct Telegram upload failed for ${nextTask.orderId}, trying base64 fallback...`, directErr);
        try {
          // Tertiary: Base64 JSON fallback
          await this.uploadTaskBase64Fallback(nextTask);
          nextTask.status = 'SUCCESS';
          nextTask.progress = 100;
        } catch (fallbackErr: any) {
          console.error(`Upload error for ${nextTask.orderId}:`, fallbackErr);
          nextTask.status = 'FAILED';
          nextTask.error = fallbackErr.message || 'Upload failed';
        }
      }
    } finally {
      this.activeUploads--;
      this.notify();
      this.processQueue();
    }
  }

  private async uploadTaskDirectTelegram(task: UploadTask): Promise<void> {
    let token = '';
    let chatId = '';

    try {
      const settingsRes = await fetch(getApiUrl('/api/settings'));
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        token = s.telegramBotToken || '';
        chatId = s.telegramChatId || '';
      }
    } catch (e) {
      console.warn('Could not fetch settings for direct upload:', e);
    }

    if (!token || !chatId) {
      throw new Error('Telegram credentials not available for direct upload');
    }

    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    const cleanChatId = chatId.trim().replace(/^["']|["']$/g, '');

    const durMin = Math.floor((task.durationSeconds || 0) / 60);
    const durSec = (task.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;
    const formattedDate = task.recordingDate
      ? new Date(task.recordingDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const caption = `<b>ZUBOC VMS Packing Recording</b>\n\n` +
      `📦 <b>Order ID:</b> <code>${task.orderId}</code>\n` +
      `👤 <b>Staff ID:</b> ${task.staffId}\n` +
      `🏬 <b>Station ID:</b> ${task.stationId}\n` +
      `⏱️ <b>Duration:</b> ${durationStr}\n` +
      `📅 <b>Date:</b> ${formattedDate}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('chat_id', cleanChatId);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      formData.append('video', task.videoBlob, `${task.orderId}.mp4`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          task.progress = percentComplete;
          this.notify();
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const tgRes = JSON.parse(xhr.responseText);
            if (tgRes.ok) {
              const messageId = tgRes.result.message_id;
              let link = '';
              const rawChatId = String(cleanChatId);
              if (rawChatId.startsWith('-100')) {
                const subId = rawChatId.substring(4);
                link = `https://t.me/c/${subId}/${messageId}`;
              }
              task.telegramMessageLink = link;

              // Save order record to server/firestore
              try {
                await fetch(getApiUrl('/api/orders'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderId: task.orderId,
                    staffId: task.staffId,
                    stationId: task.stationId,
                    recordingStartedAt: task.recordingDate ? new Date(task.recordingDate).toISOString() : new Date().toISOString(),
                    recordingCompletedAt: new Date().toISOString(),
                    durationSeconds: task.durationSeconds,
                    recordingStatus: 'COMPLETED',
                    uploadStatus: 'SUCCESS',
                    telegramChatId: cleanChatId,
                    telegramMessageId: String(messageId),
                    telegramMessageLink: link
                  })
                });
              } catch (saveErr) {
                console.warn('Error saving order record after direct upload:', saveErr);
              }

              resolve();
            } else {
              reject(new Error(tgRes.description || 'Telegram API upload failed'));
            }
          } catch {
            reject(new Error('Failed to parse Telegram API response'));
          }
        } else {
          reject(new Error(`Telegram API returned HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during Telegram upload'));
      xhr.ontimeout = () => reject(new Error('Direct Telegram upload timed out'));

      xhr.open('POST', `https://api.telegram.org/bot${cleanToken}/sendVideo`, true);
      xhr.send(formData);
    });
  }

  private uploadTaskBinaryXHR(task: UploadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      const ext = 'mp4';

      formData.append('orderId', task.orderId);
      formData.append('staffId', task.staffId);
      formData.append('stationId', task.stationId);
      formData.append('durationSeconds', task.durationSeconds.toString());
      formData.append('recordingDate', task.recordingDate);
      formData.append('video', task.videoBlob, `${task.orderId}.${ext}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          task.progress = percentComplete;
          this.notify();
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.success && res.record) {
              task.telegramMessageLink = res.record.telegramMessageLink;
            }
            resolve();
          } catch {
            resolve();
          }
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            reject(new Error(res.error || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Server returned HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload request timed out'));

      const uploadEndpoint = getApiUrl('/api/telegram/upload');
      xhr.open('POST', uploadEndpoint, true);
      xhr.send(formData);
    });
  }

  private async uploadTaskBase64Fallback(task: UploadTask): Promise<void> {
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

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          if (data.record?.telegramMessageLink) {
            task.telegramMessageLink = data.record.telegramMessageLink;
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read video blob'));
    });
  }

  public getTasks() {
    return [...this.tasks];
  }
}

export const uploadQueueManager = new UploadQueueManager();
