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

    // Remove old queued/failed task for same order if re-queued
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
      await this.uploadTaskBinaryXHR(nextTask);
      nextTask.status = 'SUCCESS';
      nextTask.progress = 100;
    } catch (err: any) {
      console.error(`Upload error for ${nextTask.orderId}:`, err);
      nextTask.status = 'FAILED';
      nextTask.error = err.message || 'Upload failed';
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
      formData.append('video', task.videoBlob, `${task.orderId}.webm`);

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

      xhr.onerror = () => {
        reject(new Error('Network connection error during upload'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out'));
      };

      xhr.open('POST', '/api/telegram/upload', true);
      xhr.send(formData);
    });
  }

  public getTasks() {
    return [...this.tasks];
  }
}

export const uploadQueueManager = new UploadQueueManager();
