import React, { useState } from 'react';
import { 
  KeyRound, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Lock, 
  CheckCircle2, 
  Palette, 
  Factory, 
  FileText, 
  Sparkles,
  User
} from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { safeFetchJson } from '../utils/api';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [selectedPortal, setSelectedPortal] = useState<'CRE' | 'DESIGNER' | 'PRODUCTION' | 'ADMIN'>('CRE');
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleVerifyAccess = async (overrideCode?: string) => {
    const targetCode = (overrideCode || accessCode).trim();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!targetCode) {
      setErrorMessage('Please enter your User ID or Access Phrase.');
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

  const getPortalInfo = () => {
    switch (selectedPortal) {
      case 'DESIGNER':
        return {
          title: 'Design Studio Portal',
          subtitle: 'CAD Blueprints, 3D Assets & Custom Revisions',
          color: 'from-amber-600 to-amber-700',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
          icon: Palette,
          demoUser: 'designer-01',
          demoPass: 'password123'
        };
      case 'PRODUCTION':
        return {
          title: 'Production Floor Terminal',
          subtitle: 'Manufacturing Queue & Blueprint Execution',
          color: 'from-blue-600 to-indigo-700',
          badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
          icon: Factory,
          demoUser: 'production-01',
          demoPass: 'password123'
        };
      case 'ADMIN':
        return {
          title: 'Admin Master Console',
          subtitle: 'Full System Oversight, Role Assignment & Security',
          color: 'from-purple-600 to-slate-900',
          badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
          icon: ShieldCheck,
          demoUser: 'saneej',
          demoPass: 'saneej'
        };
      default:
        return {
          title: 'CRE Order Terminal',
          subtitle: 'Customer Relations, Orders, Packing & Dispatch',
          color: 'from-indigo-600 to-purple-800',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30',
          icon: FileText,
          demoUser: 'cre-01',
          demoPass: 'password123'
        };
    }
  };

  const portalInfo = getPortalInfo();
  const PortalIcon = portalInfo.icon;

  return (
    <div className="min-h-screen bg-[#070408] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-purple-600 selection:text-white relative overflow-hidden">
      
      {/* Dynamic Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-purple-600/10 blur-[130px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-indigo-600/10 blur-[130px] rounded-full animate-pulse delay-700" />
      
      <div className="w-full max-w-md space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-white/5 px-5 py-2.5 rounded-full backdrop-blur-2xl border border-white/10 shadow-2xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-xs font-black uppercase tracking-[0.25em] text-white">
              Zuboc Operations Suite
            </span>
          </div>
          <h2 className="text-white text-2xl font-black tracking-tight">{portalInfo.title}</h2>
          <p className="text-slate-400 text-xs font-medium">{portalInfo.subtitle}</p>
        </div>

        {/* 3 Department Portals Selector */}
        <div className="bg-white/5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setSelectedPortal('CRE')}
            className={`py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${
              selectedPortal === 'CRE'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>CRE</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPortal('DESIGNER')}
            className={`py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${
              selectedPortal === 'DESIGNER'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Design</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPortal('PRODUCTION')}
            className={`py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${
              selectedPortal === 'PRODUCTION'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Factory className="w-3.5 h-3.5" />
            <span>Prod</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPortal('ADMIN')}
            className={`py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${
              selectedPortal === 'ADMIN'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>

        {/* Main Access Card */}
        <div className="bg-white/95 backdrop-blur-3xl border border-white/20 rounded-[2rem] p-7 shadow-2xl shadow-black/80 space-y-5 relative overflow-hidden">
          
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Feedback Messages */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Access Code Input */}
            <div className="space-y-1.5 font-sans">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Enter User ID, Station PIN or Passphrase
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Lock className={`w-4 h-4 transition-colors duration-200 ${isLoading ? 'text-indigo-600' : 'text-slate-400 group-focus-within:text-indigo-600'}`} />
                </div>
                <input
                  type={showCode ? "text" : "password"}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter User ID or password..."
                  autoFocus
                  required
                  autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white text-slate-900 pl-11 pr-11 py-3.5 rounded-2xl text-sm font-bold placeholder:text-slate-400 outline-none transition-all shadow-inner font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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
                w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg cursor-pointer
                ${isLoading || !accessCode.trim()
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                  : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.99] shadow-slate-900/30'
                }
              `}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to {selectedPortal}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Preset for convenience */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Quick test preset:</span>
            <button
              type="button"
              onClick={() => {
                setAccessCode(portalInfo.demoPass);
                handleVerifyAccess(portalInfo.demoPass);
              }}
              className="font-bold text-indigo-600 hover:underline cursor-pointer"
            >
              Use {portalInfo.demoUser} ({portalInfo.demoPass})
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex justify-between items-center px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Supabase Sync Active</span>
          </div>
          <span>Zuboc v3.0-ENTERPRISE</span>
        </div>
      </div>
    </div>
  );
};
