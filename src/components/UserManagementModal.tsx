import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  Power, 
  Edit3, 
  Search, 
  Clock, 
  Save, 
  Check, 
  Building, 
  Mail, 
  Phone
} from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { safeFetchJson } from '../utils/api';
import { formatIST } from '../utils/time';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStaff: StaffMember;
  onStaffListUpdated?: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentStaff,
  onStaffListUpdated
}) => {
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  
  // Create / Edit User State
  const [isAddMode, setIsAddMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('CRE');
  const [newStation, setNewStation] = useState('HQ');
  const [newPassword, setNewPassword] = useState('password123');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  
  // Password Reset State
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson('/api/admin/users');
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (err: any) {
      console.error('Fetch users error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Protect Admin Access
  if (currentStaff.role !== 'ADMIN') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500">
            Only authorized Admin staff members can manage users, roles, and credentials.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) {
      setFeedback({ type: 'error', message: 'User ID and Full Name are required.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await safeFetchJson('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId.trim(),
          name: newName.trim(),
          role: newRole,
          stationId: newStation.trim() || 'HQ',
          password: newPassword.trim() || 'password123',
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined
        })
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: res.message || 'User created successfully!' });
        await fetchUsers();
        if (onStaffListUpdated) onStaffListUpdated();
        setIsAddMode(false);
        setNewId('');
        setNewName('');
        setNewPassword('password123');
        setNewEmail('');
        setNewPhone('');
      } else {
        throw new Error(res?.error || 'Failed to create user');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to create user' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      const res = await safeFetchJson(`/api/admin/users/${encodeURIComponent(userId)}/toggle-active`, {
        method: 'POST'
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: res.message });
        await fetchUsers();
        if (onStaffListUpdated) onStaffListUpdated();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to change status' });
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPasswordInput.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a new password.' });
      return;
    }

    try {
      const res = await safeFetchJson(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPasswordInput.trim() })
      });

      if (res && res.success) {
        setFeedback({ type: 'success', message: res.message });
        setResettingUserId(null);
        setResetPasswordInput('');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to reset password' });
    }
  };

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      u.name.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      u.stationId.toLowerCase().includes(q);

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: StaffRole) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">Admin</span>;
      case 'CRE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">CRE / Orders</span>;
      case 'DESIGNER':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">Designer</span>;
      case 'PRODUCTION':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">Production</span>;
      case 'SUPERVISOR':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">Supervisor</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">Packer</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-4xl w-full p-6 text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center font-bold shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">User & Department Access Management</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                  Admin Control
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Manage accounts, assign CRE/Designer/Production roles, reset credentials, and deactivate access.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div className={`mt-3 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shrink-0 ${
            feedback.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border border-rose-200 animate-shake'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700">
              &times;
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff name or ID..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="CRE">CRE / Orders</option>
              <option value="DESIGNER">Designer</option>
              <option value="PRODUCTION">Production</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="PACKER">Packer</option>
            </select>
          </div>

          <button
            onClick={() => setIsAddMode(!isAddMode)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20 transition-all cursor-pointer shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isAddMode ? 'Close Form' : 'Add New Staff Member'}</span>
          </button>
        </div>

        {/* Add User Form Drawer */}
        {isAddMode && (
          <form onSubmit={handleCreateUser} className="mt-4 p-4 rounded-2xl bg-slate-50 border border-purple-200 space-y-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-purple-900">
                Create New Staff Account
              </span>
              <span className="text-[10px] text-slate-400">Credentials will be stored securely</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  User ID / Login Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="e.g. designer-alex"
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Department Role <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl"
                >
                  <option value="CRE">CRE — Customer Relations / Orders</option>
                  <option value="DESIGNER">Designer — CAD & Design Hub</option>
                  <option value="PRODUCTION">Production — Manufacturing Floor</option>
                  <option value="ADMIN">Admin — Full System Administrator</option>
                  <option value="SUPERVISOR">Supervisor — Station Lead</option>
                  <option value="PACKER">Packer — Packing Station</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Station / Location
                </label>
                <input
                  type="text"
                  value={newStation}
                  onChange={(e) => setNewStation(e.target.value)}
                  placeholder="e.g. Design-Studio-1"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Initial Password / PIN
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Default: password123"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="staff@zuboc.com"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddMode(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs"
              >
                Create Account
              </button>
            </div>
          </form>
        )}

        {/* User List Table */}
        <div className="mt-4 flex-1 overflow-y-auto border border-slate-200/80 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-black border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
              <tr>
                <th className="px-4 py-3">Staff Member</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">Department Role</th>
                <th className="px-4 py-3">Station</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(user => {
                const isActive = user.isActive !== false;
                const isCurrent = user.id === currentStaff.id;

                return (
                  <tr key={user.id} className={`hover:bg-slate-50/80 transition-colors ${!isActive ? 'opacity-60 bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{user.name}</div>
                      {user.email && <div className="text-[10px] text-slate-400">{user.email}</div>}
                    </td>

                    <td className="px-4 py-3 font-mono font-bold text-slate-700">
                      {user.id}
                    </td>

                    <td className="px-4 py-3">
                      {getRoleBadge(user.role)}
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-600">
                      {user.stationId || 'HQ'}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isActive 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span>{isActive ? 'Active' : 'Deactivated'}</span>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right space-x-2">
                      {resettingUserId === user.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="text"
                            value={resetPasswordInput}
                            onChange={(e) => setResetPasswordInput(e.target.value)}
                            placeholder="New password"
                            className="w-28 px-2 py-1 text-xs border rounded-lg font-mono"
                          />
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Confirm Reset"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setResettingUserId(null); setResetPasswordInput(''); }}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setResettingUserId(user.id); setResetPasswordInput('password123'); }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                          title="Reset Password"
                        >
                          Reset Pass
                        </button>
                      )}

                      {!isCurrent && (
                        <button
                          onClick={() => handleToggleActive(user.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                            isActive 
                              ? 'text-rose-600 hover:bg-rose-50' 
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>Deactivated accounts retain full historical order assignment and audit logs.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
