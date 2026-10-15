import React, { useState, useEffect } from 'react';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { Upload, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';

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
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full font-sans animate-fadeIn">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl overflow-hidden border-t-2 border-t-emerald-500">
        
        {/* Banner Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {activeCount > 0 ? (
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <div>
              <span className="font-extrabold text-white block text-sm tracking-tight">
                {activeCount > 0 ? `Syncing Queue (${activeCount})` : failedCount > 0 ? `${failedCount} Upload Error` : 'All Evidence Dispatched'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {successCount} delivered · {activeCount} active · {failedCount} failed
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Task List */}
        {isExpanded && (
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/80 p-4 space-y-3 bg-slate-900/80">
            {tasks.map((task) => (
              <div key={task.id} className="pt-2 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">{task.orderId}</span>
                    <span className="text-[10px] text-slate-500 font-mono px-2 py-0.5 rounded bg-slate-800">{task.stationId}</span>
                  </div>
                  <span className="font-mono text-cyan-400 font-bold">
                    {task.status === 'UPLOADING' && `${task.progress}%`}
                    {task.status === 'QUEUED' && 'Queued'}
                    {task.status === 'SUCCESS' && 'Delivered'}
                    {task.status === 'FAILED' && 'Failed'}
                  </span>
                </div>

                {/* Live Progress Bar */}
                {task.status === 'UPLOADING' && (
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-200 shadow-sm"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}

                {task.status === 'FAILED' && (
                  <div className="flex items-center justify-between text-rose-400 text-[11px] pt-1">
                    <span className="truncate max-w-[200px]">{task.error || 'Upload error'}</span>
                    <button
                      onClick={() => uploadQueueManager.retryTask(task.id)}
                      className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded-lg border border-rose-500/30 cursor-pointer transition-colors"
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
                      className="inline-flex items-center gap-1.5 text-[11px] text-cyan-400 hover:underline font-bold"
                    >
                      <span>View in Telegram Channel</span>
                      <ExternalLink className="w-3.5 h-3.5" />
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
