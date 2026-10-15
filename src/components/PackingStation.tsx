import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, CheckCircle2, Barcode, Send, ExternalLink, RefreshCw, AlertCircle, RotateCcw, PackageCheck, ShieldCheck, Check, Volume2, Mic, Maximize2, Zap, Layers, Sparkles, AlertTriangle } from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { safeFetchJson } from '../utils/api';

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
}

type StationStep = 'READY' | 'SCAN' | 'RECORDING' | 'CONFIRM';

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const type of types) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch {
      // ignore mime syntax exceptions
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
  throw new Error('Overhead webcam stream unavailable. Please check camera connection and browser permissions.');
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
  const [step, setStep] = useState<StationStep>('SCAN');
  const [orderIdInput, setOrderIdInput] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [queueTasks, setQueueTasks] = useState<UploadTask[]>([]);
  
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
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
      console.error('Camera initialization error:', err);
      setCameraError('Webcam stream error: Please ensure USB overhead camera is connected.');
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

  // Keyboard hotkeys for fast operator throughput
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (step === 'RECORDING' && e.code === 'Space') {
        e.preventDefault();
        handleStopRecording();
      }
      if (step === 'CONFIRM' && e.code === 'Enter') {
        e.preventDefault();
        handleFinalConfirmUpload();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, activeOrderId, recordedBlob, isRecording]);

  // Step 2 -> Step 3
  const handleConfirmOrderAndStartRecording = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = orderIdInput.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId) return;

    setActiveOrderId(cleanId);
    setTimerSeconds(0);
    chunksRef.current = [];
    setRecordedVideoUrl(null);
    setRecordedBlob(null);

    if (!mediaStreamRef.current) {
      await initCamera();
    } else if (videoRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }

    try {
      const selectedMime = getSupportedMimeType();
      const candidateMimes = [
        selectedMime,
        'video/mp4',
        'video/webm',
        ''
      ].filter((m, idx, arr) => m !== undefined && arr.indexOf(m) === idx);

      let recorder: MediaRecorder | null = null;
      for (const mime of candidateMimes) {
        try {
          const options = mime ? { mimeType: mime } : undefined;
          recorder = options ? new MediaRecorder(mediaStreamRef.current!, options) : new MediaRecorder(mediaStreamRef.current!);
          if (recorder) break;
        } catch {
          // try next mime
        }
      }

      if (!recorder) {
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
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        stopCameraStream();
        setStep('CONFIRM');
      };

      recorder.start(1000);
      setIsRecording(true);
      setStep('RECORDING');
    } catch (err: any) {
      alert('Failed to start webcam recording: ' + (err.message || String(err)));
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFinalConfirmUpload = () => {
    if (!activeOrderId || !recordedBlob) return;

    uploadQueueManager.addTask({
      orderId: activeOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      durationSeconds: timerSeconds,
      videoBlob: recordedBlob,
      recordingDate: new Date().toISOString()
    });

    onOrderCompleted({
      orderId: activeOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      recordingStartedAt: new Date().toISOString(),
      durationSeconds: timerSeconds,
      recordingStatus: 'COMPLETED',
      uploadStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    setLastCompletedOrder(activeOrderId);
    setActiveOrderId('');
    setOrderIdInput('');
    setRecordedBlob(null);
    setRecordedVideoUrl(null);
    setTimerSeconds(0);
    setStep('SCAN');

    setTimeout(() => {
      if (scanInputRef.current) scanInputRef.current.focus();
    }, 150);
  };

  const handleReRecord = () => {
    setRecordedBlob(null);
    setRecordedVideoUrl(null);
    setTimerSeconds(0);
    setStep('SCAN');
    setTimeout(() => {
      if (scanInputRef.current) scanInputRef.current.focus();
    }, 100);
  };

  const handleTestTelegram = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await safeFetchJson('/api/telegram/test-connection', { method: 'POST' });
      if (res && res.success) {
        setTestResult({ success: true, message: 'Test message dispatched to Telegram channel!' });
      } else {
        setTestResult({ success: false, message: res?.error || 'Failed to dispatch test message.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Telegram connection failed.' });
    } finally {
      setTestSending(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const todayCount = existingOrders.filter(o => 
    new Date(o.createdAt).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fadeIn font-sans">
      
      {/* Top Station Status Banner */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-400 font-mono font-bold shadow-inner">
            <PackageCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-white font-mono tracking-tight">PACKING TERMINAL</h1>
              <span className="px-2.5 py-0.5 rounded bg-[#181f2f] text-cyan-400 font-mono text-xs font-bold border border-[#27334a]">
                {settings.stationId || 'Packing-01'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              OPERATOR: <strong className="text-slate-200">{currentStaff.name}</strong> ({currentStaff.id})
            </p>
          </div>
        </div>

        {/* Workflow Step Tracker */}
        <div className="hidden md:flex items-center gap-2 font-mono text-xs bg-[#090b10] px-4 py-2 rounded-xl border border-[#1a2130]">
          <span className={`px-2 py-0.5 rounded font-bold ${step === 'SCAN' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500'}`}>01 SCAN</span>
          <span className="text-slate-700">→</span>
          <span className={`px-2 py-0.5 rounded font-bold ${step === 'RECORDING' ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-500'}`}>02 RECORD</span>
          <span className="text-slate-700">→</span>
          <span className={`px-2 py-0.5 rounded font-bold ${step === 'CONFIRM' ? 'bg-cyan-500 text-slate-950' : 'text-slate-500'}`}>03 DISPATCH</span>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <button
            onClick={handleTestTelegram}
            disabled={testSending}
            className="px-3.5 py-2 bg-[#161c2b] hover:bg-[#1f273b] disabled:opacity-50 text-slate-200 font-semibold rounded-xl border border-[#263249] flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Send className={`w-3.5 h-3.5 text-cyan-400 ${testSending ? 'animate-bounce' : ''}`} />
            <span>{testSending ? 'Pinging...' : 'PING BOT GATEWAY'}</span>
          </button>

          <div className="px-3.5 py-2 bg-[#08090d] border border-[#1d2536] rounded-xl text-slate-400">
            <span>PACKED TODAY: <strong className="text-emerald-400 font-bold text-sm">{todayCount}</strong></span>
          </div>
        </div>
      </div>

      {/* Test Result Banner */}
      {testResult && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-mono animate-fadeIn ${
          testResult.success 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
          <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* WORKSTATION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Workstation Viewport & Scanning Console (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">

          {/* STEP 1: SCAN ORDER AWB BARCODE */}
          {step === 'SCAN' && (
            <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl space-y-5">
              
              {lastCompletedOrder && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs text-emerald-300 font-mono">
                  <div className="flex items-center gap-2.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Order <strong className="text-white">{lastCompletedOrder}</strong> recorded and queued for Telegram delivery!</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-b border-[#1b2232] pb-3">
                <h2 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Barcode className="w-5 h-5 text-emerald-400" />
                  <span>STEP 01: SCAN BARCODE / ENTER ORDER ID</span>
                </h2>
                <span className="text-[11px] font-mono text-slate-500">Fast Scanner Listening...</span>
              </div>

              <form onSubmit={handleConfirmOrderAndStartRecording} className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-4 text-emerald-400 font-mono text-lg font-extrabold flex items-center gap-1">
                    <Barcode className="w-6 h-6" />
                  </div>
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="Scan AWB Barcode or Type Order ID (e.g. ORD-98214)..."
                    autoFocus
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full bg-[#06080c] border-2 border-[#222c3f] focus:border-emerald-500 rounded-xl pl-14 pr-4 py-4 text-white font-mono text-xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-500/10 shadow-inner transition-all"
                  />
                  {orderIdInput && (
                    <button
                      type="button"
                      onClick={() => setOrderIdInput('')}
                      className="absolute right-4 top-4 text-xs font-mono bg-[#1a2233] text-slate-400 hover:text-white px-2 py-1 rounded"
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between pt-2 gap-4">
                  <div className="text-xs font-mono text-slate-500 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Press <kbd className="px-2 py-0.5 bg-[#182030] text-slate-200 rounded border border-[#2a3854]">ENTER</kbd> to trigger overhead camera recording</span>
                  </div>

                  <button
                    type="submit"
                    disabled={!orderIdInput.trim()}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs px-8 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-500/20 uppercase tracking-wider font-mono"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>START CAMERA & RECORD</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 2: LIVE HUD OVERHEAD CAMERA RECORDING */}
          {step === 'RECORDING' && (
            <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
              
              {/* HUD Header */}
              <div className="bg-[#06080d] px-5 py-3 border-b border-[#1a2130] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-3 text-white font-bold">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>PACKING ORDER: <strong className="text-emerald-400">{activeOrderId}</strong></span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 hidden sm:inline-block">1080p WebCam @ 30fps</span>
                  <div className="flex items-center gap-2 font-mono text-rose-400 font-bold bg-rose-500/10 px-3.5 py-1 rounded-full border border-rose-500/30">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 led-rose animate-ping"></span>
                    <span>REC {formatTime(timerSeconds)}</span>
                  </div>
                </div>
              </div>

              {/* Viewport Box with HUD Reticles */}
              <div className="relative bg-[#020305] aspect-video flex items-center justify-center overflow-hidden border-b border-[#1a2130]">
                
                {/* HUD Camera Corners */}
                <div className="hud-corner-tl"></div>
                <div className="hud-corner-tr"></div>
                <div className="hud-corner-bl"></div>
                <div className="hud-corner-br"></div>

                {/* Package Alignment Guideline Box */}
                <div className="absolute inset-12 border border-dashed border-emerald-500/30 rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="text-[10px] font-mono text-emerald-500/50 uppercase tracking-widest bg-[#06080d]/80 px-3 py-1 rounded border border-emerald-500/20">
                    PLACE BOX HERE UNDER OVERHEAD CAMERA
                  </span>
                </div>

                {cameraError ? (
                  <div className="p-8 text-center text-slate-400 max-w-md">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                    <p className="text-xs font-mono mb-4">{cameraError}</p>
                    <button onClick={initCamera} className="px-5 py-2.5 bg-[#182133] hover:bg-[#222e47] text-white rounded-xl text-xs font-mono font-bold cursor-pointer">
                      Retry Overhead Camera
                    </button>
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

                {/* Active HUD Telemetry Banner */}
                <div className="absolute top-4 left-4 bg-[#080b12]/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-white/10 text-white font-mono text-xs shadow-2xl flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="text-emerald-400 font-bold">{activeOrderId}</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-300">{formatTime(timerSeconds)}</span>
                </div>
              </div>

              {/* Control Bar */}
              <div className="p-4 bg-[#06080d] flex items-center justify-between font-mono">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Audio/Video capture active · Press <kbd className="px-1.5 py-0.5 bg-[#161d2b] text-slate-200 rounded border border-[#27344e]">SPACE</kbd> to stop</span>
                </div>
                
                <button
                  onClick={handleStopRecording}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-black text-xs px-8 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-rose-600/30 uppercase tracking-wider font-mono"
                >
                  <StopCircle className="w-5 h-5" />
                  <span>STOP & REVIEW PACKING</span>
                </button>
              </div>

            </div>
          )}

          {/* STEP 3: DISPATCH & VERIFICATION CONFIRMATION */}
          {step === 'CONFIRM' && (
            <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl space-y-6">
              
              <div className="flex items-center justify-between pb-3 border-b border-[#1b2232]">
                <h2 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>STEP 03: VERIFY EVIDENCE & DISPATCH TO TELEGRAM</span>
                </h2>
                <span className="text-xs font-mono text-slate-400">Press <kbd className="px-2 py-0.5 bg-[#182030] text-slate-200 rounded">ENTER</kbd> to Dispatch</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Recorded Video Review Player */}
                <div className="bg-black rounded-xl overflow-hidden border border-[#1a2233] aspect-video flex items-center justify-center relative">
                  {recordedVideoUrl ? (
                    <video
                      ref={reviewVideoRef}
                      src={recordedVideoUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-slate-500 font-mono">Video recording preview unavailable</span>
                  )}
                </div>

                {/* Evidence Metadata Fields */}
                <div className="bg-[#06080d] border border-[#1a2130] rounded-xl p-5 space-y-4 text-xs font-mono">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">VERIFIED ORDER ID</label>
                    <input
                      type="text"
                      value={activeOrderId}
                      onChange={(e) => setActiveOrderId(e.target.value)}
                      className="w-full bg-[#0d111a] border border-[#222c3f] rounded-lg px-3 py-2 text-white font-bold text-base focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">CLIP DURATION</span>
                      <span className="text-white font-bold text-sm">{formatTime(timerSeconds)} ({timerSeconds}s)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">PACKING STATION</span>
                      <span className="text-white font-bold text-sm">{settings.stationId || 'Packing-01'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">OPERATOR</span>
                      <span className="text-white font-bold text-sm">{currentStaff.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">TARGET CHANNEL</span>
                      <span className="text-emerald-400 font-bold text-xs truncate block">{settings.telegramChatId || 'Telegram Channel'}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 font-mono">
                <button
                  onClick={handleReRecord}
                  className="px-5 py-3 bg-[#161c2b] hover:bg-[#1f273b] text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer border border-[#222c3e]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>DISCARD & RE-RECORD</span>
                </button>

                <button
                  onClick={handleFinalConfirmUpload}
                  className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-wider"
                >
                  <Send className="w-4 h-4" />
                  <span>DISPATCH TO TELEGRAM GATEWAY</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Right Panel: Live Telegram Queue & Pipeline Status */}
        <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1c2333]">
              <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>TELEGRAM DISPATCH QUEUE ({queueTasks.length})</span>
              </h3>
            </div>

            {queueTasks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono">
                No videos in active dispatch pipeline.
              </div>
            ) : (
              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {queueTasks.map((task) => (
                  <div key={task.id} className="bg-[#06080d] p-3.5 rounded-xl border border-[#1a2130] space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-white text-sm">{task.orderId}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        task.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        task.status === 'FAILED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {task.status === 'UPLOADING' ? `${task.progress}%` : task.status}
                      </span>
                    </div>

                    {task.status === 'UPLOADING' && (
                      <div className="w-full bg-[#121722] h-2 rounded-full overflow-hidden border border-[#21293a]">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-200"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Length: {task.durationSeconds}s</span>
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
                      <div className="pt-1 border-t border-[#121824] flex justify-end">
                        <a
                          href={task.telegramMessageLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline font-semibold"
                        >
                          <span>Open in Telegram</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#1c2333] text-[10px] text-slate-500 text-center font-mono">
            AUTOMATED DISPATCH PIPELINE ACTIVE
          </div>
        </div>

      </div>

    </div>
  );
};
