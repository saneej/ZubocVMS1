import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatISTTimeOnly } from '../utils/time';
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
  Maximize2,
  Truck,
  Scale,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
  Box,
  CameraOff,
  Info,
  PackagePlus,
  Zap,
  RefreshCw
} from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';
import { uploadQueueManager, UploadTask } from '../utils/uploadQueue';

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
  onOpenPreEnter?: () => void;
  selectedOrderForPacking?: OrderRecord | null;
  onClearSelectedPackingOrder?: () => void;
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

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    for (const constraint of constraintsToTry) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        if (stream) return stream;
      } catch {
        // Try next fallback constraint
      }
    }
  }

  throw new Error('Webcam stream unavailable. Please check camera connection and allow camera permissions in your browser.');
}

// Initialize MediaRecorder reliably across Chrome, Safari, Edge, Firefox
function createMediaRecorder(stream: MediaStream): MediaRecorder {
  const candidateMimes = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm'
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
  existingOrders,
  onOpenPreEnter,
  selectedOrderForPacking,
  onClearSelectedPackingOrder
}) => {
  const [step, setStep] = useState<StationStep>('READY');
  const [mode, setMode] = useState<EvidenceMode>('both'); // Default: Photo + Video
  const [orderIdInput, setOrderIdInput] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string>('');

  // Package & Shipment metadata
  const [awbInput, setAwbInput] = useState('');
  const [courierInput, setCourierInput] = useState('');
  const [deliveryMethodInput, setDeliveryMethodInput] = useState<string>('Normal');
  const [weightInput, setWeightInput] = useState('');
  const [skuInput, setSkuInput] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const [contactPersonInput, setContactPersonInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');
  const [fulfillFromInput, setFulfillFromInput] = useState('Customized Order');
  const [orderReceivedDateInput, setOrderReceivedDateInput] = useState('');
  const [dispatchDateInput, setDispatchDateInput] = useState('');
  const [orderAmountInput, setOrderAmountInput] = useState('');
  const [shippingAmountInput, setShippingAmountInput] = useState('');
  const [orderTotalInput, setOrderTotalInput] = useState('');
  const [deliveredDateInput, setDeliveredDateInput] = useState('');
  const [itemCountInput, setItemCountInput] = useState('1');
  const [notesInput, setNotesInput] = useState('');
  const [showPackageDetails, setShowPackageDetails] = useState(true);

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

  // Auto-calculate order total when order amount or shipping amount changes
  useEffect(() => {
    const ord = parseFloat(orderAmountInput) || 0;
    const shp = parseFloat(shippingAmountInput) || 0;
    if (ord > 0 || shp > 0) {
      setOrderTotalInput((ord + shp).toFixed(2));
    }
  }, [orderAmountInput, shippingAmountInput]);

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
  const capturePhoto = useCallback((customId?: string): { blob: Blob; dataUrl: string } | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (!width || !height) {
      width = 1920;
      height = 1080;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    try {
      const targetId = customId || activeOrderId || orderIdInput.trim() || 'PACKING';
      const watermarkText = `ORDER ID: ${targetId}`;
      const istDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';

      const fontSize = Math.max(16, Math.floor(height * 0.035));
      ctx.save();
      ctx.font = `bold ${fontSize}px sans-serif`;
      
      const metrics1 = ctx.measureText(watermarkText);
      const metrics2 = ctx.measureText(istDate);
      const textWidth = Math.max(metrics1.width, metrics2.width);
      
      const paddingX = fontSize * 0.8;
      const paddingY = fontSize * 0.5;
      const boxWidth = textWidth + (paddingX * 2);
      const boxHeight = (fontSize * 2.2) + (paddingY * 2);
      
      const margin = Math.max(15, Math.floor(width * 0.02));
      const safeX = Math.max(0, width - boxWidth - margin);
      const safeY = Math.max(0, height - boxHeight - margin);

      // Simple Rect Backdrop (Robust)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(safeX, safeY, boxWidth, boxHeight);

      // Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(safeX, safeY, boxWidth, boxHeight);

      // Text
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top';
      ctx.fillText(watermarkText, safeX + paddingX, safeY + paddingY);

      ctx.fillStyle = '#00E5FF';
      ctx.font = `bold ${Math.floor(fontSize * 0.75)}px monospace`;
      ctx.fillText(istDate, safeX + paddingX, safeY + paddingY + fontSize + 4);
      
      ctx.restore();
    } catch (e) {
      console.warn('Photo watermark rendering error:', e);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    // Convert dataURL to Blob
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    setSnapFlash(true);
    setTimeout(() => setSnapFlash(false), 150);
    playFeedbackTone('snap');

    return { blob, dataUrl };
  }, [activeOrderId, orderIdInput]);

  // Handler: Take photo directly
  const handleTakeSnapshot = useCallback(() => {
    setStationError(null);
    let cleanId = orderIdInput.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
    if (!cleanId && !activeOrderId) {
      cleanId = `ORD-SNAP-${Date.now().toString().slice(-5)}`;
      setOrderIdInput(cleanId);
    }

    const currentId = activeOrderId || cleanId;
    setActiveOrderId(currentId);

    const snapshot = capturePhoto(currentId);
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
  }, [capturePhoto, orderIdInput, activeOrderId, mode, step]);

  // Keyboard shortcut: Press 'Space', 'S', 'C', or 'P' key to capture image while recording or in live feed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === ' ' || e.code === 'Space' || e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTakeSnapshot();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTakeSnapshot]);

  const handleSelectForPacking = useCallback((ord: OrderRecord) => {
    setOrderIdInput(ord.orderId);
    setActiveOrderId(ord.orderId);
    setAwbInput(ord.awbNumber || '');
    setCourierInput(ord.courier || '');
    setDeliveryMethodInput(ord.deliveryMethod || 'Normal');
    setWeightInput(ord.weight || '');
    setSkuInput(ord.productSku || '');
    setCustomerInput(ord.customerName || '');
    setContactPersonInput(ord.contactPerson || '');
    setContactPhoneInput(ord.contactPhone || '');
    setFulfillFromInput(ord.fulfillFrom || 'Customized Order');
    setOrderReceivedDateInput(ord.orderReceivedDate || '');
    setDispatchDateInput(ord.dispatchDate || '');
    setOrderAmountInput(ord.orderAmount || '');
    setShippingAmountInput(ord.shippingAmount || '');
    setOrderTotalInput(ord.orderTotal || '');
    setDeliveredDateInput(ord.deliveredDate || '');
    setItemCountInput(ord.itemCount ? String(ord.itemCount) : '1');
    setNotesInput(ord.notes || '');
    setShowPackageDetails(true);
    setStationError(null);
    playFeedbackTone('beep');
    scanInputRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Auto-fill pre-entered order details if scanned or typed Order ID/AWB matches
  useEffect(() => {
    const q = orderIdInput.trim().toLowerCase();
    if (!q) return;
    const match = existingOrders.find(
      o => o.orderId.toLowerCase() === q || (o.awbNumber && o.awbNumber.toLowerCase() === q)
    );
    if (match) {
      if (match.awbNumber) setAwbInput(match.awbNumber);
      if (match.courier) setCourierInput(match.courier);
      if (match.deliveryMethod) setDeliveryMethodInput(match.deliveryMethod);
      if (match.weight) setWeightInput(match.weight);
      if (match.productSku) setSkuInput(match.productSku);
      if (match.customerName) setCustomerInput(match.customerName);
      if (match.contactPerson) setContactPersonInput(match.contactPerson);
      if (match.contactPhone) setContactPhoneInput(match.contactPhone);
      if (match.fulfillFrom) setFulfillFromInput(match.fulfillFrom);
      if (match.orderReceivedDate) setOrderReceivedDateInput(match.orderReceivedDate);
      if (match.dispatchDate) setDispatchDateInput(match.dispatchDate);
      if (match.orderAmount) setOrderAmountInput(match.orderAmount);
      if (match.shippingAmount) setShippingAmountInput(match.shippingAmount);
      if (match.orderTotal) setOrderTotalInput(match.orderTotal);
      if (match.deliveredDate) setDeliveredDateInput(match.deliveredDate);
      if (match.itemCount) setItemCountInput(String(match.itemCount));
      if (match.notes) setNotesInput(match.notes);
      setShowPackageDetails(true);
    }
  }, [orderIdInput, existingOrders]);

  useEffect(() => {
    if (selectedOrderForPacking) {
      handleSelectForPacking(selectedOrderForPacking);
      if (onClearSelectedPackingOrder) {
        onClearSelectedPackingOrder();
      }
    }
  }, [selectedOrderForPacking, handleSelectForPacking, onClearSelectedPackingOrder]);

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
        const mime = recorder?.mimeType || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: mime.includes('webm') ? 'video/mp4' : mime });
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
        const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
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
    const photosToDispatch = [...capturedPhotos];
    if (photosToDispatch.length === 0 && videoRef.current) {
      const snap = capturePhoto();
      if (snap) {
        photosToDispatch.push({
          id: `thumb_${Date.now()}`,
          blob: snap.blob,
          dataUrl: snap.dataUrl
        });
      }
    }

    // Queue task for Telegram dispatch
    uploadQueueManager.addTask({
      orderId: targetOrderId,
      staffId: currentStaff.id,
      stationId: settings.stationId,
      durationSeconds: timerSeconds,
      evidenceType,
      videoBlob: recordedBlob,
      photoBlobs: photosToDispatch.map(p => p.blob),
      photoDataUrls: photosToDispatch.map(p => p.dataUrl),
      recordingDate: new Date().toISOString(),
      width,
      height,
      awbNumber: awbInput.trim() || undefined,
      courier: courierInput.trim() || undefined,
      deliveryMethod: deliveryMethodInput.trim() || 'Normal',
      weight: weightInput.trim() || undefined,
      productSku: skuInput.trim() || undefined,
      customerName: customerInput.trim() || undefined,
      contactPerson: contactPersonInput.trim() || undefined,
      contactPhone: contactPhoneInput.trim() || undefined,
      fulfillFrom: fulfillFromInput.trim() || undefined,
      orderReceivedDate: orderReceivedDateInput.trim() || undefined,
      dispatchDate: dispatchDateInput.trim() || undefined,
      orderAmount: orderAmountInput.trim() || undefined,
      shippingAmount: shippingAmountInput.trim() || undefined,
      orderTotal: orderTotalInput.trim() || undefined,
      deliveredDate: deliveredDateInput.trim() || undefined,
      itemCount: itemCountInput.trim() || undefined,
      notes: notesInput.trim() || undefined
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
      photoDataUrl: photosToDispatch[0]?.dataUrl,
      awbNumber: awbInput.trim() || undefined,
      courier: courierInput.trim() || undefined,
      deliveryMethod: deliveryMethodInput.trim() || 'Normal',
      weight: weightInput.trim() || undefined,
      productSku: skuInput.trim() || undefined,
      customerName: customerInput.trim() || undefined,
      contactPerson: contactPersonInput.trim() || undefined,
      contactPhone: contactPhoneInput.trim() || undefined,
      fulfillFrom: fulfillFromInput.trim() || undefined,
      orderReceivedDate: orderReceivedDateInput.trim() || undefined,
      dispatchDate: dispatchDateInput.trim() || undefined,
      orderAmount: orderAmountInput.trim() || undefined,
      shippingAmount: shippingAmountInput.trim() || undefined,
      orderTotal: orderTotalInput.trim() || undefined,
      deliveredDate: deliveredDateInput.trim() || undefined,
      itemCount: itemCountInput.trim() || undefined,
      notes: notesInput.trim() || undefined,
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
    setAwbInput('');
    setCourierInput('');
    setWeightInput('');
    setSkuInput('');
    setCustomerInput('');
    setContactPersonInput('');
    setContactPhoneInput('');
    setFulfillFromInput('Customized Order');
    setOrderReceivedDateInput('');
    setDispatchDateInput('');
    setOrderAmountInput('');
    setShippingAmountInput('');
    setOrderTotalInput('');
    setDeliveredDateInput('');
    setItemCountInput('1');
    setNotesInput('');
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

  // Format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const todayCount = existingOrders.filter(o => 
    new Date(o.createdAt).toDateString() === new Date().toDateString()
  ).length;

  const pendingPreOrders = existingOrders.filter(o => 
    o.recordingStatus === 'PENDING' || (o.recordingStatus as string) === 'NOT_RECORDED'
  );

  const handleStartPackingPreOrder = (ord: OrderRecord) => {
    handleSelectForPacking(ord);
  };

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

              {cameraError || !cameraActive ? (
                <div className="p-6 text-center text-slate-200 max-w-lg z-10 font-sans bg-stone-900/95 rounded-2xl border border-stone-800 shadow-2xl m-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3 border border-amber-500/30">
                    <CameraOff className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-extrabold text-white mb-1">Camera Connection & Permission</h3>
                  <p className="text-xs text-stone-300 mb-3 leading-relaxed">
                    {cameraError || 'Webcam stream is unavailable or blocked. Please verify camera hardware connection and grant camera permissions.'}
                  </p>
                  <div className="bg-stone-800/90 p-3 rounded-xl border border-stone-700/80 text-[11px] text-stone-300 max-w-md mx-auto mb-4 font-mono text-left space-y-1">
                    <p className="font-bold text-amber-400 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 shrink-0" /> Allow Camera Permission Instructions:
                    </p>
                    <p>1. Click the lock or camera icon in your browser URL bar</p>
                    <p>2. Set "Camera" permission to <b>Allow</b></p>
                    <p>3. Click "Retry Camera Connection" below</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => initCamera()}
                    className="px-5 py-2.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg inline-flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry Camera Connection</span>
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

                  {/* Floating Button to Capture Image */}
                  <button
                    type="button"
                    onClick={handleTakeSnapshot}
                    className="absolute top-3 right-3 bg-[#832f5e] hover:bg-[#6c234b] text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg z-20 cursor-pointer transition-all active:scale-95 border border-white/20"
                    title="Press 'C' or Spacebar to capture image"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>Capture Image</span>
                  </button>

                  {/* Recording Badge Overlay with Persistent Timer, Progress Bar & Uploaded Chunks */}
                  {isRecording && (
                    <div className="absolute top-3 left-3 right-40 flex flex-col gap-1.5 z-20 pointer-events-none">
                      <div className="bg-rose-600/90 text-white px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center justify-between shadow-lg backdrop-blur">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                          <span>REC SESSION: {formatTime(timerSeconds)}</span>
                        </div>
                        <div className="text-[11px] text-rose-100">
                          Chunks: {chunksRef.current.length}
                        </div>
                      </div>
                      {/* Persistent Progress Bar */}
                      <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden border border-slate-700">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (timerSeconds / 600) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Overhead label */}
                  <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono font-bold text-slate-300">
                    LIVE OVERHEAD FEED
                  </div>

                  {/* Photo Snapshots Count Overlay */}
                  {capturedPhotos.length > 0 && (
                    <div className="absolute bottom-3 right-3 bg-[#832f5e]/90 text-white px-2.5 py-1 rounded-md text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-md">
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

                      {/* Pre-Enter Order Button on Home Page */}
                      {onOpenPreEnter && (
                        <button
                          type="button"
                          onClick={onOpenPreEnter}
                          className="px-4 py-2.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
                          title="Pre-enter order details before recording"
                        >
                          <PackagePlus className="w-4 h-4" />
                          <span>Pre-Enter Order</span>
                        </button>
                      )}
                    </div>
                  </div>


                  {/* Package & Shipment Details Panel */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowPackageDetails(!showPackageDetails)}
                        className="flex items-center gap-2 text-xs font-mono font-bold text-slate-800 hover:text-blue-600 cursor-pointer"
                      >
                        <Box className="w-4 h-4 text-blue-600" />
                        <span>PACKAGE & SHIPMENT DETAILS</span>
                        {showPackageDetails ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                      </button>
                      <span className="text-[10px] font-mono text-slate-500 font-medium">Shared in Telegram caption & stored in Dashboard</span>
                    </div>

                    {showPackageDetails && (
                      <div className="space-y-2.5 pt-1">
                        {/* Delivery Method Selector */}
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                            Delivery Method:
                          </label>
                          <select
                            value={deliveryMethodInput}
                            onChange={(e) => setDeliveryMethodInput(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none font-mono"
                          >
                            <option value="Normal">Normal</option>
                            <option value="Express">Express</option>
                            <option value="Next day delivery (porter/SKS)">Next day delivery (porter/SKS)</option>
                          </select>
                        </div>

                        {/* Courier Partner Quick Selector */}
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                            Courier Partner:
                          </label>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {['Delhivery', 'Blue Dart', 'DTDC', 'Shiprocket', 'Ekart', 'Xpressbees', 'India Post'].map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCourierInput(courierInput === c ? '' : c)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer transition-colors border ${
                                  courierInput === c
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                          <div>
                            <input
                              type="text"
                              value={courierInput}
                              onChange={(e) => setCourierInput(e.target.value)}
                              placeholder="Or type custom courier name..."
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Grid of Inputs: AWB, Weight, SKU, Qty, Customer, Notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-xs">
                          {/* AWB / Tracking No */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              AWB / Tracking Barcode
                            </label>
                            <div className="relative">
                              <Truck className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                              <input
                                type="text"
                                value={awbInput}
                                onChange={(e) => setAwbInput(e.target.value)}
                                placeholder="Scan or enter AWB..."
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Weight */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Package Weight
                            </label>
                            <div className="relative">
                              <Scale className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                              <input
                                type="text"
                                value={weightInput}
                                onChange={(e) => setWeightInput(e.target.value)}
                                placeholder="e.g. 0.45 kg / 450g"
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Item / SKU */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Item / SKU Name
                            </label>
                            <div className="relative">
                              <Tag className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                              <input
                                type="text"
                                value={skuInput}
                                onChange={(e) => setSkuInput(e.target.value)}
                                placeholder="e.g. ZB-TEE-L"
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Qty */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Items Quantity
                            </label>
                            <input
                              type="text"
                              value={itemCountInput}
                              onChange={(e) => setItemCountInput(e.target.value)}
                              placeholder="1"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Customer / City */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Customer / City
                            </label>
                            <input
                              type="text"
                              value={customerInput}
                              onChange={(e) => setCustomerInput(e.target.value)}
                              placeholder="e.g. Rajesh • Mumbai"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Contact Person Name */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Contact Person Name
                            </label>
                            <input
                              type="text"
                              value={contactPersonInput}
                              onChange={(e) => setContactPersonInput(e.target.value)}
                              placeholder="e.g. Amit Sharma"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Contact Person Phone Number */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Contact Phone Number
                            </label>
                            <input
                              type="text"
                              value={contactPhoneInput}
                              onChange={(e) => setContactPhoneInput(e.target.value)}
                              placeholder="e.g. +91 9876543210"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Order Received Date */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Order Received Date
                            </label>
                            <input
                              type="date"
                              value={orderReceivedDateInput}
                              onChange={(e) => setOrderReceivedDateInput(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Despatch Date */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Despatch Date
                            </label>
                            <input
                              type="date"
                              value={dispatchDateInput}
                              onChange={(e) => setDispatchDateInput(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Order Amount */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Order Amount (₹)
                            </label>
                            <input
                              type="text"
                              value={orderAmountInput}
                              onChange={(e) => setOrderAmountInput(e.target.value)}
                              placeholder="e.g. 1499.00"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Shipping Amount */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Shipping Amount (₹)
                            </label>
                            <input
                              type="text"
                              value={shippingAmountInput}
                              onChange={(e) => setShippingAmountInput(e.target.value)}
                              placeholder="e.g. 99.00"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Total Amount */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Total Amount (₹)
                            </label>
                            <input
                              type="text"
                              value={orderTotalInput}
                              onChange={(e) => setOrderTotalInput(e.target.value)}
                              placeholder="Auto or manual total"
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Delivered Date */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Delivered Date (Editable)
                            </label>
                            <input
                              type="date"
                              value={deliveredDateInput}
                              onChange={(e) => setDeliveredDateInput(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                            />
                          </div>

                          {/* Notes / QC Remarks */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                              Notes / QC Remarks
                            </label>
                            <div className="relative">
                              <FileText className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                              <input
                                type="text"
                                value={notesInput}
                                onChange={(e) => setNotesInput(e.target.value)}
                                placeholder="e.g. Packed OK, Bubble wrap"
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
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
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Standalone Button to Capture Image */}
                        <button
                          type="button"
                          onClick={handleTakeSnapshot}
                          className="bg-[#832f5e] hover:bg-[#6c234b] text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md uppercase tracking-wider font-sans"
                          title="Press 'C' or Spacebar on keyboard to capture image"
                        >
                          <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                          <span>CAPTURE IMAGE</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleStartRecording}
                          disabled={!orderIdInput.trim()}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm font-sans uppercase tracking-wider"
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
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 font-mono">
                  
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-800">
                        ORDER: <strong className="text-emerald-700">{activeOrderId}</strong>
                      </span>
                      <span className="text-xs text-slate-600 font-bold">
                        Session: <strong className="text-rose-600 text-sm">{formatTime(timerSeconds)}</strong> / 10:00+ Min
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[11px]">
                        Chunks: {chunksRef.current.length} (Uploaded: {queueTasks.filter(t => t.orderId === activeOrderId && t.status === 'SUCCESS').length})
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Snap Photo During Recording button */}
                      <button
                        type="button"
                        onClick={handleTakeSnapshot}
                        className="bg-[#832f5e] hover:bg-[#6c234b] text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 font-sans"
                        title="Press 'Space', 'S', or 'C' key on keyboard to snap photo frame while recording"
                      >
                        <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                        <span>SNAP PHOTO (Press 'Space' / 'S') [{capturedPhotos.length}]</span>
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

                  {/* Persistent Session Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                      <span>PACKING SESSION DURATION PROGRESS</span>
                      <span>{Math.min(100, Math.round((timerSeconds / 600) * 100))}% (Min 10m Recommended)</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden border border-slate-300">
                      <div 
                        className="bg-emerald-600 h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (timerSeconds / 600) * 100)}%` }}
                      />
                    </div>
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

                  {/* Package Metadata Summary Badge */}
                  {(awbInput || courierInput || weightInput || skuInput || customerInput || contactPersonInput || contactPhoneInput || orderReceivedDateInput || dispatchDateInput || orderAmountInput || shippingAmountInput || orderTotalInput || deliveredDateInput || notesInput) && (
                    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Package Details for Telegram Caption & Dashboard:
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {awbInput && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">AWB: <strong>{awbInput}</strong></span>}
                        {courierInput && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">Courier: <strong>{courierInput}</strong></span>}
                        {weightInput && <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">Weight: <strong>{weightInput}</strong></span>}
                        {skuInput && <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">SKU: <strong>{skuInput}</strong></span>}
                        {itemCountInput && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">Qty: <strong>{itemCountInput}</strong></span>}
                        {customerInput && <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">Customer: <strong>{customerInput}</strong></span>}
                        {contactPersonInput && <span className="bg-cyan-50 text-cyan-800 px-2 py-0.5 rounded border border-cyan-200">Contact: <strong>{contactPersonInput}</strong></span>}
                        {contactPhoneInput && <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200">Phone: <strong>{contactPhoneInput}</strong></span>}
                        {orderReceivedDateInput && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">Received: <strong>{orderReceivedDateInput}</strong></span>}
                        {dispatchDateInput && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">Despatch: <strong>{dispatchDateInput}</strong></span>}
                        {orderAmountInput && <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">Amount: <strong>₹{orderAmountInput}</strong></span>}
                        {shippingAmountInput && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">Shipping: <strong>₹{shippingAmountInput}</strong></span>}
                        {orderTotalInput && <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">Total: <strong>₹{orderTotalInput}</strong></span>}
                        {deliveredDateInput && <span className="bg-green-50 text-green-800 px-2 py-0.5 rounded border border-green-200">Delivered: <strong>{deliveredDateInput}</strong></span>}
                        {notesInput && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">Notes: <strong>{notesInput}</strong></span>}
                      </div>
                    </div>
                  )}

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

        {/* Right Column: Pre-Entered Orders List & Telegram Queue (1 col) */}
        <div className="space-y-4">
          
          {/* Pre-Entered Orders (Pending Packing) Section */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-[#832f5e]" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">
                  Pre-Entered Orders ({pendingPreOrders.length})
                </h3>
              </div>
              {onOpenPreEnter && (
                <button
                  type="button"
                  onClick={onOpenPreEnter}
                  className="px-2.5 py-1 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Order</span>
                </button>
              )}
            </div>

            {pendingPreOrders.length === 0 ? (
              <div className="p-6 text-center text-stone-400 text-xs font-sans">
                No pre-entered orders pending. Click "Add Order" to pre-stage order details.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {pendingPreOrders.map((ord) => (
                  <div 
                    key={ord.orderId}
                    className="p-3 rounded-xl border border-stone-200/90 bg-stone-50/60 hover:bg-white hover:border-[#832f5e]/40 transition-all flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 text-xs truncate">{ord.orderId}</span>
                        <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 text-[9px] font-bold font-mono border border-amber-200 shrink-0">
                          PENDING
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-600 truncate font-sans">
                        {ord.customerName ? `Cust: ${ord.customerName}` : ''}
                        {ord.courier ? ` • ${ord.courier}` : ''}
                        {ord.productSku ? ` • SKU: ${ord.productSku}` : ''}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartPackingPreOrder(ord)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold font-sans shadow-2xs transition-all cursor-pointer flex items-center gap-1 shrink-0"
                      title="Auto-fill details and start packing this order"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Start Packing</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Telegram Upload Queue */}
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
                      <span>{formatISTTimeOnly(task.recordingDate)}</span>
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
  </div>
);
};
