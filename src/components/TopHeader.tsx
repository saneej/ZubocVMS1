import React, { useState, useEffect } from 'react';
import { getCurrentISTString } from '../utils/time';
import { 
  Menu, 
  Clock, 
  Settings, 
  RefreshCw,
  LogOut,
  User,
  PackagePlus,
  Tv,
  Activity
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface TopHeaderProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales' | 'designer' | 'production-workflow' | 'users';
  currentStaff: StaffMember;
  settings: AppSettings;
  onOpenSettings: () => void;
  setIsMobileOpen: (open: boolean) => void;
  onRefreshOrders?: () => void;
  onLogout?: () => void;
  onOpenAddOrder?: () => void;
  onOpenDeck?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  currentStaff,
  settings,
  onOpenSettings,
  setIsMobileOpen,
  onRefreshOrders,
  onLogout,
  onOpenAddOrder,
  onOpenDeck
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

  const pageTitles: Record<string, string> = {
    station: 'Packing Station',
    search: 'Orders',
    history: 'Recording History',
    admin: 'Operations & Fulfillment Insights',
    calculator: 'Shipping Rate Calculator',
    deck: 'Production Deck & Live Schedule TV Dashboard',
    sales: 'Sales Intelligence & Revenue Reports',
  };

  const title = pageTitles[activeTab] || 'Dashboard';

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 text-slate-800 px-6 py-4 shadow-sm shadow-slate-200/10">
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Side: Page Title & Mobile Toggle */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="lg:hidden p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 shadow-sm active:scale-95 transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex flex-col">
            <h1 className="text-xl font-black text-slate-950 font-sans tracking-tight leading-tight">
              {title}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                <Activity className="w-3 h-3" />
                {settings.stationId || 'Packing-01'}
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-purple-600">Active Session</span>
            </div>
          </div>
        </div>

        {/* Right Side: Action Tools */}
        <div className="flex items-center gap-3">
          
          {/* Quick Actions Group */}
          <div className="flex items-center bg-slate-100/50 p-1 rounded-2xl gap-1.5">
            {onOpenAddOrder && currentStaff.role !== 'DESIGNER' && (
              <button
                onClick={onOpenAddOrder}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-lg shadow-slate-950/20 active:scale-95"
              >
                <PackagePlus className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-widest hidden sm:inline">New Order</span>
              </button>
            )}

            {onOpenDeck && currentStaff.role !== 'DESIGNER' && (
              <button
                onClick={onOpenDeck}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 shadow-sm ${
                  activeTab === 'deck' 
                    ? 'bg-purple-600 text-white border-purple-500 shadow-purple-600/20'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
                title="Launch TV Deck"
              >
                <Tv className={`w-4 h-4 ${activeTab === 'deck' ? 'text-white' : ''}`} />
              </button>
            )}
          </div>

          {/* Utilities Group */}
          <div className="hidden md:flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-[11px] font-black text-slate-600 tracking-tight">
            <Clock className="w-4 h-4 text-purple-600" />
            <span>{timeIst}</span>
          </div>

          <div className="flex items-center gap-1">
            {onRefreshOrders && (
              <button
                onClick={onRefreshOrders}
                className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-950 transition-all cursor-pointer active:scale-90"
                title="Sync Data"
              >
                <RefreshCw className="w-4.5 h-4.5" />
              </button>
            )}

            {currentStaff.role === 'ADMIN' && (
              <button
                onClick={onOpenSettings}
                className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-950 transition-all cursor-pointer active:scale-90"
                title="Settings"
              >
                <Settings className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* User Account Capsule */}
          <div className="flex items-center gap-1 pl-3 border-l border-slate-200 ml-1">
            <div className="flex items-center gap-3 pr-1.5 py-1.5 rounded-2xl bg-white border border-slate-200 shadow-sm group cursor-default">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-[12px] shadow-sm">
                {currentStaff.name.charAt(0)}
              </div>
              <div className="hidden sm:flex flex-col pr-2 leading-none">
                <span className="text-[11px] font-black text-slate-950 truncate max-w-[90px]">{currentStaff.name}</span>
                <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest mt-1">{currentStaff.role}</span>
              </div>
              
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-2 rounded-xl hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
