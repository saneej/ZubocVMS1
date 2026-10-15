import React from 'react';
import { Video, Search, History, BarChart3, Settings as SettingsIcon, Package, ShieldCheck, User } from 'lucide-react';
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
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('station')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight flex items-center space-x-2">
                <span>PackVision</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-medium border border-cyan-500/30">VMS 2.0</span>
              </div>
              <p className="text-xs text-slate-400">E-Commerce Packing Evidence System</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('station')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'station'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Packing Station</span>
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'search'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Search & Retrieve</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'admin'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Admin Dashboard</span>
            </button>
          </nav>

          {/* Right Utilities: Staff switcher & Settings */}
          <div className="flex items-center space-x-3">
            <div className="hidden lg:flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <User className="w-4 h-4 text-cyan-400" />
              <select
                value={currentStaff.id}
                onChange={(e) => {
                  const found = STAFF_LIST.find(s => s.id === e.target.value);
                  if (found) setCurrentStaff(found);
                }}
                className="bg-transparent text-sm text-white focus:outline-none cursor-pointer"
              >
                {STAFF_LIST.map(st => (
                  <option key={st.id} value={st.id} className="bg-slate-900 text-white">
                    {st.name} ({st.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-medium text-white">{settings.stationId || 'Packing-01'}</span>
            </div>

            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
              title="System Settings & Telegram Config"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>

        </div>

        {/* Mobile Nav */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('station')}
            className={`flex flex-col items-center text-xs py-1 px-3 rounded ${activeTab === 'station' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
          >
            <Package className="w-4 h-4 mb-1" />
            <span>Station</span>
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex flex-col items-center text-xs py-1 px-3 rounded ${activeTab === 'search' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
          >
            <Search className="w-4 h-4 mb-1" />
            <span>Search</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center text-xs py-1 px-3 rounded ${activeTab === 'history' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
          >
            <History className="w-4 h-4 mb-1" />
            <span>History</span>
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center text-xs py-1 px-3 rounded ${activeTab === 'admin' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
          >
            <BarChart3 className="w-4 h-4 mb-1" />
            <span>Admin</span>
          </button>
        </div>

      </div>
    </header>
  );
};
