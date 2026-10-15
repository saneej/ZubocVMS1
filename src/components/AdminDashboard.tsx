import React, { useState } from 'react';
import { Send, CheckCircle2, BarChart3, Settings, ShieldCheck } from 'lucide-react';
import { OrderRecord, AppSettings } from '../types';
import { safeFetchJson } from '../utils/api';

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
      const data = await safeFetchJson('/api/telegram/test-connection', { method: 'POST' });
      if (data && data.success) {
        setDemoStatus('Test ping sent to Telegram!');
      } else {
        setDemoStatus('Error: ' + (data?.error || 'Ping failed'));
      }
    } catch (err: any) {
      setDemoStatus('Error: ' + (err.message || 'Ping failed'));
    } finally {
      setIsSendingDemo(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 font-sans">
      
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-slate-900 font-mono uppercase tracking-wider">
          Dashboard Overview
        </h2>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={handleSendDemoMessage}
            disabled={isSendingDemo}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 text-blue-600" />
            <span>{isSendingDemo ? 'Pinging...' : 'TEST BOT'}</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>SETTINGS</span>
          </button>
        </div>
      </div>

      {demoStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{demoStatus}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Total Orders</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-extrabold text-slate-900">{totalOrders}</span>
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Telegram Success</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-extrabold text-emerald-600">{successfulUploads}</span>
            <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
              {successRate}%
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Failed Uploads</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-extrabold text-rose-600">{failedUploads}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase block">Bot Status</span>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              ONLINE
            </span>
            <ShieldCheck className="w-5 h-5 text-slate-400" />
          </div>
        </div>

      </div>

      {/* Bot & Station Config summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 uppercase">Telegram Config</h3>
          <button
            onClick={onOpenSettings}
            className="text-blue-600 hover:underline font-bold"
          >
            Edit Settings
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-slate-500 text-[10px] font-bold block uppercase">Telegram Chat ID</span>
            <span className="text-slate-900 font-bold text-sm">{settings.telegramChatId || 'Not Configured'}</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-slate-500 text-[10px] font-bold block uppercase">Bot Token Status</span>
            <span className={`font-bold text-sm ${settings.hasToken ? 'text-emerald-600' : 'text-amber-600'}`}>
              {settings.hasToken ? 'ACTIVE' : 'DEFAULT TOKEN'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
