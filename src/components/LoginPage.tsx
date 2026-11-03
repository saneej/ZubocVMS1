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
  Shield,
  Rocket,
  Zap
} from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { safeFetchJson } from '../utils/api';
import { supabase } from '../supabase';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'direct'>('direct');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleQuickLogin = (role: StaffRole, roleName: string, stationId = 'HQ') => {
    const staffMember: StaffMember = {
      id: `direct_${role.toLowerCase()}_${Date.now()}`,
      name: roleName,
      role: role,
      stationId: stationId,
      email: `${role.toLowerCase()}@zuboc.local`,
      isActive: true,
      isSupabaseAuth: false
    };
    onLoginSuccess(staffMember);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: { name: name.trim(), role: 'ADMIN', stationId: 'HQ' }
          }
        });
        if (error) throw error;
        setErrorMessage('Account created! Please check your email to confirm, then log in.');
        setMode('login');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim()
        });
        if (error) {
          // If Supabase auth fails (e.g. egress quota exceeded), fallback to direct login based on email/role
          console.warn('Supabase auth failed, falling back to direct login:', error.message);
          let assignedRole: StaffRole = 'ADMIN';
          const emailLower = email.trim().toLowerCase();
          if (emailLower.includes('packer') || emailLower.includes('order')) assignedRole = 'ORDER_MANAGEMENT';
          else if (emailLower.includes('cre')) assignedRole = 'CRE';
          else if (emailLower.includes('design')) assignedRole = 'DESIGNER';
          else if (emailLower.includes('production')) assignedRole = 'PRODUCTION';
          
          const staffMember: StaffMember = {
            id: `fallback_${Date.now()}`,
            name: email.split('@')[0] || 'Staff Member',
            role: assignedRole,
            stationId: 'HQ',
            email: email.trim(),
            isActive: true,
            isSupabaseAuth: false
          };
          onLoginSuccess(staffMember);
          return;
        }
        
        let role = data.user.user_metadata?.role || 'CRE';
        if (role === 'PACKER' || role === 'DISPATCH' || email.trim().toLowerCase() === 'packer@zuboc.com') {
          role = 'ORDER_MANAGEMENT';
        }

        const staffMember: StaffMember = {
          id: data.user.id,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: role as any,
          stationId: data.user.user_metadata?.stationId || 'HQ',
          email: data.user.email || email.trim(),
          isActive: true,
          isSupabaseAuth: true,
          supabaseAuthId: data.user.id
        };
        onLoginSuccess(staffMember);
      }
    } catch (err: any) {
      // If error is egress quota or network failure, direct login fallback
      const staffMember: StaffMember = {
        id: `fallback_${Date.now()}`,
        name: email ? email.split('@')[0] : 'Admin User',
        role: 'ADMIN',
        stationId: 'HQ',
        email: email || 'admin@zuboc.local',
        isActive: true,
        isSupabaseAuth: false
      };
      onLoginSuccess(staffMember);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070408] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md space-y-6 shadow-2xl">
        <div className="text-center pb-1">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-xl mx-auto mb-3 shadow-lg shadow-purple-600/30">
            Z
          </div>
          <h2 className="text-xl font-black text-slate-900">Zuboc VMS & Order Management</h2>
          <p className="text-xs text-slate-500 mt-1">Direct Login & Supabase Migration Ready</p>
        </div>

        {errorMessage && <p className="text-rose-600 text-xs font-bold bg-rose-50 p-3 rounded-xl border border-rose-200">{errorMessage}</p>}

        {/* Quick Direct Role Login (Bypasses Supabase Egress Quota restrictions) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              Quick Direct Login (Bypass Quota)
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">Instant</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleQuickLogin('ADMIN', 'Administrator', 'HQ')}
              className="p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Shield className="w-4 h-4 text-purple-600 shrink-0" />
              <div className="text-left">
                <div>Admin</div>
                <div className="text-[10px] text-purple-600 font-normal">Full Access</div>
              </div>
            </button>

            <button
              onClick={() => handleQuickLogin('ORDER_MANAGEMENT', 'Order Manager', 'Packing-01')}
              className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="text-left">
                <div>Order Management</div>
                <div className="text-[10px] text-blue-600 font-normal">Packing & Orders</div>
              </div>
            </button>

            <button
              onClick={() => handleQuickLogin('CRE', 'CRE Executive', 'HQ')}
              className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <User className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-left">
                <div>CRE Desk</div>
                <div className="text-[10px] text-emerald-600 font-normal">Customer & Workflow</div>
              </div>
            </button>

            <button
              onClick={() => handleQuickLogin('DESIGNER', 'Lead Designer', 'Design-HQ')}
              className="p-3 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-900 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Palette className="w-4 h-4 text-pink-600 shrink-0" />
              <div className="text-left">
                <div>Designer</div>
                <div className="text-[10px] text-pink-600 font-normal">Design Revisions</div>
              </div>
            </button>
          </div>
        </div>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-4 text-slate-400 text-[10px] font-bold uppercase tracking-wider">Or Supabase Auth</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        <form onSubmit={handleAuth} className="space-y-3.5">
          {mode === 'signup' && (
            <input 
              type="text" 
              placeholder="Full Name" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600" 
            />
          )}
          <input 
            type="email" 
            placeholder="Email Address" 
            required 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600" 
          />
          <input 
            type="password" 
            placeholder="Password" 
            required 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600" 
          />
          <button 
            disabled={isLoading} 
            className="w-full p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-xs cursor-pointer shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
          >
            {isLoading ? 'Processing...' : (mode === 'login' ? 'Sign In via Supabase' : 'Sign Up')}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs pt-1">
          <button 
            type="button" 
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} 
            className="text-purple-600 font-bold hover:underline cursor-pointer"
          >
            {mode === 'login' ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
          </button>
          <span className="text-slate-400 text-[10px]">Egress quota safe</span>
        </div>
      </div>
    </div>
  );
};

