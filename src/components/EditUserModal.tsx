import React, { useState } from 'react';
import { X } from 'lucide-react';
import { StaffRole, StaffMember } from '../types';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: StaffMember;
  onUpdateUser: (id: string, name: string, role: StaffRole, password?: string) => Promise<void>;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<StaffRole>(user.role);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onUpdateUser(user.id, name, role, password || undefined);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black">Edit User: {user.name}</h2>
          <button onClick={onClose}><X className="w-6 h-6 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border rounded-xl" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as StaffRole)} className="w-full p-3 border rounded-xl">
              <option value="ADMIN">Admin</option>
              <option value="CRE">CRE</option>
              <option value="DESIGNER">Designer</option>
              <option value="PRODUCTION">Production</option>
              <option value="PACKER">Packer</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">New Password (optional)</label>
            <input type="password" placeholder="Leave blank to keep current" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-xl" />
          </div>
          <button type="submit" disabled={loading} className="w-full p-3 bg-[#832f5e] text-white rounded-xl font-bold">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
};
