import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  HardDrive, 
  Trash2, 
  Server, 
  Clock, 
  ArrowLeft,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { getCurrentISTString } from '../utils/time';

export const DiagnosePage: React.FC = () => {
  const navigate = useNavigate();
  const [readCount, setReadCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('zuboc_diag_reads') || '0', 10);
  });
  const [writeCount, setWriteCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('zuboc_diag_writes') || '0', 10);
  });
  const [cacheSizeKb, setCacheSizeKb] = useState<number>(0);
  const [cacheItemCount, setCacheItemCount] = useState<number>(0);
  const [dbStatus, setDbStatus] = useState<'IDLE' | 'TESTING' | 'CONNECTED' | 'QUOTA_EXCEEDED' | 'ERROR'>('IDLE');
  const [lastTestResult, setLastTestResult] = useState<string>('Not tested yet');
  const [logs, setLogs] = useState<{ time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([]);

  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), text, type }, ...prev.slice(0, 49)]);
  };

  const updateCacheStats = () => {
    try {
      const cache = localStorage.getItem('zuboc_orders_cache');
      if (cache) {
        setCacheSizeKb(Math.round(cache.length / 1024));
        const parsed = JSON.parse(cache);
        setCacheItemCount(Array.isArray(parsed) ? parsed.length : 0);
      } else {
        setCacheSizeKb(0);
        setCacheItemCount(0);
      }
    } catch {
      setCacheSizeKb(0);
      setCacheItemCount(0);
    }
  };

  useEffect(() => {
    updateCacheStats();
    addLog('System Diagnostics Portal initialized. Monitoring Firestore quota & cache.', 'info');
  }, []);

  const handleTestFirestoreRead = async () => {
    setDbStatus('TESTING');
    addLog('Executing test Firestore read (1 document)...', 'info');
    try {
      const q = query(collection(db, 'orders'), limit(1));
      const snap = await getDocs(q);
      
      const newReads = readCount + snap.size + 1;
      setReadCount(newReads);
      localStorage.setItem('zuboc_diag_reads', String(newReads));

      setDbStatus('CONNECTED');
      setLastTestResult(`Success! Read ${snap.size} document(s) from Firestore.`);
      addLog(`Firestore read test succeeded (${snap.size} doc). Quota healthy.`, 'success');
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
        setDbStatus('QUOTA_EXCEEDED');
        setLastTestResult('Error: Firestore Quota Exceeded (Resource Exhausted).');
        addLog('Firestore Quota Exceeded detected!', 'error');
      } else {
        setDbStatus('ERROR');
        setLastTestResult(`Error: ${err?.message || 'Unknown error'}`);
        addLog(`Firestore test error: ${err?.message}`, 'error');
      }
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem('zuboc_orders_cache');
    updateCacheStats();
    addLog('Local storage orders cache cleared successfully.', 'warn');
  };

  const handleResetCounters = () => {
    setReadCount(0);
    setWriteCount(0);
    localStorage.setItem('zuboc_diag_reads', '0');
    localStorage.setItem('zuboc_diag_writes', '0');
    addLog('Diagnostic counters reset to zero.', 'info');
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-900 font-sans antialiased flex flex-col">
      
      {/* Top Header */}
      <header className="px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/orders')}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to App</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#832f5e] text-white flex items-center justify-center font-bold">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold uppercase tracking-tight text-slate-900">
                System &amp; Quota Diagnostics
              </h1>
              <span className="text-[10px] font-mono text-stone-500">Real-time Firebase &amp; Cache Health Monitor</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetCounters}
            className="px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
          >
            Reset Counters
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        
        {/* Top Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Estimated Reads */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase">
              <span>Est. Reads (Session)</span>
              <Database className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {readCount.toLocaleString()} <span className="text-xs font-normal text-stone-400">/ 50k free</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full ${readCount > 40000 ? 'bg-rose-600' : 'bg-blue-600'}`}
                style={{ width: `${Math.min(100, (readCount / 50000) * 100)}%` }}
              />
            </div>
          </div>

          {/* Estimated Writes */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase">
              <span>Est. Writes (Session)</span>
              <Zap className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {writeCount.toLocaleString()} <span className="text-xs font-normal text-stone-400">/ 20k free</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full ${writeCount > 15000 ? 'bg-rose-600' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, (writeCount / 20000) * 100)}%` }}
              />
            </div>
          </div>

          {/* Local Cache */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase">
              <span>Browser Cache</span>
              <HardDrive className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {cacheSizeKb} KB <span className="text-xs font-normal text-stone-400">({cacheItemCount} orders)</span>
            </div>
            <p className="text-[11px] text-emerald-600 font-bold">✓ Serving from local cache</p>
          </div>

          {/* DB Status */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase">
              <span>Database Status</span>
              <Server className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              {dbStatus === 'CONNECTED' && <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">Connected</span>}
              {dbStatus === 'QUOTA_EXCEEDED' && <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold">Quota Exceeded</span>}
              {dbStatus === 'TESTING' && <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold animate-pulse">Testing...</span>}
              {dbStatus === 'IDLE' && <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 text-xs font-bold">Ready</span>}
            </div>
            <p className="text-[11px] text-stone-400">{lastTestResult}</p>
          </div>

        </div>

        {/* Action Controls & Diagnostic Actions */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-4">
          <h2 className="text-sm font-extrabold uppercase text-stone-800">Diagnostic Actions</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTestFirestoreRead}
              disabled={dbStatus === 'TESTING'}
              className="px-4 py-2.5 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${dbStatus === 'TESTING' ? 'animate-spin' : ''}`} />
              <span>Test Firestore Read (Check Quota)</span>
            </button>

            <button
              onClick={handleClearCache}
              className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Clear Browser Orders Cache</span>
            </button>
          </div>
        </div>

        {/* Live System Log */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-3">
          <h2 className="text-sm font-extrabold uppercase text-stone-800">System Diagnostic Logs</h2>
          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs h-64 overflow-y-auto space-y-1.5 border border-slate-800">
            {logs.length === 0 ? (
              <div className="text-slate-500">No logs recorded yet.</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-slate-500">[{log.time}]</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400 font-bold' :
                    log.type === 'warn' ? 'text-amber-400 font-bold' :
                    log.type === 'error' ? 'text-rose-400 font-bold' : 'text-slate-300'
                  }>
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </main>

    </div>
  );
};
export default DiagnosePage;
