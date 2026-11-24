import { Injectable, HttpStatus } from '@nestjs/common';
import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { pinWeakness, readHousePrefs, type HousePrefs, type MeDTO, type PinCheckDTO, type TerminalPersonDTO } from '@reberon/contracts';
import { jwtVerify, SignJWT } from 'jose';
import type { User } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { AppError, badRequest, conflict, unauthorized } from '../../common/errors.js';
import { ACCESS_COOKIE, ACCESS_TTL_SECONDS, REFRESH_COOKIE, SESSION_HINT_COOKIE, signAccessToken, type AuthUser } from '../../common/auth.js';
import { accessProblem, permissionsOf } from '../../common/access.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { hashToken, newToken } from './tokens.js';

const REFRESH_TTL_MS = 30 * 86_400_000;
/** A replaced refresh token presented again this soon is a race between tabs, not theft. */
const REUSE_GRACE_MS = 30_000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
/** Remembers who signed in on this device with a password, so they may come back with a PIN. */
export const TERMINAL_COOKIE = 'rb_term';
const TERMINAL_TTL_MS = 180 * 86_400_000;
const TERMINAL_MAX = 8;
const MAX_FAILED_PINS = 5;
const termKey = new TextEncoder().encode(`${env.JWT_SECRET}:terminal`);
/**
 * PINs are a keyed HMAC, not a salted hash: only a deterministic value can sit behind a
 * unique index (no two people share a PIN). The key never touches the database, so a copy
 * of the database alone cannot reveal anyone's PIN. DATA_KEY is required in production.
 */
const pinKey = Buffer.from(hkdfSync('sha256', env.DATA_KEY ?? env.JWT_SECRET, 'reberon', 'quick-pin-v1', 32));
const pinDigest = (pin: string) => createHmac('sha256', pinKey).update(`pin:${pin}`).digest('hex');
const sameDigest = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/**
 * Never say a PIN is someone else's. A refusal is always "not available", and the hotel
 * also holds back a fixed, secret ~10% of all PINs with the same answer — so a refused PIN
 * almost always means "held back", not "a colleague has it", and trying PINs teaches nothing.
 * Refusals are still limited per day and audited.
 */
const heldBack = (pin: string) => createHmac('sha256', pinKey).update(`held-back:${pin}`).digest()[0]! < 26;
const MAX_REFUSALS_PER_DAY = 8;
const NOT_AVAILABLE = 'That PIN is not available — choose another';
const PIN_RESET_TTL_MS = 3600_000;
const maskEmail = (e: string) => {
  const [name, domain] = e.split('@');
  return `${name!.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, name!.length - 1)))}@${domain}`;
};
export const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  me(u: Pick<User, 'id' | 'email' | 'name' | 'role' | 'grants' | 'revokes'> & { avatarId?: string | null; jobTitle?: string | null; customRoleKey?: string | null; customRoleName?: string | null; preferences?: unknown; pinDigest?: string | null; pinSetAt?: Date | null }): MeDTO {
    return {
      id: u.id,
      email: u.email ?? '',
      name: u.name,
      role: u.role,
      avatarUrl: u.avatarId ? `${env.MEDIA_PUBLIC_URL}/i/${u.avatarId}/320.webp` : null,
      jobTitle: u.jobTitle ?? null,
      customRoleKey: u.customRoleKey ?? null,
      customRoleName: u.customRoleName ?? null,
      permissions: permissionsOf(u),
      preferences: readHousePrefs(u.preferences),
      hasPin: !!u.pinDigest,
      pinSetAt: u.pinDigest ? (u.pinSetAt?.toISOString() ?? null) : null,
    };
  }

  /** A person's own House layout (pins, hidden apps, dock). */
  async savePreferences(userId: string, prefs: HousePrefs, req: Request) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true, name: true, email: true, role: true, grants: true, revokes: true } });
    const next = { ...readHousePrefs(before.preferences), ...prefs };
    await this.prisma.user.update({ where: { id: userId }, data: { preferences: next } });
    await this.audit.record({
      actor: { id: userId, email: before.email ?? '', name: before.name, role: before.role, perms: permissionsOf(before) },
      action: 'user.preferences',
      entityType: 'User',
      entityId: userId,
      summary: 'Changed their House layout',
      before: before.preferences as object,
      after: next,
      req,
    });
    return next;
  }

  private asActor(u: User): AuthUser {
    return { id: u.id, email: u.email ?? '', name: u.name, role: u.role, perms: permissionsOf(u) };
  }

  private cookieOpts(maxAgeMs: number, path = '/') {
    return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' as const, path, maxAge: maxAgeMs };
  }

  private async issue(user: User, res: Response, req: Request, family: string = randomUUID()) {
    const refresh = newToken();
    await this.prisma.session.create({
      data: { userId: user.id, refreshTokenHash: hashToken(refresh), family, userAgent: req.headers['user-agent']?.slice(0, 300), ip: req.ip, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    const access = await signAccessToken(this.asActor(user));
    res.cookie(ACCESS_COOKIE, access, this.cookieOpts(ACCESS_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, refresh, this.cookieOpts(REFRESH_TTL_MS, '/v1/admin/auth'));
    // Not a credential: only tells the admin app's router that a session probably exists.
    res.cookie(SESSION_HINT_COOKIE, '1', { ...this.cookieOpts(REFRESH_TTL_MS), httpOnly: false });
  }

  clear(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/admin/auth' });
    res.clearCookie(SESSION_HINT_COOKIE, { path: '/' });
  }

  async login(email: string, password: string, req: Request, res: Response): Promise<MeDTO> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const fail = () => new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'That email and password do not match.');
    if (!user || !user.passwordHash || user.deletedAt) {
      await argon2.hash(password, ARGON_OPTS); // equalise timing
      throw fail();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null } });
      await this.audit.record({ actorType: 'USER', action: 'auth.login_failed', entityType: 'User', entityId: user.id, summary: `Failed sign-in (${failed})`, req });
      throw fail();
    }
    // Right password, but maybe not allowed in: no login on their record, outside their hours, or access ended.
    const problem = accessProblem(user);
    if (problem) {
      await this.audit.record({ actor: this.asActor(user), action: 'auth.login_refused', entityType: 'User', entityId: user.id, summary: problem, req });
      throw unauthorized(problem);
    }
    // A password sign-in also clears a PIN blocked by wrong tries.
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, failedPins: 0, lastLoginAt: new Date() } });
    await this.issue(user, res, req);
    await this.rememberOnTerminal(user.id, req, res);
    await this.audit.record({ actor: this.asActor(user), action: 'auth.login', entityType: 'User', entityId: user.id, summary: 'Signed in', req });
    return this.me(user);
  }

  // ── Shared terminals: lock and quick PIN switching ─────────────────────────

  /** The people remembered on this device (most recent first), from its signed cookie. */
  private async terminal(req: Request): Promise<{ id: string; users: string[] }> {
    const raw = req.cookies?.[TERMINAL_COOKIE];
    if (raw) {
      try {
        const { payload } = await jwtVerify(raw, termKey, { issuer: 'reberon-terminal' });
        const users = Array.isArray(payload.users) ? (payload.users as unknown[]).filter((u): u is string => typeof u === 'string') : [];
        return { id: payload.sub ?? randomUUID(), users };
      } catch {
        /* tampered or old: start a fresh list */
      }
    }
    return { id: randomUUID(), users: [] };
  }

  private async writeTerminal(t: { id: string; users: string[] }, res: Response) {
    const token = await new SignJWT({ users: t.users }).setProtectedHeader({ alg: 'HS256' }).setSubject(t.id).setIssuer('reberon-terminal').setIssuedAt().sign(termKey);
    res.cookie(TERMINAL_COOKIE, token, this.cookieOpts(TERMINAL_TTL_MS, '/v1/admin/auth'));
  }

  private async rememberOnTerminal(userId: string, req: Request, res: Response) {
    const t = await this.terminal(req);
    t.users = [userId, ...t.users.filter((u) => u !== userId)].slice(0, TERMINAL_MAX);
    await this.writeTerminal(t, res);
  }

  /** Who can come back on this device. Only the holder of the device's cookie sees this list. */
  async terminalPeople(req: Request): Promise<TerminalPersonDTO[]> {
    const t = await this.terminal(req);
    if (!t.users.length) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: t.users } } });
    const byId = new Map(rows.map((u) => [u.id, u]));
    return t.users
      .map((id) => byId.get(id))
      .filter((u): u is User => !!u && !!u.passwordHash && !accessProblem(u))
      .map((u) => ({
        id: u.id,
        name: u.name,
        jobTitle: u.customRoleName ?? u.jobTitle ?? null,
        avatarUrl: u.avatarId ? `${env.MEDIA_PUBLIC_URL}/i/${u.avatarId}/320.webp` : null,
        hasPin: !!u.pinDigest,
        pinBlocked: !!u.pinDigest && u.failedPins >= MAX_FAILED_PINS,
      }));
  }

  /** Take someone off this device's lock screen (they can always sign in with email and password). */
  async forgetOnTerminal(userId: string, req: Request, res: Response) {
    const t = await this.terminal(req);
    t.users = t.users.filter((u) => u !== userId);
    await this.writeTerminal(t, res);
  }

  /** Lock: end this session but keep the device's list, so the next person can come in with a PIN. */
  async lock(actor: AuthUser, req: Request, res: Response) {
    await this.endFamily(req.cookies?.[REFRESH_COOKIE]);
    this.clear(res);
    await this.audit.record({ actor, action: 'auth.lock', entityType: 'User', entityId: actor.id, summary: 'Locked the screen', req });
  }

  /**
   * Come back in on a device that remembers you: PIN, or password if you have no PIN
   * (or it is blocked). A PIN only works here, so a guessed PIN is useless anywhere else.
   */
  async unlock(body: { userId: string; pin?: string; password?: string }, req: Request, res: Response): Promise<MeDTO> {
    const t = await this.terminal(req);
    const notHere = () => unauthorized('This device does not remember you. Sign in with your email and password.');
    if (!t.users.includes(body.userId)) throw notHere();
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user || !user.passwordHash || user.deletedAt) throw notHere();
    const problem = accessProblem(user);
    if (problem) {
      await this.audit.record({ actor: this.asActor(user), action: 'auth.login_refused', entityType: 'User', entityId: user.id, summary: problem, req });
      throw unauthorized(problem);
    }

    if (body.pin !== undefined) {
      if (!user.pinDigest) throw badRequest('You have no PIN yet. Use your password, then set a PIN under Your account.');
      if (user.failedPins >= MAX_FAILED_PINS) throw unauthorized('Too many wrong PINs. Use your password this time.');
      if (!sameDigest(user.pinDigest, pinDigest(body.pin))) {
        const failed = user.failedPins + 1;
        await this.prisma.user.update({ where: { id: user.id }, data: { failedPins: failed } });
        await this.audit.record({ actorType: 'USER', action: 'auth.pin_failed', entityType: 'User', entityId: user.id, summary: `Wrong PIN (${failed})`, req });
        const left = MAX_FAILED_PINS - failed;
        throw unauthorized(left > 0 ? `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before it needs your password.` : 'Too many wrong PINs. Use your password this time.');
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { failedPins: 0, lastLoginAt: new Date() } });
    } else {
      if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
      if (!(await argon2.verify(user.passwordHash, body.password ?? ''))) {
        const failed = user.failedLogins + 1;
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null } });
        await this.audit.record({ actorType: 'USER', action: 'auth.login_failed', entityType: 'User', entityId: user.id, summary: `Failed sign-in (${failed})`, req });
        throw unauthorized('That password is not right.');
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, failedPins: 0, lastLoginAt: new Date() } });
    }
    await this.issue(user, res, req);
    t.users = [user.id, ...t.users.filter((u) => u !== user.id)].slice(0, TERMINAL_MAX);
    await this.writeTerminal(t, res);
    await this.audit.record({ actor: this.asActor(user), action: 'auth.unlock', entityType: 'User', entityId: user.id, summary: body.pin !== undefined ? 'Unlocked with PIN' : 'Unlocked with password', req });
    return this.me(user);
  }

  /** Whether this person may take this PIN: free, or theirs already. Never says whose. */
  private async pinFree(userId: string, pin: string): Promise<{ free: boolean; same: boolean; holder: { id: string; deletedAt: Date | null } | null }> {
    const holder = await this.prisma.user.findUnique({ where: { pinDigest: pinDigest(pin) }, select: { id: true, deletedAt: true } });
    if (holder?.id === userId) return { free: false, same: true, holder };
    return { free: !heldBack(pin) && (!holder || !!holder.deletedAt), same: false, holder };
  }

  /** Count and audit a refused PIN; too many in a day and checking stops. */
  private async refusal(userId: string, req: Request) {
    const since = new Date(Date.now() - 86_400_000);
    const n = await this.prisma.auditLog.count({ where: { action: 'auth.pin_unavailable', entityId: userId, createdAt: { gte: since } } });
    if (n >= MAX_REFUSALS_PER_DAY) throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many PINs tried today. Try again tomorrow, or ask the owner.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.audit.record({ actor: this.asActor(user), action: 'auth.pin_unavailable', entityType: 'User', entityId: userId, summary: 'Tried a PIN that is not available', req });
  }

  /** Live check while someone chooses a PIN: 4 digits, not easy to guess, available. */
  async checkPin(userId: string, pin: string, req: Request): Promise<PinCheckDTO> {
    const digits = /^\d{4}$/.test(pin);
    const weak = digits ? pinWeakness(pin) : null;
    if (!digits || weak) return { digits, weak, available: null, same: false, ok: false };
    const { free, same } = await this.pinFree(userId, pin);
    if (same) return { digits, weak, available: false, same: true, ok: false };
    if (!free) {
      await this.refusal(userId, req);
      return { digits, weak, available: false, same: false, ok: false };
    }
    return { digits, weak, available: true, same: false, ok: true };
  }

  /** Store a PIN for this person; the unique index is the final word if two people pick the same one at once. */
  private async applyPin(user: User, pin: string, req: Request) {
    const { free, same, holder } = await this.pinFree(user.id, pin);
    if (same) throw badRequest('That is already your PIN — choose a different one', [{ path: 'pin', message: 'Already your PIN' }]);
    if (!free) {
      await this.refusal(user.id, req);
      throw conflict(NOT_AVAILABLE);
    }
    try {
      await this.prisma.$transaction([
        // A deleted account's PIN is free again.
        ...(holder ? [this.prisma.user.update({ where: { id: holder.id }, data: { pinDigest: null, pinSetAt: null } })] : []),
        this.prisma.user.update({ where: { id: user.id }, data: { pinDigest: pinDigest(pin), pinSetAt: new Date(), failedPins: 0 } }),
      ]);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflict(NOT_AVAILABLE);
      throw e;
    }
  }

  /** Set or change your own PIN; your password proves it is you. */
  async setPin(userId: string, password: string, pin: string, req: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, password))) throw badRequest('Your password is not right', [{ path: 'password', message: 'Incorrect' }]);
    await this.applyPin(user, pin, req);
    await this.audit.record({ actor: this.asActor(user), action: user.pinDigest ? 'auth.pin_change' : 'auth.pin_set', entityType: 'User', entityId: userId, summary: user.pinDigest ? 'Changed their PIN' : 'Set a PIN', req });
  }

  async removePin(userId: string, req: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.pinDigest) return;
    await this.prisma.user.update({ where: { id: userId }, data: { pinDigest: null, pinSetAt: null, failedPins: 0 } });
    await this.audit.record({ actor: this.asActor(user), action: 'auth.pin_remove', entityType: 'User', entityId: userId, summary: 'Removed their PIN', req });
  }

  /** Email a one-hour link to choose a new PIN. Returns the masked address it went to. */
  async sendPinReset(user: User, req: Request, by?: AuthUser): Promise<{ sentTo: string }> {
    if (!user.email) throw badRequest(`${by ? `${user.name} has` : 'You have'} no email address on record — ${by ? 'clear the PIN instead' : 'ask the owner to clear your PIN'}.`);
    const problem = accessProblem(user);
    if (problem) throw unauthorized(problem);
    const token = newToken();
    await this.prisma.$transaction([
      this.prisma.userToken.updateMany({ where: { userId: user.id, kind: 'PIN_RESET', usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.userToken.create({ data: { userId: user.id, kind: 'PIN_RESET', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PIN_RESET_TTL_MS) } }),
    ]);
    await this.notifications.email({
      to: user.email,
      subject: 'Choose a new House PIN',
      heading: 'Choose a new PIN',
      paragraphs: [
        `Hello ${user.name.split(' ')[0]},`,
        by ? `${by.name} sent you this link to choose a new 4-digit PIN for the shared House computers.` : 'You asked to reset the 4-digit PIN you use on the shared House computers.',
        'The link works for one hour. Your password does not change.',
      ],
      action: { label: 'Choose a new PIN', url: `${env.ADMIN_URL}/reset-pin?token=${token}` },
      footnote: 'If you did not ask for this, ignore this email — your current PIN keeps working.',
    });
    await this.audit.record({
      actor: by ?? this.asActor(user),
      action: 'auth.pin_reset_sent',
      entityType: 'User',
      entityId: user.id,
      summary: by ? `Emailed ${user.name} a PIN reset link` : 'Asked for a PIN reset link from the lock screen',
      req,
    });
    return { sentTo: maskEmail(user.email) };
  }

  /** "Forgot PIN?" on a lock screen: only for someone this device remembers. */
  async forgotPin(userId: string, req: Request) {
    const t = await this.terminal(req);
    if (!t.users.includes(userId)) throw unauthorized('This device does not remember you. Use “Forgot password” on the sign-in page.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw unauthorized();
    return this.sendPinReset(user, req);
  }

  private async pinResetToken(token: string) {
    const row = await this.prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row || row.kind !== 'PIN_RESET' || row.usedAt || row.expiresAt < new Date() || row.user.deletedAt) throw badRequest('This link has expired or was already used. Ask for a new one from the lock screen.');
    return row;
  }

  async pinResetInfo(token: string) {
    const row = await this.pinResetToken(token);
    return { name: row.user.name, hasPin: !!row.user.pinDigest, expiresAt: row.expiresAt.toISOString() };
  }

  async checkPinWithToken(token: string, pin: string, req: Request) {
    const row = await this.pinResetToken(token);
    return this.checkPin(row.userId, pin, req);
  }

  async resetPin(token: string, pin: string, req: Request) {
    const row = await this.pinResetToken(token);
    await this.applyPin(row.user, pin, req);
    await this.prisma.userToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await this.audit.record({ actor: this.asActor(row.user), action: 'auth.pin_reset', entityType: 'User', entityId: row.userId, summary: 'Chose a new PIN from an email link', req });
  }

  async refresh(token: string | undefined, req: Request, res: Response): Promise<MeDTO> {
    if (!token) throw unauthorized();
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hashToken(token) }, include: { user: true } });
    if (!session) throw unauthorized();
    if (session.revokedAt && Date.now() - session.revokedAt.getTime() < REUSE_GRACE_MS && !accessProblem(session.user) && session.expiresAt > new Date()) {
      // Two tabs (or a reload during an app update) renewed at the same moment: the second one
      // arrives with the token the first just replaced. Not theft — carry on in the same family,
      // unless the family was ended on purpose (sign-out, lock, password change).
      const live = await this.prisma.session.count({ where: { family: session.family, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (live > 0) {
        await this.issue(session.user, res, req, session.family);
        return this.me(session.user);
      }
    }
    if (session.revokedAt) {
      // A rotated token was used again: assume theft, end the whole family.
      await this.prisma.session.updateMany({ where: { family: session.family, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorType: 'SYSTEM', action: 'auth.refresh_reuse', entityType: 'User', entityId: session.userId, summary: 'Refresh token reuse detected; sessions revoked', req });
      this.clear(res);
      throw unauthorized('Your session ended. Please sign in again.');
    }
    const problem = accessProblem(session.user);
    if (session.expiresAt < new Date() || problem) {
      this.clear(res);
      throw unauthorized(problem ?? undefined);
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await this.issue(session.user, res, req, session.family);
    return this.me(session.user);
  }

  /** End this sign-in on this browser — every tab's renewed session with it. */
  private async endFamily(token: string | undefined) {
    if (!token) return;
    const s = await this.prisma.session.findUnique({ where: { refreshTokenHash: hashToken(token) }, select: { family: true } });
    if (s) await this.prisma.session.updateMany({ where: { family: s.family, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async logout(token: string | undefined, res: Response) {
    await this.endFamily(token);
    this.clear(res);
  }

  async forgot(email: string, req: Request) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE' || !user.canSignIn) return; // never reveal whether an account exists
    const token = newToken();
    await this.prisma.userToken.create({ data: { userId: user.id, kind: 'PASSWORD_RESET', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    await this.notifications.email({
      to: email,
      subject: 'Reset your Reberon Suite password',
      heading: 'Reset your password',
      paragraphs: [`Hello ${user.name.split(' ')[0]},`, 'Someone (hopefully you) asked to reset the password for the Reberon Suite. The link works for one hour.'],
      action: { label: 'Choose a new password', url: `${env.ADMIN_URL}/reset-password?token=${token}` },
      footnote: 'If you did not ask for this, you can ignore this email.',
    });
    await this.audit.record({ actor: this.asActor(user), action: 'auth.forgot', entityType: 'User', entityId: user.id, summary: 'Requested a password reset', req });
  }

  async consumeToken(token: string, kind: 'PASSWORD_RESET' | 'INVITE', password: string, req: Request) {
    const row = await this.prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) throw badRequest('This link has expired or was already used.');
    const passwordHash = await argon2.hash(password, ARGON_OPTS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash, status: 'ACTIVE', failedLogins: 0, lockedUntil: null } }),
      this.prisma.userToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.record({ actor: this.asActor(row.user), action: kind === 'INVITE' ? 'auth.invite_accepted' : 'auth.password_reset', entityType: 'User', entityId: row.userId, summary: kind === 'INVITE' ? 'Accepted invitation' : 'Reset password', req });
  }

  async changePassword(userId: string, current: string, next: string, req: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current))) throw badRequest('Your current password is not right', [{ path: 'currentPassword', message: 'Incorrect' }]);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, ARGON_OPTS) } });
    await this.audit.record({ actor: this.asActor(user), action: 'auth.password_change', entityType: 'User', entityId: userId, summary: 'Changed password', req });
  }
}
