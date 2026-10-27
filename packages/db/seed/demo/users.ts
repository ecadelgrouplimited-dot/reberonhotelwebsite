import argon2 from 'argon2';
import type { Role } from '../../src/index.js';
import { prisma, log } from '../lib.js';

export const SEED_USERS: { email: string; name: string; role: Role; phone?: string }[] = [
  { email: 'owner@reberonhotel.com', name: 'Denis Mayamba', role: 'OWNER', phone: '+256700000101' },
  { email: 'wilson@ecadelgroup.com', name: 'Wilson Ecaat', role: 'OWNER', phone: '+256700000102' },
  { email: 'manager@reberonhotel.com', name: 'Grace Chemutai', role: 'MANAGER', phone: '+256700000103' },
  { email: 'desk@reberonhotel.com', name: 'Brian Cheptoek', role: 'DESK', phone: '+256700000104' },
  { email: 'housekeeping@reberonhotel.com', name: 'Sarah Chelangat', role: 'HOUSEKEEPING' },
];

export async function seedUsers() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error('SEED_PASSWORD must be set (12+ chars)');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });

  // Migrate any existing @reberonhotel.ug user emails in-place to @reberonhotel.com so UUIDs and sessions remain intact
  const legacyUsers = await prisma.user.findMany({ where: { email: { endsWith: '@reberonhotel.ug' } } });
  for (const lu of legacyUsers) {
    if (!lu.email) continue;
    const newEmail = lu.email.replace(/@reberonhotel\.ug$/i, '@reberonhotel.com');
    const conflictUser = await prisma.user.findUnique({ where: { email: newEmail } });
    if (!conflictUser) {
      await prisma.user.update({ where: { id: lu.id }, data: { email: newEmail } });
    }
  }

  const ids: Record<string, string> = {};
  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash, status: 'ACTIVE', isSeed: true },
      update: { passwordHash, failedLogins: 0, lockedUntil: null, status: 'ACTIVE' },
    });
    ids[u.email] = user.id;
  }
  // Staff who never sign in: named on cleaning rotas and documents, no House login.
  const records = [
    { name: 'Esther Chebet', jobTitle: 'Housekeeper', role: 'HOUSEKEEPING' as Role, phone: '+256700000111' },
    { name: 'Moses Kiprotich', jobTitle: 'Night guard', role: 'HOUSEKEEPING' as Role, phone: '+256700000112' },
  ];
  for (const r of records) {
    if (!(await prisma.user.findFirst({ where: { name: r.name, isSeed: true } }))) await prisma.user.create({ data: { ...r, canSignIn: false, status: 'ACTIVE', isSeed: true } });
  }
  // A temporary contractor: desk access for three months, weekday hours.
  await prisma.user.upsert({
    where: { email: 'relief.desk@reberonhotel.com' },
    create: { email: 'relief.desk@reberonhotel.com', name: 'Joan Nekesa', jobTitle: 'Relief receptionist', role: 'DESK', status: 'ACTIVE', passwordHash, isSeed: true, signInFrom: '07:00', signInUntil: '19:00', accessExpiresAt: new Date(Date.now() + 90 * 86_400_000), revokes: ['payments:record'] },
    update: { passwordHash, failedLogins: 0, lockedUntil: null, status: 'ACTIVE' },
  });
  // Specialized operational staff from the hotel management structure:
  const opsStaff: { email: string; name: string; jobTitle: string; role: Role; phone: string; grants: string[] }[] = [
    { email: 'bar@reberonhotel.com', name: 'Samuel Kiprop', jobTitle: 'Bar Attendant', role: 'DESK', phone: '+256700000105', grants: ['pos:operate', 'inventory:manage', 'requisitions:request'] },
    { email: 'kitchen@reberonhotel.com', name: 'Chef Isaac Mangusho', jobTitle: 'Head Chef', role: 'DESK', phone: '+256700000106', grants: ['pos:operate', 'inventory:manage', 'requisitions:request'] },
    { email: 'gym@reberonhotel.com', name: 'Coach Daniel Cherop', jobTitle: 'Gym Instructor & Spa Attendant', role: 'DESK', phone: '+256700000107', grants: ['healthclub:operate', 'pos:operate', 'inventory:manage', 'requisitions:request'] },
  ];
  for (const s of opsStaff) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      create: { ...s, passwordHash, status: 'ACTIVE', isSeed: true },
      update: { passwordHash, failedLogins: 0, lockedUntil: null, status: 'ACTIVE' },
    });
    ids[s.email] = u.id;
  }
  log('users', `${SEED_USERS.length + opsStaff.length} who sign in, 2 staff records without sign-in, 1 relief receptionist (password from SEED_PASSWORD)`);
  return ids;
}
