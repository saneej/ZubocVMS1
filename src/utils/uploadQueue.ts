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
      // Primary: Base64 JSON upload via Server API (100% reliable across serverless & proxy environments)
      await this.uploadTaskBase64Json(nextTask);
      nextTask.status = 'SUCCESS';
      nextTask.progress = 100;
    } catch (err: any) {
      console.warn(`Base64 JSON upload failed for ${nextTask.orderId}, trying binary multipart fallback...`, err);
      try {
        await this.uploadTaskBinaryXHR(nextTask);
        nextTask.status = 'SUCCESS';
        nextTask.progress = 100;
      } catch (fallbackErr: any) {
        console.error(`Upload error for ${nextTask.orderId}:`, fallbackErr);
        nextTask.status = 'FAILED';
        nextTask.error = fallbackErr.message || 'Upload failed';
      }
    } finally {
      this.activeUploads--;
      this.notify();
      this.processQueue();
    }
  }

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
          let data: any;
          try {
            data = JSON.parse(rawText);
          } catch {
            throw new Error(`Server non-JSON response: ${rawText.slice(0, 100)}`);
          }

          if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          if (data.record?.telegramMessageLink) {
            task.telegramMessageLink = data.record.telegramMessageLink;
          }
          task.progress = 100;
          resolve();
        } catch (err: any) {
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
