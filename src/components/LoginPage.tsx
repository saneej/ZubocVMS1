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
  User,
  Mail,
  Shield
} from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { safeFetchJson } from '../utils/api';
import { supabase } from '../supabase';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [loginMode, setLoginMode] = useState<'supaAuth' | 'pin'>('supaAuth');
  const [selectedPortal, setSelectedPortal] = useState<'CRE' | 'DESIGNER' | 'PRODUCTION' | 'ADMIN'>('CRE');
  
  // Supabase Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // PIN state
  const [accessCode, setAccessCode] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSupaAuthLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both Email and Password.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Authentication failed. Please check your credentials.');
      }

      // 2. Fetch corresponding staff profile from public.staffs table
      const { data: staffData, error: staffError } = await supabase
        .from('staffs')
        .select('*')
        .eq('email', email.trim())
        .maybeSingle();

      let staffMember: StaffMember;

      if (!staffError && staffData) {
        staffMember = {
          id: staffData.id,
          name: staffData.name,
          role: staffData.role || 'PACKER',
          stationId: staffData.stationId || 'Packing-01',
          email: staffData.email,
          isActive: true
        };
      } else {
        // Fallback staff member mapped from Supabase user
        staffMember = {
          id: authData.user.id.substring(0, 8),
          name: authData.user.user_metadata?.name || email.split('@')[0],
          role: authData.user.user_metadata?.role || 'CRE',
          stationId: authData.user.user_metadata?.stationId || 'Packing-01',
          email: authData.user.email,
          isActive: true
        };
      }

      setSuccessMessage('Supabase Auth Verified Successfully!');
      setTimeout(() => {
        onLoginSuccess(staffMember);
      }, 300);

    } catch (err: any) {
      setErrorMessage(err?.message || 'Supabase Auth error. Please check email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCode = accessCode.trim();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!targetCode) {
      setErrorMessage('Please enter your Access Phrase or PIN.');
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

  const getPortalInfo = () => {
    switch (selectedPortal) {
      case 'DESIGNER':
        return {
          title: 'Design Studio Portal',
          subtitle: 'CAD Blueprints, 3D Assets & Custom Revisions',
          color: 'from-amber-600 to-amber-700',
          demoEmail: 'designer@zuboc.com',
          demoPass: 'password123',
          demoPin: 'designer-01'
        };
      case 'PRODUCTION':
        return {
          title: 'Production Floor Terminal',
          subtitle: 'Manufacturing Queue & Blueprint Execution',
          color: 'from-blue-600 to-indigo-700',
          demoEmail: 'production@zuboc.com',
          demoPass: 'password123',
          demoPin: 'production-01'
        };
      case 'ADMIN':
        return {
          title: 'Admin Master Console',
          subtitle: 'Full System Oversight, Role Assignment & Security',
          color: 'from-purple-600 to-slate-900',
          demoEmail: 'admin@zuboc.com',
          demoPass: 'password123',
          demoPin: 'Zuboc'
        };
      default:
        return {
          title: 'CRE Order Terminal',
          subtitle: 'Customer Relations, Orders, Packing & Dispatch',
          color: 'from-indigo-600 to-purple-800',
          demoEmail: 'cre@zuboc.com',
          demoPass: 'password123',
          demoPin: 'cre-01'
        };
    }
  };

  const portalInfo = getPortalInfo();

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
              Zuboc Secure Auth
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

        {/* Auth Method Toggle */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 text-xs font-bold">
          <button
            type="button"
            onClick={() => setLoginMode('supaAuth')}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              loginMode === 'supaAuth' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Supabase Auth (Secure)</span>
          </button>
          <button
            type="button"
            onClick={() => setLoginMode('pin')}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              loginMode === 'pin' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Station PIN / Code</span>
          </button>
        </div>

        {/* Main Access Card */}
        <div className="bg-white/95 backdrop-blur-3xl border border-white/20 rounded-[2rem] p-7 shadow-2xl shadow-black/80 space-y-5 relative overflow-hidden">
          
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

          {loginMode === 'supaAuth' ? (
            <form onSubmit={handleSupaAuthLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Supabase User Email
                </label>
                <div className="relative group">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. admin@zuboc.com"
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white text-slate-900 pl-11 pr-4 py-3.5 rounded-2xl text-xs font-bold placeholder:text-slate-400 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Secure Password
                </label>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter secure password..."
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white text-slate-900 pl-11 pr-11 py-3.5 rounded-2xl text-xs font-bold placeholder:text-slate-400 outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-600/30 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Authenticating via Supabase...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In with Supabase Auth</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Demo Supabase Login:</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(portalInfo.demoEmail);
                    setPassword(portalInfo.demoPass);
                  }}
                  className="font-bold text-emerald-600 hover:underline cursor-pointer"
                >
                  Fill {portalInfo.demoEmail}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Station PIN or Access Code
                </label>
                <div className="relative group">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="Enter PIN or Code..."
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white text-slate-900 pl-11 pr-4 py-3.5 rounded-2xl text-xs font-bold placeholder:text-slate-400 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In with Access Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Quick test PIN:</span>
                <button
                  type="button"
                  onClick={() => {
                    setAccessCode(portalInfo.demoPin);
                  }}
                  className="font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Use {portalInfo.demoPin}
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer info */}
        <div className="flex justify-between items-center px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Supabase Auth Ready</span>
          </div>
          <span>Zuboc v3.0-ENTERPRISE</span>
        </div>
      </div>
    </div>
  );
};
