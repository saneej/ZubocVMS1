import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, CheckCircle2, Barcode, Send, ExternalLink, RefreshCw, AlertCircle, RotateCcw, PackageCheck, ShieldCheck, Check, Volume2, Mic, Maximize2, Zap, Layers, Sparkles, AlertTriangle, Scan, Upload, Video } from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { safeFetchJson } from '../utils/api';
import { scanBarcodeFromVideo, scanBarcodeFromImageFile, BarcodeScanResult } from '../utils/barcodeScanner';

function playBeepSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // ignore sound errors
  }
}

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
}

type StationStep = 'READY' | 'SCAN' | 'RECORDING' | 'CONFIRM';

function getSupportedMimeTypes(): string[] {
  if (typeof MediaRecorder === 'undefined') return [];
  const candidateTypes = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm;codecs=h264',
    'video/webm',
    'video/quicktime'
  ];
  return candidateTypes.filter(type => {
    try {
      return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

async function getCameraStream(deviceId?: string): Promise<MediaStream> {
  const constraintsToTry = [
    // 1. Specific deviceId if selected by operator
    ...(deviceId ? [
      { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 1.7777777778 } } },
      { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { deviceId: { exact: deviceId } } }
    ] : []),
    // 2. High-res widescreen (ideal constraints only, NO hard min requirements that crash standard webcams)
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 1.7777777778 }, frameRate: { ideal: 30 }, facingMode: { ideal: 'environment' } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.7777777778 }, frameRate: { ideal: 30 } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: { facingMode: 'environment' } },
    { video: true }
  ];

  for (const constraint of constraintsToTry) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      if (stream) return stream;
    } catch {
      // try next constraint
    }
  }
  throw new Error('Webcam stream unavailable. Please verify camera permissions and connection.');
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
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  const [availableCameras, setAvailableCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('zuboc_selected_camera') || '';
  });

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [queueTasks, setQueueTasks] = useState<UploadTask[]>([]);
  
  const [uploadPreset, setUploadPreset] = useState<'turbo' | 'fast' | 'hd'>(() => {
    return (localStorage.getItem('zuboc_upload_preset') as any) || 'turbo';
  });

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [autoRecordOnScan, setAutoRecordOnScan] = useState<boolean>(true);
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  const [scannedNotification, setScannedNotification] = useState<{ text: string; time: string; engine?: string } | null>(null);
  const [scanHeartbeat, setScanHeartbeat] = useState<boolean>(false);

  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastScannedCodeRef = useRef<string>('');
  const isScanningFrameRef = useRef<boolean>(false);

  // Enumerate cameras so user can switch between built-in and overhead cameras
  const refreshCameras = async () => {
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
      // ignore enumeration errors
    }
  };

  // Auto-start camera immediately on component mount
  useEffect(() => {
    initCamera(selectedCameraId).catch(err => console.warn('Initial camera warm-up:', err));
  }, []);

  // Handle scanned barcode detection
  const handleBarcodeDetected = (rawCode: string, engine?: string) => {
    const cleanCode = rawCode.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanCode || cleanCode === lastScannedCodeRef.current) return;

    lastScannedCodeRef.current = cleanCode;
    playBeepSound();

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(100); } catch {}
    }

    setScannedNotification({
      text: cleanCode,
      time: new Date().toLocaleTimeString(),
      engine: engine ? engine.toUpperCase() : 'DETECTED'
    });
    setOrderIdInput(cleanCode);

    if (autoRecordOnScan) {
      setTimeout(() => {
        handleConfirmOrderAndStartRecording(undefined, cleanCode);
      }, 400);
    }
  };

  // Real-time camera barcode frame scanner loop using multi-tier pipeline
  useEffect(() => {
    if (step !== 'SCAN' || !cameraActive || !scannerActive) return;

    let isScanning = false;
    const intervalId = setInterval(async () => {
      if (isScanning || isScanningFrameRef.current) return;
      const targetVideo = scanVideoRef.current || videoRef.current;
      if (!targetVideo || targetVideo.readyState < 2 || targetVideo.videoWidth < 10) return;

      isScanning = true;
      isScanningFrameRef.current = true;
      setScanHeartbeat(prev => !prev);

      try {
        const result = await scanBarcodeFromVideo(targetVideo);
        if (result && result.code) {
          handleBarcodeDetected(result.code, result.engine);
        }
      } catch (err) {
        console.warn('Scan frame warning:', err);
      } finally {
        isScanning = false;
        isScanningFrameRef.current = false;
      }
    }, 180);

    return () => {
      clearInterval(intervalId);
      isScanningFrameRef.current = false;
    };
  }, [step, cameraActive, scannerActive, autoRecordOnScan]);

  // Handle file photo barcode scan
  const handleFileUploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await scanBarcodeFromImageFile(file);
      if (res && res.code) {
        handleBarcodeDetected(res.code, res.engine);
      } else {
        alert('No barcode detected in uploaded image. Please try a clearer photo or use the camera.');
      }
    } catch (err) {
      alert('Failed to process image file.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  useEffect(() => {
    localStorage.setItem('zuboc_upload_preset', uploadPreset);
  }, [uploadPreset]);

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

  const initCamera = async (deviceId?: string) => {
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
        videoRef.current.play().catch(e => console.warn('Camera preview play warning:', e));
      }
      if (scanVideoRef.current && scanVideoRef.current !== videoRef.current) {
        scanVideoRef.current.srcObject = stream;
        scanVideoRef.current.play().catch(e => console.warn('Scan camera preview play warning:', e));
      }
      refreshCameras();
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      setCameraError('Webcam stream error: Please ensure USB overhead camera is connected and browser permissions are granted.');
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

  // Ref callback to immediately bind camera stream when <video> mounts in DOM
  const setVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    scanVideoRef.current = el;
    if (el && mediaStreamRef.current) {
      if (el.srcObject !== mediaStreamRef.current) {
        el.srcObject = mediaStreamRef.current;
      }
      el.play().catch(e => console.warn('Camera preview play warning:', e));
    }
  };

  // Pre-warm camera stream on SCAN step & keep stream active
  useEffect(() => {
    if (step === 'SCAN' && (!mediaStreamRef.current || !mediaStreamRef.current.active)) {
      initCamera().catch(err => console.warn('Background camera init:', err));
    }
  }, [step]);

  // Sync camera stream to video element when step becomes RECORDING
  useEffect(() => {
    if (step === 'RECORDING' && videoRef.current && mediaStreamRef.current) {
      if (videoRef.current.srcObject !== mediaStreamRef.current) {
        videoRef.current.srcObject = mediaStreamRef.current;
      }
      videoRef.current.play().catch(e => console.warn('Camera preview play warning:', e));
    }
  }, [step, cameraActive, isRecording]);

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

  // Calculate target bitrate based on selected Speed Preset (All 1080p Full HD Stream)
  const getTargetBitrate = () => {
    switch (uploadPreset) {
      case 'turbo': return 1800000; // 1.8 Mbps (~6.5MB for 30s) -> 1-2s instant upload with crisp 1080p Full HD VP9/H264
      case 'fast':  return 2800000; // 2.8 Mbps (~10MB for 30s) -> 2-3s fast upload with high clarity 1080p
      case 'hd':    return 4800000; // 4.8 Mbps (~18MB for 30s) -> 4-6s upload with master studio 1080p clarity
      default:      return 1800000;
    }
  };

  // Step 2 -> Step 3
  const handleConfirmOrderAndStartRecording = async (e?: React.FormEvent, overrideOrderId?: string) => {
    if (e) e.preventDefault();
    setRecordingError(null);

    const targetId = overrideOrderId || orderIdInput;
    const cleanId = targetId.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId) {
      setRecordingError('Please enter or scan an Order ID / AWB before starting recording.');
      scanInputRef.current?.focus();
      return;
    }

    setIsStartingRecording(true);
    setActiveOrderId(cleanId);
    setTimerSeconds(0);
    chunksRef.current = [];
    setRecordedVideoUrl(null);
    setRecordedBlob(null);

    try {
      // 1. Ensure camera stream is active and healthy
      let stream = mediaStreamRef.current;
      const isStreamHealthy = stream && stream.active && stream.getVideoTracks().some(t => t.readyState === 'live');
      
      if (!isStreamHealthy) {
        stream = await getCameraStream(selectedCameraId);
        mediaStreamRef.current = stream;
        setCameraActive(true);
      }

      if (!stream) {
        throw new Error('Camera stream could not be acquired. Please check camera connection.');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => console.warn('Preview play warning:', err));
      }

      // 2. Select compatible video codec
      const supportedMimes = getSupportedMimeTypes();
      const targetBitrate = getTargetBitrate();

      let recorder: MediaRecorder | null = null;

      // Try with targetBitrate and supported MIME
      for (const mime of supportedMimes) {
        try {
          recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: targetBitrate });
          if (recorder) break;
        } catch {
          try {
            recorder = new MediaRecorder(stream, { mimeType: mime });
            if (recorder) break;
          } catch {}
        }
      }

      // If specific MIME failed, try raw browser default
      if (!recorder) {
        try {
          recorder = new MediaRecorder(stream, { videoBitsPerSecond: targetBitrate });
        } catch {
          recorder = new MediaRecorder(stream);
        }
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: any) => {
        console.error('MediaRecorder error event:', event);
        setRecordingError('Recording device error encountered.');
      };

      recorder.onstop = () => {
        const actualMime = recorder?.mimeType || supportedMimes[0] || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        // Keep camera stream alive so next order doesn't suffer startup delay!
        setStep('CONFIRM');
      };

      // 3. Start recording
      try {
        recorder.start(1000);
      } catch {
        // Fallback without timeslice if browser doesn't support timeslice with this mime
        recorder.start();
      }

      setIsRecording(true);
      setRecordingError(null);
      setStep('RECORDING');
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setRecordingError('Failed to start camera recording: ' + (err.message || String(err)));
      setStep('SCAN');
    } finally {
      setIsStartingRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
      }
    }
    setIsRecording(false);
  };

  const handleFinalConfirmUpload = () => {
    if (!activeOrderId || !recordedBlob) return;

    const videoTrack = mediaStreamRef.current?.getVideoTracks()[0];
    const trackSettings = videoTrack?.getSettings();
    const width = trackSettings?.width || videoRef.current?.videoWidth || 1920;
    const height = trackSettings?.height || videoRef.current?.videoHeight || 1080;

    uploadQueueManager.addTask({
      orderId: activeOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      durationSeconds: timerSeconds,
      videoBlob: recordedBlob,
      recordingDate: new Date().toISOString(),
      width,
      height
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
      
      {/* Top Station Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center text-blue-600 font-bold">
            <PackageCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight font-sans">Packing Workstation</h1>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold border border-slate-200">
                {settings.stationId || 'Packing-01'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Operator: <strong className="text-slate-800">{currentStaff.name}</strong>
            </p>
          </div>
        </div>

        {/* Minimal Speed Presets */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-mono">
          <button
            type="button"
            onClick={() => setUploadPreset('turbo')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              uploadPreset === 'turbo'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚡ 1080P TURBO
          </button>
          <button
            type="button"
            onClick={() => setUploadPreset('fast')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              uploadPreset === 'fast'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🚀 1080P BALANCED
          </button>
          <button
            type="button"
            onClick={() => setUploadPreset('hd')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              uploadPreset === 'hd'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎥 1080P ULTRA
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold">
            PACKED TODAY: <strong className="text-emerald-700 text-sm ml-1">{todayCount}</strong>
          </div>
        </div>
      </div>

      {/* WORKSTATION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Workstation Area (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">

          {/* STEP 1: SCAN BARCODE WITH LIVE CAMERA */}
          {step === 'SCAN' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              
              {lastCompletedOrder && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-emerald-800 font-mono">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Order <strong className="text-slate-900">{lastCompletedOrder}</strong> recorded & dispatched!</span>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-600" />
                  <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">
                    LIVE OVERHEAD CAMERA & BARCODE SCANNER
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {availableCameras.length > 1 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                      <Video className="w-3.5 h-3.5 text-slate-500" />
                      <select
                        value={selectedCameraId}
                        onChange={(e) => initCamera(e.target.value)}
                        className="bg-transparent text-[11px] font-mono text-slate-700 outline-none cursor-pointer max-w-[140px] truncate"
                      >
                        {availableCameras.map(cam => (
                          <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setAutoRecordOnScan(!autoRecordOnScan)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold font-mono transition-all cursor-pointer ${
                      autoRecordOnScan
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    AUTO-RECORD: {autoRecordOnScan ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Live Camera Box */}
              <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-inner group">
                
                {/* Status Indicator */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono font-bold text-slate-200">
                  <span className={`w-2 h-2 rounded-full ${scanHeartbeat ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-emerald-500'}`} />
                  <span>SEEKING BARCODE / QR</span>
                </div>

                {/* Scanner Frame / Reticle */}
                <div className="absolute inset-x-8 sm:inset-x-20 inset-y-8 sm:inset-y-12 border-2 border-dashed border-emerald-400/60 rounded-xl pointer-events-none flex flex-col items-center justify-between p-3 z-10 bg-emerald-500/[0.02]">
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-sm animate-pulse" />
                  <div className="text-[10px] font-mono font-bold text-white bg-slate-900/90 backdrop-blur px-3 py-1 rounded-lg border border-emerald-500/40 flex items-center gap-1.5 shadow-md">
                    <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                    <span>HOLD AWB BARCODE UNDER CAMERA</span>
                  </div>
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-sm animate-pulse" />
                </div>

                {/* Scanned Flash Overlay */}
                {scannedNotification && (
                  <div className="absolute inset-0 bg-emerald-500/15 border-4 border-emerald-500 z-30 flex flex-col items-center justify-center pointer-events-none transition-all">
                    <div className="bg-emerald-600 text-white font-mono font-bold text-sm px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                      <span>SCANNED: {scannedNotification.text} {scannedNotification.engine ? `(${scannedNotification.engine})` : ''}</span>
                    </div>
                    <p className="text-white text-xs font-mono font-bold bg-slate-900/90 px-3 py-1 rounded-md mt-2 border border-emerald-400/40 shadow-lg">
                      {autoRecordOnScan ? '⚡ Starting Recording...' : 'Order ID Applied'}
                    </p>
                  </div>
                )}

                {cameraError ? (
                  <div className="p-8 text-center text-slate-400 max-w-md z-10 font-mono">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-xs mb-3">{cameraError}</p>
                    <button onClick={() => initCamera()} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer">
                      Retry Camera
                    </button>
                  </div>
                ) : (
                  <video
                    ref={(el) => {
                      scanVideoRef.current = el;
                      setVideoRef(el);
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover block"
                  />
                )}
              </div>

              {/* Quick Sample Test Buttons & Photo Upload */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] font-mono">
                <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                  <span className="font-bold text-slate-400">QUICK TEST:</span>
                  <button
                    type="button"
                    onClick={() => handleBarcodeDetected('AWB-DELHIVERY-9981', 'SAMPLE')}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer transition-colors"
                  >
                    AWB-DELHIVERY-9981
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBarcodeDetected('BLUEDART-48201', 'SAMPLE')}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer transition-colors"
                  >
                    BLUEDART-48201
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBarcodeDetected('EKART-55102', 'SAMPLE')}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 cursor-pointer transition-colors"
                  >
                    EKART-55102
                  </button>
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUploadScan}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-bold cursor-pointer hover:underline"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>UPLOAD BARCODE PHOTO</span>
                  </button>
                </div>
              </div>

              {/* Error Alert if Recording Fails */}
              {recordingError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{recordingError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecordingError(null)}
                    className="text-rose-600 hover:text-rose-900 font-bold ml-3 cursor-pointer"
                  >
                    DISMISS
                  </button>
                </div>
              )}

              {/* Order ID Form */}
              <form onSubmit={handleConfirmOrderAndStartRecording} className="space-y-3">
                <div className="relative">
                  <Barcode className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="Scan AWB Barcode with camera or type Order ID..."
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-11 pr-20 py-3 text-slate-900 font-mono text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
                  />
                  {orderIdInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderIdInput('');
                        lastScannedCodeRef.current = '';
                        setScannedNotification(null);
                        setRecordingError(null);
                      }}
                      className="absolute right-3 top-2.5 text-xs font-mono bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded font-bold cursor-pointer"
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={!orderIdInput.trim() || isStartingRecording}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{isStartingRecording ? 'STARTING...' : 'START RECORDING'}</span>
                  </button>
                </div>
              </form>

            </div>
          )}

          {/* STEP 2: RECORDING */}
          {step === 'RECORDING' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              
              <div className="bg-slate-900 px-5 py-3 flex items-center justify-between text-xs font-mono text-white">
                <div className="flex items-center gap-2 font-bold">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>ORDER: <strong className="text-emerald-400">{activeOrderId}</strong></span>
                </div>

                <div className="flex items-center gap-2 font-bold bg-rose-600 text-white px-3 py-1 rounded-full text-xs">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>REC {formatTime(timerSeconds)}</span>
                </div>
              </div>

              <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
                <video
                  ref={setVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover block"
                />
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between font-mono">
                <span className="text-xs text-slate-500">Press <kbd className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded">SPACE</kbd> to stop</span>
                
                <button
                  onClick={handleStopRecording}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>STOP & REVIEW</span>
                </button>
              </div>

            </div>
          )}

          {/* STEP 3: DISPATCH */}
          {step === 'CONFIRM' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 font-mono text-xs">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>VERIFY EVIDENCE & DISPATCH</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-black rounded-xl overflow-hidden aspect-video w-full flex items-center justify-center relative border border-slate-200">
                  {recordedVideoUrl ? (
                    <video
                      ref={reviewVideoRef}
                      src={recordedVideoUrl}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain bg-black rounded-xl"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Preview unavailable</span>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="text-slate-500 block font-bold text-[10px] uppercase">ORDER ID</label>
                    <input
                      type="text"
                      value={activeOrderId}
                      onChange={(e) => setActiveOrderId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div>
                      <span className="block text-[10px] text-slate-400">DURATION</span>
                      <strong className="text-slate-900">{formatTime(timerSeconds)}</strong>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">OPERATOR</span>
                      <strong className="text-slate-900">{currentStaff.name}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleReRecord}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border border-slate-200 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>DISCARD</span>
                </button>

                <button
                  onClick={handleFinalConfirmUpload}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-sm transition-all uppercase tracking-wider"
                >
                  <Send className="w-4 h-4" />
                  <span>DISPATCH TO TELEGRAM</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Right Panel: Telegram Queue */}
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
                Queue empty
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                {queueTasks.map((task) => (
                  <div key={task.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs font-mono">
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
                      <span>{task.durationSeconds}s</span>
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
