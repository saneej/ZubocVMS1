import React, { useState } from 'react';
import { X, UserPlus, AlertCircle } from 'lucide-react';
import { StaffRole } from '../types';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddUser: (email: string, name: string, role: StaffRole, password: string) => Promise<void>;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onAddUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('CRE');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onAddUser(email.trim(), name.trim(), role, password.trim());
      setName('');
      setEmail('');
      setPassword('');
      setRole('CRE');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create user. Please check server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#832f5e]" />
            <h2 className="text-lg font-black text-slate-900">Create New User</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Full Name *</label>
            <input 
              type="text" 
              placeholder="e.g. Rahul Sharma" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20" 
              required 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Email Address *</label>
            <input 
              type="email" 
              placeholder="user@zuboc.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20" 
              required 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Password *</label>
            <input 
              type="password" 
              placeholder="Minimum 6 characters" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20" 
              required 
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Role *</label>
            <select 
              value={role} 
              onChange={e => setRole(e.target.value as StaffRole)} 
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
            >
              <option value="ADMIN">ADMIN (Full Access)</option>
              <option value="CRE">CRE (Orders & Design Management)</option>
              <option value="DESIGNER">DESIGNER (Design Studio & CAD Uploads)</option>
              <option value="PRODUCTION">PRODUCTION (Manufacturing Hub)</option>
              <option value="PACKER">PACKER (Packing Station)</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="px-5 py-2.5 bg-[#832f5e] hover:bg-[#6c264d] text-white rounded-xl font-bold text-xs shadow-md shadow-[#832f5e]/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Create User Account</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
