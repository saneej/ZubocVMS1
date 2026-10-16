import React, { useState, useEffect } from 'react';
import { getCurrentISTString } from '../utils/time';
import { 
  Menu, 
  Clock, 
  Settings, 
  RefreshCw,
  LogOut,
  User,
  PackagePlus
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface TopHeaderProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'calculator';
  currentStaff: StaffMember;
  settings: AppSettings;
  onOpenSettings: () => void;
  setIsMobileOpen: (open: boolean) => void;
  onRefreshOrders?: () => void;
  onLogout?: () => void;
  onOpenAddOrder?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  currentStaff,
  settings,
  onOpenSettings,
  setIsMobileOpen,
  onRefreshOrders,
  onLogout,
  onOpenAddOrder
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
    admin: 'Admin Dashboard',
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

        {/* Right Side: Simple Actions */}
        <div className="flex items-center gap-2">
          
          {/* Add Order Button in Header */}
          {onOpenAddOrder && (
            <button
              onClick={onOpenAddOrder}
              className="px-3.5 py-1.5 rounded-xl bg-[#832f5e] hover:bg-[#6c234b] text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              title="Add a new order manually"
            >
              <PackagePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Order</span>
            </button>
          )}

          {/* UTC Clock */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-mono text-slate-600 font-medium">
            <Clock className="w-3.5 h-3.5 text-[#832f5e]" />
            <span>{timeIst}</span>
          </div>

          {/* Refresh Data */}
          {onRefreshOrders && (
            <button
              onClick={onRefreshOrders}
              className="p-2 rounded-xl bg-white hover:bg-stone-100 text-slate-600 hover:text-slate-900 border border-stone-200 transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-white hover:bg-[#832f5e]/10 hover:text-[#832f5e] text-slate-600 border border-stone-200 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Active Staff Info */}
          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-stone-200">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-stone-200 text-xs font-mono">
              <User className="w-3.5 h-3.5 text-[#832f5e]" />
              <span className="font-bold text-slate-800">{currentStaff.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#832f5e]/10 text-[#832f5e] font-bold">
                {currentStaff.role}
              </span>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-2 rounded-xl bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-stone-200 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
