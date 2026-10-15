import React, { useState } from 'react';
import { Send, CheckCircle2, ShieldCheck, Activity, BarChart3, Settings, Zap, Server } from 'lucide-react';
import { OrderRecord, AppSettings } from '../types';

interface AdminDashboardProps {
  orders: OrderRecord[];
  settings: AppSettings;
  onOpenSettings: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ orders, settings, onOpenSettings }) => {
  const [isSendingDemo, setIsSendingDemo] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);

  const totalOrders = orders.length;
  const successfulUploads = orders.filter(o => o.uploadStatus === 'SUCCESS').length;
  const failedUploads = orders.filter(o => o.uploadStatus === 'FAILED').length;
  const successRate = totalOrders > 0 ? Math.round((successfulUploads / totalOrders) * 100) : 100;

  const handleSendDemoMessage = async () => {
    setIsSendingDemo(true);
    setDemoStatus(null);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDemoStatus('Demo message successfully dispatched to Telegram channel!');
      } else {
        setDemoStatus('Error: ' + (data.error || 'Failed to send message'));
      }
    } catch (err: any) {
      setDemoStatus('Error: ' + err.message);
    } finally {
      setIsSendingDemo(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold tracking-wider">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>ENTERPRISE TELEMETRY</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Zuboc Operations & Telemetry
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Real-time monitoring of packing throughput, Telegram bot connection health, serverless endpoints, and cryptographic evidence delivery.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleSendDemoMessage}
              disabled={isSendingDemo}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSendingDemo ? 'Pinging Telegram...' : 'Test Telegram Ping'}</span>
            </button>
            <button
              onClick={onOpenSettings}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20 hover:brightness-110 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Configure Settings</span>
            </button>
          </div>
        </div>
      </div>

      {demoStatus && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 text-xs text-emerald-400 flex items-center gap-3 shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-mono">{demoStatus}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/15 transition-all"></div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-2">Total Recorded Orders</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black font-mono text-white tabular-nums">{totalOrders}</span>
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <BarChart3 className="w-5 h-5" />
            </span>
          </div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/15 transition-all"></div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-2">Telegram Deliveries</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums">{successfulUploads}</span>
            <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              {successRate}% Success
            </span>
          </div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/15 transition-all"></div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-2">Failed Deliveries</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black font-mono text-rose-400 tabular-nums">{failedUploads}</span>
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <Zap className="w-5 h-5" />
            </span>
          </div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/15 transition-all"></div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-2">System Status</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Operational
            </span>
            <Server className="w-5 h-5 text-slate-500" />
          </div>
        </div>

      </div>

      {/* Channel Configuration Status */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-white">Telegram Channel & Bot Configuration</h3>
            <p className="text-xs text-slate-400">Active integration parameters for automatic video evidence dispatch</p>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Edit Config
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-2">
            <span className="text-slate-500 text-[11px] block uppercase tracking-wider">Telegram Channel ID</span>
            <span className="text-white text-sm font-bold">{settings.telegramChatId || '-1003940299676'}</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-2">
            <span className="text-slate-500 text-[11px] block uppercase tracking-wider">Bot Token Status</span>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${settings.hasToken ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span className="text-white text-sm font-bold">{settings.hasToken ? 'Connected & Validated' : 'Default Token Active'}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
