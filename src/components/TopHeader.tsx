import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Clock, 
  Settings, 
  RefreshCw,
  LogOut,
  User
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface TopHeaderProps {
  activeTab: 'station' | 'search' | 'history' | 'admin';
  currentStaff: StaffMember;
  settings: AppSettings;
  onOpenSettings: () => void;
  setIsMobileOpen: (open: boolean) => void;
  onRefreshOrders?: () => void;
  onLogout?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  currentStaff,
  settings,
  onOpenSettings,
  setIsMobileOpen,
  onRefreshOrders,
  onLogout
}) => {
  const [timeUtc, setTimeUtc] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeUtc(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const pageTitles: Record<string, string> = {
    station: 'Packing Station',
    search: 'Search Recordings',
    history: 'Recording History',
    admin: 'Admin Dashboard',
  };

  const title = pageTitles[activeTab] || 'Dashboard';

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 text-slate-800 px-6 py-3.5 shadow-2xs">
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Side: Page Title & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-extrabold text-slate-900 font-sans tracking-tight">
              {title}
            </h1>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-600 border border-blue-200/60">
              STATION: {settings.stationId || 'Packing-01'}
            </span>
          </div>
        </div>

        {/* Right Side: Simple Actions */}
        <div className="flex items-center gap-2">
          
          {/* UTC Clock */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600 font-medium">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>{timeUtc}</span>
          </div>

          {/* Refresh Data */}
          {onRefreshOrders && (
            <button
              onClick={onRefreshOrders}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors cursor-pointer"
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
            className="p-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Active Staff Info */}
          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-bold text-slate-800">{currentStaff.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-bold">
                {currentStaff.role}
              </span>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
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
