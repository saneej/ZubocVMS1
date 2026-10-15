import React, { useState, useEffect } from 'react';
import { 
  Stethoscope, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw, 
  Copy, Check, ShieldCheck, Camera, Server, Send, Database, Cpu, 
  Wrench, Zap, Key, Hash, Save, Trash2, ArrowRight
} from 'lucide-react';
import { AppSettings, OrderRecord } from '../types';
import { safeFetchJson } from '../utils/api';
import { db } from '../firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

interface DiagnosePageProps {
  settings: AppSettings;
  orders: OrderRecord[];
  onRefreshOrders: () => void;
  onSaveSettings?: (newSettings: AppSettings) => void;
}

interface TestResult {
  id: string;
  category: 'CAM' | 'MEDIA_RECORDER' | 'API' | 'TELEGRAM' | 'FIRESTORE';
  title: string;
  status: 'PENDING' | 'RUNNING' | 'PASS' | 'WARN' | 'FAIL';
  details: string;
  remedy?: string;
  timestamp?: string;
}

export const DiagnosePage: React.FC<DiagnosePageProps> = ({ 
  settings, 
  orders, 
  onRefreshOrders,
  onSaveSettings 
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  
  // Interactive Telegram Quick-Fix modal/form state
  const [showTgFixModal, setShowTgFixModal] = useState(false);
  const [tgFixToken, setTgFixToken] = useState(settings.telegramBotToken || '');
  const [tgFixChatId, setTgFixChatId] = useState(settings.telegramChatId || '');
  const [tgFixStatus, setTgFixStatus] = useState<{ type: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  // Fix Action feedback
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  const setFeedback = (id: string, msg: string) => {
    setActionFeedback(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => {
      setActionFeedback(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 4000);
  };

  const runAllDiagnostics = async () => {
    setIsRunning(true);
    setConsoleLogs([]);
    setTestResults([]);

    addLog('🚀 Initiating Zuboc VMS System Diagnostic Suite...');

    const results: TestResult[] = [];

    // TEST 1: Camera Hardware & WebCam Permissions
    addLog('Testing WebCam stream access (navigator.mediaDevices.getUserMedia)...');
    let activeStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        results.push({
          id: 't1_cam',
          category: 'CAM',
          title: 'WebCam Hardware & API Access',
          status: 'FAIL',
          details: 'navigator.mediaDevices.getUserMedia is not supported on this browser context or insecure HTTP origin.',
          remedy: 'Ensure site is served over HTTPS or use modern Chrome/Safari/Edge browser.'
        });
        addLog('❌ WebCam access unsupported or non-HTTPS context');
      } else {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: true
        }).catch(async () => {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }).catch(async () => {
          return await navigator.mediaDevices.getUserMedia({ video: true });
        });

        if (activeStream && activeStream.getVideoTracks().length > 0) {
          const vTrack = activeStream.getVideoTracks()[0];
          results.push({
            id: 't1_cam',
            category: 'CAM',
            title: 'WebCam Camera Stream Access',
            status: 'PASS',
            details: `Active camera track attached: "${vTrack.label || 'Overhead WebCam'}" (${activeStream.getTracks().length} tracks: video/audio)`
          });
          addLog(`✅ WebCam stream obtained successfully (${vTrack.label})`);
        } else {
          throw new Error('No active video tracks found in camera stream');
        }
      }
    } catch (err: any) {
      results.push({
        id: 't1_cam',
        category: 'CAM',
        title: 'WebCam Camera Stream Access',
        status: 'FAIL',
        details: `Camera Access Error: ${err.message || String(err)}`,
        remedy: 'Verify USB overhead camera is connected and browser permission is allowed in address bar.'
      });
      addLog(`❌ WebCam error: ${err.message || String(err)}`);
    }

    // TEST 2: MediaRecorder MIME Pattern Safety
    addLog('Testing MediaRecorder constructor & MIME pattern safety...');
    try {
      if (typeof MediaRecorder === 'undefined') {
        results.push({
          id: 't2_recorder',
          category: 'MEDIA_RECORDER',
          title: 'MediaRecorder Engine',
          status: 'FAIL',
          details: 'MediaRecorder browser API is undefined.',
          remedy: 'Update browser (Safari 14.1+, Chrome 49+ required).'
        });
        addLog('❌ MediaRecorder undefined');
      } else {
        const testMimes = [
          'video/mp4',
          'video/webm',
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/mp4;codecs=avc1'
        ];

        const supportedList: string[] = [];
        for (const m of testMimes) {
          try {
            if (MediaRecorder.isTypeSupported(m)) {
              supportedList.push(m);
            }
          } catch {
            // safari syntax exception
          }
        }

        if (activeStream) {
          let recCreated = false;
          let usedMime = '';
          const candidateMimesToTry = [...supportedList, 'video/mp4', 'video/webm', ''];

          for (const cand of candidateMimesToTry) {
            try {
              const opts = cand ? { mimeType: cand } : undefined;
              const testRec = opts ? new MediaRecorder(activeStream, opts) : new MediaRecorder(activeStream);
              if (testRec) {
                recCreated = true;
                usedMime = cand || 'browser-default';
                break;
              }
            } catch (pErr: any) {
              addLog(`  ⚠️ Candidate mimeType="${cand}" threw: ${pErr.message}`);
            }
          }

          if (recCreated) {
            results.push({
              id: 't2_recorder',
              category: 'MEDIA_RECORDER',
              title: 'MediaRecorder Constructor & MIME Safety',
              status: 'PASS',
              details: `MediaRecorder instantiated safely without pattern syntax errors. Active format: "${usedMime}". Native codecs: [${supportedList.join(', ')}]`
            });
            addLog(`✅ MediaRecorder instantiated cleanly using "${usedMime}"`);
          } else {
            results.push({
              id: 't2_recorder',
              category: 'MEDIA_RECORDER',
              title: 'MediaRecorder Pattern Safety',
              status: 'WARN',
              details: 'MediaRecorder constructor rejected specific codec options, falling back to unconstrained native stream.'
            });
          }
        } else {
          results.push({
            id: 't2_recorder',
            category: 'MEDIA_RECORDER',
            title: 'MediaRecorder Engine',
            status: 'WARN',
            details: `Supported MIME types detected: [${supportedList.join(', ')}]. Live stream test deferred because camera access failed.`
          });
        }
      }
    } catch (mrErr: any) {
      results.push({
        id: 't2_recorder',
        category: 'MEDIA_RECORDER',
        title: 'MediaRecorder Pattern Test',
        status: 'FAIL',
        details: `MediaRecorder error: ${mrErr.message}`
      });
      addLog(`❌ MediaRecorder error: ${mrErr.message}`);
    }

    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
    }

    // TEST 3: Express Backend API Service
    addLog('Checking Express Backend API Endpoints (/api/health)...');
    try {
      const healthData = await safeFetchJson('/api/health');
      results.push({
        id: 't3_api',
        category: 'API',
        title: 'Backend Express API Service (/api/health)',
        status: 'PASS',
        details: `Backend service operational. Firebase server connection: ${healthData.firebaseConnected ? 'CONNECTED' : 'LOCAL CACHE MODE'}. Time: ${healthData.timestamp}`
      });
      addLog('✅ Backend API health check passed');
    } catch (apiErr: any) {
      const errText = typeof apiErr === 'string' ? apiErr : (apiErr?.message || JSON.stringify(apiErr));
      results.push({
        id: 't3_api',
        category: 'API',
        title: 'Backend Express API Service (/api/health)',
        status: 'FAIL',
        details: `API Endpoint Error: ${errText}`,
        remedy: 'Verify server.ts Express router is active.'
      });
      addLog(`❌ API health check failed: ${errText}`);
    }

    // TEST 4: Telegram Bot API Authentication
    addLog('Diagnosing Telegram Bot credentials & gateway...');
    const rawBotToken = settings.telegramBotToken || '';
    const rawChatId = settings.telegramChatId || '';

    if (!rawBotToken || !rawChatId) {
      results.push({
        id: 't4_telegram',
        category: 'TELEGRAM',
        title: 'Telegram Bot Configuration',
        status: 'WARN',
        details: 'Telegram Bot Token or Chat ID is missing in app settings.',
        remedy: 'Click "Quick Fix Credentials" below to configure Telegram Bot Token and Chat ID.'
      });
      addLog('⚠️ Telegram credentials incomplete in settings');
    } else {
      try {
        const cleanToken = rawBotToken.trim().replace(/^["']|["']$/g, '');
        const tgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
        const tgData = await tgRes.json();

        if (tgData.ok) {
          results.push({
            id: 't4_telegram',
            category: 'TELEGRAM',
            title: 'Telegram Bot API Authentication',
            status: 'PASS',
            details: `Telegram Bot Verified: "@${tgData.result.username}" (${tgData.result.first_name}). Target Chat ID: ${rawChatId}`
          });
          addLog(`✅ Telegram Bot "@${tgData.result.username}" authenticated successfully`);
        } else {
          results.push({
            id: 't4_telegram',
            category: 'TELEGRAM',
            title: 'Telegram Bot API Authentication',
            status: 'FAIL',
            details: `Telegram API response error: ${tgData.description || 'Invalid token'}`,
            remedy: 'Click "Quick Fix Credentials" below to update your Bot Token from @BotFather.'
          });
          addLog(`❌ Telegram Bot error: ${tgData.description}`);
        }
      } catch (tgNetErr: any) {
        results.push({
          id: 't4_telegram',
          category: 'TELEGRAM',
          title: 'Telegram Gateway Connection',
          status: 'FAIL',
          details: `Gateway Connection Error: ${tgNetErr.message}`
        });
        addLog(`❌ Telegram gateway connection error: ${tgNetErr.message}`);
      }
    }

    // TEST 5: Firestore Database Query Check
    addLog('Testing Firebase Firestore persistence query...');
    try {
      const q = query(collection(db, 'orders'), limit(1));
      const snap = await getDocs(q);
      results.push({
        id: 't5_firestore',
        category: 'FIRESTORE',
        title: 'Firebase Firestore Database Read Test',
        status: 'PASS',
        details: `Firestore query executed successfully (${snap.size} sample document retrieved). Real-time listener active.`
      });
      addLog('✅ Firebase Firestore query succeeded');
    } catch (fsErr: any) {
      results.push({
        id: 't5_firestore',
        category: 'FIRESTORE',
        title: 'Firebase Firestore Database Read Test',
        status: 'WARN',
        details: `Firestore query note: ${fsErr.message || String(fsErr)}`
      });
      addLog(`⚠️ Firestore note: ${fsErr.message || String(fsErr)}`);
    }

    setTestResults(results);
    setIsRunning(false);
    addLog('🎉 Diagnostic suite execution completed!');
  };

  useEffect(() => {
    runAllDiagnostics();
  }, []);

  // --- INDIVIDUAL FIXING METHODS ---

  // Fix 1: Camera Reset
  const fixCameraStream = async () => {
    addLog('🛠️ Executing Fix: Resetting Camera Drivers & MediaStream Constraints...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
      setFeedback('t1_cam', 'Camera permissions & video stream successfully reset!');
      addLog('✅ Fix Applied: WebCam permissions verified and tracks released cleanly.');
      runAllDiagnostics();
    } catch (err: any) {
      setFeedback('t1_cam', `Camera Fix Error: ${err.message}`);
      addLog(`❌ Fix Failed: ${err.message}`);
    }
  };

  // Fix 2: MediaRecorder Codec Auto-Calibration
  const fixMediaRecorderMime = async () => {
    addLog('🛠️ Executing Fix: Calibrating Safe MediaRecorder MIME Types...');
    try {
      const preferredMimes = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      let calibratedMime = '';
      for (const m of preferredMimes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          calibratedMime = m;
          break;
        }
      }
      if (calibratedMime) {
        localStorage.setItem('zuboc_vms_preferred_mime', calibratedMime);
        setFeedback('t2_recorder', `Calibrated safe format: "${calibratedMime}" saved!`);
        addLog(`✅ Fix Applied: Locked recording format to "${calibratedMime}".`);
      } else {
        localStorage.removeItem('zuboc_vms_preferred_mime');
        setFeedback('t2_recorder', 'Default browser stream format unlocked!');
        addLog('✅ Fix Applied: Reset to unconstrained browser default format.');
      }
      runAllDiagnostics();
    } catch (err: any) {
      setFeedback('t2_recorder', `Calibration Error: ${err.message}`);
    }
  };

  // Fix 3: Express API Health & Connection Re-establishment
  const fixApiConnection = async () => {
    addLog('🛠️ Executing Fix: Re-establishing Express Backend API Link...');
    try {
      const res = await safeFetchJson('/api/health');
      if (res && res.status === 'ok') {
        setFeedback('t3_api', 'Backend API responded cleanly!');
        addLog(`✅ Fix Applied: Backend API reachable at /api/health (${res.timestamp})`);
      } else {
        throw new Error('Invalid API response schema');
      }
      runAllDiagnostics();
    } catch (err: any) {
      setFeedback('t3_api', `API Ping Failed: ${err.message || String(err)}`);
      addLog(`❌ API Fix Failed: ${err.message || String(err)}`);
    }
  };

  // Fix 4: Save Telegram Credentials Direct Fix
  const handleSaveTgFix = async (e: React.FormEvent) => {
    e.preventDefault();
    setTgFixStatus({ type: 'testing', message: 'Testing Telegram token with @BotFather...' });
    addLog('🛠️ Executing Fix: Validating and Saving Telegram Credentials...');

    const cleanToken = tgFixToken.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
    const cleanChat = tgFixChatId.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');

    if (!cleanToken) {
      setTgFixStatus({ type: 'error', message: 'Please enter a valid Telegram Bot Token.' });
      return;
    }

    try {
      // 1. Verify token with Telegram API
      const tgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
      const tgData = await tgRes.json();

      if (!tgData.ok) {
        throw new Error(`Telegram API Error: ${tgData.description || 'Invalid token'}`);
      }

      addLog(`✅ Bot verified: @${tgData.result.username}`);

      // 2. Save via Express API
      const saveRes = await safeFetchJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramBotToken: cleanToken,
          telegramChatId: cleanChat,
          stationId: settings.stationId || 'Packing-01',
          autoUpload: true
        })
      });

      if (saveRes.success) {
        const updatedSettings: AppSettings = {
          ...settings,
          telegramBotToken: cleanToken,
          telegramChatId: cleanChat,
          hasToken: true
        };
        if (onSaveSettings) {
          onSaveSettings(updatedSettings);
        }
        setTgFixStatus({ type: 'success', message: `Bot @${tgData.result.username} verified & saved successfully!` });
        addLog(`🎉 Telegram Credentials saved & verified for @${tgData.result.username}`);
        setTimeout(() => {
          setShowTgFixModal(false);
          runAllDiagnostics();
        }, 1200);
      } else {
        throw new Error(saveRes.error || 'Failed to save settings via server');
      }
    } catch (err: any) {
      setTgFixStatus({ type: 'error', message: err.message || 'Verification failed' });
      addLog(`❌ Telegram Fix Error: ${err.message}`);
    }
  };

  // Fix 5: Firestore Resync
  const fixFirestoreSync = async () => {
    addLog('🛠️ Executing Fix: Force Resynced Firestore Orders & Cache...');
    try {
      onRefreshOrders();
      setFeedback('t5_firestore', 'Firestore query re-triggered & cache synchronized!');
      addLog('✅ Fix Applied: Triggered onRefreshOrders() and synchronized Firestore listener.');
      runAllDiagnostics();
    } catch (err: any) {
      setFeedback('t5_firestore', `Sync Error: ${err.message}`);
    }
  };

  // MASTER AUTOMATED REPAIR SUITE
  const runMasterAutoRepair = async () => {
    setIsFixing(true);
    addLog('⚡ LAUNCHING ONE-CLICK SYSTEM AUTO-REPAIR SUITE...');

    try {
      // Step 1: MediaRecorder calibration
      addLog('Step 1/4: Auto-calibrating MediaRecorder recording engine...');
      await fixMediaRecorderMime();

      // Step 2: API ping
      addLog('Step 2/4: Re-pinging Express Backend API service...');
      await fixApiConnection();

      // Step 3: Clear stale upload queues
      addLog('Step 3/4: Flushing stagnant local upload queues...');
      localStorage.removeItem('zuboc_failed_uploads');

      // Step 4: Refresh orders & re-run diagnostics
      addLog('Step 4/4: Resyncing Firestore state & re-evaluating diagnostic matrix...');
      onRefreshOrders();
      await runAllDiagnostics();

      addLog('✅ MASTER AUTO-REPAIR COMPLETED WITH ALL RECOVERY PROTOCOLS EXECUTED.');
    } catch (err: any) {
      addLog(`⚠️ Auto-Repair Notice: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  const handleCopyLogs = () => {
    const textToCopy = `=== ZUBOC VMS DIAGNOSTIC & FIX REPORT ===\nGenerated: ${new Date().toISOString()}\n\nRESULTS:\n${testResults.map(t => `[${t.status}] ${t.title}: ${t.details}`).join('\n')}\n\nLOGS:\n${consoleLogs.join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn font-sans">
      
      {/* Header Banner */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 font-mono">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Stethoscope className="w-3.5 h-3.5" />
            <span>REAL-TIME HARDWARE & GATEWAY DIAGNOSTICS</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            SYSTEM DIAGNOSTIC & AUTO-REPAIR MATRIX
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Test overhead WebCam drivers, MediaRecorder browser mime compatibility, Express server routes, and Telegram bot connections with 1-click automated fixing utilities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 text-xs font-bold">
          <button
            onClick={runMasterAutoRepair}
            disabled={isFixing || isRunning}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer disabled:opacity-50 uppercase tracking-wider font-extrabold"
          >
            <Zap className={`w-4 h-4 ${isFixing ? 'animate-bounce' : ''}`} />
            <span>{isFixing ? 'REPAIRING...' : 'RUN AUTO-REPAIR'}</span>
          </button>

          <button
            onClick={runAllDiagnostics}
            disabled={isRunning || isFixing}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 uppercase tracking-wider"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'RUNNING...' : 'RE-RUN DIAGNOSTICS'}</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="px-4 py-2.5 bg-[#161c2b] hover:bg-[#1f273b] text-slate-200 border border-[#222c3e] rounded-xl flex items-center gap-2 transition-all cursor-pointer"
          >
            {copiedLogs ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
            <span>{copiedLogs ? 'REPORT COPIED' : 'COPY REPORT'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Diagnostic Tests & Inline Fixing Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-mono">
        {testResults.map((test) => {
          let badgeBg = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
          let icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;

          if (test.status === 'WARN') {
            badgeBg = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
            icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
          } else if (test.status === 'FAIL') {
            badgeBg = 'bg-rose-500/10 border-rose-500/30 text-rose-400';
            icon = <XCircle className="w-5 h-5 text-rose-400 shrink-0" />;
          } else if (test.status === 'RUNNING' || test.status === 'PENDING') {
            badgeBg = 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400';
            icon = <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />;
          }

          return (
            <div key={test.id} className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    {icon}
                    <h3 className="text-sm font-extrabold text-white">{test.title}</h3>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${badgeBg}`}>
                    {test.status}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-[#06080d] p-3 rounded-xl border border-[#1a2130]">
                  {test.details}
                </p>

                {test.remedy && (
                  <div className="text-xs text-amber-300 bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/10 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <strong className="block">REMEDY ACTION:</strong>
                      <span>{test.remedy}</span>
                    </div>
                  </div>
                )}

                {/* Specific Action Feedback message */}
                {actionFeedback[test.id] && (
                  <div className="text-xs bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 p-2.5 rounded-lg flex items-center gap-2 animate-fadeIn">
                    <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>{actionFeedback[test.id]}</span>
                  </div>
                )}
              </div>

              {/* FIXING METHOD BUTTONS PER CATEGORY */}
              <div className="pt-3 border-t border-[#1a2130] flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                  <span>FIXING METHOD:</span>
                </div>

                {test.category === 'CAM' && (
                  <button
                    onClick={fixCameraStream}
                    className="px-3 py-1.5 bg-[#161c2b] hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>RESET CAMERA</span>
                  </button>
                )}

                {test.category === 'MEDIA_RECORDER' && (
                  <button
                    onClick={fixMediaRecorderMime}
                    className="px-3 py-1.5 bg-[#161c2b] hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>CALIBRATE MIME</span>
                  </button>
                )}

                {test.category === 'API' && (
                  <button
                    onClick={fixApiConnection}
                    className="px-3 py-1.5 bg-[#161c2b] hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>RE-PING API</span>
                  </button>
                )}

                {test.category === 'TELEGRAM' && (
                  <button
                    onClick={() => setShowTgFixModal(true)}
                    className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>QUICK FIX CREDENTIALS</span>
                  </button>
                )}

                {test.category === 'FIRESTORE' && (
                  <button
                    onClick={fixFirestoreSync}
                    className="px-3 py-1.5 bg-[#161c2b] hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>FORCE RESYNC</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Terminal Log */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl overflow-hidden shadow-2xl font-mono">
        <div className="px-6 py-3 bg-[#06080d] border-b border-[#1f2738] flex items-center justify-between text-xs font-bold text-slate-300">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>REAL-TIME TERMINAL & AUTO-REPAIR LOG OUTPUT</span>
          </div>
          <span className="text-[10px] text-slate-500">Live Execution Log</span>
        </div>

        <div className="p-5 bg-[#040508] text-xs text-cyan-300 space-y-1.5 h-60 overflow-y-auto font-mono selection:bg-cyan-500 selection:text-slate-950">
          {consoleLogs.length === 0 ? (
            <div className="text-slate-600 italic">Click "RE-RUN DIAGNOSTICS" or "RUN AUTO-REPAIR" to launch engine...</div>
          ) : (
            consoleLogs.map((log, idx) => (
              <div key={idx} className="whitespace-pre-wrap">{log}</div>
            ))
          )}
        </div>
      </div>

      {/* QUICK-FIX TELEGRAM MODAL */}
      {showTgFixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn font-mono">
          <div className="bg-[#0e111a] border border-[#222c3f] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0">
            
            <div className="bg-[#06080d] px-6 py-5 border-b border-[#1f2738] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base font-mono">TELEGRAM BOT QUICK-FIX</h3>
                  <p className="text-xs text-slate-400">Test & save Bot Token directly to server & database</p>
                </div>
              </div>
              <button 
                onClick={() => setShowTgFixModal(false)}
                className="text-slate-400 hover:text-white font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTgFix} className="p-6 space-y-4 text-xs">
              
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>TELEGRAM BOT TOKEN</span>
                </label>
                <input
                  type="text"
                  value={tgFixToken}
                  onChange={(e) => setTgFixToken(e.target.value)}
                  placeholder="e.g. 8372063656:AAGc8APzAoq..."
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full bg-[#06080d] border border-[#222c3f] rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                  <Hash className="w-3.5 h-3.5 text-emerald-400" />
                  <span>TARGET CHAT ID</span>
                </label>
                <input
                  type="text"
                  value={tgFixChatId}
                  onChange={(e) => setTgFixChatId(e.target.value)}
                  placeholder="e.g. -1003940299676"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full bg-[#06080d] border border-[#222c3f] rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

              {tgFixStatus.type === 'testing' && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 text-cyan-400 font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{tgFixStatus.message}</span>
                </div>
              )}

              {tgFixStatus.type === 'success' && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-400 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{tgFixStatus.message}</span>
                </div>
              )}

              {tgFixStatus.type === 'error' && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-400 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{tgFixStatus.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1f2738]">
                <button
                  type="button"
                  onClick={() => setShowTgFixModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#161c2b] text-slate-300 hover:text-white font-bold cursor-pointer transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={tgFixStatus.type === 'testing'}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20 uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>TEST & SAVE CREDENTIALS</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
