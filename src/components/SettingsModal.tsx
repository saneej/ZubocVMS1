import React, { useState } from 'react';
import { X, Check, ShieldCheck } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-sm tracking-tight">Telegram & Station Settings</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider text-[11px]">
              Telegram Bot Token
            </label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="e.g. 8372063656:AAGc8APzAoq..."
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500 shadow-inner"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider text-[11px]">
              Telegram Channel / Group ID
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. -1003940299676"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500 shadow-inner"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider text-[11px]">
              Packing Station ID
            </label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="Packing-01"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-sans focus:outline-none focus:border-emerald-500 shadow-inner"
            />
          </div>

          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-400 font-medium">
              ⚠️ {errorMessage}
            </div>
          )}

          {saveSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-400 font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer transition-all shadow-md"
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
