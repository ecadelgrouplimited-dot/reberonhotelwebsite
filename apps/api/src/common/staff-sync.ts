import { normalizePhone } from '@reberon/utils';
import type { StaffProfile, User } from '@reberon/db';
import type { PrismaService } from './prisma.service.js';

/**
 * One person, two records: the HR staff profile (pay, NIN, next of kin…) and the House
 * sign-in account (permissions, PIN…). The details both hold — name, phone, job title and
 * email — are kept the same: whichever side is edited updates the other.
 * Pay, bank, IDs and access stay where they belong.
 */

const phoneKey = (p: string | null | undefined) => (p ? (normalizePhone(p) ?? p) : null);
const fullName = (s: Pick<StaffProfile, 'firstName' | 'lastName' | 'otherNames'>) => [s.firstName, s.lastName, s.otherNames].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/** The account a staff profile belongs to: its stored link, else the same email, else the same phone. */
async function accountFor(prisma: PrismaService, s: StaffProfile): Promise<User | null> {
  if (s.userId) {
    const u = await prisma.user.findFirst({ where: { id: s.userId, deletedAt: null } });
    if (u) return u;
  }
  if (s.email) {
    const u = await prisma.user.findFirst({ where: { email: { equals: s.email, mode: 'insensitive' }, deletedAt: null } });
    if (u) return u;
  }
  const key = phoneKey(s.phone);
  if (key) {
    const candidates = await prisma.user.findMany({ where: { deletedAt: null, phone: { not: null } }, select: { id: true, phone: true } });
    const hit = candidates.find((c) => phoneKey(c.phone) === key);
    if (hit) return prisma.user.findUnique({ where: { id: hit.id } });
  }
  return null;
}

/** After an HR edit: carry name, phone, job title and email to the linked account. Returns what changed there. */
export async function syncAccountFromStaff(prisma: PrismaService, staff: StaffProfile): Promise<{ user: User | null; changed: string[]; emailSkipped?: string }> {
  const user = await accountFor(prisma, staff);
  if (!user) return { user: null, changed: [] };
  const data: Partial<Pick<User, 'name' | 'phone' | 'jobTitle' | 'email'>> = {};
  const changed: string[] = [];
  let emailSkipped: string | undefined;

  const name = fullName(staff);
  if (name && name !== user.name) {
    data.name = name;
    changed.push('name');
  }
  const phone = staff.phone ? (normalizePhone(staff.phone) ?? staff.phone) : null;
  if (phone && phoneKey(phone) !== phoneKey(user.phone)) {
    data.phone = phone;
    changed.push('phone');
  }
  if (staff.jobTitle && staff.jobTitle !== user.jobTitle) {
    data.jobTitle = staff.jobTitle;
    changed.push('job title');
  }
  // The email is also their sign-in name: only move it to an address nobody else signs in with.
  const email = staff.email?.trim().toLowerCase() || null;
  if (email && email !== user.email?.toLowerCase()) {
    const other = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: user.id } }, select: { id: true } });
    if (other) emailSkipped = email;
    else {
      data.email = email;
      changed.push('email');
    }
  }
  const updated = changed.length ? await prisma.user.update({ where: { id: user.id }, data }) : user;
  if (staff.userId !== user.id) await prisma.staffProfile.update({ where: { id: staff.id }, data: { userId: user.id } });
  return { user: updated, changed, emailSkipped };
}

/** After an account edit: carry name, phone, job title and email to the linked HR profile. */
export async function syncStaffFromAccount(prisma: PrismaService, user: User): Promise<{ staff: StaffProfile | null; changed: string[] }> {
  let staff = await prisma.staffProfile.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  if (!staff && user.email) staff = await prisma.staffProfile.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' }, userId: null } });
  if (!staff) return { staff: null, changed: [] };
  const data: Partial<StaffProfile> = {};
  const changed: string[] = [];

  const name = user.name.replace(/\s+/g, ' ').trim();
  if (name && name !== fullName(staff)) {
    // "First Last" → first word is the first name, the rest the last name; other names are cleared
    // only when the new full name no longer contains them.
    const [first, ...rest] = name.split(' ');
    let last = rest.join(' ');
    let other = staff.otherNames;
    if (other && last.endsWith(` ${other}`)) last = last.slice(0, -other.length - 1);
    else other = null;
    data.firstName = first!;
    data.lastName = last || staff.lastName;
    data.otherNames = other;
    changed.push('name');
  }
  if (user.phone && phoneKey(user.phone) !== phoneKey(staff.phone)) {
    data.phone = user.phone;
    changed.push('phone');
  }
  if (user.jobTitle && user.jobTitle !== staff.jobTitle) {
    data.jobTitle = user.jobTitle;
    changed.push('job title');
  }
  if (user.email && user.email.toLowerCase() !== staff.email?.toLowerCase()) {
    data.email = user.email;
    changed.push('email');
  }
  if (staff.userId !== user.id) data.userId = user.id;
  const updated = Object.keys(data).length ? await prisma.staffProfile.update({ where: { id: staff.id }, data }) : staff;
  return { staff: updated, changed };
}
