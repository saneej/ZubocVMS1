import React, { useState } from 'react';
import { KeyRound, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff, Lock, CheckCircle2 } from 'lucide-react';
import { StaffMember } from '../types';
import { safeFetchJson } from '../utils/api';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleVerifyAccess = async () => {
    const targetCode = accessCode.trim();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!targetCode) {
      setErrorMessage('Please enter your Station Access Phrase.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await safeFetchJson('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: targetCode })
      });

      if (res && res.success && res.staff) {
        setSuccessMessage(res.message || 'Access Verified!');
        setTimeout(() => {
          onLoginSuccess(res.staff);
        }, 300);
      } else {
        setErrorMessage(res?.error || 'Invalid Access Phrase. Access Denied.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleVerifyAccess();
  };

  return (
    <div className="min-h-screen bg-[#0a0508] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-purple-600 selection:text-white relative overflow-hidden">
      
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse delay-700" />
      
      <div className="w-full max-w-sm space-y-8 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-2">
            <div className="bg-white/5 p-4 rounded-[2.5rem] backdrop-blur-2xl border border-white/10 shadow-2xl ring-1 ring-white/10 group transition-all hover:ring-white/20">
              <img 
                src="/zuboc-com-svg-1-1.png" 
                alt="Zuboc Flow Logo" 
                className="h-14 w-auto object-contain max-w-[220px] brightness-[2.5] transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-white text-xl font-black tracking-tight">Access Terminal</h2>
            <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.3em]">Secure Logistics Gateway</p>
          </div>
        </div>

        {/* Main Access Card */}
        <div className="bg-white/95 backdrop-blur-3xl border border-white/20 rounded-[2rem] p-8 shadow-2xl shadow-black/80 space-y-6 relative overflow-hidden">
          {/* Inner card glow */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
          
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Feedback Messages */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-2xl text-[11px] font-black uppercase tracking-wider flex items-center gap-3 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-2xl text-[11px] font-black uppercase tracking-wider flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Verification Successful</span>
              </div>
            )}

            {/* Access Code Input */}
            <div className="space-y-2 font-sans">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                Enter Access Phrase
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Lock className={`w-5 h-5 transition-colors duration-300 ${isLoading ? 'text-purple-600' : 'text-slate-300 group-focus-within:text-purple-600'}`} />
                </div>
                <input
                  type={showCode ? "text" : "password"}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="•••• •••• ••••"
                  autoFocus
                  required
                  autoComplete="off"
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-purple-600 focus:bg-white text-slate-900 px-12 py-4 rounded-2xl text-base font-black tracking-[0.2em] placeholder:text-slate-200 placeholder:tracking-normal outline-none transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
                  title={showCode ? "Hide passphrase" : "Show passphrase"}
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !accessCode.trim()}
              className={`
                w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 group relative overflow-hidden shadow-xl
                ${isLoading || !accessCode.trim()
                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed border-2 border-slate-200' 
                  : 'bg-slate-950 text-white hover:bg-slate-800 border-2 border-slate-950 active:scale-[0.98] shadow-slate-950/40'
                }
              `}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Authenticating</span>
                </>
              ) : (
                <>
                  <span>Login to Station</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
              Authorized Personnel Only
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex justify-between items-center px-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">System Online</span>
          </div>
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">v2.4.0-FLOW</span>
        </div>
      </div>
    </div>
  );
};
