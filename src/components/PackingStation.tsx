import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  StopCircle, 
  Play, 
  CheckCircle2, 
  Barcode, 
  Send, 
  ExternalLink, 
  RotateCcw, 
  PackageCheck, 
  AlertTriangle, 
  Video, 
  Sparkles, 
  Image as ImageIcon, 
  Plus, 
  Trash2,
  Maximize2
} from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
}

type StationStep = 'READY' | 'RECORDING' | 'CONFIRM';
type EvidenceMode = 'video' | 'photo' | 'both';

// Audio feedback for warehouse operators
function playFeedbackTone(type: 'beep' | 'success' | 'snap') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'beep') {
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'snap') {
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch {
    // AudioContext blocked or unsupported - silent fallback
  }
}

// Request camera stream without brittle hard constraints
async function getCameraStream(deviceId?: string): Promise<MediaStream> {
  const constraintsToTry: MediaStreamConstraints[] = [
    ...(deviceId ? [
      { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: { deviceId: { exact: deviceId } } }
    ] : []),
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { ideal: 'environment' } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: { facingMode: 'environment' } },
    { video: true }
  ];

  for (const constraint of constraintsToTry) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      if (stream) return stream;
    } catch {
      // Try next fallback constraint
    }
  }
  throw new Error('Webcam stream unavailable. Please check camera connection and permissions.');
}

// Initialize MediaRecorder reliably across Chrome, Safari, Edge, Firefox
function createMediaRecorder(stream: MediaStream): MediaRecorder {
  const candidateMimes = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm;codecs=h264',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4'
  ];

  for (const mime of candidateMimes) {
    try {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime)) {
        return new MediaRecorder(stream, { mimeType: mime });
      }
    } catch {
      // try next
    }
  }

  // Browser default container
  return new MediaRecorder(stream);
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
  const [step, setStep] = useState<StationStep>('READY');
  const [mode, setMode] = useState<EvidenceMode>('both'); // Default: Photo + Video
  const [orderIdInput, setOrderIdInput] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string>('');

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stationError, setStationError] = useState<string | null>(null);

  // Photos State
  const [capturedPhotos, setCapturedPhotos] = useState<{ id: string; blob: Blob; dataUrl: string }[]>([]);
  const [snapFlash, setSnapFlash] = useState(false);

  // Video State
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  // Hardware Devices
  const [availableCameras, setAvailableCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('zuboc_selected_camera') || '';
  });

  // Telegram Queue
  const [queueTasks, setQueueTasks] = useState<UploadTask[]>([]);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<string | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const stopTimeoutRef = useRef<any>(null);

  // Enumerate cameras
  const refreshCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`
        }));
      setAvailableCameras(videoInputs);
    } catch {
      // ignore
    }
  }, []);

  // Initialize Camera Stream
  const initCamera = useCallback(async (deviceId?: string) => {
    try {
      setCameraError(null);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      const stream = await getCameraStream(deviceId || selectedCameraId);
      mediaStreamRef.current = stream;
      setCameraActive(true);

      if (deviceId) {
        setSelectedCameraId(deviceId);
        localStorage.setItem('zuboc_selected_camera', deviceId);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Preview play notice:', e));
      }

      refreshCameras();
    } catch (err: any) {
      console.error('Camera init error:', err);
      setCameraError('Camera stream unavailable. Please verify USB webcam connection and permissions.');
      setCameraActive(false);
    }
  }, [selectedCameraId, refreshCameras]);

  // Initial mount: Start camera preview immediately
  useEffect(() => {
    initCamera(selectedCameraId);
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, []);

  // Subscribe to Telegram Upload Queue
  useEffect(() => {
    const unsubscribe = uploadQueueManager.subscribe((tasks) => {
      setQueueTasks(tasks);
    });
    return () => unsubscribe();
  }, []);

  // Timer counter during active recording
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

  // Persistent Video binding ref callback
  const handleVideoMount = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && mediaStreamRef.current) {
      if (el.srcObject !== mediaStreamRef.current) {
        el.srcObject = mediaStreamRef.current;
      }
      el.play().catch(() => {});
    }
  };

  // Capture high-res snapshot from live camera feed
  const capturePhoto = useCallback((): { blob: Blob; dataUrl: string } | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Convert dataURL to Blob
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    // Flash animation & audio feedback
    setSnapFlash(true);
    setTimeout(() => setSnapFlash(false), 150);
    playFeedbackTone('snap');

    return { blob, dataUrl };
  }, []);

  // Handler: Take photo directly
  const handleTakeSnapshot = () => {
    setStationError(null);
    const cleanId = orderIdInput.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId && !activeOrderId) {
      setStationError('Please type or scan an Order ID before taking photos.');
      scanInputRef.current?.focus();
      return;
    }

    const currentId = activeOrderId || cleanId;
    setActiveOrderId(currentId);

    const snapshot = capturePhoto();
    if (snapshot) {
      const newPhoto = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        blob: snapshot.blob,
        dataUrl: snapshot.dataUrl
      };
      setCapturedPhotos(prev => [...prev, newPhoto]);

      // If in photo-only mode and not yet in confirm, transition to confirm
      if (mode === 'photo' && step === 'READY') {
        setStep('CONFIRM');
      }
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    setCapturedPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  // Handler: Start Video Recording
  const handleStartRecording = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStationError(null);

    const cleanId = orderIdInput.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId) {
      setStationError('Please type Order ID or scan with handheld barcode gun.');
      scanInputRef.current?.focus();
      return;
    }

    setActiveOrderId(cleanId);
    setTimerSeconds(0);
    chunksRef.current = [];
    setRecordedBlob(null);
    setRecordedVideoUrl(null);

    try {
      // Ensure healthy camera stream
      let stream = mediaStreamRef.current;
      const isHealthy = stream && stream.active && stream.getVideoTracks().some(t => t.readyState === 'live');
      if (!isHealthy) {
        stream = await getCameraStream(selectedCameraId);
        mediaStreamRef.current = stream;
        setCameraActive(true);
      }

      if (!stream) {
        throw new Error('Camera stream could not be acquired.');
      }

      if (videoRef.current && videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Create robust MediaRecorder
      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event);
        setStationError('Recording device error encountered.');
        setIsRecording(false);
        setStep('READY');
      };

      recorder.onstop = () => {
        if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
        const mime = recorder?.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        setIsRecording(false);
        setStep('CONFIRM');
      };

      // Start recording with 1-second timeslice chunks
      try {
        recorder.start(1000);
      } catch {
        recorder.start();
      }

      setIsRecording(true);
      setStep('RECORDING');
      playFeedbackTone('beep');

      // If Photo+Video mode, optionally take an opening photo snapshot automatically
      if (mode === 'both' && capturedPhotos.length === 0) {
        setTimeout(() => {
          const snap = capturePhoto();
          if (snap) {
            setCapturedPhotos([{ id: `photo_start_${Date.now()}`, blob: snap.blob, dataUrl: snap.dataUrl }]);
          }
        }, 300);
      }
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setStationError('Recording could not start: ' + (err.message || String(err)));
      setStep('READY');
      setIsRecording(false);
    }
  };

  // Handler: Stop Recording
  const handleStopRecording = () => {
    if (!mediaRecorderRef.current) {
      setIsRecording(false);
      setStep('READY');
      return;
    }

    // Safety watchdog: ensure onstop finishes within 1s
    stopTimeoutRef.current = setTimeout(() => {
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
        setRecordedVideoUrl(URL.createObjectURL(blob));
      }
      setIsRecording(false);
      setStep('CONFIRM');
    }, 1000);

    if (mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (typeof mediaRecorderRef.current.requestData === 'function') {
          try { mediaRecorderRef.current.requestData(); } catch {}
        }
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('MediaRecorder stop warning:', err);
        setIsRecording(false);
        setStep('CONFIRM');
      }
    } else {
      setIsRecording(false);
      setStep('CONFIRM');
    }
    playFeedbackTone('beep');
  };

  // Dispatch Evidence to Telegram
  const handleDispatchEvidence = () => {
    const targetOrderId = activeOrderId || orderIdInput.trim();
    if (!targetOrderId) return;

    const videoTrack = mediaStreamRef.current?.getVideoTracks()[0];
    const trackSettings = videoTrack?.getSettings();
    const width = trackSettings?.width || videoRef.current?.videoWidth || 1920;
    const height = trackSettings?.height || videoRef.current?.videoHeight || 1080;

    let evidenceType: 'VIDEO' | 'PHOTO' | 'PHOTO_VIDEO' = 'VIDEO';
    if (recordedBlob && capturedPhotos.length > 0) evidenceType = 'PHOTO_VIDEO';
    else if (capturedPhotos.length > 0 && !recordedBlob) evidenceType = 'PHOTO';
    else evidenceType = 'VIDEO';

    // Queue task for Telegram dispatch
    uploadQueueManager.addTask({
      orderId: targetOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      durationSeconds: timerSeconds,
      evidenceType,
      videoBlob: recordedBlob,
      photoBlobs: capturedPhotos.map(p => p.blob),
      photoDataUrls: capturedPhotos.map(p => p.dataUrl),
      recordingDate: new Date().toISOString(),
      width,
      height
    });

    onOrderCompleted({
      orderId: targetOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      recordingStartedAt: new Date().toISOString(),
      durationSeconds: timerSeconds,
      recordingStatus: 'COMPLETED',
      uploadStatus: 'PENDING',
      evidenceType,
      photoDataUrl: capturedPhotos[0]?.dataUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    playFeedbackTone('success');
    setLastCompletedOrder(targetOrderId);
    handleResetForNextOrder();
  };

  // Reset station state for next order
  const handleResetForNextOrder = () => {
    setActiveOrderId('');
    setOrderIdInput('');
    setRecordedBlob(null);
    setRecordedVideoUrl(null);
    setCapturedPhotos([]);
    setTimerSeconds(0);
    setStationError(null);
    setStep('READY');

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 100);
  };

  // Quick Auto-Generate Order ID
  const handleGenerateOrderId = () => {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const newId = `ORD-${randomDigits}`;
    setOrderIdInput(newId);
    setStationError(null);
  };

  // Format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const todayCount = existingOrders.filter(o => 
    new Date(o.createdAt).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5 font-sans">
      
      {/* Station Control Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        
        {/* Workstation Info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <PackageCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">Packing Station</h1>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-mono font-bold border border-blue-200">
                {settings.stationId || 'Packing-01'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Operator: <strong className="text-slate-800">{currentStaff.name}</strong>
            </p>
          </div>
        </div>

        {/* EVIDENCE MODE SELECTOR: Photo, Video, Photo+Video */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 font-mono text-xs">
          <button
            type="button"
            onClick={() => setMode('both')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              mode === 'both'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>PHOTO + VIDEO</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('video')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              mode === 'video'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>VIDEO ONLY</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('photo')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              mode === 'photo'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>PHOTO ONLY</span>
          </button>
        </div>

        {/* Packed Today Badge */}
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-mono text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>PACKED TODAY: <strong className="text-emerald-700 text-sm ml-0.5">{todayCount}</strong></span>
          </div>
        </div>

      </div>

      {/* Main Workstation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Live Camera & Controls (2 cols) */}
        <div className="lg:col-span-2 space-y-4">

          {/* Success banner if previous order uploaded */}
          {lastCompletedOrder && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-800 font-mono">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Order <strong className="text-slate-900">{lastCompletedOrder}</strong> dispatched to Telegram!</span>
              </div>
              <button
                type="button"
                onClick={() => setLastCompletedOrder(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Error Banner */}
          {stationError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-mono flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{stationError}</span>
              </div>
              <button
                type="button"
                onClick={() => setStationError(null)}
                className="text-rose-600 hover:text-rose-900 font-bold ml-2 cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          )}

          {/* Live Camera Box (PERSISTENT MOUNT - Never unmounts) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
            
            {/* Camera Bar Sub-Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2 font-mono text-xs font-extrabold text-slate-800 uppercase">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>OVERHEAD PACKING CAMERA</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Camera switcher */}
                {availableCameras.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                    <Video className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={selectedCameraId}
                      onChange={(e) => initCamera(e.target.value)}
                      className="bg-transparent text-[11px] font-mono text-slate-700 outline-none cursor-pointer max-w-[150px] truncate"
                    >
                      {availableCameras.map(cam => (
                        <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Status indicator */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{isRecording ? `RECORDING (${formatTime(timerSeconds)})` : 'LIVE FEED'}</span>
                </div>
              </div>
            </div>

            {/* Video Viewport */}
            <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-inner">
              
              {/* Shutter Flash Effect */}
              {snapFlash && (
                <div className="absolute inset-0 bg-white/90 z-20 pointer-events-none transition-opacity duration-150 animate-fadeOut" />
              )}

              {cameraError ? (
                <div className="p-8 text-center text-slate-400 max-w-md z-10 font-mono">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-xs mb-3">{cameraError}</p>
                  <button
                    onClick={() => initCamera()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Reconnect Camera
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={handleVideoMount}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover block"
                  />

                  {/* Recording Badge Overlay */}
                  {isRecording && (
                    <div className="absolute top-3 left-3 bg-rose-600/90 text-white px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-2 shadow-lg backdrop-blur">
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                      <span>REC {formatTime(timerSeconds)}</span>
                    </div>
                  )}

                  {/* Overhead label */}
                  <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono font-bold text-slate-300">
                    LIVE OVERHEAD FEED
                  </div>

                  {/* Photo Snapshots Count Overlay */}
                  {capturedPhotos.length > 0 && (
                    <div className="absolute bottom-3 right-3 bg-blue-600/90 text-white px-2.5 py-1 rounded-md text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-md">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{capturedPhotos.length} {capturedPhotos.length === 1 ? 'PHOTO' : 'PHOTOS'}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ACTION CONTROLS BAR */}
            <div className="pt-1">
              {step === 'READY' && (
                <div className="space-y-3">
                  
                  {/* Order ID Input Form */}
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-slate-700 uppercase mb-1.5">
                      Order ID / Barcode AWB
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Barcode className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                        <input
                          ref={scanInputRef}
                          type="text"
                          name="orderIdInput"
                          value={orderIdInput}
                          onChange={(e) => setOrderIdInput(e.target.value)}
                          placeholder="Type Order ID or scan with handheld barcode gun..."
                          autoFocus
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="characters"
                          spellCheck="false"
                          data-lpignore="true"
                          className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-11 pr-20 py-3 text-slate-900 font-mono text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
                        />
                        {orderIdInput && (
                          <button
                            type="button"
                            onClick={() => {
                              setOrderIdInput('');
                              setStationError(null);
                            }}
                            className="absolute right-3 top-2.5 text-xs font-mono bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded font-bold cursor-pointer"
                          >
                            CLEAR
                          </button>
                        )}
                      </div>

                      {/* Quick Auto-Generate ID Button */}
                      <button
                        type="button"
                        onClick={handleGenerateOrderId}
                        className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-mono font-bold border border-slate-200 cursor-pointer transition-colors"
                        title="Auto-generate a random order ID for fast testing"
                      >
                        + GEN ID
                      </button>
                    </div>
                  </div>

                  {/* Primary Trigger Buttons depending on Selected Mode */}
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                    
                    {/* PHOTO ONLY MODE BUTTON */}
                    {mode === 'photo' && (
                      <button
                        type="button"
                        onClick={handleTakeSnapshot}
                        disabled={!orderIdInput.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                      >
                        <Camera className="w-4 h-4" />
                        <span>CAPTURE PHOTO EVIDENCE</span>
                      </button>
                    )}

                    {/* VIDEO ONLY MODE BUTTON */}
                    {mode === 'video' && (
                      <button
                        type="button"
                        onClick={handleStartRecording}
                        disabled={!orderIdInput.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>START RECORDING</span>
                      </button>
                    )}

                    {/* PHOTO + VIDEO MODE BUTTONS */}
                    {mode === 'both' && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleTakeSnapshot}
                          disabled={!orderIdInput.trim()}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                        >
                          <Camera className="w-4 h-4" />
                          <span>SNAP PHOTO</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleStartRecording}
                          disabled={!orderIdInput.trim()}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>START VIDEO + PHOTOS</span>
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              )}

              {/* RECORDING ACTIVE CONTROLS */}
              {step === 'RECORDING' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 font-mono">
                  
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-800">
                      ORDER: <strong className="text-emerald-700">{activeOrderId}</strong>
                    </span>
                    <span className="text-xs text-slate-500">
                      Recording: <strong className="text-rose-600">{formatTime(timerSeconds)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Snap Photo During Recording button */}
                    <button
                      type="button"
                      onClick={handleTakeSnapshot}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    >
                      <Camera className="w-4 h-4" />
                      <span>SNAP PHOTO ({capturedPhotos.length})</span>
                    </button>

                    {/* Stop Recording */}
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-sm transition-all uppercase tracking-wider"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>STOP & REVIEW</span>
                    </button>
                  </div>

                </div>
              )}

              {/* CONFIRMATION / REVIEW STEP */}
              {step === 'CONFIRM' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4 font-mono text-xs">
                  
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-extrabold text-slate-900 uppercase flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>EVIDENCE READY • ORDER: {activeOrderId}</span>
                    </span>

                    <span className="text-slate-500 text-[11px]">
                      {recordedBlob ? `Video: ${formatTime(timerSeconds)} • ` : ''}{capturedPhotos.length} {capturedPhotos.length === 1 ? 'Photo' : 'Photos'}
                    </span>
                  </div>

                  {/* Review Media Previews */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Video Player Preview (if video recorded) */}
                    {recordedVideoUrl && (
                      <div className="bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-slate-200">
                        <video
                          ref={reviewVideoRef}
                          src={recordedVideoUrl}
                          controls
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}

                    {/* Photos Gallery */}
                    {capturedPhotos.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 font-bold">
                          <span>CAPTURED PHOTO EVIDENCE ({capturedPhotos.length})</span>
                          <button
                            type="button"
                            onClick={handleTakeSnapshot}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Photo</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[180px] overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                          {capturedPhotos.map((photo, index) => (
                            <div key={photo.id} className="relative group rounded-md overflow-hidden aspect-video bg-slate-100 border border-slate-200">
                              <img src={photo.dataUrl} alt={`Evidence #${index + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(photo.id)}
                                className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded opacity-80 hover:opacity-100 cursor-pointer shadow-sm"
                                title="Remove photo"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              <span className="absolute bottom-1 left-1 bg-slate-900/80 text-white px-1 rounded text-[9px] font-bold">
                                #{index + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Confirm & Dispatch Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleResetForNextOrder}
                      className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>DISCARD</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDispatchEvidence}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-sm transition-all uppercase tracking-wider"
                    >
                      <Send className="w-4 h-4" />
                      <span>DISPATCH TO TELEGRAM</span>
                    </button>
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>

        {/* Right Column: Telegram Upload Queue (1 col) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 font-mono">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-600" />
                <span>TELEGRAM QUEUE ({queueTasks.length})</span>
              </h3>
            </div>

            {queueTasks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-mono">
                No pending uploads. Completed orders will appear here automatically.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 font-mono">
                {queueTasks.map((task) => (
                  <div key={task.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{task.orderId}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        task.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        task.status === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {task.status === 'UPLOADING' ? `${task.progress}%` : task.status}
                      </span>
                    </div>

                    {task.status === 'UPLOADING' && (
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-200"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{task.evidenceType || (task.videoBlob ? 'VIDEO' : 'PHOTO')}</span>
                      <span>{new Date(task.recordingDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {task.status === 'SUCCESS' && task.telegramMessageLink && (
                      <a
                        href={task.telegramMessageLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-bold pt-0.5"
                      >
                        <span>View in Telegram</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
