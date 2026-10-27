import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { prisma } from './lib.js';

/**
 * First owner on a fresh production database (no demo data there).
 *   OWNER_EMAIL=denis@reberonhotel.com OWNER_NAME="Denis Mayamba" npx tsx seed/owner.ts
 * Prints a one-time password; the owner changes it after signing in (Account).
 * Refuses to run if an active owner already exists.
 */
async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.OWNER_NAME?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) throw new Error('Set OWNER_EMAIL and OWNER_NAME');
  const existing = await prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE', isSeed: false } });
  if (existing) throw new Error('An owner already exists. Invite more people from the House → People.');
  const password = randomBytes(12).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });
  await prisma.user.upsert({ where: { email }, create: { email, name, role: 'OWNER', status: 'ACTIVE', passwordHash }, update: { name, role: 'OWNER', status: 'ACTIVE', passwordHash, isSeed: false } });
  console.log(`\nOwner ready: ${email}\nOne-time password: ${password}\nSign in at the House and change it under Account.\n`);
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
