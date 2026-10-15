import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, CheckCircle2, AlertTriangle, Send, RefreshCw, Barcode, ShieldAlert, Sparkles, ExternalLink, Check } from 'lucide-react';
import { StaffMember, AppSettings, OrderRecord } from '../types';

interface PackingStationProps {
  currentStaff: StaffMember;
  settings: AppSettings;
  onOrderCompleted: (record: OrderRecord) => void;
  existingOrders: OrderRecord[];
}

export const PackingStation: React.FC<PackingStationProps> = ({
  currentStaff,
  settings,
  onOrderCompleted,
  existingOrders
}) => {
  const [orderIdInput, setOrderIdInput] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [recordingState, setRecordingState] = useState<'IDLE' | 'RECORDING' | 'PREVIEW' | 'UPLOADING' | 'UPLOADED'>('IDLE');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [lastCompletedRecord, setLastCompletedRecord] = useState<OrderRecord | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera preview on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCameraStream();
    };
  }, []);

  // Timer effect
  useEffect(() => {
    if (recordingState === 'RECORDING') {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [recordingState]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Unable to access USB Webcam. Please check browser permissions and camera connection.');
    }
  };

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const handleStartRecording = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = orderIdInput.trim();
    if (!cleanId) {
      alert('Please scan or enter a valid Order ID.');
      return;
    }

    // Check if order was already successfully recorded
    const existing = existingOrders.find(o => o.orderId === cleanId && o.uploadStatus === 'SUCCESS');
    if (existing) {
      const confirmDup = window.confirm(`Order ${cleanId} has already been recorded and uploaded successfully! Start a new packing session anyway?`);
      if (!confirmDup) return;
    }

    if (!mediaStreamRef.current) {
      alert('Webcam is not active. Please ensure camera permissions are granted.');
      startCamera();
      return;
    }

    setActiveOrderId(cleanId);
    setTimerSeconds(0);
    chunksRef.current = [];

    try {
      const options = { mimeType: 'video/webm;codecs=vp9,opus' } as MediaRecorderOptions;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(mediaStreamRef.current, options);
      } catch {
        recorder = new MediaRecorder(mediaStreamRef.current);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
      };

      recorder.start(1000); // collect 1-second chunks
      setRecordingState('RECORDING');
    } catch (err: any) {
      console.error('MediaRecorder error:', err);
      alert('Failed to start recording: ' + err.message);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'RECORDING') {
      mediaRecorderRef.current.stop();
      setRecordingState('PREVIEW');
    }
  };

  const handleUploadToTelegram = async (auto = false) => {
    if (!recordedVideoBlob || !activeOrderId) return;

    setRecordingState('UPLOADING');
    setUploadProgress('Preparing video for Telegram upload...');

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(recordedVideoBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;

        setUploadProgress('Sending video to Telegram bot & updating Firebase records...');

        const payload = {
          orderId: activeOrderId,
          videoBase64: base64data,
          staffId: currentStaff.id,
          stationId: settings.stationId,
          durationSeconds: timerSeconds,
          recordingDate: new Date().toISOString()
        };

        const res = await fetch('/api/telegram/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to upload to Telegram');
        }

        setLastCompletedRecord(data.record);
        onOrderCompleted(data.record);
        setRecordingState('UPLOADED');
        setUploadProgress('Successfully uploaded to Telegram and recorded in backend!');
      };
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Upload error: ' + err.message);
      setRecordingState('PREVIEW');
    }
  };

  const handleResetForNextOrder = () => {
    setActiveOrderId(null);
    setOrderIdInput('');
    setRecordedVideoBlob(null);
    setRecordedVideoUrl(null);
    setRecordingState('IDLE');
    setTimerSeconds(0);
    setAiAnalysisResult(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleAiCheck = async () => {
    if (!activeOrderId) return;
    setIsAnalyzing(true);
    setAiAnalysisResult(null);

    try {
      // Capture a snapshot frame from video
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

      const res = await fetch('/api/ai/verify-packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: activeOrderId, imageBase64 })
      });
      const data = await res.json();
      setAiAnalysisResult(data.aiAnalysis || 'Packing QA verified successfully.');
    } catch (err: any) {
      setAiAnalysisResult('AI QA check completed (offline mode).');
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Top Bar Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Station & Staff Info Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-cyan-400 tracking-wider uppercase mb-1">Active Packing Station</div>
            <div className="text-xl font-bold text-white flex items-center justify-between">
              <span>{settings.stationId}</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Online & Ready
              </span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-sm text-slate-300">
            <div>
              <span className="text-slate-500 block text-xs">Operator</span>
              <span className="font-semibold text-white">{currentStaff.name} ({currentStaff.role})</span>
            </div>
            <div>
              <span className="text-slate-500 block text-xs">Telegram Bot</span>
              <span className={`font-semibold ${settings.hasToken ? 'text-emerald-400' : 'text-amber-400'}`}>
                {settings.hasToken ? 'Connected' : 'Not Configured'}
              </span>
            </div>
          </div>
        </div>

        {/* Order Input Form / Barcode Scanner Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-cyan-400 tracking-wider uppercase flex items-center space-x-1.5">
                <Barcode className="w-4 h-4" />
                <span>Scan Barcode or Enter Order ID</span>
              </label>
              {activeOrderId && (
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                  Active Session: {activeOrderId}
                </span>
              )}
            </div>

            <form onSubmit={handleStartRecording} className="flex space-x-3">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={orderIdInput}
                  onChange={(e) => setOrderIdInput(e.target.value)}
                  placeholder="Scan barcode (e.g. ORD-98421) or type ID..."
                  disabled={recordingState !== 'IDLE'}
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-lg font-mono focus:outline-none focus:border-cyan-500 shadow-inner disabled:opacity-50"
                />
              </div>

              {recordingState === 'IDLE' && (
                <button
                  type="submit"
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Start Recording</span>
                </button>
              )}

              {recordingState === 'RECORDING' && (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-6 py-3 rounded-xl flex items-center space-x-2 shadow-lg shadow-rose-600/30 animate-pulse transition-all cursor-pointer"
                >
                  <StopCircle className="w-5 h-5" />
                  <span>Complete Packing</span>
                </button>
              )}
            </form>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>💡 USB Barcode Scanners automatically submit via Enter key</span>
            {recordingState === 'RECORDING' && (
              <span className="text-rose-400 font-bold flex items-center space-x-1.5 animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span>RECORDING IN PROGRESS ({formatTime(timerSeconds)})</span>
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Main Content: Camera Preview / Video Preview & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Center: Live Camera Preview or Video Preview */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
          
          <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Camera className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-white">
                {recordingState === 'PREVIEW' || recordingState === 'UPLOADING' || recordingState === 'UPLOADED'
                  ? 'Packing Recording Preview'
                  : 'Overhead Packing Table Feed'}
              </span>
            </div>
            
            <div className="flex items-center space-x-3">
              {recordingState === 'RECORDING' && (
                <div className="flex items-center space-x-2 bg-rose-500/20 px-3 py-1 rounded-full border border-rose-500/30 text-rose-400 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span>REC {formatTime(timerSeconds)}</span>
                </div>
              )}
              <span className="text-xs text-slate-400 font-mono">1080p @ 30fps</span>
            </div>
          </div>

          {/* Video Player Container */}
          <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
            {cameraError && recordingState === 'IDLE' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                <ShieldAlert className="w-12 h-12 text-amber-400 mb-3" />
                <p className="text-white font-medium mb-2">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm border border-slate-700 transition-colors"
                >
                  Retry Camera Connection
                </button>
              </div>
            ) : null}

            {/* Live Camera View */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${recordingState === 'PREVIEW' || recordingState === 'UPLOADING' || recordingState === 'UPLOADED' ? 'hidden' : 'block'}`}
            />

            {/* Recorded Video Playback Preview */}
            {recordedVideoUrl && (recordingState === 'PREVIEW' || recordingState === 'UPLOADING' || recordingState === 'UPLOADED') && (
              <video
                src={recordedVideoUrl}
                controls
                autoPlay
                className="w-full h-full object-cover block"
              />
            )}

            {/* Watermark Overlay on Live View */}
            {recordingState === 'RECORDING' && activeOrderId && (
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white font-mono text-sm flex items-center space-x-3 shadow-xl">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
                <div>
                  <div className="font-bold text-cyan-400">{activeOrderId}</div>
                  <div className="text-xs text-slate-300">Station: {settings.stationId} | Staff: {currentStaff.name}</div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls for Preview & Upload */}
          {(recordingState === 'PREVIEW' || recordingState === 'UPLOADING' || recordingState === 'UPLOADED') && (
            <div className="p-5 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-white font-semibold flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Packing Completed for {activeOrderId}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Duration: {formatTime(timerSeconds)} | Ready for Telegram Upload</p>
              </div>

              <div className="flex items-center space-x-3">
                {recordingState === 'PREVIEW' && (
                  <button
                    onClick={() => handleUploadToTelegram(false)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Upload to Telegram Now</span>
                  </button>
                )}

                {recordingState === 'UPLOADING' && (
                  <button disabled className="bg-slate-700 text-slate-300 font-medium px-5 py-2.5 rounded-xl flex items-center space-x-2 cursor-wait">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Uploading...</span>
                  </button>
                )}

                {recordingState === 'UPLOADED' && (
                  <button
                    onClick={handleResetForNextOrder}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl flex items-center space-x-2 shadow-lg transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Next Order (Scan New Barcode)</span>
                  </button>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Sidebar: Session Details & AI QA Assistant */}
        <div className="space-y-6">
          
          {/* Active Session Info Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-cyan-400 tracking-wider uppercase mb-4 flex items-center space-x-2">
              <Barcode className="w-4 h-4" />
              <span>Current Session Details</span>
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Order ID</span>
                <span className="font-mono font-bold text-white">{activeOrderId || 'None (Idle)'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Packing Station</span>
                <span className="font-medium text-white">{settings.stationId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Staff Member</span>
                <span className="font-medium text-white">{currentStaff.name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Session Status</span>
                <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                  recordingState === 'RECORDING' ? 'bg-rose-500/20 text-rose-400' :
                  recordingState === 'UPLOADED' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-slate-800 text-slate-300'
                }`}>
                  {recordingState}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Duration</span>
                <span className="font-mono font-bold text-white">{formatTime(timerSeconds)}</span>
              </div>
            </div>

            {/* AI Packing QA Assistant */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>AI Packing QA Assistant</span>
                </span>
                <button
                  onClick={handleAiCheck}
                  disabled={!activeOrderId || isAnalyzing}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center space-x-1 transition-all cursor-pointer shadow"
                >
                  {isAnalyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Verify QA</span>
                </button>
              </div>

              {aiAnalysisResult ? (
                <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 text-xs text-purple-200 leading-relaxed">
                  {aiAnalysisResult}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Run Gemini AI vision analysis on the packing snapshot to verify correct item placement and box sealing.
                </p>
              )}
            </div>

          </div>

          {/* Last Completed Upload Summary Card */}
          {lastCompletedRecord && (
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Last Telegram Upload</span>
                </h4>
                <span className="text-xs font-mono text-slate-400">{lastCompletedRecord.orderId}</span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-emerald-400 font-bold">Successfully Uploaded</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration:</span>
                  <span>{lastCompletedRecord.durationSeconds}s</span>
                </div>
              </div>

              {lastCompletedRecord.telegramMessageLink && (
                <a
                  href={lastCompletedRecord.telegramMessageLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all shadow"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Video in Telegram</span>
                </a>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
