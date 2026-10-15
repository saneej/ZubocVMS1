import React, { useState } from 'react';
import { 
  Video, 
  Key, 
  User, 
  Lock, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { StaffMember } from '../types';
import { safeFetchJson } from '../utils/api';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Password Reset Flow State
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [resetErrorMessage, setResetErrorMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUserId = userId.trim();
    if (!cleanUserId) {
      setErrorMessage('Please enter your User ID.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await safeFetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: cleanUserId,
          password: password.trim()
        })
      });

      if (res && res.success && res.staff) {
        onLoginSuccess(res.staff);
      } else {
        throw new Error(res?.error || 'Invalid User ID or Password. Default password is password123');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMessage(null);
    setResetSuccessMessage(null);

    const cleanUserId = resetUserId.trim();
    const cleanPass = resetNewPassword.trim();

    if (!cleanUserId) {
      setResetErrorMessage('Please enter your User ID or Name.');
      return;
    }

    if (!cleanPass || cleanPass.length < 4) {
      setResetErrorMessage('New password must be at least 4 characters long.');
      return;
    }

    if (cleanPass !== resetConfirmPassword.trim()) {
      setResetErrorMessage('Passwords do not match.');
      return;
    }

    setIsResetting(true);

    try {
      const res = await safeFetchJson('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: cleanUserId,
          newPassword: cleanPass
        })
      });

      if (res && res.success) {
        setResetSuccessMessage(`Password updated! You can now log in with your new password.`);
        setUserId(cleanUserId);
        setPassword(cleanPass);
        setTimeout(() => {
          setIsResetMode(false);
          setResetSuccessMessage(null);
        }, 1500);
      } else {
        throw new Error(res?.error || 'Password reset failed.');
      }
    } catch (err: any) {
      setResetErrorMessage(err.message || 'Error updating password.');
    } finally {
      setIsResetting(false);
    }
  };



  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-blue-600 selection:text-white">
      
      <div className="w-full max-w-md space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-1">
            <img 
              src="https://zuboc.com/cdn/shop/files/zuboc_logo_1.svg?v=1748579899&width=500" 
              alt="Zuboc Logo" 
              className="h-10 w-auto object-contain max-w-[200px]"
            />
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Zuboc VMS Packing & Verification Portal
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-5">
          
          {!isResetMode ? (
            /* STANDARD LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Operator Login</span>
                </h2>
                <span className="text-[11px] text-slate-400 font-mono">Secure Access</span>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-mono flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* User ID Input */}
              <div className="space-y-1.5 font-mono">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  User ID / Staff ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="e.g. Admin-01 or Staff-01"
                    autoFocus
                    required
                    autoComplete="username"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-slate-900 text-sm focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5 font-mono">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setResetUserId(userId);
                      setResetErrorMessage(null);
                      setResetSuccessMessage(null);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-bold cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    required
                    autoComplete="current-password"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-11 py-2.5 text-slate-900 text-sm focus:outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 transition-all pt-3.5"
              >
                <span>{isLoading ? 'AUTHENTICATING...' : 'SIGN IN TO WORKSTATION'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

            </form>
          ) : (
            /* PASSWORD RESET FORM */
            <form onSubmit={handlePasswordReset} className="space-y-4">
              
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>Reset Staff Password</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setIsResetMode(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-mono font-bold cursor-pointer"
                >
                  Back to Login
                </button>
              </div>

              {/* Messages */}
              {resetErrorMessage && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{resetErrorMessage}</span>
                </div>
              )}

              {resetSuccessMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resetSuccessMessage}</span>
                </div>
              )}

              {/* User ID */}
              <div className="space-y-1 font-mono">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  Staff ID / User ID
                </label>
                <input
                  type="text"
                  value={resetUserId}
                  onChange={(e) => setResetUserId(e.target.value)}
                  placeholder="e.g. Admin-01 or Staff-01"
                  required
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none font-mono"
                />
              </div>

              {/* New Password */}
              <div className="space-y-1 font-mono">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  New Password (min 4 characters)
                </label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter new password..."
                  required
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none font-mono"
                />
              </div>

              {/* Confirm Password */}
              <div className="space-y-1 font-mono">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Re-type new password..."
                  required
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none font-mono"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetMode(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold font-mono text-xs cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold font-mono text-xs uppercase cursor-pointer shadow-sm"
                >
                  {isResetting ? 'UPDATING...' : 'SAVE NEW PASSWORD'}
                </button>
              </div>

            </form>
          )}



        </div>

        {/* Footer Note */}
        <p className="text-center text-[11px] text-slate-400 font-mono">
          Zuboc VMS • Enterprise Logistics & Packing Station
        </p>

      </div>

    </div>
  );
};
