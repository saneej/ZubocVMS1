import React from 'react';
import { 
  Video, 
  Search, 
  History, 
  Activity, 
  Settings, 
  X,
  UserCheck
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';

interface SidebarProps {
  activeTab: 'station' | 'search' | 'history' | 'admin';
  setActiveTab: (tab: 'station' | 'search' | 'history' | 'admin') => void;
  currentStaff: StaffMember;
  setCurrentStaff: (staff: StaffMember) => void;
  settings: AppSettings;
  onOpenSettings: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  pendingCount?: number;
}

const STAFF_LIST: StaffMember[] = [
  { id: 'Staff-01', name: 'Alex Packer', role: 'PACKER', stationId: 'Packing-01' },
  { id: 'Staff-02', name: 'Sarah Supervisor', role: 'SUPERVISOR', stationId: 'Packing-01' },
  { id: 'Admin-01', name: 'David Admin', role: 'ADMIN', stationId: 'Packing-HQ' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentStaff,
  setCurrentStaff,
  settings,
  onOpenSettings,
  isMobileOpen,
  setIsMobileOpen,
  pendingCount = 0
}) => {

  const navItems = [
    { id: 'station', label: 'Packing Station', icon: Video, badge: pendingCount > 0 ? `${pendingCount}` : undefined },
    { id: 'search', label: 'Search Recordings', icon: Search },
    { id: 'history', label: 'Recording History', icon: History },
    { id: 'admin', label: 'Admin Dashboard', icon: Activity },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Main Sidebar Panel - Clean Light/Bright Minimal Theme */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-white text-slate-900 border-r border-slate-200
        flex flex-col justify-between transition-transform duration-300 ease-in-out shadow-sm
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Brand Header */}
        <div>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => { setActiveTab('station'); setIsMobileOpen(false); }}>
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-mono font-bold shadow-md shadow-blue-500/20">
                <Video className="w-5 h-5 text-white" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight text-slate-900 font-sans">ZUBOC</span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200/60 font-mono">
                  VMS
                </span>
              </div>
            </div>

            <button 
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Minimal Navigation Items */}
          <nav className="p-3 space-y-1 mt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setIsMobileOpen(false);
                  }}
                  className={`
                    w-full text-left px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all
                    flex items-center justify-between cursor-pointer
                    ${isActive 
                      ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Operator Account & Settings */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2">
          
          {/* Quick Settings */}
          <button
            onClick={onOpenSettings}
            className="w-full px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" />
              <span>Settings</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono ${
              settings.hasToken ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}>
              {settings.hasToken ? 'TELEGRAM READY' : 'SETUP'}
            </span>
          </button>

          {/* Operator Switcher */}
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                {currentStaff.name.charAt(0)}
              </div>
              <select
                value={currentStaff.id}
                onChange={(e) => {
                  const found = STAFF_LIST.find(s => s.id === e.target.value);
                  if (found) setCurrentStaff(found);
                }}
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer pr-1"
              >
                {STAFF_LIST.map(st => (
                  <option key={st.id} value={st.id} className="bg-white text-slate-800">
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
          </div>

        </div>

      </aside>
    </>
  );
};
