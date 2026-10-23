import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { StaffMember, StaffRole } from '../types';
import { Trash2, Plus, Edit } from 'lucide-react';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { safeFetchJson } from '../utils/api';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('staffs').select('*');
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (email: string, name: string, role: StaffRole, password: string) => {
    try {
      await safeFetchJson('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role, password })
      });
      fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      alert('Error creating user. Check server logs.');
    }
  };

  const handleUpdateUser = async (id: string, name: string, role: StaffRole, password?: string) => {
    try {
      await safeFetchJson('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, role, password })
      });
      fetchUsers();
      setEditingUser(null);
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Error updating user. Check server logs.');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await safeFetchJson(`/api/admin/users/${id}`, {
        method: 'DELETE'
      });
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Error deleting user. Check server logs.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">User Management</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-[#832f5e] text-white rounded-xl text-xs font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>
      <CreateUserModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAddUser={handleAddUser} />
      {editingUser && (
        <EditUserModal 
          isOpen={!!editingUser} 
          onClose={() => setEditingUser(null)} 
          user={editingUser} 
          onUpdateUser={handleUpdateUser} 
        />
      )}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-10 text-center">Loading...</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                <th className="p-4">Name</th>
                <th className="p-4">Email</th>
                <th className="p-4">Role</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="p-4 font-bold">{user.name}</td>
                  <td className="p-4 font-mono">{user.email || 'N/A'}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-slate-700 font-bold">{user.role}</span>
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button onClick={() => setEditingUser(user)} className="text-blue-500 hover:text-blue-700"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
