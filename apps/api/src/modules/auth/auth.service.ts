import { Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { readHousePrefs, type HousePrefs, type MeDTO, type TerminalPersonDTO } from '@reberon/contracts';
import { jwtVerify, SignJWT } from 'jose';
import type { User } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { AppError, badRequest, unauthorized } from '../../common/errors.js';
import { ACCESS_COOKIE, ACCESS_TTL_SECONDS, REFRESH_COOKIE, SESSION_HINT_COOKIE, signAccessToken, type AuthUser } from '../../common/auth.js';
import { accessProblem, permissionsOf } from '../../common/access.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { hashToken, newToken } from './tokens.js';

const REFRESH_TTL_MS = 30 * 86_400_000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
/** Remembers who signed in on this device with a password, so they may come back with a PIN. */
export const TERMINAL_COOKIE = 'rb_term';
const TERMINAL_TTL_MS = 180 * 86_400_000;
const TERMINAL_MAX = 8;
const MAX_FAILED_PINS = 5;
const termKey = new TextEncoder().encode(`${env.JWT_SECRET}:terminal`);
export const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  me(u: Pick<User, 'id' | 'email' | 'name' | 'role' | 'grants' | 'revokes'> & { avatarId?: string | null; jobTitle?: string | null; customRoleKey?: string | null; customRoleName?: string | null; preferences?: unknown; pinHash?: string | null }): MeDTO {
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
      hasPin: !!u.pinHash,
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
        hasPin: !!u.pinHash,
        pinBlocked: !!u.pinHash && u.failedPins >= MAX_FAILED_PINS,
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
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await this.prisma.session.updateMany({ where: { refreshTokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
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
      if (!user.pinHash) throw badRequest('You have no PIN yet. Use your password, then set a PIN under Your account.');
      if (user.failedPins >= MAX_FAILED_PINS) throw unauthorized('Too many wrong PINs. Use your password this time.');
      if (!(await argon2.verify(user.pinHash, body.pin))) {
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

  /** Set or change your own PIN; your password proves it is you. */
  async setPin(userId: string, password: string, pin: string, req: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, password))) throw badRequest('Your password is not right', [{ path: 'password', message: 'Incorrect' }]);
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: await argon2.hash(pin, ARGON_OPTS), pinSetAt: new Date(), failedPins: 0 } });
    await this.audit.record({ actor: this.asActor(user), action: user.pinHash ? 'auth.pin_change' : 'auth.pin_set', entityType: 'User', entityId: userId, summary: user.pinHash ? 'Changed their PIN' : 'Set a PIN', req });
  }

  async removePin(userId: string, req: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.pinHash) return;
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: null, pinSetAt: null, failedPins: 0 } });
    await this.audit.record({ actor: this.asActor(user), action: 'auth.pin_remove', entityType: 'User', entityId: userId, summary: 'Removed their PIN', req });
  }

  async refresh(token: string | undefined, req: Request, res: Response): Promise<MeDTO> {
    if (!token) throw unauthorized();
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hashToken(token) }, include: { user: true } });
    if (!session) throw unauthorized();
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

  async logout(token: string | undefined, res: Response) {
    if (token) await this.prisma.session.updateMany({ where: { refreshTokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
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
