import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, CheckCircle2, Barcode, Send, ExternalLink, RefreshCw, AlertCircle, RotateCcw, PackageCheck, ShieldCheck, Check, Volume2, Mic, Maximize2, Zap, Layers, Sparkles, AlertTriangle } from 'lucide-react';
import { MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';
import { safeFetchJson } from '../utils/api';

function playBeepSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // ignore sound errors
  }
}

function decodeBarcodeFromVideo(video: HTMLVideoElement): string | null {
  try {
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const luminanceSource = new RGBLuminanceSource(
      new Uint8ClampedArray(imageData.data.buffer),
      canvas.width,
      canvas.height
    );
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const reader = new MultiFormatReader();
    const result = reader.decode(binaryBitmap);
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}

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
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=av1,opus',
    'video/webm;codecs=vp8,opus',
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
    // Prioritize Full HD 1080p (1920x1080) with explicit 16:9 widescreen aspect ratio for maximum clarity
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 1.7777777778 }, frameRate: { ideal: 30 }, facingMode: { ideal: 'environment' } } },
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 1.7777777778 }, frameRate: { ideal: 30 } } },
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 1.7777777778 } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.7777777778 }, facingMode: { ideal: 'environment' } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.7777777778 } } },
    { video: { aspectRatio: { ideal: 1.7777777778 }, facingMode: 'environment' } },
    { video: { aspectRatio: { ideal: 1.7777777778 } } },
    { video: { facingMode: 'environment' } },
    { video: true }
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

  const [autoRecordOnScan, setAutoRecordOnScan] = useState<boolean>(true);
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  const [scannedNotification, setScannedNotification] = useState<{ text: string; time: string } | null>(null);

  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastScannedCodeRef = useRef<string>('');
  const isScanningFrameRef = useRef<boolean>(false);

  // Auto-start camera immediately on component mount
  useEffect(() => {
    initCamera().catch(err => console.warn('Initial camera warm-up:', err));
  }, []);

  // Handle scanned barcode detection
  const handleBarcodeDetected = (rawCode: string) => {
    const cleanCode = rawCode.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanCode || cleanCode === lastScannedCodeRef.current) return;

    lastScannedCodeRef.current = cleanCode;
    playBeepSound();

    setScannedNotification({
      text: cleanCode,
      time: new Date().toLocaleTimeString()
    });
    setOrderIdInput(cleanCode);

    if (autoRecordOnScan) {
      setTimeout(() => {
        handleConfirmOrderAndStartRecording(undefined, cleanCode);
      }, 350);
    }
  };

  // Real-time camera barcode frame scanner loop
  useEffect(() => {
    if (step !== 'SCAN' || !cameraActive || !scannerActive) return;

    let intervalId: any = null;

    const performScan = async () => {
      if (isScanningFrameRef.current) return;
      const targetVideo = scanVideoRef.current || videoRef.current;
      if (!targetVideo || targetVideo.readyState < 2) return;

      isScanningFrameRef.current = true;
      try {
        // 1. Try Native BarcodeDetector (GPU hardware accelerated in Chrome/Edge/Android)
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'pdf417']
            });
            const barcodes = await detector.detect(targetVideo);
            if (barcodes && barcodes.length > 0) {
              const text = barcodes[0].rawValue;
              if (text) {
                handleBarcodeDetected(text);
                isScanningFrameRef.current = false;
                return;
              }
            }
          } catch {
            // fallback to ZXing
          }
        }

        // 2. ZXing fallback scanner via Canvas frame decoding
        const scannedText = decodeBarcodeFromVideo(targetVideo);
        if (scannedText) {
          handleBarcodeDetected(scannedText);
        }
      } catch {
        // frame decode exception ignored
      } finally {
        isScanningFrameRef.current = false;
      }
    };

    intervalId = setInterval(performScan, 300);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [step, cameraActive, scannerActive, autoRecordOnScan]);

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

  const initCamera = async () => {
    try {
      setCameraError(null);
      const stream = await getCameraStream();
      mediaStreamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Camera preview play warning:', e));
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

  // Ref callback to immediately bind camera stream when <video> mounts in DOM
  const setVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
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
    const targetId = overrideOrderId || orderIdInput;
    const cleanId = targetId.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
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
      const targetBitrate = getTargetBitrate();

      const candidateMimes = [
        selectedMime,
        'video/mp4',
        'video/webm',
        ''
      ].filter((m, idx, arr) => m !== undefined && arr.indexOf(m) === idx);

      let recorder: MediaRecorder | null = null;
      for (const mime of candidateMimes) {
        try {
          const options: MediaRecorderOptions = { videoBitsPerSecond: targetBitrate };
          if (mime) options.mimeType = mime;

          recorder = new MediaRecorder(mediaStreamRef.current!, options);
          if (recorder) break;
        } catch {
          // try next mime without options
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
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-600" />
                  <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">
                    LIVE OVERHEAD CAMERA & BARCODE SCANNER
                  </h2>
                </div>

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

              {/* Live Camera Box */}
              <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-inner">
                
                {/* Scanner Frame */}
                <div className="absolute inset-10 sm:inset-16 border-2 border-dashed border-emerald-400/60 rounded-xl pointer-events-none flex flex-col items-center justify-between p-3 z-10">
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-sm animate-pulse" />
                  <div className="text-[10px] font-mono font-bold text-white bg-slate-900/90 backdrop-blur px-3 py-1 rounded-lg border border-emerald-500/40 flex items-center gap-1.5">
                    <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                    <span>HOLD AWB BARCODE UNDER CAMERA TO SCAN</span>
                  </div>
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-sm animate-pulse" />
                </div>

                {scannedNotification && (
                  <div className="absolute top-4 bg-emerald-600 text-white font-mono font-bold text-xs px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 z-20">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>BARCODE SCANNED: {scannedNotification.text}</span>
                  </div>
                )}

                {cameraError ? (
                  <div className="p-8 text-center text-slate-400 max-w-md z-10 font-mono">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-xs mb-3">{cameraError}</p>
                    <button onClick={initCamera} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer">
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

              {/* Order ID Form */}
              <form onSubmit={handleConfirmOrderAndStartRecording} className="space-y-3">
                <div className="relative">
                  <Barcode className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="Scan AWB Barcode or type Order ID..."
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
                    disabled={!orderIdInput.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-mono uppercase tracking-wider"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>START RECORDING</span>
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
