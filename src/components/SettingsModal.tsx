import React, { useState } from 'react';
import { X, Check, ShieldCheck, Key, Hash, Monitor } from 'lucide-react';
import { AppSettings } from '../types';
import { safeFetchJson } from '../utils/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
}

function cleanInputString(val: string): string {
  if (!val) return '';
  return val.trim().replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  const [botToken, setBotToken] = useState(settings.telegramBotToken || '');
  const [chatId, setChatId] = useState(settings.telegramChatId || '');
  const [stationId, setStationId] = useState(settings.stationId || 'Packing-01');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    const sanitizedToken = cleanInputString(botToken);
    const sanitizedChatId = cleanInputString(chatId);
    const sanitizedStationId = cleanInputString(stationId);

    try {
      const data = await safeFetchJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramBotToken: sanitizedToken,
          telegramChatId: sanitizedChatId,
          stationId: sanitizedStationId,
          autoUpload: true
        })
      });

      if (data.success) {
        onSaveSettings({
          ...settings,
          telegramBotToken: sanitizedToken,
          telegramChatId: sanitizedChatId,
          stationId: sanitizedStationId,
          hasToken: Boolean(sanitizedToken)
        });
        setSaveSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setErrorMessage(data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        <div className="bg-slate-950 px-8 py-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base tracking-tight">Zuboc Integration Settings</h3>
              <p className="text-xs text-slate-400 font-mono">Telegram Bot & Station Configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6 text-xs">
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span>Telegram Bot Token</span>
            </label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="e.g. 8372063656:AAGc8APzAoq..."
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white font-mono focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              <Hash className="w-3.5 h-3.5 text-cyan-400" />
              <span>Telegram Channel / Group ID</span>
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. -1003940299676"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white font-mono focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>Packing Station Identifier</span>
            </label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="Packing-01"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white font-sans focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
            />
          </div>

          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-400 font-medium">
              ⚠️ {errorMessage}
            </div>
          )}

          {saveSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-emerald-400 font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Settings successfully synchronized!</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-black shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
