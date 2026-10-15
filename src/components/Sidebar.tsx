import React from 'react';
import { 
  Video, 
  Search, 
  History, 
  Activity, 
  Cpu, 
  Settings, 
  Radio, 
  ShieldCheck, 
  PackageCheck, 
  ChevronRight,
  LogOut,
  User,
  Sliders,
  Sparkles,
  Layers,
  Menu,
  X
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';

interface SidebarProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'diagnose';
  setActiveTab: (tab: 'station' | 'search' | 'history' | 'admin' | 'diagnose') => void;
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
    { id: 'station', label: 'Packing Station', subLabel: 'Live Camera Workstation', icon: Video, badge: pendingCount > 0 ? `${pendingCount}` : undefined },
    { id: 'search', label: 'Search Recordings', subLabel: 'Evidence Retrieval Vault', icon: Search },
    { id: 'history', label: 'Recording History', subLabel: 'Audit & Dispatch Ledger', icon: History },
    { id: 'admin', label: 'Admin Dashboard', subLabel: 'Telemetry & Analytics', icon: Activity },
    { id: 'diagnose', label: 'Diagnostics', subLabel: 'Webcam & Gateway Health', icon: Cpu, badgeText: 'LIVE' },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Main Sidebar Panel */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#0B1F35] text-slate-100 border-r border-[#152E4A]
        flex flex-col justify-between transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Top Header & Brand Mark */}
        <div>
          <div className="p-5 border-b border-[#152E4A] flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setActiveTab('station'); setIsMobileOpen(false); }}>
              <div className="w-9 h-9 rounded-lg bg-[#1769E8] flex items-center justify-center text-white font-mono font-bold shadow-sm">
                <Video className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-lg tracking-widest text-white font-mono">ZUBOC</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                    VMS
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase font-medium">
                  EVIDENCE GATEWAY
                </p>
              </div>
            </div>

            <button 
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#152E4A]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Station Status Chip */}
          <div className="px-5 py-3 bg-[#081729] border-b border-[#152E4A] flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 led-emerald animate-pulse" />
              <span>STATION: <strong className="text-white">{settings.stationId || 'Packing-01'}</strong></span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              ONLINE
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 mt-2">
            <div className="px-3 py-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">
              MAIN NAVIGATION
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
                    w-full text-left px-3.5 py-2.5 rounded-xl font-sans text-xs transition-all
                    flex items-center justify-between group cursor-pointer
                    ${isActive 
                      ? 'bg-[#1769E8] text-white font-bold shadow-md shadow-blue-600/30' 
                      : 'text-slate-300 hover:text-white hover:bg-[#122A46]'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`} />
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className={`text-[10px] font-mono ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                        {item.subLabel}
                      </div>
                    </div>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white text-blue-700' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {item.badge}
                    </span>
                  )}

                  {item.badgeText && !isActive && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Operator Account & Settings */}
        <div className="p-4 border-t border-[#152E4A] bg-[#081729] space-y-3">
          
          {/* Quick Settings Action */}
          <button
            onClick={onOpenSettings}
            className="w-full px-3 py-2 rounded-xl bg-[#0F2640] hover:bg-[#153457] text-slate-200 border border-[#1C3B61] text-xs font-mono font-medium flex items-center justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-400" />
              <span>VMS Configuration</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
              {settings.hasToken ? 'TELEGRAM OK' : 'SETUP'}
            </span>
          </button>

          {/* User Profile / Role Card */}
          <div className="p-3 rounded-xl bg-[#0B1F35] border border-[#152E4A] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 font-mono font-bold text-xs">
                {currentStaff.name.charAt(0)}
              </div>
              <div className="flex flex-col text-left">
                <select
                  value={currentStaff.id}
                  onChange={(e) => {
                    const found = STAFF_LIST.find(s => s.id === e.target.value);
                    if (found) setCurrentStaff(found);
                  }}
                  className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer pr-1"
                >
                  {STAFF_LIST.map(st => (
                    <option key={st.id} value={st.id} className="bg-[#0B1F35] text-white">
                      {st.name} ({st.role})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 font-mono">
                  ID: {currentStaff.id}
                </span>
              </div>
            </div>

            <div className="w-2 h-2 rounded-full bg-emerald-400" title="Operator Session Active" />
          </div>

        </div>

      </aside>
    </>
  );
};
