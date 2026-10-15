import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Clock, 
  Radio, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  Search,
  ShieldCheck,
  RefreshCw,
  Bell
} from 'lucide-react';
import { StaffMember, AppSettings } from '../types';
import { safeFetchJson } from '../utils/api';

interface TopHeaderProps {
  activeTab: 'station' | 'search' | 'history' | 'admin' | 'diagnose';
  currentStaff: StaffMember;
  settings: AppSettings;
  onOpenSettings: () => void;
  setIsMobileOpen: (open: boolean) => void;
  onRefreshOrders?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  currentStaff,
  settings,
  onOpenSettings,
  setIsMobileOpen,
  onRefreshOrders
}) => {
  const [timeUtc, setTimeUtc] = useState<string>('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeUtc(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    station: { title: 'Packing Station', subtitle: 'Live Overhead Camera & AWB Barcode Scanner' },
    search: { title: 'Search Recordings', subtitle: 'Cryptographic Evidence Vault & Audit Retrieval' },
    history: { title: 'Recording History', subtitle: 'Chronological Dispatch Audit Ledger' },
    admin: { title: 'Admin Dashboard', subtitle: 'Real-time Telemetry & Operational Analytics' },
    diagnose: { title: 'Diagnostics', subtitle: 'Webcam Stream, Audio & Telegram Health' },
  };

  const currentInfo = pageTitles[activeTab] || { title: 'Control Panel', subtitle: 'VMS Gateway' };

  const handleTestTelegram = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await safeFetchJson('/api/telegram/test-connection', { method: 'POST' });
      if (res && res.success) {
        setTestResult({ success: true, message: 'Bot gateway ping successful!' });
      } else {
        setTestResult({ success: false, message: res?.error || 'Telegram bot connection failed.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Gateway offline.' });
    } finally {
      setTestSending(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0B0F19] border-b border-[#1A2338] text-slate-100 px-4 lg:px-8 py-3.5 shadow-md">
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Side: Title & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-[#131B2E] border border-[#212D4A] text-slate-300 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base lg:text-lg font-extrabold text-white font-sans tracking-tight">
                {currentInfo.title}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#131B2E] text-blue-400 border border-[#212D4A]">
                BRIGADEZ VMS
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono hidden sm:block">
              {currentInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right Side: Telemetry Metrics & Actions */}
        <div className="flex items-center gap-3">
          
          {/* UTC Clock */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#131B2E] border border-[#212D4A] text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{timeUtc}</span>
          </div>

          {/* Bot Gateway Ping */}
          <button
            onClick={handleTestTelegram}
            disabled={testSending}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#131B2E] hover:bg-[#1C2844] disabled:opacity-50 border border-[#212D4A] text-xs font-mono text-slate-200 transition-colors cursor-pointer"
            title="Ping Telegram Bot Gateway"
          >
            <Radio className={`w-3.5 h-3.5 ${settings.hasToken ? 'text-emerald-400' : 'text-amber-400'} ${testSending ? 'animate-ping' : ''}`} />
            <span className="font-semibold">{testSending ? 'Pinging...' : 'PING BOT'}</span>
          </button>

          {/* Test Toast Pill */}
          {testResult && (
            <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono ${
              testResult.success ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Sync Refresh Button */}
          {onRefreshOrders && (
            <button
              onClick={onRefreshOrders}
              className="p-2 rounded-xl bg-[#131B2E] hover:bg-[#1C2844] text-slate-300 hover:text-white border border-[#212D4A] transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {/* Settings Trigger Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-[#131B2E] hover:bg-[#1C2844] text-slate-300 hover:text-blue-400 border border-[#212D4A] transition-colors cursor-pointer"
            title="Open VMS Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

        </div>

      </div>
    </header>
  );
};
