import React from 'react';
import { Video, Settings as SettingsIcon, User } from 'lucide-react';
import { StaffMember, AppSettings } from '../types';

interface NavbarProps {
  activeTab: 'station' | 'search' | 'history' | 'admin';
  setActiveTab: (tab: 'station' | 'search' | 'history' | 'admin') => void;
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
    <header className="bg-zinc-950 border-b border-zinc-800/80 text-zinc-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-8">
          
          {/* Zone 1: Wordmark */}
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => setActiveTab('station')}>
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold">
              <Video className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="font-bold text-base tracking-tight text-white whitespace-nowrap">PackVision VMS</span>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-zinc-900/60 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setActiveTab('station')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'station'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Packing Station
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'search'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Search
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'history'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              History
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'admin'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Dashboard
            </button>
          </nav>

          {/* Zone 3: Actions & Staff Switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800 text-xs">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={currentStaff.id}
                onChange={(e) => {
                  const found = STAFF_LIST.find(s => s.id === e.target.value);
                  if (found) setCurrentStaff(found);
                }}
                className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
              >
                {STAFF_LIST.map(st => (
                  <option key={st.id} value={st.id} className="bg-zinc-900 text-white">
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-md bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer"
              title="Telegram & Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-zinc-800 text-xs text-zinc-400">
          <button onClick={() => setActiveTab('station')} className={activeTab === 'station' ? 'text-emerald-400 font-bold' : ''}>Station</button>
          <button onClick={() => setActiveTab('search')} className={activeTab === 'search' ? 'text-emerald-400 font-bold' : ''}>Search</button>
          <button onClick={() => setActiveTab('history')} className={activeTab === 'history' ? 'text-emerald-400 font-bold' : ''}>History</button>
          <button onClick={() => setActiveTab('admin')} className={activeTab === 'admin' ? 'text-emerald-400 font-bold' : ''}>Admin</button>
        </div>

      </div>
    </header>
  );
};
