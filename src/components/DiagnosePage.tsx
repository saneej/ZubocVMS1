import React, { useState, useEffect } from 'react';
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw, Copy, Check, ShieldCheck, Camera, Server, Send, Database, Cpu } from 'lucide-react';
import { AppSettings, OrderRecord } from '../types';
import { safeFetchJson } from '../utils/api';
import { db } from '../firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

interface DiagnosePageProps {
  settings: AppSettings;
  orders: OrderRecord[];
  onRefreshOrders: () => void;
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

export const DiagnosePage: React.FC<DiagnosePageProps> = ({ settings, orders, onRefreshOrders }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  const runAllDiagnostics = async () => {
    setIsRunning(true);
    setConsoleLogs([]);
    setTestResults([]);

    addLog('🚀 Starting Zuboc VMS Deep System Diagnostics...');

    const results: TestResult[] = [];

    // TEST 1: Camera Permissions & UserMedia
    addLog('Testing WebCam stream access (navigator.mediaDevices.getUserMedia)...');
    let streamSuccess = false;
    let activeStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        results.push({
          id: 't1_cam',
          category: 'CAM',
          title: 'WebCam Hardware & API Access',
          status: 'FAIL',
          details: 'navigator.mediaDevices.getUserMedia is not supported on this browser context or insecure origin (HTTP vs HTTPS).',
          remedy: 'Use a secure HTTPS domain or modern WebKit/Blink browser with camera permissions enabled.'
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
          streamSuccess = true;
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
        remedy: 'Verify USB overhead camera is connected, and browser camera permission is allowed in address bar.'
      });
      addLog(`❌ WebCam error: ${err.message || String(err)}`);
    }

    // TEST 2: MediaRecorder Constructor & Pattern Validation
    addLog('Testing MediaRecorder MIME types andConstructor Pattern safety...');
    try {
      if (typeof MediaRecorder === 'undefined') {
        results.push({
          id: 't2_recorder',
          category: 'MEDIA_RECORDER',
          title: 'MediaRecorder Browser Engine',
          status: 'FAIL',
          details: 'MediaRecorder browser API is entirely undefined.',
          remedy: 'Update browser (Safari 14.1+, Chrome 49+, iOS Safari 14.5+ required).'
        });
        addLog('❌ MediaRecorder undefined in this browser');
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
            // safari throws on invalid regex strings
          }
        }

        addLog(`MediaRecorder supported MIME types: ${supportedList.length > 0 ? supportedList.join(', ') : 'Default native fallback only'}`);

        // Live MediaRecorder Instantiation Test (Fixing "string did not match expected pattern")
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
              title: 'MediaRecorder Initialization & Pattern Test',
              status: 'PASS',
              details: `Successfully initialized MediaRecorder without pattern syntax errors. Safe MIME format selected: "${usedMime}". Native supported codecs: [${supportedList.join(', ')}]`
            });
            addLog(`✅ MediaRecorder test instantiated cleanly using "${usedMime}"`);
          } else {
            results.push({
              id: 't2_recorder',
              category: 'MEDIA_RECORDER',
              title: 'MediaRecorder Pattern Safety',
              status: 'WARN',
              details: 'MediaRecorder constructor rejected specific codec options, but generic recorder can function.',
              remedy: 'The system automatically falls back to unconstrained native stream encoding.'
            });
          }
        } else {
          results.push({
            id: 't2_recorder',
            category: 'MEDIA_RECORDER',
            title: 'MediaRecorder Engine',
            status: 'WARN',
            details: `Supported MIME types detected: [${supportedList.join(', ')}]. Could not perform live recording test because camera stream failed.`
          });
        }
      }
    } catch (mrErr: any) {
      results.push({
        id: 't2_recorder',
        category: 'MEDIA_RECORDER',
        title: 'MediaRecorder Pattern Test',
        status: 'FAIL',
        details: `MediaRecorder throw: ${mrErr.message}`,
        remedy: 'Ensure browser is updated and not blocking video track MIME constraints.'
      });
      addLog(`❌ MediaRecorder error: ${mrErr.message}`);
    }

    // Stop test camera stream
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
    }

    // TEST 3: Backend Express & Server Endpoint Health Check
    addLog('Checking Backend API Endpoints (/api/health, /api/settings, /api/orders)...');
    try {
      const healthData = await safeFetchJson('/api/health');
      results.push({
        id: 't3_api',
        category: 'API',
        title: 'Backend API Service (/api/health)',
        status: 'PASS',
        details: `Backend operational. Firebase server connection: ${healthData.firebaseConnected ? 'CONNECTED' : 'LOCAL BACKUP MODE'}. Time: ${healthData.timestamp}`
      });
      addLog('✅ Backend API health endpoint responded OK');
    } catch (apiErr: any) {
      results.push({
        id: 't3_api',
        category: 'API',
        title: 'Backend API Service (/api/health)',
        status: 'FAIL',
        details: `API Server Endpoint Error: ${apiErr.message}`,
        remedy: 'Ensure Node.js/Vercel server function is running and server route handlers are deployed.'
      });
      addLog(`❌ API health check failed: ${apiErr.message}`);
    }

    // TEST 4: Telegram Bot Integration Diagnostic
    addLog('Diagnosing Telegram Bot Credentials & Gateway...');
    const rawBotToken = settings.telegramBotToken || '';
    const rawChatId = settings.telegramChatId || '';

    if (!rawBotToken || !rawChatId) {
      results.push({
        id: 't4_telegram',
        category: 'TELEGRAM',
        title: 'Telegram Bot Configuration',
        status: 'WARN',
        details: 'Telegram Bot Token or Chat ID is missing in app settings.',
        remedy: 'Open Settings in top right and save your Telegram Bot Token and Channel Chat ID.'
      });
      addLog('⚠️ Telegram Bot Credentials missing');
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
          addLog(`✅ Telegram Bot "@${tgData.result.username}" active & validated`);
        } else {
          results.push({
            id: 't4_telegram',
            category: 'TELEGRAM',
            title: 'Telegram Bot API Authentication',
            status: 'FAIL',
            details: `Telegram API error: ${tgData.description || 'Invalid Bot Token'}`,
            remedy: 'Check Bot Token from @BotFather in Telegram.'
          });
          addLog(`❌ Telegram Bot error: ${tgData.description}`);
        }
      } catch (tgNetErr: any) {
        results.push({
          id: 't4_telegram',
          category: 'TELEGRAM',
          title: 'Telegram Gateway Connection',
          status: 'FAIL',
          details: `Direct Telegram API connection error: ${tgNetErr.message}`,
          remedy: 'Check internet connectivity or firewall rules blocking api.telegram.org.'
        });
        addLog(`❌ Telegram gateway connection error: ${tgNetErr.message}`);
      }
    }

    // TEST 5: Firestore Database Connection Check
    addLog('Testing Firebase Firestore persistence...');
    try {
      const q = query(collection(db, 'orders'), limit(1));
      const snap = await getDocs(q);
      results.push({
        id: 't5_firestore',
        category: 'FIRESTORE',
        title: 'Firebase Firestore Database Read Test',
        status: 'PASS',
        details: `Firestore query executed successfully (${snap.size} sample document retrieved). Real-time sync enabled.`
      });
      addLog('✅ Firebase Firestore query succeeded');
    } catch (fsErr: any) {
      results.push({
        id: 't5_firestore',
        category: 'FIRESTORE',
        title: 'Firebase Firestore Database Read Test',
        status: 'WARN',
        details: `Firestore client warning: ${fsErr.message || String(fsErr)}`,
        remedy: 'Check domain authorization in Firebase Console -> Authentication -> Settings -> Authorized Domains if deploying on custom domains.'
      });
      addLog(`⚠️ Firestore read warning: ${fsErr.message || String(fsErr)}`);
    }

    setTestResults(results);
    setIsRunning(false);
    addLog('🎉 Diagnostic suite completed successfully!');
  };

  useEffect(() => {
    runAllDiagnostics();
  }, []);

  const handleCopyLogs = () => {
    const textToCopy = `=== ZUBOC VMS SYSTEM DIAGNOSTIC REPORT ===\nGenerated: ${new Date().toISOString()}\n\nTEST RESULTS:\n${testResults.map(t => `[${t.status}] ${t.title}: ${t.details}`).join('\n')}\n\nCONSOLE LOGS:\n${consoleLogs.join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold tracking-wider">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>REAL-TIME HARDWARE & GATEWAY DIAGNOSTICS</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>Zuboc System Diagnostic Console</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Inspect overhead WebCam drivers, MediaRecorder browser mime-type pattern compatibility, Telegram Bot API connectivity, and Firestore database operations.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={runAllDiagnostics}
              disabled={isRunning}
              className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-2.5 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Running Diagnostics...' : 'Re-Run System Tests'}</span>
            </button>

            <button
              onClick={handleCopyLogs}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer"
            >
              {copiedLogs ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              <span>{copiedLogs ? 'Report Copied!' : 'Copy Diagnostic Report'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Tests */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <div key={test.id} className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    {icon}
                    <h3 className="text-base font-bold text-white tracking-tight">{test.title}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full border text-[10px] font-mono font-extrabold tracking-wider uppercase ${badgeBg}`}>
                    {test.status}
                  </span>
                </div>

                <p className="text-xs font-mono text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
                  {test.details}
                </p>
              </div>

              {test.remedy && (
                <div className="pt-2 border-t border-slate-800/80 text-xs text-amber-300/90 flex items-start gap-2 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span className="font-bold font-mono">Suggested Fix: </span>
                    <span>{test.remedy}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Diagnostic Terminal Output Console */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between font-mono text-xs font-bold text-slate-300">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>REAL-TIME DIAGNOSTIC TERMINAL LOGS</span>
          </div>
          <span className="text-[10px] text-slate-500 font-normal">Auto-scrolling execution log</span>
        </div>

        <div className="p-6 bg-slate-950/90 font-mono text-xs text-cyan-300/90 space-y-1.5 h-64 overflow-y-auto leading-relaxed selection:bg-cyan-500 selection:text-slate-950">
          {consoleLogs.length === 0 ? (
            <div className="text-slate-600 italic">Click "Re-Run System Tests" to execute full diagnostic suite...</div>
          ) : (
            consoleLogs.map((log, idx) => (
              <div key={idx} className="whitespace-pre-wrap">{log}</div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
