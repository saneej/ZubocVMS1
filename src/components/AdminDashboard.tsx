import React, { useState } from 'react';
import { Send, CheckCircle2, Activity, BarChart3, Settings, Zap, Server, ShieldCheck, Radio, Clock, Cpu } from 'lucide-react';
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
        setDemoStatus('Test ping successfully dispatched to Telegram channel!');
      } else {
        setDemoStatus('Error: ' + (data.error || 'Failed to send ping'));
      }
    } catch (err: any) {
      setDemoStatus('Error: ' + err.message);
    } finally {
      setIsSendingDemo(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn font-sans">
      
      {/* Header Banner */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6 font-mono">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>ENTERPRISE TELEMETRY COMMAND CENTER</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            OPERATIONS & BOT DISPATCH TELEMETRY
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Monitor real-time packing station throughput, Telegram channel delivery rates, and serverless gateway connectivity.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs">
          <button
            onClick={handleSendDemoMessage}
            disabled={isSendingDemo}
            className="px-4 py-2.5 bg-[#161c2b] hover:bg-[#1f273b] text-emerald-400 border border-[#222c3e] rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isSendingDemo ? 'Pinging Bot...' : 'TEST BOT PING'}</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-black flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer uppercase tracking-wider"
          >
            <Settings className="w-4 h-4" />
            <span>CONFIGURE VMS</span>
          </button>
        </div>
      </div>

      {demoStatus && (
        <div className="bg-[#0e111a] border border-emerald-500/40 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-3 shadow-lg font-mono">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{demoStatus}</span>
        </div>
      )}

      {/* KPI Stat Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 font-mono">
        
        <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl space-y-2">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">TOTAL RECORDED ORDERS</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-white tabular-nums">{totalOrders}</span>
            <div className="p-2 rounded-xl bg-[#161d2b] border border-[#212b3e] text-cyan-400">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl space-y-2">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">TELEGRAM DELIVERIES</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-emerald-400 tabular-nums">{successfulUploads}</span>
            <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              {successRate}% SUCCESS
            </span>
          </div>
        </div>

        <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl space-y-2">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">FAILED DELIVERIES</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-rose-400 tabular-nums">{failedUploads}</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Zap className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-5 shadow-xl space-y-2">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">GATEWAY OPERATIONAL STATUS</span>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 led-emerald animate-pulse"></span>
              ONLINE
            </span>
            <Server className="w-5 h-5 text-slate-500" />
          </div>
        </div>

      </div>

      {/* Bot & Channel Configuration Section */}
      <div className="bg-[#0e111a] border border-[#1f2738] rounded-2xl p-6 shadow-2xl space-y-6 font-mono">
        <div className="flex items-center justify-between border-b border-[#1f2738] pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-white">TELEGRAM BOT GATEWAY PARAMETERS</h3>
            <p className="text-xs text-slate-400 mt-0.5">Active endpoint parameters for video dispatch</p>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-3.5 py-1.5 bg-[#161c2b] hover:bg-[#1f273b] text-cyan-400 border border-[#222c3e] rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            EDIT PARAMETERS
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          <div className="bg-[#06080d] border border-[#1b2232] rounded-xl p-4 space-y-1.5">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider block">TELEGRAM CHANNEL CHAT ID</span>
            <span className="text-white text-sm font-bold">{settings.telegramChatId || '-1003940299676'}</span>
          </div>

          <div className="bg-[#06080d] border border-[#1b2232] rounded-xl p-4 space-y-1.5">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider block">BOT TOKEN STATUS</span>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${settings.hasToken ? 'bg-emerald-400 led-emerald animate-pulse' : 'bg-amber-400'}`}></span>
              <span className="text-white text-sm font-bold">{settings.hasToken ? 'VALIDATED & ACTIVE' : 'DEFAULT TOKEN ACTIVE'}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
