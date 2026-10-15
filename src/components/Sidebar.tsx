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
  staffList?: StaffMember[];
  onLogout?: () => void;
}

const DEFAULT_STAFF_LIST: StaffMember[] = [
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
  pendingCount = 0,
  staffList,
  onLogout
}) => {
  const effectiveStaffList = staffList && staffList.length > 0 ? staffList : DEFAULT_STAFF_LIST;

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
              <img 
                src="https://zuboc.com/cdn/shop/files/zuboc_logo_1.svg?v=1748579899&width=500" 
                alt="Zuboc Logo" 
                className="h-8 w-auto object-contain max-w-[160px]"
              />
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
                      ? 'bg-[#832f5e] text-white font-bold shadow-md shadow-[#832f5e]/20' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-stone-100/80'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-stone-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white text-[#832f5e]' : 'bg-[#832f5e]/10 text-[#832f5e]'
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
        <div className="p-4 border-t border-stone-100 bg-stone-50/50 space-y-2">
          
          {/* Quick Settings */}
          <button
            onClick={onOpenSettings}
            className="w-full px-3 py-2 rounded-xl bg-white hover:bg-stone-100 text-slate-700 border border-stone-200 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#832f5e]" />
              <span>Settings</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono ${
              settings.hasToken ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}>
              {settings.hasToken ? 'TELEGRAM READY' : 'SETUP'}
            </span>
          </button>

          {/* Operator Switcher & Account */}
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  {currentStaff.name.charAt(0)}
                </div>
                <select
                  value={currentStaff.id}
                  onChange={(e) => {
                    const found = effectiveStaffList.find(s => s.id === e.target.value);
                    if (found) setCurrentStaff(found);
                  }}
                  className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer pr-1 max-w-[130px] truncate"
                >
                  {effectiveStaffList.map(st => (
                    <option key={st.id} value={st.id} className="bg-white text-slate-800">
                      {st.name} ({st.role})
                    </option>
                  ))}
                </select>
              </div>

              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-1.5 px-2 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Sign Out</span>
              </button>
            )}
          </div>

        </div>

      </aside>
    </>
  );
};
