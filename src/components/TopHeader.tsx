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
  Tv
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface TopHeaderProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'calculator' | 'deck' | 'sales';
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
    <header className="sticky top-0 z-30 bg-[#F9F8F6]/90 backdrop-blur-md border-b border-stone-200/80 text-slate-800 px-6 py-3.5 shadow-2xs">
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Side: Page Title & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-white border border-stone-200 text-slate-600 hover:text-slate-900"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-extrabold text-slate-900 font-sans tracking-tight">
              {title}
            </h1>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#832f5e]/10 text-[#832f5e] border border-[#832f5e]/20">
              STATION: {settings.stationId || 'Packing-01'}
            </span>
          </div>
        </div>

        {/* Right Side: Action Tools */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Quick Actions Group */}
          <div className="flex items-center bg-white/50 border border-stone-200/60 p-1 rounded-2xl gap-1">
            {onOpenAddOrder && (
              <button
                onClick={onOpenAddOrder}
                className="p-2 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white transition-all cursor-pointer shadow-sm"
                title="Add New Order"
              >
                <PackagePlus className="w-4 h-4" />
              </button>
            )}

            {onOpenDeck && (
              <button
                onClick={onOpenDeck}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  activeTab === 'deck' 
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-stone-50 text-slate-600 border-stone-200'
                }`}
                title="Launch TV Deck"
              >
                <Tv className={`w-4 h-4 ${activeTab === 'deck' ? 'text-amber-400' : ''}`} />
              </button>
            )}
          </div>

          {/* Utilities Group */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/50 border border-stone-200/60 text-[11px] font-mono text-slate-500 font-bold">
            <Clock className="w-3.5 h-3.5 text-[#832f5e]/60" />
            <span>{timeIst.split(' ')[0]}</span>
          </div>

          <div className="flex items-center gap-1">
            {onRefreshOrders && (
              <button
                onClick={onRefreshOrders}
                className="p-2 rounded-xl hover:bg-white hover:text-[#832f5e] text-slate-400 transition-colors cursor-pointer"
                title="Sync Data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl hover:bg-white hover:text-[#832f5e] text-slate-400 transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* User Account Capsule */}
          <div className="flex items-center gap-1 pl-1.5 border-l border-stone-200/80 ml-1">
            <div className="flex items-center gap-2 pr-1 py-1 rounded-2xl bg-white border border-stone-200/80 shadow-3xs group cursor-default">
              <div className="w-7 h-7 rounded-xl bg-stone-100 text-[#832f5e] flex items-center justify-center font-black text-[10px]">
                {currentStaff.name.charAt(0)}
              </div>
              <div className="hidden sm:flex flex-col pr-3 leading-tight">
                <span className="text-[10px] font-black text-slate-900 truncate max-w-[80px]">{currentStaff.name}</span>
                <span className="text-[8px] font-bold text-[#832f5e] uppercase tracking-widest">{currentStaff.role}</span>
              </div>
              
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer mr-0.5"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
