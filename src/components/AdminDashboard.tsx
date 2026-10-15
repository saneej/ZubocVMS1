import React, { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
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
        setDemoStatus('Demo message sent to Telegram channel!');
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Operations Dashboard</h2>
          <p className="text-xs text-zinc-400">System metrics and Telegram delivery telemetry</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSendDemoMessage}
            disabled={isSendingDemo}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-semibold rounded-md border border-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSendingDemo ? 'Sending...' : 'Send Demo Message'}</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-md transition-colors cursor-pointer"
          >
            Settings
          </button>
        </div>
      </div>

      {demoStatus && (
        <div className="bg-zinc-900 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{demoStatus}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs text-zinc-400 block mb-1">Total Recorded Orders</span>
          <span className="text-2xl font-bold font-mono text-white tabular-nums">{totalOrders}</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs text-zinc-400 block mb-1">Successful Telegram Deliveries</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">{successfulUploads}</span>
            <span className="text-xs text-zinc-500 font-mono">({successRate}%)</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs text-zinc-400 block mb-1">Failed Deliveries</span>
          <span className="text-2xl font-bold font-mono text-rose-400 tabular-nums">{failedUploads}</span>
        </div>

      </div>

      {/* Channel Configuration Status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-xs space-y-2">
        <div className="text-zinc-300 font-semibold mb-2">Telegram Channel Status</div>
        <div className="flex justify-between py-1.5 border-b border-zinc-800">
          <span className="text-zinc-500">Channel ID:</span>
          <span className="font-mono text-zinc-200">{settings.telegramChatId || 'Not Configured'}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-zinc-500">Bot Connection:</span>
          <span className={`font-mono font-bold ${settings.hasToken ? 'text-emerald-400' : 'text-amber-400'}`}>
            {settings.hasToken ? 'Active' : 'Unconfigured'}
          </span>
        </div>
      </div>

    </div>
  );
};
