import React from 'react';
import { 
  Video, 
  Search, 
  History, 
  BarChart3, 
  Settings, 
  X,
  Calculator,
  Tv,
  Activity,
  ExternalLink,
  TrendingUp
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';

interface SidebarProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales';
  setActiveTab: (tab: 'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales') => void;
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
    { id: 'search', label: 'Orders', icon: Search },
    { id: 'deck', label: 'Production TV Deck', icon: Tv, badge: '55" TV' },
    { id: 'station', label: 'Packing Station', icon: Video, badge: pendingCount > 0 ? `${pendingCount}` : undefined },
    { id: 'calculator', label: 'Rate Calculator', icon: Calculator },
    { id: 'history', label: 'Recording History', icon: History },
    { id: 'admin', label: 'Insights', icon: BarChart3 },
    { id: 'sales', label: 'Sales Reports', icon: TrendingUp },
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

      {/* Main Sidebar Panel - Premium Modern Aesthetic */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-white text-slate-900 border-r border-slate-200/60
        flex flex-col justify-between transition-transform duration-300 ease-in-out shadow-xl shadow-slate-200/20
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Brand Header */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="px-6 py-8 flex items-center justify-center relative">
            <div 
              className="flex items-center gap-3 cursor-pointer select-none transition-transform hover:scale-[1.02] active:scale-95" 
              onClick={() => { setActiveTab('search'); setIsMobileOpen(false); }}
            >
              <img 
                src="/zuboc-com-svg-1-1.png" 
                alt="Zuboc Logo" 
                className="h-10 w-auto object-contain max-w-[190px]"
              />
            </div>

            <button 
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden absolute right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Premium Navigation Items */}
          <nav className="px-3 pb-6 space-y-1.5">
            <div className="px-4 py-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Core Engine</span>
            </div>
            
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
                    w-full text-left px-4 py-3 rounded-2xl font-semibold text-[13px] transition-all duration-200
                    flex items-center justify-between cursor-pointer group relative
                    ${isActive 
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/20' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                    }
                  `}
                >
                  <div className="flex items-center gap-3.5">
                    <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-900'}`} />
                    <span className="tracking-tight">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                      isActive 
                        ? 'bg-white/10 border-white/20 text-white' 
                        : 'bg-[#832f5e]/5 border-[#832f5e]/10 text-[#832f5e]'
                    }`}>
                      {item.badge}
                    </span>
                  )}

                  {isActive && (
                    <div className="absolute left-1.5 w-1 h-4 bg-purple-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Operator Account & Settings */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100/80 space-y-3">
          
          {/* Quick Settings */}
          <button
            onClick={onOpenSettings}
            className="w-full px-3.5 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60 text-[12px] font-bold flex items-center justify-between transition-all cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-purple-50">
                <Settings className="w-4 h-4 text-[#832f5e]" />
              </div>
              <span>System Config</span>
            </div>
            <span className={`text-[9px] px-2 py-0.5 rounded-lg font-black tracking-wider ${
              settings.hasToken 
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
            }`}>
              {settings.hasToken ? 'ONLINE' : 'OFFLINE'}
            </span>
          </button>

          {/* Diagnostics Portal Link */}
          <a
            href="/diagnose"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-3 rounded-2xl text-slate-500 hover:text-slate-950 hover:bg-white/60 transition-all text-[12px] font-bold border border-transparent hover:border-slate-200 group/diag cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-50">
                <Activity className="w-4 h-4 text-emerald-600 group-hover/diag:animate-pulse" />
              </div>
              <span>Diagnostics</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover/diag:text-slate-500" />
          </a>

          {/* Operator Account */}
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-[12px] shadow-sm">
                  {currentStaff.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Active Staff</span>
                  <select
                    value={currentStaff.id}
                    onChange={(e) => {
                      const found = effectiveStaffList.find(s => s.id === e.target.value);
                      if (found) setCurrentStaff(found);
                    }}
                    className="bg-transparent text-[12px] text-slate-900 font-black focus:outline-none cursor-pointer pr-1 max-w-[110px] truncate"
                  >
                    {effectiveStaffList.map(st => (
                      <option key={st.id} value={st.id} className="bg-white text-slate-900">
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="relative">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20" />
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2.5 px-3 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-100 hover:border-rose-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
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
