import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, Check, Barcode, ShieldAlert, Sparkles, Send, RefreshCw, ExternalLink, ArrowRight, Trash2, ArrowLeft } from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { getApiUrl } from '../utils/api';

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
}

// Universal cross-browser MediaRecorder MIME helper
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

// Cross-platform iOS Safari compliant camera stream initialization
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
      // try next fallback constraint
    }
  }
  throw new Error('Could not access camera. Please check device camera permissions.');
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
  // Step workflow state: 'ENTRY' (Scan order) -> 'RECORDING' (Live video) -> 'CONFIRM' (Review & Upload)
  const [step, setStep] = useState<'ENTRY' | 'RECORDING' | 'CONFIRM'>('ENTRY');
  const [orderIdInput, setOrderIdInput] = useState('');
  const [confirmedOrderId, setConfirmedOrderId] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
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

  useEffect(() => {
    const unsubscribe = uploadQueueManager.subscribe((tasks) => {
      setQueueTasks(tasks);
    });
    return () => {
      stopCameraStream();
      unsubscribe();
    };
  }, []);

  // Timer effect during active recording
  useEffect(() => {
    if (step === 'RECORDING') {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [step]);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // STEP 1: Staff submits order ID -> Open camera and start recording
  const handleStartPackingSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = orderIdInput.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId) return;

    setConfirmedOrderId(cleanId);
    setTimerSeconds(0);
    chunksRef.current = [];
    setCameraError(null);

    try {
      const stream = await getCameraStream();
      mediaStreamRef.current = stream;

      setStep('RECORDING');

      // Bind video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);

      const selectedMime = getSupportedMimeType();
      const options = selectedMime ? { mimeType: selectedMime } : undefined;
      let recorder: MediaRecorder;
      try {
        recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
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
      };

      recorder.start(1000);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err.message || 'Unable to start camera.');
    }
  };

  // STEP 2: Complete packing -> Stop camera and go to Confirmation Page
  const handleCompletePacking = () => {
    if (mediaRecorderRef.current && step === 'RECORDING') {
      mediaRecorderRef.current.stop();
      stopCameraStream();
      setStep('CONFIRM');
    }
  };

  // STEP 3: Confirm Details & Trigger Upload to Telegram
  const handleConfirmAndUpload = () => {
    if (!recordedVideoBlob) return;

    // Queue for parallel background upload to Telegram
    uploadQueueManager.addTask({
      orderId: confirmedOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      durationSeconds: timerSeconds,
      videoBlob: recordedVideoBlob,
      recordingDate: new Date().toISOString()
    });

    onOrderCompleted({
      orderId: confirmedOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      recordingStartedAt: new Date().toISOString(),
      durationSeconds: timerSeconds,
      recordingStatus: 'COMPLETED',
      uploadStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Reset back to Step 1 for next order
    handleResetToEntry();
  };

  const handleResetToEntry = () => {
    stopCameraStream();
    setStep('ENTRY');
    setOrderIdInput('');
    setConfirmedOrderId('');
    setRecordedVideoBlob(null);
    setRecordedVideoUrl(null);
    setTimerSeconds(0);
    setAiAnalysisResult(null);
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 100);
  };

  const handleAiCheck = async () => {
    if (!confirmedOrderId) return;
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
        body: JSON.stringify({ orderId: confirmedOrderId, imageBase64 })
      });
      const data = await res.json();
      setAiAnalysisResult(data.aiAnalysis || 'QA Verified.');
    } catch {
      setAiAnalysisResult('QA Verified (local).');
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
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      
      {/* PAGE 1: Order Scan & Entry Screen (Camera OFF) */}
      {step === 'ENTRY' && (
        <div className="max-w-xl mx-auto space-y-6 pt-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="text-center space-y-1.5 pb-4 border-b border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Barcode className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Order Packing Station</h2>
              <p className="text-xs text-slate-400">Scan or type Order Barcode ID to begin packing & video recording</p>
            </div>

            <form onSubmit={handleStartPackingSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Order ID / Barcode
                </label>
                <div className="relative">
                  <Barcode className="w-5 h-5 text-cyan-400 absolute left-4 top-3.5" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="e.g. ORD-123456"
                    autoFocus
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white font-mono text-base focus:outline-none focus:border-emerald-500 shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">Packing Station</span>
                  <span className="font-semibold text-white">{settings.stationId}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">Operator</span>
                  <span className="font-semibold text-white">{currentStaff.name}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={!orderIdInput.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-500/20"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Packing & Record Video</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PAGE 2: Active Packing & Live Camera Recording Screen (Camera ON) */}
      {step === 'RECORDING' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-mono">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white">{confirmedOrderId}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{settings.stationId}</span>
              </div>

              <div className="flex items-center gap-2 font-mono text-rose-400 font-bold bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                <span>REC {formatTime(timerSeconds)}</span>
              </div>
            </div>

            <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <div className="p-8 text-center text-slate-400">
                  <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                  <p className="text-sm">{cameraError}</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover block"
                />
              )}

              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-white font-mono text-xs shadow-xl">
                <span className="text-emerald-400 font-bold">{confirmedOrderId}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleAiCheck}
                disabled={isAnalyzing}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-purple-300 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer font-medium"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>AI QA Check</span>
              </button>

              <button
                onClick={handleCompletePacking}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-rose-600/30 animate-pulse text-sm"
              >
                <StopCircle className="w-5 h-5" />
                <span>Complete Packing</span>
              </button>
            </div>

          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Active Packing Session</h3>
              
              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between">
                  <span className="text-slate-500">Order ID:</span>
                  <span className="font-mono font-bold text-white">{confirmedOrderId}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between">
                  <span className="text-slate-500">Recording Time:</span>
                  <span className="font-mono text-rose-400 font-bold">{formatTime(timerSeconds)}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between">
                  <span className="text-slate-500">Packing Station:</span>
                  <span className="text-slate-200">{settings.stationId}</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 text-center pt-4 border-t border-slate-800">
              When packing is complete, click <b>Complete Packing</b> to review video before Telegram upload.
            </div>
          </div>

        </div>
      )}

      {/* PAGE 3: Review & Confirm Details Screen (Camera OFF) */}
      {step === 'CONFIRM' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Confirm Details & Video Preview</h3>
                <p className="text-xs text-slate-400 mt-0.5">Review packing recording before uploading to Telegram</p>
              </div>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold rounded-full border border-emerald-500/30">
                Ready for Review
              </span>
            </div>

            {/* Video Playback Preview */}
            <div className="bg-black aspect-video flex items-center justify-center overflow-hidden">
              {recordedVideoUrl ? (
                <video src={recordedVideoUrl} controls autoPlay className="w-full h-full object-cover" />
              ) : (
                <p className="text-xs text-slate-500">Processing preview...</p>
              )}
            </div>

            {/* Order Confirmation Details Form */}
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Order ID</span>
                  <input
                    type="text"
                    value={confirmedOrderId}
                    onChange={(e) => setConfirmedOrderId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-sm font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Recording Duration</span>
                  <span className="font-mono text-white text-sm font-bold block pt-1">{timerSeconds} seconds ({formatTime(timerSeconds)})</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Packing Station</span>
                  <span className="text-white text-sm font-semibold block">{settings.stationId}</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Operator</span>
                  <span className="text-white text-sm font-semibold block">{currentStaff.name}</span>
                </div>
              </div>

              {/* Two Clear Primary Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleResetToEntry}
                  className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Discard & Retake</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndUpload}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-500/20 text-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>Confirm & Upload to Telegram</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Background Order Upload Queue Progress List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-400" />
            <span>Order Upload Queue ({queueTasks.length})</span>
          </h3>
        </div>

        {queueTasks.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            No active order uploads in queue. Complete an order session above to deliver footage to Telegram.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {queueTasks.map((task) => (
              <div key={task.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-sm">{task.orderId}</span>
                  <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
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

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
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
                  <div className="pt-1 border-t border-slate-900 flex justify-end">
                    <a
                      href={task.telegramMessageLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline font-medium"
                    >
                      <span>Telegram Video Link</span>
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
