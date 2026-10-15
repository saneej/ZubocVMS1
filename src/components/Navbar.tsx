import React from 'react';
import { Video, Settings as SettingsIcon, User, ShieldCheck } from 'lucide-react';
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
  { id: 'Staff-01', name: 'Alex Packer', role: 'PACKER', stationId: 'Packing-01' },
  { id: 'Staff-02', name: 'Sarah Supervisor', role: 'SUPERVISOR', stationId: 'Packing-01' },
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
  return (
    <header className="bg-slate-950 border-b border-slate-800/80 text-slate-100 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-8">
          
          {/* Zone 1: Zuboc Brand Wordmark */}
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => setActiveTab('station')}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-md shadow-cyan-500/20">
              <Video className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                <span>Zuboc</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-mono border border-cyan-500/30">VMS</span>
              </div>
            </div>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab('station')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'station'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Packing Terminal
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'search'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Evidence Search
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Recording Logs
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Telemetry
            </button>

            <button
              onClick={() => setActiveTab('diagnose')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'diagnose'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Diagnostics</span>
            </button>
          </nav>

          {/* Zone 3: Actions, Telegram Indicator & Staff Switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300">
              <span className={`w-2 h-2 rounded-full ${settings.hasToken ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span>Telegram: {settings.hasToken ? 'Connected' : 'Offline'}</span>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <select
                value={currentStaff.id}
                onChange={(e) => {
                  const found = STAFF_LIST.find(s => s.id === e.target.value);
                  if (found) setCurrentStaff(found);
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                {STAFF_LIST.map(st => (
                  <option key={st.id} value={st.id} className="bg-slate-950 text-white">
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
              title="TrackVid VMS Config"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Mobile Nav */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800 text-xs text-slate-400 font-medium">
          <button onClick={() => setActiveTab('station')} className={activeTab === 'station' ? 'text-cyan-400 font-bold' : ''}>Terminal</button>
          <button onClick={() => setActiveTab('search')} className={activeTab === 'search' ? 'text-cyan-400 font-bold' : ''}>Search</button>
          <button onClick={() => setActiveTab('history')} className={activeTab === 'history' ? 'text-cyan-400 font-bold' : ''}>Logs</button>
          <button onClick={() => setActiveTab('admin')} className={activeTab === 'admin' ? 'text-cyan-400 font-bold' : ''}>Telemetry</button>
          <button onClick={() => setActiveTab('diagnose')} className={activeTab === 'diagnose' ? 'text-cyan-400 font-bold' : ''}>Diagnose</button>
        </div>

      </div>
    </header>
  );
};
