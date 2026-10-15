import React from 'react';
import { BarChart3, CheckCircle2, XCircle, AlertTriangle, Package, ShieldCheck, Users, Video } from 'lucide-react';
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
  const pendingUploads = orders.filter(o => o.uploadStatus === 'PENDING').length;

  const successRate = totalOrders > 0 ? Math.round((successfulUploads / totalOrders) * 100) : 100;

  // Station breakdown
  const stationCounts: Record<string, number> = {};
  orders.forEach(o => {
    stationCounts[o.stationId] = (stationCounts[o.stationId] || 0) + 1;
  });

  // Staff breakdown
  const staffCounts: Record<string, number> = {};
  orders.forEach(o => {
    staffCounts[o.staffId] = (staffCounts[o.staffId] || 0) + 1;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            <span>Admin & Operations Dashboard</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry, Telegram upload metrics, and station performance monitoring.
          </p>
        </div>

        <button
          onClick={onOpenSettings}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow cursor-pointer"
        >
          Configure Telegram & Settings
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Recorded</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">{totalOrders}</div>
          <p className="text-xs text-slate-500 mt-2">Orders packed & recorded</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Successful Uploads</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">{successfulUploads}</div>
          <p className="text-xs text-slate-500 mt-2">{successRate}% Telegram delivery rate</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Failed Uploads</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-rose-400 font-mono">{failedUploads}</div>
          <p className="text-xs text-slate-500 mt-2">Requires review or retry</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Telegram Status</span>
            <div className={`p-2 rounded-xl ${settings.hasToken ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className={`text-xl font-bold ${settings.hasToken ? 'text-emerald-400' : 'text-amber-400'}`}>
            {settings.hasToken ? 'Active' : 'Unconfigured'}
          </div>
          <p className="text-xs text-slate-500 mt-2">Target Chat: {settings.telegramChatId || 'Not set'}</p>
        </div>

      </div>

      {/* Breakdowns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Packing Stations Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
          <h3 className="text-base font-bold text-white mb-4 flex items-center space-x-2">
            <Video className="w-5 h-5 text-cyan-400" />
            <span>Recordings by Packing Station</span>
          </h3>

          {Object.keys(stationCounts).length === 0 ? (
            <p className="text-sm text-slate-500">No station data available yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(stationCounts).map(([station, count]) => (
                <div key={station} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-white">{station}</span>
                  <span className="font-mono text-cyan-400 font-bold">{count} orders</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staff Activity Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
          <h3 className="text-base font-bold text-white mb-4 flex items-center space-x-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <span>Staff Activity & Pack Count</span>
          </h3>

          {Object.keys(staffCounts).length === 0 ? (
            <p className="text-sm text-slate-500">No staff activity recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(staffCounts).map(([staff, count]) => (
                <div key={staff} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-white">{staff}</span>
                  <span className="font-mono text-emerald-400 font-bold">{count} packs</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
