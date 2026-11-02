import { Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import type { MeDTO } from '@reberon/contracts';
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
export const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  me(u: Pick<User, 'id' | 'email' | 'name' | 'role' | 'grants' | 'revokes'> & { avatarId?: string | null; jobTitle?: string | null; customRoleKey?: string | null; customRoleName?: string | null }): MeDTO {
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
    };
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
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.issue(user, res, req);
    await this.audit.record({ actor: this.asActor(user), action: 'auth.login', entityType: 'User', entityId: user.id, summary: 'Signed in', req });
    return this.me(user);
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
