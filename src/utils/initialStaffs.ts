import { StaffMember } from '../types';

export const INITIAL_STAFFS: StaffMember[] = [
  {
    id: 'saneej',
    name: 'saneej',
    role: 'ADMIN',
    stationId: 'Packing-01',
    password: 'saneej',
    createdAt: '2026-10-16T11:06:21.534Z'
  },
  {
    id: 'Admin-01',
    name: 'David Admin',
    role: 'ADMIN',
    stationId: 'Packing-HQ',
    password: 'password123',
    createdAt: '2026-10-15T10:09:26.652Z'
  },
  {
    id: 'Staff-01',
    name: 'Alex Packer',
    role: 'PACKER',
    stationId: 'Packing-01',
    password: 'password123',
    createdAt: '2026-10-15T10:09:26.652Z'
  },
  {
    id: 'Staff-02',
    name: 'Sarah Supervisor',
    role: 'SUPERVISOR',
    stationId: 'Packing-01',
    password: 'password123',
    createdAt: '2026-10-15T10:09:26.652Z'
  },
  {
    id: 'Zuboc',
    name: 'Zuboc',
    role: 'ADMIN',
    stationId: 'Packing-01',
    password: 'password123',
    isActive: true,
    createdAt: '2026-10-16T10:00:00.000Z'
  },
  {
    id: 'cre-01',
    name: 'Chloe CRE',
    role: 'CRE',
    stationId: 'CRE-HQ',
    password: 'password123',
    isActive: true,
    createdAt: '2026-10-22T10:00:00.000Z'
  },
  {
    id: 'designer-01',
    name: 'Dan Designer',
    role: 'DESIGNER',
    stationId: 'Design-Studio-1',
    password: 'password123',
    isActive: true,
    createdAt: '2026-10-22T10:00:00.000Z'
  },
  {
    id: 'designer-02',
    name: 'Diana CAD',
    role: 'DESIGNER',
    stationId: 'Design-Studio-2',
    password: 'password123',
    isActive: true,
    createdAt: '2026-10-22T10:00:00.000Z'
  },
  {
    id: 'production-01',
    name: 'Peter Production',
    role: 'PRODUCTION',
    stationId: 'Plant-Floor-1',
    password: 'password123',
    isActive: true,
    createdAt: '2026-10-22T10:00:00.000Z'
  }
];
