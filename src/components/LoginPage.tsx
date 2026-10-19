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

  const handleVerifyAccess = async (codeToVerify?: string) => {
    const targetCode = (codeToVerify !== undefined ? codeToVerify : accessCode).trim();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!targetCode) {
      setErrorMessage('Please enter your Access Code.');
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
        setErrorMessage(res?.error || 'Invalid Access Code. Access Denied.');
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

  const handleKeypadPress = (digit: string) => {
    const nextCode = accessCode + digit;
    setAccessCode(nextCode);
  };

  const handleKeypadClear = () => {
    setAccessCode('');
    setErrorMessage(null);
  };

  const handleKeypadBackspace = () => {
    setAccessCode(prev => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#160a12] to-[#2a0e20] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#832f5e] selection:text-white">
      
      <div className="w-full max-w-sm space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-1">
            <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl">
              <img 
                src="https://zuboc.com/cdn/shop/files/zuboc_logo_1.svg?v=1748579899&width=500" 
                alt="Zuboc Logo" 
                className="h-9 w-auto object-contain max-w-[180px] brightness-200"
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-stone-300 text-xs font-mono font-bold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5 text-[#832f5e]" />
            <span>Secure Access Terminal</span>
          </div>
        </div>

        {/* Main Access Card */}
        <div className="bg-white/95 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl shadow-black/50 space-y-5">
          
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#832f5e]" />
                <span>Station Passcode</span>
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#832f5e]/10 text-[#832f5e] font-mono">
                ENCRYPTED
              </span>
            </div>

            {/* Feedback Messages */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-2xl text-xs font-mono flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-bold">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">{successMessage}</span>
              </div>
            )}

            {/* Access Code Input */}
            <div className="space-y-1.5 font-mono">
              <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                Enter Access Code / PIN
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-stone-400" />
                <input
                  type={showCode ? "text" : "password"}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  required
                  autoComplete="off"
                  className="w-full bg-stone-50 border border-stone-300 focus:border-[#832f5e] focus:bg-white rounded-2xl pl-10 pr-10 py-3 text-slate-900 text-base font-mono font-bold tracking-widest focus:outline-none transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  className="py-2.5 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-slate-800 rounded-xl font-black text-sm transition-all cursor-pointer border border-stone-200"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleKeypadClear}
                className="py-2.5 bg-stone-100 hover:bg-stone-200 text-rose-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border border-stone-200"
              >
                CLR
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="py-2.5 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-slate-800 rounded-xl font-black text-sm transition-all cursor-pointer border border-stone-200"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="py-2.5 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer border border-stone-200"
              >
                ⌫
              </button>
            </div>

            {/* Verify Button */}
            <button
              type="submit"
              disabled={isLoading || !accessCode.trim()}
              className="w-full py-3.5 bg-[#832f5e] hover:bg-[#6c234b] disabled:opacity-50 text-white rounded-2xl font-bold font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#832f5e]/30 transition-all mt-2"
            >
              <span>{isLoading ? 'VERIFYING...' : 'VERIFY & ENTER'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </form>

        </div>

        {/* Security Footer */}
        <p className="text-center text-[10px] text-stone-400 font-mono tracking-wider uppercase">
          Zuboc VMS • Server-Verified Station Terminal
        </p>

      </div>

    </div>
  );
};
