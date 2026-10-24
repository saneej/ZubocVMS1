import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { StaffMember, StaffRole } from '../types';
import { Trash2, Plus, Edit3, Shield, Mail, UserCheck, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { safeFetchJson } from '../utils/api';

const FAKE_USER_IDS = ['cre-01', 'designer-01', 'designer-02', 'production-01', 'admin-01', 'Operator-01', 'Staff-01', 'Staff-02', 'Zuboc', '<UUID_FROM_AUTH>'];

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // First try backend API which syncs Supabase Auth + staffs table
      const data = await safeFetchJson('/api/admin/users');
      if (Array.isArray(data) && data.length > 0) {
        setUsers(data.filter((u: any) => u && u.id && !FAKE_USER_IDS.includes(u.id)));
      } else {
        // Direct Supabase query fallback
        const { data: supaData, error } = await supabase.from('staffs').select('*').order('createdAt', { ascending: false });
        if (error) throw error;
        setUsers(((supaData || []) as any[]).filter((u: any) => u && u.id && !FAKE_USER_IDS.includes(u.id)));
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (email: string, name: string, role: StaffRole, password: string) => {
    const res = await safeFetchJson('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role, password })
    });

    if (res && res.error) {
      throw new Error(res.error);
    }

    setFeedback({
      type: 'success',
      message: `User ${name} (${role}) created successfully!`
    });
    await fetchUsers();
  };

  const handleUpdateUser = async (id: string, name: string, role: StaffRole, password?: string) => {
    try {
      const res = await safeFetchJson('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, role, password })
      });

      if (res && res.error) {
        throw new Error(res.error);
      }

      setFeedback({ type: 'success', message: `User ${name} updated successfully!` });
      await fetchUsers();
      setEditingUser(null);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setFeedback({ type: 'error', message: err?.message || 'Error updating user.' });
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${name}"?`)) return;
    try {
      const res = await safeFetchJson(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res && res.error) {
        throw new Error(res.error);
      }
      setFeedback({ type: 'success', message: `User ${name} deleted successfully.` });
      await fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setFeedback({ type: 'error', message: err?.message || 'Error deleting user.' });
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">Admin</span>;
      case 'CRE':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">CRE Operations</span>;
      case 'DESIGNER':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">Designer</span>;
      case 'PRODUCTION':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Production</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">{role}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800">
              Access Control
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Total Verified Users: {users.length}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">User & Role Management</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage staff login accounts, roles (CRE, Designer, Production, Admin), and permissions across Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-bold transition-all cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-[#832f5e] hover:bg-[#6c264d] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-[#832f5e]/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New User</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
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

      <CreateUserModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAddUser={handleAddUser} />
      
      {editingUser && (
        <EditUserModal 
          isOpen={!!editingUser} 
          onClose={() => setEditingUser(null)} 
          user={editingUser} 
          onUpdateUser={handleUpdateUser} 
        />
      )}

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading user accounts from Supabase...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No real users found. Click &quot;Add New User&quot; above to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                  <th className="p-4">Name & Email</th>
                  <th className="p-4">Assigned Role</th>
                  <th className="p-4">Station ID</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 text-sm">{user.name}</div>
                      <div className="font-mono text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{user.email || 'No email associated'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-600 text-xs">
                      {user.stationId || 'HQ'}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => setEditingUser(user)} 
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit User"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id, user.name)} 
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
