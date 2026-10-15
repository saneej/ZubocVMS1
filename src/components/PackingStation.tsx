import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, CheckCircle2, Barcode, Send, ExternalLink, RefreshCw, AlertCircle, ArrowLeft, RotateCcw, PackageCheck, ShieldCheck, Check } from 'lucide-react';
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
  throw new Error('Unable to access overhead camera. Please check camera permissions.');
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
  const [step, setStep] = useState<StationStep>('READY');
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
      setCameraError('Camera access error. Please ensure USB webcam is connected and permissions are granted.');
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

  // Step 1 -> Step 2
  const handleStartSession = () => {
    setStep('SCAN');
    setTimeout(() => {
      if (scanInputRef.current) scanInputRef.current.focus();
    }, 100);
  };

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

    // Initialize camera stream when entering recording step
    if (!mediaStreamRef.current) {
      await initCamera();
    } else if (videoRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }

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

  // Stop recording -> Trigger onstop -> Step 4 Confirmation
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Step 4: Confirm details & Send to Telegram
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

  // Re-record
  const handleReRecord = () => {
    setRecordedBlob(null);
    setRecordedVideoUrl(null);
    setTimerSeconds(0);
    setStep('SCAN');
    setTimeout(() => {
      if (scanInputRef.current) scanInputRef.current.focus();
    }, 100);
  };

  // Test Telegram connection
  const handleTestTelegram = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await safeFetchJson('/api/telegram/test-connection', { method: 'POST' });
      if (res && res.success) {
        setTestResult({ success: true, message: 'Test message sent to Telegram channel!' });
      } else {
        setTestResult({ success: false, message: res?.error || 'Failed to send test message.' });
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
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>TrackVid VMS Packing Station</span>
              <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {settings.stationId}
              </span>
            </h1>
            <p className="text-xs text-slate-400">Operator: <strong className="text-slate-200">{currentStaff.name}</strong> ({currentStaff.id})</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={handleTestTelegram}
            disabled={testSending}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Send className={`w-3.5 h-3.5 text-cyan-400 ${testSending ? 'animate-bounce' : ''}`} />
            <span>{testSending ? 'Testing...' : 'Test Telegram Connection'}</span>
          </button>

          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-400">
            <span>Packed Today: <strong className="text-emerald-400">{todayCount}</strong></span>
          </div>
        </div>
      </div>

      {/* Test Result Toast */}
      {testResult && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn ${
          testResult.success 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
          <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white font-bold">×</button>
        </div>
      )}

      {/* STEP 1: READY / WELCOME SCREEN */}
      {step === 'READY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 shadow-2xl text-center space-y-6 max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto text-emerald-400 shadow-xl">
            <Camera className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">Overhead Video Recording System</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Ready to record e-commerce order packing video evidence. Scanned orders will be recorded and dispatched to Telegram.
            </p>
          </div>

          <div className="pt-4 flex justify-center">
            <button
              onClick={handleStartSession}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base px-10 py-4 rounded-xl flex items-center gap-3 cursor-pointer shadow-xl shadow-emerald-500/20 transition-all transform hover:scale-105"
            >
              <Barcode className="w-6 h-6" />
              <span>Start Packing Session</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN RECORDING / SCAN / CONFIRM WORKFLOW */}
      {(step === 'SCAN' || step === 'RECORDING' || step === 'CONFIRM') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Left Panel (2 Columns) */}
          <div className="lg:col-span-2 space-y-6">

            {/* STEP 2: SCAN ORDER ID */}
            {step === 'SCAN' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                
                {lastCompletedOrder && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-400">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Order <strong>{lastCompletedOrder}</strong> recorded & queued for Telegram delivery!</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Barcode className="w-5 h-5 text-emerald-400" />
                    <span>Step 1 of 3: Scan or Enter Order ID</span>
                  </h2>
                  <button onClick={() => setStep('READY')} className="text-xs text-slate-400 hover:text-slate-200">
                    Exit Session
                  </button>
                </div>

                <form onSubmit={handleConfirmOrderAndStartRecording} className="space-y-4">
                  <div className="relative">
                    <Barcode className="w-7 h-7 text-emerald-400 absolute left-4 top-4" />
                    <input
                      ref={scanInputRef}
                      type="text"
                      value={orderIdInput}
                      onChange={(e) => setOrderIdInput(e.target.value)}
                      placeholder="Scan Barcode or Type Order ID (e.g. ORD-98214)..."
                      autoFocus
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-14 pr-4 py-4 text-white font-mono text-xl font-bold focus:outline-none focus:border-emerald-500 shadow-inner"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-slate-500 font-mono">
                      Station: {settings.stationId} | Operator: {currentStaff.id}
                    </div>

                    <button
                      type="submit"
                      disabled={!orderIdInput.trim()}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-sm px-8 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xl shadow-emerald-500/20"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      <span>Confirm & Start Recording</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STEP 3: LIVE CAMERA RECORDING */}
            {step === 'RECORDING' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Packing Order: <span className="text-emerald-400">{activeOrderId}</span></span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-rose-400 font-bold bg-rose-500/10 px-3.5 py-1 rounded-full border border-rose-500/30">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span>REC {formatTime(timerSeconds)}</span>
                  </div>
                </div>

                <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
                  {cameraError ? (
                    <div className="p-8 text-center text-slate-400">
                      <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
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
                      className="w-full h-full object-cover block"
                    />
                  )}

                  <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white font-mono text-xs shadow-2xl flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span className="text-emerald-400 font-bold text-sm">{activeOrderId}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">Pack items into box under overhead camera...</span>
                  
                  <button
                    onClick={handleStopRecording}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-black text-base px-8 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xl shadow-rose-600/30 animate-pulse"
                  >
                    <StopCircle className="w-6 h-6" />
                    <span>Complete Packing & Stop Recording</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: DETAILS CONFIRMATION BEFORE UPLOAD */}
            {step === 'CONFIRM' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span>Step 3 of 3: Confirm Order Details Before Telegram Dispatch</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Video Review Player */}
                  <div className="bg-black rounded-xl overflow-hidden border border-slate-800 aspect-video flex items-center justify-center">
                    {recordedVideoUrl ? (
                      <video
                        ref={reviewVideoRef}
                        src={recordedVideoUrl}
                        controls
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">Video preview non-available</span>
                    )}
                  </div>

                  {/* Summary Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs font-mono">
                    <div className="space-y-1">
                      <span className="text-slate-500 block">ORDER ID</span>
                      <input
                        type="text"
                        value={activeOrderId}
                        onChange={(e) => setActiveOrderId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold text-base focus:border-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <span className="text-slate-500 block">DURATION</span>
                        <span className="text-white font-bold text-sm">{formatTime(timerSeconds)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">STATION</span>
                        <span className="text-white font-bold text-sm">{settings.stationId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">OPERATOR</span>
                        <span className="text-white font-bold text-sm">{currentStaff.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">DISPATCH TO</span>
                        <span className="text-emerald-400 font-bold text-xs truncate block">{settings.telegramChatId || 'Telegram Channel'}</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Confirm Buttons */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    onClick={handleReRecord}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Discard & Re-Record</span>
                  </button>

                  <button
                    onClick={handleFinalConfirmUpload}
                    className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm rounded-xl flex items-center gap-2 cursor-pointer shadow-xl shadow-emerald-500/20 transition-all"
                  >
                    <Send className="w-4 h-4" />
                    <span>Confirm Details & Dispatch to Telegram</span>
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* Right Panel: Recent Telegram Upload Queue & Progress */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <Send className="w-4 h-4 text-emerald-400" />
                  <span>Telegram Delivery Queue ({queueTasks.length})</span>
                </h3>
              </div>

              {queueTasks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-mono">
                  No uploads currently in queue.
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {queueTasks.map((task) => (
                    <div key={task.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
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
              TrackVid VMS Automated Dispatch Pipeline
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
