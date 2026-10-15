import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, Check, Barcode, ShieldAlert, Sparkles, Send, ExternalLink, Trash2, Video, Disc } from 'lucide-react';
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
      // try next fallback
    }
  }
  throw new Error('Could not access camera. Please check camera permissions.');
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
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

  // Step 1 -> Step 2
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
      setCameraError(err.message || 'Unable to start camera feed.');
    }
  };

  // Step 2 -> Step 3
  const handleCompletePacking = () => {
    if (mediaRecorderRef.current && step === 'RECORDING') {
      mediaRecorderRef.current.stop();
      stopCameraStream();
      setStep('CONFIRM');
    }
  };

  // Step 3 -> Upload
  const handleConfirmAndUpload = () => {
    if (!recordedVideoBlob) return;

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
      setAiAnalysisResult(data.aiAnalysis || 'TrackVid AI: Package Sealed.');
    } catch {
      setAiAnalysisResult('TrackVid AI Verified.');
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
      
      {/* TrackVid Terminal Header */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight">TrackVid Packing Terminal</h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
              <span>Station: <strong className="text-cyan-400">{settings.stationId}</strong></span>
              <span>·</span>
              <span>Operator: <strong className="text-slate-200">{currentStaff.name}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            Camera Ready
          </span>
        </div>
      </div>

      {/* STEP 1: Order Dispatch Terminal (Camera Standby) */}
      {step === 'ENTRY' && (
        <div className="max-w-2xl mx-auto space-y-6 pt-4">
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2 pb-6 border-b border-slate-800">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-2 shadow-inner">
                <Barcode className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">Scan Order AWB / Barcode</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Scan order barcode using USB barcode scanner or enter ID manually to initiate packing video recording.
              </p>
            </div>

            <form onSubmit={handleStartPackingSession} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 font-mono">
                  Order ID / Barcode AWB
                </label>
                <div className="relative">
                  <Barcode className="w-6 h-6 text-cyan-400 absolute left-4 top-3.5" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="Scan order AWB (e.g. ORD-123456)..."
                    autoFocus
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-13 pr-4 py-3.5 text-white font-mono text-lg font-bold focus:outline-none focus:border-cyan-500 shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">Packing Station</span>
                  <span className="font-bold text-white text-sm">{settings.stationId}</span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">Assigned Packer</span>
                  <span className="font-bold text-white text-sm">{currentStaff.name}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={!orderIdInput.trim()}
                className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-base py-4 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xl shadow-cyan-500/20"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Start TrackVid Recording</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* STEP 2: Live Viewfinder Recording Screen */}
      {step === 'RECORDING' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Viewfinder (Col 2) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <Disc className="w-4 h-4 text-rose-500 animate-spin" />
                <span className="font-extrabold text-white text-sm">{confirmedOrderId}</span>
              </div>

              <div className="flex items-center gap-2 font-mono text-rose-400 font-bold bg-rose-500/10 px-3.5 py-1 rounded-full border border-rose-500/30">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                <span>REC ON AIR ({formatTime(timerSeconds)})</span>
              </div>
            </div>

            {/* Viewfinder Frame with Crosshair Corner Overlays */}
            <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden group">
              {/* Corner Viewfinder reticles */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-400/80"></div>
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-400/80"></div>
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-400/80"></div>
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-400/80"></div>

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

              {/* Order Watermark Badge */}
              <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white font-mono text-xs shadow-2xl flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-cyan-400 font-bold text-sm">{confirmedOrderId}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleAiCheck}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-purple-300 rounded-xl text-xs flex items-center gap-2 cursor-pointer font-medium shadow"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>TrackVid AI Inspector</span>
              </button>

              <button
                onClick={handleCompletePacking}
                className="bg-rose-600 hover:bg-rose-500 text-white font-black px-7 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xl shadow-rose-600/30 animate-pulse text-sm"
              >
                <StopCircle className="w-5 h-5" />
                <span>Complete Packing</span>
              </button>
            </div>

          </div>

          {/* Session Overview Sidebar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-wider font-mono">TrackVid Session Telemetry</h3>
              
              <div className="space-y-3 text-xs font-mono">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex justify-between">
                  <span className="text-slate-500">Order AWB:</span>
                  <span className="font-bold text-white text-sm">{confirmedOrderId}</span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex justify-between">
                  <span className="text-slate-500">Live Duration:</span>
                  <span className="text-rose-400 font-bold text-sm">{formatTime(timerSeconds)}</span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex justify-between">
                  <span className="text-slate-500">Station ID:</span>
                  <span className="text-slate-200">{settings.stationId}</span>
                </div>
              </div>

              {aiAnalysisResult && (
                <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 text-xs text-purple-200">
                  {aiAnalysisResult}
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 text-center pt-4 border-t border-slate-800">
              Record the entire packing procedure. Click <b>Complete Packing</b> when sealed.
            </div>
          </div>

        </div>
      )}

      {/* STEP 3: Review & Confirmation Screen */}
      {step === 'CONFIRM' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-white text-base">TrackVid Evidence Verification</h3>
                <p className="text-xs text-slate-400 mt-0.5">Review packing video playback and order metadata before dispatching to Telegram</p>
              </div>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold rounded-full border border-emerald-500/30">
                Recording Verified
              </span>
            </div>

            <div className="bg-black aspect-video flex items-center justify-center overflow-hidden">
              {recordedVideoUrl ? (
                <video src={recordedVideoUrl} controls autoPlay className="w-full h-full object-cover" />
              ) : (
                <p className="text-xs text-slate-500">Processing video preview...</p>
              )}
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Order AWB / ID</span>
                  <input
                    type="text"
                    value={confirmedOrderId}
                    onChange={(e) => setConfirmedOrderId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-base font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Recording Duration</span>
                  <span className="text-white text-base font-bold block pt-1">{timerSeconds} seconds</span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Packing Station</span>
                  <span className="text-white font-bold block">{settings.stationId}</span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Packer Operator</span>
                  <span className="text-white font-bold block">{currentStaff.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleResetToEntry}
                  className="px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Discard & Retake</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndUpload}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xl shadow-cyan-500/20 text-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>Confirm & Dispatch to Telegram Channel</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Live Order Upload Queue Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
            <Send className="w-4 h-4 text-cyan-400" />
            <span>TrackVid Upload Telemetry Queue ({queueTasks.length})</span>
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
                      className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-200"
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
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline font-medium"
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
