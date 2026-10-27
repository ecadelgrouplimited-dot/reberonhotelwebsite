import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import argon2 from 'argon2';
import { OWNER_ONLY, PERMISSIONS, zAdminSetPasswordInput, zInviteInput, zStaffCreateInput, zUserUpdateInput, type Permission, type SessionDTO, type UserDTO } from '@reberon/contracts';
import type { z } from 'zod';
import type { User } from '@reberon/db';
import { normalizePhone } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { permissionsOf } from '../../common/access.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ARGON_OPTS } from './auth.service.js';
import { hashToken, newToken } from './tokens.js';

const ROLE_WORD: Record<string, string> = { OWNER: 'owner', MANAGER: 'manager', DESK: 'front desk', HOUSEKEEPING: 'housekeeping' };

function device(ua: string | null) {
  if (!ua) return 'Unknown device';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

/**
 * People and access. The role is a starting preset; the owner can add or take
 * away single permissions per person, keep someone as a staff record without
 * a login, limit the hours they can sign in, end access on a date, or directly
 * set/change passwords and dispatch credentials to their official email.
 */
@Controller('v1/admin/users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async dto(rows: User[]): Promise<UserDTO[]> {
    const live = rows.length
      ? await this.prisma.session.groupBy({ by: ['userId', 'family'], where: { userId: { in: rows.map((r) => r.id) }, revokedAt: null, expiresAt: { gt: new Date() } } })
      : [];
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      jobTitle: u.jobTitle,
      role: u.role,
      status: u.status,
      canSignIn: u.canSignIn,
      signInFrom: u.signInFrom,
      signInUntil: u.signInUntil,
      accessExpiresAt: u.accessExpiresAt?.toISOString() ?? null,
      grants: u.grants,
      revokes: u.revokes,
      permissions: permissionsOf(u),
      hasPassword: !!u.passwordHash,
      activeSessions: live.filter((s) => s.userId === u.id).length,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /** The staff list is visible to anyone who can assign work (inbox, cleaning). */
  @Get()
  @Requires('inbox:read')
  async list() {
    const rows = await this.prisma.user.findMany({ where: { deletedAt: null }, orderBy: [{ status: 'asc' }, { name: 'asc' }] });
    return this.dto(rows);
  }

  @Get(':id')
  @Requires('users:manage')
  async one(@Param('id') id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw notFound('Person');
    return (await this.dto([u]))[0];
  }

  private async sendInvite(user: User, me: AuthUser) {
    if (!user.email) throw badRequest('Add an email address first');
    await this.prisma.userToken.updateMany({ where: { userId: user.id, kind: 'INVITE', usedAt: null }, data: { usedAt: new Date() } });
    const token = newToken();
    await this.prisma.userToken.create({ data: { userId: user.id, kind: 'INVITE', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    const url = `${env.ADMIN_URL}/accept-invite?token=${token}`;
    await this.notifications.email({
      to: user.email,
      subject: `${me.name} invited you to the Reberon Suite`,
      heading: 'You have been invited',
      paragraphs: [`Hello ${user.name.split(' ')[0]},`, `${me.name} has given you access to the Reberon Hotel Suite (${ROLE_WORD[user.role]}). Choose a password to start. The link works for seven days.`],
      action: { label: 'Accept and set a password', url },
    });
    return env.NODE_ENV === 'production' ? undefined : url;
  }

  private async sendCredentialsEmail(user: User, plainPassword: string, me: AuthUser) {
    if (!user.email) throw badRequest('Add an official email address first before sending credentials');
    const loginUrl = `${env.ADMIN_URL}/login`;
    await this.notifications.email({
      to: user.email,
      subject: 'Your Reberon Hotel Suite login credentials',
      heading: 'Your Reberon Suite Access',
      paragraphs: [
        `Hello ${user.name.split(' ')[0]},`,
        `${me.name} has configured your sign-in credentials for the Reberon Hotel Management Suite (${ROLE_WORD[user.role]}).`,
        'Use the official email and password below to sign in. Once signed in, you can change or reset your password at any time under Account settings.',
      ],
      facts: [
        ['Official Email', user.email],
        ['Password', plainPassword],
        ['Role', ROLE_WORD[user.role] ?? user.role],
        ['Portal URL', loginUrl],
      ],
      action: { label: 'Sign in to Reberon Suite', url: loginUrl },
      footnote: 'Sent via alerts@reberonhotel.com. For security, please update your password after your first sign-in.',
    });
  }

  /** Kept for older screens: invite someone who signs in. */
  @Post('invite')
  @Requires('users:manage')
  async invite(@Body(new ZodPipe(zInviteInput)) body: z.infer<typeof zInviteInput>, @CurrentUser() me: AuthUser, @Req() req: Request) {
    return this.create({ ...body, canSignIn: true, sendCredentials: true }, me, req);
  }

  /** Add a person. With canSignIn they either receive a direct password (and optional credentials email) or an invitation link; without, they are a staff record only. */
  @Post()
  @Requires('users:manage')
  async create(@Body(new ZodPipe(zStaffCreateInput)) body: z.infer<typeof zStaffCreateInput>, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const existing = body.email ? await this.prisma.user.findUnique({ where: { email: body.email } }) : null;
    // Only an invitation that was never accepted may be re-used.
    if (existing && !(existing.status === 'INVITED' && !existing.deletedAt)) throw conflict('Someone with that email is already on the staff list');
    const phone = body.phone ? (normalizePhone(body.phone) ?? body.phone) : null;
    const passwordHash = body.canSignIn && body.password ? await argon2.hash(body.password, ARGON_OPTS) : undefined;
    const status = !body.canSignIn ? 'ACTIVE' : passwordHash ? 'ACTIVE' : 'INVITED';
    const fields = {
      name: body.name,
      jobTitle: body.jobTitle ?? null,
      phone,
      role: body.role,
      canSignIn: body.canSignIn,
      ...(passwordHash ? { passwordHash, status: 'ACTIVE' as const, failedLogins: 0, lockedUntil: null } : {}),
    };
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: fields })
      : await this.prisma.user.create({ data: { ...fields, email: body.email ?? null, status } });

    let inviteUrl: string | undefined;
    let credentialsEmailed = false;
    if (body.canSignIn) {
      if (body.password) {
        if (body.sendCredentials && user.email) {
          await this.sendCredentialsEmail(user, body.password, me);
          credentialsEmailed = true;
        }
      } else {
        inviteUrl = await this.sendInvite(user, me);
      }
    }

    await this.audit.record({
      actor: me,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      summary: `Added ${user.name} (${ROLE_WORD[user.role]})${!body.canSignIn ? ', no sign-in' : body.password ? (credentialsEmailed ? ' with password and emailed credentials' : ' with password set') : ' and sent an invitation'}`,
      req,
    });
    return { user: (await this.dto([user]))[0], inviteUrl, credentialsEmailed };
  }

  /** Directly set or change a user's password as Super Admin / Owner, with optional email dispatch of credentials. */
  @Post(':id/password')
  @HttpCode(200)
  @Requires('users:manage')
  async setPassword(
    @Param('id') id: string,
    @Body(new ZodPipe(zAdminSetPasswordInput)) body: z.infer<typeof zAdminSetPasswordInput>,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound('Person');
    if (body.sendCredentials && !user.email) {
      throw badRequest('Save an official email address for this person before sending credentials');
    }
    const passwordHash = await argon2.hash(body.password, ARGON_OPTS);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        canSignIn: true,
        status: user.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await this.prisma.userToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });

    let emailed = false;
    if (body.sendCredentials && updated.email) {
      await this.sendCredentialsEmail(updated, body.password, me);
      emailed = true;
    }

    await this.audit.record({
      actor: me,
      action: 'user.password_set',
      entityType: 'User',
      entityId: id,
      summary: `Set password for ${updated.name}${emailed ? ` and emailed credentials to ${updated.email}` : ''}`,
      req,
    });
    return { user: (await this.dto([updated]))[0], emailed };
  }

  @Post(':id/invite')
  @HttpCode(200)
  @Requires('users:manage')
  async reinvite(@Param('id') id: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound('Person');
    if (user.passwordHash && user.status === 'ACTIVE') throw badRequest('They already have a password. Use the Password & Credentials panel to set a new password or send credentials.');
    const updated = await this.prisma.user.update({ where: { id }, data: { canSignIn: true, status: user.passwordHash ? user.status : 'INVITED' } });
    const inviteUrl = await this.sendInvite(updated, me);
    await this.audit.record({ actor: me, action: 'user.invite', entityType: 'User', entityId: id, summary: `Sent ${user.name} an invitation`, req });
    return { inviteUrl };
  }

  @Patch(':id')
  @Requires('users:manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(zUserUpdateInput)) body: z.infer<typeof zUserUpdateInput>, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const before = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound('Person');
    const self = id === me.id;
    const accessFields = ['role', 'status', 'canSignIn', 'signInFrom', 'signInUntil', 'accessExpiresAt', 'grants', 'revokes'] as const;
    if (self && accessFields.some((k) => body[k] !== undefined && JSON.stringify(body[k]) !== JSON.stringify(k === 'accessExpiresAt' ? (before.accessExpiresAt?.toISOString() ?? null) : before[k]))) {
      throw badRequest('Ask another owner to change your own access');
    }
    // Never leave the hotel without an owner who can get in.
    const losesOwner = before.role === 'OWNER' && ((body.role && body.role !== 'OWNER') || body.status === 'DISABLED' || body.canSignIn === false || body.accessExpiresAt);
    if (losesOwner) {
      const owners = await this.prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE', canSignIn: true, deletedAt: null, id: { not: id } } });
      if (!owners) throw badRequest('There must always be another owner who can sign in');
    }
    const touchesHours = body.signInFrom !== undefined || body.signInUntil !== undefined;
    if (touchesHours && !body.signInFrom !== !body.signInUntil) {
      throw badRequest('Give both a start and an end time, or neither', [{ path: 'signInUntil', message: 'Both or neither' }]);
    }
    const known = (xs?: string[]) => xs?.filter((p) => (PERMISSIONS as readonly string[]).includes(p) && !OWNER_ONLY.includes(p as Permission));
    if (body.email && body.email !== before.email && (await this.prisma.user.findUnique({ where: { email: body.email } }))) throw conflict('Someone else already uses that email');

    const { password, sendCredentials, ...restBody } = body;
    const passwordHash = password ? await argon2.hash(password, ARGON_OPTS) : undefined;

    const data = {
      ...restBody,
      phone: restBody.phone === undefined ? undefined : restBody.phone ? (normalizePhone(restBody.phone) ?? restBody.phone) : null,
      accessExpiresAt: restBody.accessExpiresAt === undefined ? undefined : restBody.accessExpiresAt ? new Date(restBody.accessExpiresAt) : null,
      grants: known(restBody.grants),
      revokes: restBody.revokes?.filter((p) => (PERMISSIONS as readonly string[]).includes(p)),
      ...(passwordHash ? { passwordHash, status: 'ACTIVE' as const, failedLogins: 0, lockedUntil: null } : {}),
    };
    const user = await this.prisma.user.update({ where: { id }, data });

    if (password && sendCredentials && user.email) {
      await this.sendCredentialsEmail(user, password, me);
    }

    // Taking access away ends their open sessions straight away.
    const shut = body.status === 'DISABLED' || body.canSignIn === false || (data.accessExpiresAt && data.accessExpiresAt <= new Date());
    if (shut) await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    const was = permissionsOf(before);
    const now = permissionsOf(user);
    const added = now.filter((p) => !was.includes(p));
    const removed = was.filter((p) => !now.includes(p));
    const bits = [
      body.role && body.role !== before.role ? `role ${ROLE_WORD[before.role]} → ${ROLE_WORD[body.role]}` : '',
      added.length ? `can now: ${added.join(', ')}` : '',
      removed.length ? `no longer: ${removed.join(', ')}` : '',
      body.canSignIn !== undefined && body.canSignIn !== before.canSignIn ? (body.canSignIn ? 'may sign in' : 'no sign-in') : '',
      body.status && body.status !== before.status ? body.status.toLowerCase() : '',
      body.signInFrom !== undefined && body.signInFrom !== before.signInFrom ? (body.signInFrom ? `hours ${body.signInFrom}–${body.signInUntil}` : 'any hour') : '',
      body.accessExpiresAt !== undefined ? (body.accessExpiresAt ? `access ends ${body.accessExpiresAt.slice(0, 10)}` : 'no end date') : '',
      password ? (sendCredentials && user.email ? `password set & emailed to ${user.email}` : 'password set') : '',
    ].filter(Boolean);
    await this.audit.record({ actor: me, action: 'user.update', entityType: 'User', entityId: id, summary: `${user.name}: ${bits.join('; ') || 'details updated'}`, before: { role: before.role, grants: before.grants, revokes: before.revokes, status: before.status }, after: restBody, req });
    return (await this.dto([user]))[0];
  }

  @Get(':id/sessions')
  @Requires('users:manage')
  async sessions(@Param('id') id: string): Promise<SessionDTO[]> {
    const rows = await this.prisma.session.findMany({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    const firstOf = new Map<string, Date>();
    for (const r of await this.prisma.session.findMany({ where: { family: { in: rows.map((r) => r.family) } }, select: { family: true, createdAt: true } })) {
      const cur = firstOf.get(r.family);
      if (!cur || r.createdAt < cur) firstOf.set(r.family, r.createdAt);
    }
    return rows.map((r) => ({ id: r.id, device: device(r.userAgent), ip: r.ip, createdAt: (firstOf.get(r.family) ?? r.createdAt).toISOString(), lastUsedAt: r.createdAt.toISOString(), current: false }));
  }

  /** Sign them out on every device now. */
  @Post(':id/sign-out')
  @HttpCode(200)
  @Requires('users:manage')
  async signOut(@Param('id') id: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound('Person');
    const r = await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ actor: me, action: 'user.sign_out', entityType: 'User', entityId: id, summary: `Signed ${user.name} out everywhere (${r.count} session${r.count === 1 ? '' : 's'})`, req });
    return { ended: r.count };
  }
}
