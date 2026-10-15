import React from 'react';
import { OrderRecord, AppSettings } from '../types';

interface AdminDashboardProps {
  orders: OrderRecord[];
  settings: AppSettings;
  onOpenSettings: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ orders, settings, onOpenSettings }) => {
  const totalOrders = orders.length;
  const successfulUploads = orders.filter(o => o.uploadStatus === 'SUCCESS').length;
  const failedUploads = orders.filter(o => o.uploadStatus === 'FAILED').length;
  const successRate = totalOrders > 0 ? Math.round((successfulUploads / totalOrders) * 100) : 100;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Operations Dashboard</h2>
          <p className="text-xs text-zinc-400">System metrics and Telegram delivery telemetry</p>
        </div>

        <button
          onClick={onOpenSettings}
          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-md transition-colors cursor-pointer"
        >
          Telegram Settings
        </button>
      </div>

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
