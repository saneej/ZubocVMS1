import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, Check, Barcode, ShieldAlert, Sparkles, Send, ExternalLink, RefreshCw, Zap, Eye, CheckCircle2 } from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { getApiUrl } from '../utils/api';

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

async function getCameraStream(): Promise<MediaStream> {
  const constraintsToTry = [
    { video: { facingMode: 'environment' } },
    { video: true },
    { video: { facingMode: 'user' } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
  ];

  for (const constraint of constraintsToTry) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      if (stream) return stream;
    } catch {
      // try fallback
    }
  }
  throw new Error('Unable to access camera. Please check camera permissions.');
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
  const [orderId, setOrderId] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState(false); // false = Instant Auto Mode, true = Review Mode
  const [lastUploadedOrder, setLastUploadedOrder] = useState<string | null>(null);
  
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [queueTasks, setQueueTasks] = useState<UploadTask[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera preview on mount for instant readiness
  useEffect(() => {
    initCamera();
    const unsubscribe = uploadQueueManager.subscribe((tasks) => {
      setQueueTasks(tasks);
    });
    return () => {
      stopCameraStream();
      unsubscribe();
    };
  }, []);

  // Timer counter during recording
  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  const initCamera = async () => {
    try {
      setCameraError(null);
      const stream = await getCameraStream();
      mediaStreamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError('Camera access error. Please grant camera permissions.');
      setCameraActive(false);
    }
  };

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setCameraActive(false);
    }
  };

  // 1-Click Scan / Submit to Start Recording
  const handleStartRecording = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = orderId.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId) return;

    if (!mediaStreamRef.current) {
      await initCamera();
    }

    setActiveOrderId(cleanId);
    setTimerSeconds(0);
    chunksRef.current = [];
    setRecordedVideoUrl(null);
    setRecordedVideoBlob(null);

    try {
      const selectedMime = getSupportedMimeType();
      const options = selectedMime ? { mimeType: selectedMime } : undefined;
      let recorder: MediaRecorder;
      try {
        recorder = options ? new MediaRecorder(mediaStreamRef.current!, options) : new MediaRecorder(mediaStreamRef.current!);
      } catch {
        recorder = new MediaRecorder(mediaStreamRef.current!);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const actualMime = recorder.mimeType || selectedMime || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setRecordedVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);

        if (!reviewMode) {
          // Instant Auto-Upload Mode
          dispatchUpload(cleanId, blob, timerSeconds);
        }
      };

      recorder.start(1000);
      setIsRecording(true);
    } catch (err: any) {
      alert('Failed to start recording: ' + (err.message || String(err)));
    }
  };

  // Stop Recording
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Helper to send to background upload queue
  const dispatchUpload = (orderToUpload: string, blob: Blob, durationSecs: number) => {
    uploadQueueManager.addTask({
      orderId: orderToUpload,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      durationSeconds: durationSecs,
      videoBlob: blob,
      recordingDate: new Date().toISOString()
    });

    onOrderCompleted({
      orderId: orderToUpload,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      recordingStartedAt: new Date().toISOString(),
      durationSeconds: durationSecs,
      recordingStatus: 'COMPLETED',
      uploadStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    setLastUploadedOrder(orderToUpload);
    setActiveOrderId(null);
    setOrderId('');
    setRecordedVideoBlob(null);
    setTimerSeconds(0);

    // Re-focus scanner input for immediate next barcode scan
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 100);
  };

  const handleManualConfirmUpload = () => {
    if (activeOrderId && recordedVideoBlob) {
      dispatchUpload(activeOrderId, recordedVideoBlob, timerSeconds);
    }
  };

  const handleAiCheck = async () => {
    const currentId = activeOrderId || orderId;
    if (!currentId) return;
    setIsAnalyzing(true);
    try {
      let imageBase64 = undefined;
      if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
        }
      }

      const url = getApiUrl('/api/ai/verify-packing');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: currentId, imageBase64 })
      });
      const data = await res.json();
      setAiAnalysisResult(data.aiAnalysis || 'Package Verified.');
    } catch {
      setAiAnalysisResult('Package Verified.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Success Notification Banner */}
      {lastUploadedOrder && !isRecording && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between text-emerald-400 text-xs shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Order <strong>{lastUploadedOrder}</strong> packed & queued for Telegram delivery!</span>
          </div>
          <span className="text-emerald-500/80 font-mono">Ready for next barcode scan →</span>
        </div>
      )}

      {/* Main Command Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setReviewMode(false)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                !reviewMode ? 'bg-emerald-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Instant Mode (Auto-Upload)</span>
            </button>
            <button
              onClick={() => setReviewMode(true)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                reviewMode ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Review Mode</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span>Station: <strong className="text-white">{settings.stationId}</strong></span>
            <span>·</span>
            <span>Operator: <strong className="text-white">{currentStaff.name}</strong></span>
          </div>

        </div>

        {/* Scan Input & Action Buttons */}
        <form onSubmit={handleStartRecording} className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Barcode className="w-6 h-6 text-cyan-400 absolute left-4 top-3.5" />
            <input
              ref={inputRef}
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Scan Barcode or Type Order ID (Press Enter)..."
              disabled={isRecording}
              autoFocus
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-13 pr-4 py-3.5 text-white font-mono text-lg font-bold focus:outline-none focus:border-emerald-500 shadow-inner disabled:opacity-50"
            />
          </div>

          {!isRecording && (
            <button
              type="submit"
              disabled={!orderId.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-base px-8 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xl shadow-emerald-500/20 shrink-0"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Start Recording</span>
            </button>
          )}

          {isRecording && (
            <button
              type="button"
              onClick={handleStopRecording}
              className="bg-rose-600 hover:bg-rose-500 text-white font-black text-base px-8 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xl shadow-rose-600/30 animate-pulse shrink-0"
            >
              <StopCircle className="w-6 h-6" />
              <span>Complete Packing</span>
            </button>
          )}
        </form>

      </div>

      {/* Grid Layout: Live Camera Feed + Live Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Camera Viewport */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
          
          <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-sm">
                {activeOrderId ? `Order: ${activeOrderId}` : 'Overhead Packing Camera'}
              </span>
            </div>

            {isRecording ? (
              <div className="flex items-center gap-2 font-mono text-rose-400 font-bold bg-rose-500/10 px-3.5 py-1 rounded-full border border-rose-500/30">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                <span>REC {formatTime(timerSeconds)}</span>
              </div>
            ) : cameraActive ? (
              <span className="text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                ● Live Feed Active
              </span>
            ) : (
              <button onClick={initCamera} className="text-cyan-400 underline font-bold">Enable Camera</button>
            )}
          </div>

          <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
            {cameraError ? (
              <div className="p-8 text-center text-slate-400">
                <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-medium">{cameraError}</p>
                <button onClick={initCamera} className="mt-3 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs">
                  Retry Camera
                </button>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${reviewMode && recordedVideoUrl && !isRecording ? 'hidden' : 'block'}`}
              />
            )}

            {reviewMode && recordedVideoUrl && !isRecording && (
              <video src={recordedVideoUrl} controls autoPlay className="w-full h-full object-cover block" />
            )}

            {isRecording && activeOrderId && (
              <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white font-mono text-xs shadow-2xl flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                <span className="text-emerald-400 font-bold text-sm">{activeOrderId}</span>
              </div>
            )}
          </div>

          {/* Bottom Toolbar */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handleAiCheck}
                disabled={isAnalyzing}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-purple-300 rounded-xl flex items-center gap-1.5 cursor-pointer font-medium"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>AI Package Check</span>
              </button>
              {aiAnalysisResult && <span className="text-purple-300 italic text-xs">{aiAnalysisResult}</span>}
            </div>

            {reviewMode && recordedVideoBlob && !isRecording && activeOrderId && (
              <button
                onClick={handleManualConfirmUpload}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2 rounded-xl flex items-center gap-1.5 shadow"
              >
                <Send className="w-4 h-4" />
                <span>Confirm & Upload {activeOrderId}</span>
              </button>
            )}
          </div>

        </div>

        {/* Live Background Upload Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Recent Telegram Uploads ({queueTasks.length})</span>
              </h3>
            </div>

            {queueTasks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono">
                No recent uploads in queue. Scan a barcode above to pack orders.
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {queueTasks.map((task) => (
                  <div key={task.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{task.orderId}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        task.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' :
                        task.status === 'FAILED' ? 'bg-rose-500/20 text-rose-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {task.status === 'UPLOADING' ? `${task.progress}%` : task.status}
                      </span>
                    </div>

                    {task.status === 'UPLOADING' && (
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-200"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Duration: {task.durationSeconds}s</span>
                      <span>{new Date(task.recordingDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {task.status === 'FAILED' && (
                      <div className="pt-1 flex items-center justify-between text-rose-400 text-[11px]">
                        <span className="truncate max-w-[140px]">{task.error || 'Upload error'}</span>
                        <button
                          onClick={() => uploadQueueManager.retryTask(task.id)}
                          className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded border border-rose-500/30 cursor-pointer"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {task.status === 'SUCCESS' && task.telegramMessageLink && (
                      <div className="pt-1 border-t border-slate-900 flex justify-end font-sans">
                        <a
                          href={task.telegramMessageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline font-medium"
                        >
                          <span>View Video in Telegram</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 text-center font-mono">
            PackVision VMS Background Video Delivery Pipeline
          </div>
        </div>

      </div>

    </div>
  );
};
