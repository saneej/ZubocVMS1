import React, { useState } from 'react';
import { X, Check, ShieldCheck, Key, Hash, Monitor, AlertCircle } from 'lucide-react';
import { AppSettings } from '../types';
import { safeFetchJson } from '../utils/api';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

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

      if (db) {
        try {
          await setDoc(doc(db, 'settings', 'config'), {
            telegramBotToken: localStorage.getItem('zuboc_telegram_token') || sanitizedToken,
            telegramChatId: sanitizedChatId,
            stationId: sanitizedStationId,
            autoUpload: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch {}
      }

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
      }, 800);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm font-mono uppercase tracking-wider">VMS Configuration</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs font-mono">
          
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

          <div className="space-y-1">
            <label className="flex items-center gap-1.5 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              <Hash className="w-3.5 h-3.5 text-blue-600" />
              <span>Telegram Channel Chat ID</span>
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. -1003940299676"
              className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none transition-all"
            />
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
              placeholder="Packing-01"
              className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none transition-all"
            />
          </div>

          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 font-bold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Saved successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-2xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Config'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
