import React, { useState } from 'react';
import { X, Settings as SettingsIcon, ShieldCheck, Check, Send } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
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

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramBotToken: botToken,
          telegramChatId: chatId,
          stationId: stationId,
          autoUpload: true
        })
      });
      const data = await res.json();
      if (data.success) {
        onSaveSettings({
          ...settings,
          telegramBotToken: botToken,
          telegramChatId: chatId,
          stationId: stationId,
          hasToken: Boolean(botToken)
        });
        setSaveSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base">System & Telegram Settings</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          
          <div>
            <label className="block text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
              Telegram Bot Token
            </label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Obtain your bot token from @BotFather on Telegram and add it to the designated private group.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
              Telegram Group / Chat ID
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. -100123456789 or @packing_group"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              The private Telegram group ID where packing video evidence will be automatically uploaded.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
              Packing Station ID
            </label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="Packing-01"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 shadow-inner"
            />
          </div>

          {saveSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold shadow-lg transition-all cursor-pointer flex items-center space-x-2"
            >
              {isSaving ? <span>Saving...</span> : <span>Save Settings</span>}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
