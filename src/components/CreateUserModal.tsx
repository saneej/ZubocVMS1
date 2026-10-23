import React, { useState } from 'react';
import { X } from 'lucide-react';
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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onAddUser(email, name, role, password);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black">Create New User</h2>
          <button onClick={onClose}><X className="w-6 h-6 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border rounded-xl" required />
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded-xl" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-xl" required />
          <select value={role} onChange={e => setRole(e.target.value as StaffRole)} className="w-full p-3 border rounded-xl">
            <option value="ADMIN">Admin</option>
            <option value="CRE">CRE</option>
            <option value="DESIGNER">Designer</option>
            <option value="PRODUCTION">Production</option>
            <option value="PACKER">Packer</option>
          </select>
          <button type="submit" disabled={loading} className="w-full p-3 bg-[#832f5e] text-white rounded-xl font-bold">
            {loading ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  );
};
