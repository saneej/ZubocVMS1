import React, { useState } from 'react';
import { KeyRound, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { StaffMember } from '../types';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [accessCode, setAccessCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const code = accessCode.trim().toLowerCase();
    if (!code) {
      setErrorMessage('Please enter the access code word.');
      return;
    }

    setIsLoading(true);

    // Accept common words like 'zuboc', 'production', 'floor', 'admin', 'work' or any non-empty code for easy workshop floor access
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess({
        id: 'floor-op-' + Math.floor(Math.random() * 1000),
        name: code === 'admin' ? 'Floor Administrator' : 'Production Floor Operator',
        role: code === 'admin' ? 'ADMIN' : 'SUPERVISOR',
        stationId: 'Packing-01'
      });
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#1a0b14] to-[#2c0f22] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#832f5e] selection:text-white">
      
      <div className="w-full max-w-md space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-2">
            <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl">
              <img 
                src="https://zuboc.com/cdn/shop/files/zuboc_logo_1.svg?v=1748579899&width=500" 
                alt="Zuboc Logo" 
                className="h-10 w-auto object-contain max-w-[200px] brightness-200"
              />
            </div>
          </div>
          <p className="text-xs text-rose-200/70 font-medium tracking-wide uppercase font-mono">
            Production Deck &amp; Workshop Portal
          </p>
        </div>

        {/* Main Access Card */}
        <div className="bg-white/95 backdrop-blur-xl border border-white/20 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/40 space-y-6">
          
          <form onSubmit={handleLogin} className="space-y-4">
            
            <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#832f5e]" />
                <span>Secure Access Word</span>
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#832f5e]/10 text-[#832f5e] font-mono">
                FLOOR TERMINAL
              </span>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Access Code Input */}
            <div className="space-y-1.5 font-mono">
              <label className="block text-[11px] font-bold text-stone-700 uppercase">
                Enter Access Code / Word
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-stone-400" />
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="e.g. zuboc, production, floor..."
                  autoFocus
                  required
                  className="w-full bg-stone-50 border border-stone-300 focus:border-[#832f5e] focus:bg-white rounded-xl pl-10 pr-4 py-3 text-slate-900 text-sm font-bold focus:outline-none transition-all shadow-inner"
                />
              </div>
              <p className="text-[10px] text-stone-500 pt-1">
                Hint: Type <strong className="text-[#832f5e]">zuboc</strong> or any workshop word to access.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-[#832f5e] hover:bg-[#6c234b] disabled:opacity-50 text-white rounded-xl font-bold font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#832f5e]/30 transition-all"
            >
              <span>{isLoading ? 'VERIFYING...' : 'ENTER WORKSHOP DECK'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </form>

        </div>

        {/* Footer Note */}
        <p className="text-center text-[11px] text-stone-400 font-mono">
          Zuboc VMS • Enterprise Packing &amp; Floor Verification
        </p>

      </div>

    </div>
  );
};
