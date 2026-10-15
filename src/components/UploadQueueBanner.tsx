import React, { useState, useEffect } from 'react';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { CheckCircle2, AlertCircle, RefreshCw, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';

export const UploadQueueBanner: React.FC = () => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const unsubscribe = uploadQueueManager.subscribe((newTasks) => {
      setTasks(newTasks);
    });
    return unsubscribe;
  }, []);

  if (tasks.length === 0) return null;

  const activeCount = tasks.filter(t => t.status === 'UPLOADING' || t.status === 'QUEUED').length;
  const failedCount = tasks.filter(t => t.status === 'FAILED').length;
  const successCount = tasks.filter(t => t.status === 'SUCCESS').length;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full font-mono animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden border-t-4 border-t-blue-600">
        
        {/* Banner Header */}
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {activeCount > 0 ? (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <div>
              <span className="font-extrabold text-slate-900 block tracking-tight">
                {activeCount > 0 ? `UPLOADING (${activeCount})` : failedCount > 0 ? `${failedCount} ERROR` : 'DISPATCH COMPLETE'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {successCount} delivered · {activeCount} active · {failedCount} failed
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg hover:bg-slate-200/60 text-slate-500 transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Task List */}
        {isExpanded && (
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-3 space-y-2 bg-white">
            {tasks.map((task) => (
              <div key={task.id} className="pt-2 text-xs space-y-1.5 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{task.orderId}</span>
                  </div>
                  <span className="text-blue-600 font-bold text-[11px]">
                    {task.status === 'UPLOADING' && `${task.progress}%`}
                    {task.status === 'QUEUED' && 'Queued'}
                    {task.status === 'SUCCESS' && 'Delivered'}
                    {task.status === 'FAILED' && 'Failed'}
                  </span>
                </div>

                {/* Progress Bar */}
                {task.status === 'UPLOADING' && (
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-200"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}

                {task.status === 'FAILED' && (
                  <div className="flex items-center justify-between text-rose-600 text-[10px] pt-1">
                    <span className="truncate max-w-[180px]">{task.error || 'Upload error'}</span>
                    <button
                      onClick={() => uploadQueueManager.retryTask(task.id)}
                      className="px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded border border-rose-200 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {task.status === 'SUCCESS' && task.telegramMessageLink && (
                  <div className="pt-0.5">
                    <a
                      href={task.telegramMessageLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-bold"
                    >
                      <span>View in Telegram</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};
