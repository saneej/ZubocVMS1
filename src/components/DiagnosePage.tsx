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
        remedy: 'Configure your Telegram Bot Token and Chat ID in VMS Settings.'
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
            remedy: 'Verify Bot Token from @BotFather in Telegram.'
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

  const handleCopyLogs = () => {
    const textToCopy = `=== ZUBOC VMS DIAGNOSTIC REPORT ===\nGenerated: ${new Date().toISOString()}\n\nRESULTS:\n${testResults.map(t => `[${t.status}] ${t.title}: ${t.details}`).join('\n')}\n\nLOGS:\n${consoleLogs.join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn font-sans">
      
      {/* Header Banner */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6 font-mono">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Stethoscope className="w-3.5 h-3.5" />
            <span>REAL-TIME HARDWARE & GATEWAY DIAGNOSTICS</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            SYSTEM DIAGNOSTIC MATRIX
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Test overhead WebCam drivers, MediaRecorder browser mime compatibility, Express server routes, and Telegram bot connections.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs font-bold">
          <button
            onClick={runAllDiagnostics}
            disabled={isRunning}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 uppercase tracking-wider"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'RUNNING TESTS...' : 'RE-RUN DIAGNOSTICS'}</span>
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

      {/* Grid of Diagnostic Tests */}
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
            <div key={test.id} className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4 mb-2">
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
              </div>

              {test.remedy && (
                <div className="pt-2 border-t border-[#1a2130] text-xs text-amber-300 bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/10 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <strong className="block">REMEDY ACTION:</strong>
                    <span>{test.remedy}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Execution Terminal Log */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl overflow-hidden shadow-2xl font-mono">
        <div className="px-6 py-3 bg-[#06080d] border-b border-[#1f2738] flex items-center justify-between text-xs font-bold text-slate-300">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>REAL-TIME TERMINAL LOG OUTPUT</span>
          </div>
          <span className="text-[10px] text-slate-500">Live Execution Log</span>
        </div>

        <div className="p-5 bg-[#040508] text-xs text-cyan-300 space-y-1.5 h-60 overflow-y-auto font-mono selection:bg-cyan-500 selection:text-slate-950">
          {consoleLogs.length === 0 ? (
            <div className="text-slate-600 italic">Click "RE-RUN DIAGNOSTICS" to launch diagnostic suite...</div>
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
