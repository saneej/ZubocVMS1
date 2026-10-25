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
  TrendingUp,
  Palette,
  Factory,
  Users,
  ShieldCheck
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';

interface SidebarProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales' | 'designer' | 'production-workflow' | 'users';
  setActiveTab: (tab: 'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales' | 'designer' | 'production-workflow' | 'users') => void;
  currentStaff: StaffMember | null;
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
  { id: '795afba9-4494-4dde-a238-0f036b1aa726', name: 'Saneej', role: 'ADMIN', email: 'msaneejk@gmail.com', stationId: 'HQ' },
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
  if (!currentStaff) return null;
  const effectiveStaffList = staffList && staffList.length > 0 ? staffList : DEFAULT_STAFF_LIST;

  // Build role-tailored navigation items
  let navItems: { id: any; label: string; icon: any; badge?: string }[] = [];

  if (currentStaff.role === 'DESIGNER') {
    navItems = [
      { id: 'designer', label: 'Design Studio', icon: Palette },
      { id: 'history', label: 'History', icon: History },
    ];
  } else if (currentStaff.role === 'PRODUCTION') {
    navItems = [
      { id: 'production-workflow', label: 'Manufacturing Hub', icon: Factory },
      { id: 'deck', label: 'Production TV Deck', icon: Tv },
      { id: 'search', label: 'Orders & Archives', icon: Search },
    ];
  } else if (currentStaff.role === 'ORDER_MANAGEMENT') {
    navItems = [
      { id: 'search', label: 'Orders & Add', icon: Search },
      { id: 'station', label: 'Packing Station', icon: Video, badge: pendingCount > 0 ? `${pendingCount}` : undefined },
      { id: 'history', label: 'History', icon: History },
    ];
  } else {
    // CRE and ADMIN have full access, preserving every existing feature
    navItems = [
      { id: 'search', label: 'Orders', icon: Search },
      { id: 'designer', label: 'Design Studio', icon: Palette },
      { id: 'production-workflow', label: 'Manufacturing', icon: Factory },
      { id: 'deck', label: 'Production TV Deck', icon: Tv },
      { id: 'station', label: 'Packing Station', icon: Video, badge: pendingCount > 0 ? `${pendingCount}` : undefined },
      { id: 'calculator', label: 'Rate Calculator', icon: Calculator },
      { id: 'history', label: 'Recording History', icon: History },
      ...(currentStaff.role === 'ADMIN' ? [{ id: 'admin', label: 'Insights', icon: BarChart3 }] : []),
      ...(currentStaff.role === 'ADMIN' ? [{ id: 'users', label: 'Users', icon: Users }] : []),
      { id: 'sales', label: 'Sales Reports', icon: TrendingUp },
    ];
  }

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
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-white/80 backdrop-blur-xl text-slate-900 border-r border-slate-200/60
        flex flex-col justify-between transition-transform duration-300 ease-in-out shadow-2xl shadow-slate-200/40
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Brand Header */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="px-6 py-8 flex items-center justify-between relative">
            <div 
              className="flex items-center gap-3 cursor-pointer select-none transition-transform hover:scale-105 active:scale-95" 
              onClick={() => { 
                const defaultTarget = currentStaff.role === 'DESIGNER' ? 'designer' : currentStaff.role === 'PRODUCTION' ? 'production-workflow' : 'search';
                setActiveTab(defaultTarget); 
                setIsMobileOpen(false); 
              }}
            >
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-600/30 font-black text-sm">
                Z
              </div>
              <div>
                <span className="text-base font-black uppercase tracking-[0.15em] text-slate-900 block leading-tight">
                  Zuboc Flow
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">
                  {currentStaff.role === 'ADMIN' ? 'Admin Portal' : currentStaff.role === 'DESIGNER' ? 'Design Studio' : currentStaff.role === 'PRODUCTION' ? 'Production' : 'CRE Operations'}
                </span>
              </div>
            </div>

            <button 
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Premium Navigation Items */}
          <nav className="px-4 pb-8 space-y-1.5">
            <div className="px-3 py-1.5 mb-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Navigation</span>
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileOpen(false);
                  }}
                  className={`
                    w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-all duration-200 group relative cursor-pointer
                    ${isActive 
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 translate-x-1' 
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                      isActive ? 'text-purple-400' : 'text-slate-400 group-hover:text-slate-600'
                    }`} />
                    <span className="tracking-wide font-sans">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border transition-colors ${
                      isActive 
                        ? 'bg-white/10 border-white/20 text-white' 
                        : 'bg-slate-950/5 border-slate-950/10 text-slate-600'
                    }`}>
                      {item.badge}
                    </span>
                  )}

                  {isActive && (
                    <div className="absolute left-0 w-1 h-5 bg-purple-500 rounded-r-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Operator Account & Settings */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100/80 space-y-2">
          
          {/* Quick Settings - Admin Only */}
          {currentStaff.role === 'ADMIN' && (
            <button
              onClick={onOpenSettings}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60 text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-xs active:scale-[0.98]"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1 rounded-lg bg-slate-100 text-slate-600">
                  <Settings className="w-3.5 h-3.5" />
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
          )}

          {/* Operator Account */}
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                  {currentStaff.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">
                    {currentStaff.role}
                  </span>
                  <span className="text-xs text-slate-900 font-black truncate max-w-[110px]">
                    {currentStaff.name}
                  </span>
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
                className="w-full py-2 px-3 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-100 hover:border-rose-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
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
