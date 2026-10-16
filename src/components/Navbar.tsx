import React, { useState, useEffect } from 'react';
import { getCurrentISTString } from '../utils/time';
import { Video, Settings as SettingsIcon, User, Activity, Search, History, Cpu, ChevronRight, ShieldCheck, Radio, Clock } from 'lucide-react';
import { StaffMember, AppSettings } from '../types';

interface NavbarProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'diagnose';
  setActiveTab: (tab: 'station' | 'search' | 'history' | 'admin' | 'diagnose') => void;
  currentStaff: StaffMember;
  setCurrentStaff: (staff: StaffMember) => void;
  settings: AppSettings;
  onOpenSettings: () => void;
}

const STAFF_LIST: StaffMember[] = [
  { id: 'Admin-01', name: 'David Admin', role: 'ADMIN', stationId: 'Packing-HQ' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentStaff,
  setCurrentStaff,
  settings,
  onOpenSettings
}) => {
  const [timeIst, setTimeUtc] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      setTimeUtc(getCurrentISTString());
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  interface NavTab {
    id: 'station' | 'search' | 'history' | 'admin' | 'diagnose';
    label: string;
    keyHint: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  const tabs: NavTab[] = [
    { id: 'station', label: 'PACKING TERMINAL', keyHint: '1', icon: Video },
    { id: 'search', label: 'EVIDENCE VAULT', keyHint: '2', icon: Search },
    { id: 'history', label: 'AUDIT LEDGER', keyHint: '3', icon: History },
    { id: 'admin', label: 'TELEMETRY', keyHint: '4', icon: Activity },
    { id: 'diagnose', label: 'DIAGNOSTICS', keyHint: '5', icon: Cpu, badge: 'LIVE' },
  ];

  return (
    <header className="bg-[#0b0d12] border-b border-[#1f2636] sticky top-0 z-50 text-slate-200">
      
      {/* Top Utility Telemetry Bar */}
      <div className="bg-[#06070a] border-b border-[#141822] px-4 py-1 text-[11px] font-mono text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 led-emerald animate-pulse"></span>
            SYSTEM OPERATIONAL
          </span>
          <span className="text-slate-600">|</span>
          <span className="hidden sm:inline-block">NODE: <strong className="text-slate-300">ZUBOC-ECOM-VMS-01</strong></span>
          <span className="text-slate-600 hidden sm:inline-block">|</span>
          <span className="flex items-center gap-1 text-slate-300">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>{timeIst}</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Radio className={`w-3 h-3 ${settings.hasToken ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>BOT GATEWAY:</span>
            <strong className={settings.hasToken ? 'text-emerald-400' : 'text-amber-400'}>
              {settings.hasToken ? 'ACTIVE' : 'DEFAULT'}
            </strong>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">STATION: <strong className="text-cyan-400">{settings.stationId || 'Packing-01'}</strong></span>
        </div>
      </div>

      {/* Primary Brand & Navigation Control */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-6">
          
          {/* Brand Mark */}
          <div 
            onClick={() => setActiveTab('station')}
            className="flex items-center gap-3 cursor-pointer group shrink-0 select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 group-hover:border-emerald-400 flex items-center justify-center text-emerald-400 transition-all shadow-lg shadow-emerald-500/10">
              <Video className="w-5 h-5 group-hover:scale-110 transition-transform text-emerald-400" />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-wider text-white flex items-center gap-2 font-mono">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-emerald-400 font-black">ZUBOC</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold tracking-widest">
                  VMS v2.4
                </span>
              </div>
              <p className="text-[10px] font-mono text-emerald-400/80 uppercase tracking-widest font-semibold">
                LOGISTICS VIDEO EVIDENCE VAULT
              </p>
            </div>
          </div>

          {/* Segmented Tactical Tab Controls */}
          <nav className="hidden lg:flex items-center bg-[#121620] p-1 rounded-xl border border-[#202738] shadow-inner">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md font-extrabold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-[#1a202e]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.badge && !isActive && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 led-cyan animate-ping"></span>
                  )}
                  <span className={`text-[9px] px-1 rounded font-mono ${isActive ? 'bg-slate-950/20 text-slate-900' : 'text-slate-600'}`}>
                    [{tab.keyHint}]
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Operator Switcher & Config Button */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-[#121620] border border-[#202738] rounded-xl px-3 py-1.5 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-bold font-mono">
                {currentStaff.name.charAt(0)}
              </div>
              <div className="flex flex-col text-left">
                <select
                  value={currentStaff.id}
                  onChange={(e) => {
                    const found = STAFF_LIST.find(s => s.id === e.target.value);
                    if (found) setCurrentStaff(found);
                  }}
                  className="bg-transparent text-xs text-slate-200 font-bold focus:outline-none cursor-pointer"
                >
                  {STAFF_LIST.map(st => (
                    <option key={st.id} value={st.id} className="bg-[#0b0d12] text-white">
                      {st.name} ({st.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={onOpenSettings}
              className="p-2.5 rounded-xl bg-[#121620] hover:bg-[#1a202e] text-slate-300 hover:text-white border border-[#202738] transition-all cursor-pointer shadow-sm group"
              title="Open VMS Configuration"
            >
              <SettingsIcon className="w-4 h-4 group-hover:rotate-45 transition-transform text-slate-400 group-hover:text-cyan-400" />
            </button>
          </div>

        </div>

        {/* Mobile Navigation Row */}
        <div className="flex lg:hidden items-center justify-around py-2 border-t border-[#1a202c] text-[11px] font-mono text-slate-400">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-2 py-1 rounded ${isActive ? 'text-emerald-400 font-extrabold bg-emerald-500/10' : ''}`}
              >
                {tab.label.split(' ')[0]}
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
