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

// ... (Previous imports)
export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        if (error) throw error;
        
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
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070408] flex items-center justify-center p-4">
      <form onSubmit={handleAuth} className="bg-white p-8 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl">
        <div className="text-center pb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg mx-auto mb-2 shadow-md shadow-purple-600/30">
            Z
          </div>
          <h2 className="text-xl font-black text-slate-900">{mode === 'login' ? 'Sign In to Zuboc VMS' : 'Create Admin Account'}</h2>
          <p className="text-xs text-slate-500 mt-1">Select login mode or sign in</p>
        </div>

        {errorMessage && <p className="text-rose-600 text-xs font-bold bg-rose-50 p-2.5 rounded-xl border border-rose-200">{errorMessage}</p>}
        {mode === 'signup' && <input type="text" placeholder="Full Name" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600" />}
        <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600" />
        <input type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600" />
        <button disabled={isLoading} className="w-full p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-xs cursor-pointer shadow-lg shadow-slate-900/20 active:scale-95 transition-all">
          {isLoading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
        </button>

        <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="w-full text-slate-500 text-xs font-bold underline text-center pt-1">
          {mode === 'login' ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
        </button>
      </form>
    </div>
  );
};
