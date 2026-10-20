import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  ShieldCheck, 
  Key, 
  Hash, 
  Monitor, 
  AlertCircle, 
  Users, 
  UserPlus, 
  Trash2, 
  RotateCcw, 
  Settings as SettingsIcon,
  Shield,
  Eye,
  EyeOff,
  User,
  Activity,
  Download,
  Upload,
  Database,
  Save
} from 'lucide-react';
import { AppSettings, StaffMember } from '../types';
import { safeFetchJson } from '../utils/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  currentStaff: StaffMember;
  onStaffUpdated?: () => void;
  onStaffChanged?: (updatedStaff: StaffMember) => void;
}

function cleanInputString(val: string): string {
  if (!val) return '';
  return val.trim().replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  currentStaff,
  onStaffUpdated,
  onStaffChanged
}) => {
  const [activeTab, setActiveTab] = useState<'telegram' | 'profile' | 'staffs' | 'backup'>('telegram');

  // Telegram Config
  const [botToken, setBotToken] = useState(settings.telegramBotToken || '');
  const [chatId, setChatId] = useState(settings.telegramChatId || '');
  const [stationId, setStationId] = useState(settings.stationId || 'Packing-01');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDetectingChat, setIsDetectingChat] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  const handleDetectChatId = async () => {
    setIsDetectingChat(true);
    setDetectStatus(null);
    setErrorMessage(null);
    try {
      const tokenToUse = botToken || settings.telegramBotToken;
      const res = await safeFetchJson('/api/telegram/detect-chat-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramBotToken: tokenToUse })
      });

      if (res && res.success && res.chatId) {
        setChatId(res.chatId);
        setDetectStatus(`Detected: "${res.chatTitle}" (${res.chatId})`);
      } else {
        setDetectStatus(res?.message || 'No recent messages found. Steps: 1) Add bot to group, 2) Send a message (e.g. "hello bot") in the group, 3) Click Auto-Detect again!');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to detect group Chat ID');
    } finally {
      setIsDetectingChat(false);
    }
  };

  // Profile State
  const [profileName, setProfileName] = useState(currentStaff.name || '');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Staffs State
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoadingStaffs, setIsLoadingStaffs] = useState(false);
  const [staffActionError, setStaffActionError] = useState<string | null>(null);
  const [staffActionSuccess, setStaffActionSuccess] = useState<string | null>(null);

  // Add Staff Form
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'PACKER' | 'SUPERVISOR' | 'ADMIN'>('PACKER');
  const [newStaffStation, setNewStaffStation] = useState(settings.stationId || 'Packing-01');
  const [newStaffPassword, setNewStaffPassword] = useState('password123');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);

  // Reset Password Modal / Action
  const [resettingStaffId, setResettingStaffId] = useState<string | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setBotToken(settings.telegramBotToken || '');
      setChatId(settings.telegramChatId || '');
      setStationId(settings.stationId || 'Packing-01');
      setProfileName(currentStaff.name || '');
      fetchStaffs();
    }
  }, [isOpen, currentStaff]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);
    setIsSavingProfile(true);

    const cleanName = cleanInputString(profileName);
    if (!cleanName) {
      setProfileError('Display name cannot be empty.');
      setIsSavingProfile(false);
      return;
    }

    try {
      const res = await safeFetchJson('/api/staffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentStaff.id,
          name: cleanName,
          role: currentStaff.role,
          stationId: currentStaff.stationId,
          email: currentStaff.email
        })
      });

      if (res && res.success) {
        const updatedStaff: StaffMember = {
          ...currentStaff,
          name: cleanName
        };
        onStaffChanged?.(updatedStaff);
        setProfileSuccess(true);
        setTimeout(() => {
          setProfileSuccess(false);
          onStaffUpdated?.();
        }, 1000);
      } else {
        throw new Error(res?.error || 'Failed to update profile name');
      }
    } catch (err: any) {
      setProfileError(err.message || 'Error updating profile name');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchStaffs = async () => {
    setIsLoadingStaffs(true);
    try {
      const data = await safeFetchJson('/api/staffs');
      if (Array.isArray(data)) {
        setStaffList(data);
      }
    } catch (err: any) {
      console.warn('Failed to load staffs from API:', err);
    } finally {
      setIsLoadingStaffs(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveTelegramSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    const sanitizedToken = cleanInputString(botToken);
    const sanitizedChatId = cleanInputString(chatId);
    const sanitizedStationId = cleanInputString(stationId);

    try {
      if (sanitizedToken && !sanitizedToken.includes('...')) {
        const meRes = await fetch(`https://api.telegram.org/bot${sanitizedToken}/getMe`);
        const meText = await meRes.text();
        let meData: any = null;
        try { meData = JSON.parse(meText); } catch {}
        if (!meData || !meData.ok) {
          throw new Error(meData?.description || 'Invalid Telegram Bot Token');
        }
      }

      if (sanitizedToken && !sanitizedToken.includes('...')) {
        localStorage.setItem('zuboc_telegram_token', sanitizedToken);
      }
      localStorage.setItem('zuboc_telegram_chatid', sanitizedChatId);
      localStorage.setItem('zuboc_station_id', sanitizedStationId);

      try {
        await safeFetchJson('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramBotToken: sanitizedToken,
            telegramChatId: sanitizedChatId,
            stationId: sanitizedStationId,
            autoUpload: true
          })
        });
      } catch {}

      onSaveSettings({
        ...settings,
        telegramBotToken: localStorage.getItem('zuboc_telegram_token') || sanitizedToken,
        telegramChatId: sanitizedChatId,
        stationId: sanitizedStationId,
        hasToken: Boolean(sanitizedToken)
      });

      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffActionError(null);
    setStaffActionSuccess(null);
    setIsSubmittingStaff(true);

    const cleanId = cleanInputString(newStaffId);
    const cleanName = cleanInputString(newStaffName);
    const cleanStation = cleanInputString(newStaffStation) || settings.stationId;
    const cleanPass = newStaffPassword.trim();

    if (!cleanId || !cleanName) {
      setStaffActionError('Staff ID and Full Name are required.');
      setIsSubmittingStaff(false);
      return;
    }

    try {
      const res = await safeFetchJson('/api/staffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cleanId,
          name: cleanName,
          role: newStaffRole,
          stationId: cleanStation,
          password: cleanPass || 'password123'
        })
      });

      if (res && res.success) {
        setStaffActionSuccess(`Staff member ${cleanName} (${cleanId}) added!`);
        setNewStaffId('');
        setNewStaffName('');
        setNewStaffPassword('password123');
        setShowAddForm(false);
        await fetchStaffs();
        onStaffUpdated?.();
        try {
          const bc = new BroadcastChannel('zuboc_flow_sync');
          bc.postMessage({ type: 'SYNC_REFRESH' });
          bc.close();
        } catch {}
      } else {
        throw new Error(res?.error || 'Failed to add staff member');
      }
    } catch (err: any) {
      setStaffActionError(err.message || 'Error adding staff');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleRemoveStaff = async (staffId: string, staffName: string) => {
    if (staffId === currentStaff.id) {
      setStaffActionError('You cannot delete your own currently logged-in account.');
      return;
    }

    if (!window.confirm(`Are you sure you want to remove staff member "${staffName}" (${staffId})?`)) {
      return;
    }

    setStaffActionError(null);
    setStaffActionSuccess(null);

    try {
      const res = await safeFetchJson(`/api/staffs/${staffId}`, { method: 'DELETE' });
      if (res && res.success) {
        setStaffActionSuccess(`Staff member ${staffName} removed.`);
        await fetchStaffs();
        onStaffUpdated?.();
        try {
          const bc = new BroadcastChannel('zuboc_flow_sync');
          bc.postMessage({ type: 'SYNC_REFRESH' });
          bc.close();
        } catch {}
      } else {
        throw new Error(res?.error || 'Failed to remove staff');
      }
    } catch (err: any) {
      setStaffActionError(err.message || 'Error removing staff');
    }
  };

  const handleResetPassword = async (staffId: string) => {
    if (!resetNewPassword || resetNewPassword.trim().length < 4) {
      setStaffActionError('New password must be at least 4 characters.');
      return;
    }

    setStaffActionError(null);
    setStaffActionSuccess(null);

    try {
      const res = await safeFetchJson('/api/staffs/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: staffId,
          newPassword: resetNewPassword.trim()
        })
      });

      if (res && res.success) {
        setStaffActionSuccess(`Password reset successfully for ${staffId}!`);
        setResettingStaffId(null);
        setResetNewPassword('');
        await fetchStaffs();
        try {
          const bc = new BroadcastChannel('zuboc_flow_sync');
          bc.postMessage({ type: 'SYNC_REFRESH' });
          bc.close();
        } catch {}
      } else {
        throw new Error(res?.error || 'Failed to reset password');
      }
    } catch (err: any) {
      setStaffActionError(err.message || 'Error resetting password');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm font-mono uppercase tracking-wider">Workstation Settings</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-6 pt-2 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'telegram'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>TELEGRAM & STATION</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>MY PROFILE</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('staffs')}
            className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'staffs'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-blue-600" />
            <span>ACCESS CODES ({staffList.length})</span>
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs">
          
          {/* TAB: My Profile */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900 space-y-1">
                <div className="font-bold">Operator Profile Settings</div>
                <div className="text-[11px] text-blue-700">Update your display name used across order logs and packing sessions.</div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">User ID (Login Username)</label>
                <input
                  type="text"
                  value={currentStaff.id}
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-500 cursor-not-allowed font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">Role & Access</label>
                <input
                  type="text"
                  value={currentStaff.role}
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-500 cursor-not-allowed font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>Display Name</span>
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. David Admin"
                  required
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none transition-all"
                />
              </div>

              {profileError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              {profileSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Display name updated successfully!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  CANCEL
                </button>

                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-all uppercase tracking-wider"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingProfile ? 'SAVING...' : 'UPDATE NAME'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 1: Telegram & Station */}
          {activeTab === 'telegram' && (
            <form onSubmit={handleSaveTelegramSettings} className="space-y-4">
              
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  <Key className="w-3.5 h-3.5 text-blue-600" />
                  <span>Telegram Bot Token</span>
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="e.g. 8372063656:AAGc8AP..."
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center justify-between font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-blue-600" />
                    <span>Telegram Group / Channel Chat ID</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal lowercase">starts with -100 for groups</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="e.g. -1003940299676"
                    className="flex-1 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none transition-all font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleDetectChatId}
                    disabled={isDetectingChat}
                    className="px-3.5 py-2.5 bg-[#832f5e] hover:bg-[#6c234b] disabled:opacity-50 text-white rounded-xl font-bold text-xs cursor-pointer transition-colors shadow-2xs shrink-0 flex items-center gap-1.5"
                    title="Automatically detect Chat ID from your Telegram bot updates"
                  >
                    <span>{isDetectingChat ? 'SEARCHING...' : '🔍 AUTO-DETECT GROUP ID'}</span>
                  </button>
                </div>

                {detectStatus && (
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-mono leading-relaxed mt-1">
                    {detectStatus}
                  </div>
                )}

                {/* Instructions Box: How to switch to a Telegram Group */}
                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl space-y-1.5 text-[11px] text-stone-700 font-sans mt-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 font-mono text-xs">
                    <span>💡 How to switch to a new Telegram Group:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 font-mono text-[11px]">
                    <li>Add your bot to your new Telegram Group as a member or Admin.</li>
                    <li>Send a test message in the group (e.g. <code>hello bot</code> or <code>/start</code>).</li>
                    <li>Click the <b>Auto-Detect Group ID</b> button above!</li>
                  </ol>
                </div>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  <Monitor className="w-3.5 h-3.5 text-blue-600" />
                  <span>Packing Station Identifier</span>
                </label>
                <input
                  type="text"
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  placeholder="e.g. Packing-01"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none transition-all"
                />
              </div>

              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Settings saved successfully!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  CANCEL
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-all uppercase tracking-wider"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'SAVING...' : 'SAVE CONFIGURATION'}</span>
                </button>
              </div>

            </form>
          )}

          {/* TAB 2: Staff Members Management */}
          {activeTab === 'staffs' && (
            <div className="space-y-4">
              
              {/* Feedback messages */}
              {staffActionError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{staffActionError}</span>
                  </div>
                  <button onClick={() => setStaffActionError(null)} className="font-bold cursor-pointer">✕</button>
                </div>
              )}

              {staffActionSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{staffActionSuccess}</span>
                  </div>
                  <button onClick={() => setStaffActionSuccess(null)} className="font-bold cursor-pointer">✕</button>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider font-mono">
                  Authorized Access Codes ({staffList.length})
                </span>

                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-3 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all text-xs font-mono"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{showAddForm ? 'CANCEL' : '+ ADD ACCESS CODE'}</span>
                </button>
              </div>

              {/* ADD ACCESS CODE INLINE FORM */}
              {showAddForm && (
                <form onSubmit={handleAddStaff} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 font-mono">
                  <h4 className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-[#832f5e]" />
                    <span>Create New Access Code</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Access Code / Passphrase *</label>
                      <input
                        type="text"
                        value={newStaffPassword || newStaffId}
                        onChange={(e) => {
                          setNewStaffPassword(e.target.value);
                          if (!newStaffId) setNewStaffId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                        }}
                        placeholder="e.g. 889911 or ayisha123 or floor99"
                        required
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-[#832f5e] focus:outline-none font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assigned To (Name / Station) *</label>
                      <input
                        type="text"
                        value={newStaffName}
                        onChange={(e) => {
                          setNewStaffName(e.target.value);
                          if (!newStaffId) setNewStaffId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                        }}
                        placeholder="e.g. Ayisha or Saneej or Floor Station 1"
                        required
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-[#832f5e] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Permission Role</label>
                      <select
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value as any)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-[#832f5e] focus:outline-none cursor-pointer"
                      >
                        <option value="PACKER">PACKER</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assigned Station</label>
                      <input
                        type="text"
                        value={newStaffStation}
                        onChange={(e) => setNewStaffStation(e.target.value)}
                        placeholder="e.g. Packing-01"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-[#832f5e] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingStaff}
                      className="px-4 py-1.5 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-lg font-bold cursor-pointer shadow-xs"
                    >
                      {isSubmittingStaff ? 'Saving...' : 'Save Access Code'}
                    </button>
                  </div>
                </form>
              )}

              {/* ACCESS CODES TABLE */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white font-mono">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="p-3">Access Code</th>
                      <th className="p-3">Assigned To</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Station</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffList.map((staff) => (
                      <tr key={staff.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-[#832f5e] font-mono text-sm">
                            {staff.password || staff.id}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono">Code ID: {staff.id}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900">{staff.name}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            staff.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                            staff.role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {staff.role}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 font-bold">
                          {staff.stationId}
                        </td>
                        <td className="p-3 text-right space-x-1.5">
                          {/* Update Code Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setResettingStaffId(resettingStaffId === staff.id ? null : staff.id);
                              setResetNewPassword(staff.password || '');
                            }}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold cursor-pointer"
                            title="Update access code"
                          >
                            Update Code
                          </button>

                          {/* Delete Code Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveStaff(staff.id, staff.name)}
                            disabled={staff.id === currentStaff.id}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded disabled:opacity-30 cursor-pointer"
                            title={staff.id === currentStaff.id ? 'Cannot remove currently logged-in access code' : 'Delete access code'}
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* INLINE UPDATE ACCESS CODE PANEL */}
              {resettingStaffId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 text-xs">
                      Update Access Code for Assigned User: <strong>{staffList.find(s => s.id === resettingStaffId)?.name || resettingStaffId}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setResettingStaffId(null)}
                      className="text-amber-800 hover:text-amber-950 font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="Enter new password (min 4 characters)..."
                      className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-slate-900 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleResetPassword(resettingStaffId)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs"
                    >
                      Update Password
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Modal Footer with Diagnose Portal link */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <a
            href="/diagnose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-[#832f5e] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-[#832f5e]" />
            <span>System &amp; Quota Diagnostics (/diagnose)</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl font-bold text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
