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
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full font-mono animate-fadeIn">
      <div className="bg-[#0e111a]/95 backdrop-blur-md border border-[#222c3f] rounded-2xl shadow-2xl overflow-hidden border-t-2 border-t-emerald-500">
        
        {/* Banner Header */}
        <div className="bg-[#06080d] px-4 py-3 border-b border-[#1f2738] flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {activeCount > 0 ? (
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <div>
              <span className="font-extrabold text-white block tracking-tight">
                {activeCount > 0 ? `DISPATCH QUEUE (${activeCount})` : failedCount > 0 ? `${failedCount} UPLOAD ERROR` : 'ALL EVIDENCE DISPATCHED'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {successCount} delivered · {activeCount} active · {failedCount} failed
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-7 h-7 rounded-lg bg-[#161c2b] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Task List */}
        {isExpanded && (
          <div className="max-h-60 overflow-y-auto divide-y divide-[#1b2232] p-3 space-y-2 bg-[#090c14]">
            {tasks.map((task) => (
              <div key={task.id} className="pt-2 text-xs space-y-1.5 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{task.orderId}</span>
                    <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-[#151c29]">{task.stationId}</span>
                  </div>
                  <span className="text-emerald-400 font-bold text-[11px]">
                    {task.status === 'UPLOADING' && `${task.progress}%`}
                    {task.status === 'QUEUED' && 'Queued'}
                    {task.status === 'SUCCESS' && 'Delivered'}
                    {task.status === 'FAILED' && 'Failed'}
                  </span>
                </div>

                {/* Progress Bar */}
                {task.status === 'UPLOADING' && (
                  <div className="w-full bg-[#050608] h-1.5 rounded-full overflow-hidden border border-[#1b2232]">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}

                {task.status === 'FAILED' && (
                  <div className="flex items-center justify-between text-rose-400 text-[10px] pt-1">
                    <span className="truncate max-w-[180px]">{task.error || 'Upload error'}</span>
                    <button
                      onClick={() => uploadQueueManager.retryTask(task.id)}
                      className="px-2.5 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded border border-rose-500/30 cursor-pointer"
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
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline font-bold"
                    >
                      <span>Open Telegram Post</span>
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
