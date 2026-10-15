import React, { useState } from 'react';
import { X, Check, ShieldCheck, Key, Hash, Monitor, Send, AlertCircle } from 'lucide-react';
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
        }, 800);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn font-mono">
      <div className="bg-[#0e111a] border border-[#222c3f] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="bg-[#06080d] px-6 py-5 border-b border-[#1f2738] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base font-mono">VMS INTEGRATION CONFIG</h3>
              <p className="text-xs text-slate-400">Telegram Bot & Station Identifiers</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#161c2b] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs">
          
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span>TELEGRAM BOT TOKEN</span>
            </label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="e.g. 8372063656:AAGc8APzAoq..."
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-[#06080d] border border-[#222c3f] rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              <Hash className="w-3.5 h-3.5 text-emerald-400" />
              <span>TELEGRAM CHANNEL CHAT ID</span>
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. -1003940299676"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-[#06080d] border border-[#222c3f] rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              <Monitor className="w-3.5 h-3.5 text-emerald-400" />
              <span>PACKING STATION IDENTIFIER</span>
            </label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="Packing-01"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-[#06080d] border border-[#222c3f] rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
          </div>

          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 text-rose-400 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 text-emerald-400 font-bold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Parameters saved & synchronized!</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1f2738]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#161c2b] text-slate-300 hover:text-white font-bold cursor-pointer transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20 uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'SAVING...' : 'SAVE CONFIG'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
