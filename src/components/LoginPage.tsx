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
        
        const staffMember: StaffMember = {
          id: data.user.id,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: data.user.user_metadata?.role || 'CRE',
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
      <form onSubmit={handleAuth} className="bg-white p-8 rounded-3xl w-full max-w-sm space-y-4">
        <h2 className="text-xl font-black text-slate-900">{mode === 'login' ? 'Sign In' : 'Create Admin Account'}</h2>
        {errorMessage && <p className="text-rose-600 text-xs font-bold">{errorMessage}</p>}
        {mode === 'signup' && <input type="text" placeholder="Full Name" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs" />}
        <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs" />
        <input type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-xs" />
        <button disabled={isLoading} className="w-full p-3 bg-emerald-600 text-white rounded-xl font-bold text-xs">{isLoading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}</button>
        <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="w-full text-slate-500 text-xs underline">
          {mode === 'login' ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
        </button>
      </form>
    </div>
  );
};
