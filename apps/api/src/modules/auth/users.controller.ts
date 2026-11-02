import { Body, Controller, Delete, Get, HttpCode, OnModuleInit, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import argon2 from 'argon2';
import {
  OWNER_ONLY,
  PERMISSIONS,
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  zAdminSetPasswordInput,
  zCreateRoleInput,
  zInviteInput,
  zStaffCreateInput,
  zUpdateRoleInput,
  zUserUpdateInput,
  type HrEmployeeForAccessDTO,
  type Permission,
  type Role,
  type RoleDefinitionDTO,
  type SessionDTO,
  type UserDTO,
} from '@reberon/contracts';
import type { z } from 'zod';
import type { User } from '@reberon/db';
import { normalizePhone } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { permissionsOf } from '../../common/access.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ARGON_OPTS } from './auth.service.js';
import { hashToken, newToken } from './tokens.js';

const ROLE_WORD: Record<string, string> = {
  OWNER: 'Owner & Proprietor',
  MANAGER: 'General Manager',
  HR: 'Human Resources',
  ACCOUNTANT: 'Finance & Accounts',
  DESK: 'Front Desk & Reception',
  KITCHEN: 'Kitchen & Culinary',
  BAR: 'Bar & Beverage',
  GYM: 'Health Club & Spa',
  HOUSEKEEPING: 'Housekeeping & Rooms',
};

const ROLE_DEFAULT_COLOR: Record<Role, string> = {
  OWNER: 'violet',
  MANAGER: 'indigo',
  HR: 'rose',
  ACCOUNTANT: 'emerald',
  DESK: 'sky',
  KITCHEN: 'amber',
  BAR: 'orange',
  GYM: 'teal',
  HOUSEKEEPING: 'slate',
};

function computeGrantsAndRevokes(baseRole: Role, targetPermissions: string[]) {
  if (baseRole === 'OWNER') return { grants: [] as string[], revokes: [] as string[] };
  const preset = new Set<string>(ROLE_PERMISSIONS[baseRole] ?? []);
  const target = new Set<string>(
    targetPermissions.filter(
      (p) => (PERMISSIONS as readonly string[]).includes(p) && !OWNER_ONLY.includes(p as Permission),
    ),
  );
  const grants = [...target].filter((p) => !preset.has(p));
  const revokes = [...preset].filter((p) => !target.has(p));
  return { grants, revokes };
}

function device(ua: string | null) {
  if (!ua) return 'Unknown device';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

/**
 * People, Roles, and Access. Includes built-in hotel roles (Owner, Manager, HR,
 * Accountant, Front Desk, Kitchen, Bar, Gym/Spa, Housekeeping) as well as custom
 * hotel roles with dynamic permission presets.
 */
@Controller('v1/admin/users')
export class UsersController implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    try {
      // 1. Seed / synchronize built-in system RoleDefinitions
      for (const r of ROLES) {
        await this.prisma.roleDefinition.upsert({
          where: { key: r },
          create: {
            key: r,
            name: ROLE_LABELS[r],
            description: ROLE_DESCRIPTIONS[r],
            color: ROLE_DEFAULT_COLOR[r] ?? 'emerald',
            baseRole: r,
            permissions: [...ROLE_PERMISSIONS[r]],
            isSystem: true,
          },
          update: {
            isSystem: true,
            baseRole: r,
          },
        });
      }

      // 2. Automatically upgrade existing specialized staff from legacy DESK + revokes to their dedicated native roles
      const upgrades: { email: string; role: Role }[] = [
        { email: 'kitchen@reberonhotel.com', role: 'KITCHEN' },
        { email: 'bar@reberonhotel.com', role: 'BAR' },
        { email: 'gym@reberonhotel.com', role: 'GYM' },
        { email: 'hr@reberonhotel.com', role: 'HR' },
      ];
      for (const up of upgrades) {
        const u = await this.prisma.user.findUnique({ where: { email: up.email } });
        if (u && u.role === 'DESK' && u.revokes.length >= 10) {
          await this.prisma.user.update({
            where: { id: u.id },
            data: { role: up.role, grants: [], revokes: [] },
          });
        }
      }
    } catch {
      // Ignore if migration hasn't run yet during build
    }
  }

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
      customRoleKey: u.customRoleKey ?? null,
      customRoleName: u.customRoleName ?? null,
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

  /* ───── HR Employee Directory Lookup for Role Assignment ───── */

  @Get('hr-employees')
  @Requires('users:manage')
  async listHrEmployees(): Promise<HrEmployeeForAccessDTO[]> {
    const [staffProfiles, departments, activeUsers] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where: { status: { not: 'TERMINATED' } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.hotelDepartment.findMany({ select: { code: true, name: true } }),
      this.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    ]);

    const deptMap = new Map<string, string>(departments.map((d) => [d.code, d.name]));
    const userById = new Map<string, User>(activeUsers.map((u) => [u.id, u]));
    const userByEmail = new Map<string, User>();
    const userByPhone = new Map<string, User>();
    for (const u of activeUsers) {
      if (u.email) userByEmail.set(u.email.toLowerCase(), u);
      if (u.phone) userByPhone.set(normalizePhone(u.phone) ?? u.phone, u);
    }

    const linkedUserIds = new Set<string>();
    const results: HrEmployeeForAccessDTO[] = [];

    for (const s of staffProfiles) {
      const fullName = [s.firstName, s.lastName, s.otherNames].filter(Boolean).join(' ');
      let matchedUser: User | undefined = s.userId ? userById.get(s.userId) : undefined;
      if (!matchedUser && s.email) {
        matchedUser = userByEmail.get(s.email.toLowerCase());
      }
      if (!matchedUser && s.phone) {
        matchedUser = userByPhone.get(normalizePhone(s.phone) ?? s.phone);
      }

      if (matchedUser) {
        linkedUserIds.add(matchedUser.id);
        if (s.userId !== matchedUser.id) {
          await this.prisma.staffProfile
            .update({ where: { id: s.id }, data: { userId: matchedUser.id } })
            .catch(() => undefined);
        }
      }

      results.push({
        staffProfileId: s.id,
        employeeNumber: s.employeeNumber,
        fullName,
        firstName: s.firstName,
        lastName: s.lastName,
        jobTitle: s.jobTitle,
        departmentCode: s.departmentCode,
        departmentName: deptMap.get(s.departmentCode) ?? s.departmentCode,
        phone: s.phone,
        email: s.email ?? matchedUser?.email ?? null,
        employmentStatus: s.status,
        existingUser: matchedUser
          ? {
              id: matchedUser.id,
              email: matchedUser.email,
              role: matchedUser.role,
              customRoleKey: matchedUser.customRoleKey ?? null,
              customRoleName: matchedUser.customRoleName ?? null,
              roleDisplayName:
                matchedUser.customRoleName || ROLE_WORD[matchedUser.role] || matchedUser.role,
              canSignIn: matchedUser.canSignIn,
              hasPassword: !!matchedUser.passwordHash,
              status: matchedUser.status,
            }
          : null,
      });
    }

    // Ensure any active User who wasn't in StaffProfile yet (e.g. Co-Owner Wilson Ecaat) also has an HR StaffProfile
    let nextEmpIndex = staffProfiles.length + 1;
    for (const u of activeUsers) {
      if (linkedUserIds.has(u.id)) continue;
      const parts = u.name.trim().split(/\s+/);
      const firstName = parts[0] || u.name;
      const lastName = parts.slice(1).join(' ') || 'Staff';
      const empNo = `REB-EMP-${String(nextEmpIndex++).padStart(3, '0')}`;
      const deptCode =
        u.role === 'OWNER' || u.role === 'MANAGER' || u.role === 'HR' || u.role === 'ACCOUNTANT'
          ? 'ADMIN_GENERAL'
          : u.role === 'KITCHEN'
            ? 'KITCHEN'
            : u.role === 'BAR'
              ? 'BAR'
              : u.role === 'GYM'
                ? 'HEALTH_CLUB'
                : u.role === 'HOUSEKEEPING'
                  ? 'HOUSEKEEPING'
                  : 'FRONT_DESK';

      try {
        const createdProfile = await this.prisma.staffProfile.create({
          data: {
            employeeNumber: empNo,
            userId: u.id,
            firstName,
            lastName,
            phone: u.phone || '+256700000000',
            email: u.email,
            departmentCode: deptCode,
            jobTitle: u.jobTitle || ROLE_WORD[u.role] || u.role,
            employmentType: 'FULL_TIME',
            emergencyContactName: 'Reberon Administration',
            emergencyContactPhone: '+256700000101',
            emergencyContactRelation: 'COLLEAGUE',
            status: u.status === 'DISABLED' ? 'SUSPENDED' : 'ACTIVE',
          },
        });
        results.push({
          staffProfileId: createdProfile.id,
          employeeNumber: createdProfile.employeeNumber,
          fullName: u.name,
          firstName,
          lastName,
          jobTitle: createdProfile.jobTitle,
          departmentCode: deptCode,
          departmentName: deptMap.get(deptCode) ?? deptCode,
          phone: createdProfile.phone,
          email: u.email,
          employmentStatus: createdProfile.status,
          existingUser: {
            id: u.id,
            email: u.email,
            role: u.role,
            customRoleKey: u.customRoleKey ?? null,
            customRoleName: u.customRoleName ?? null,
            roleDisplayName: u.customRoleName || ROLE_WORD[u.role] || u.role,
            canSignIn: u.canSignIn,
            hasPassword: !!u.passwordHash,
            status: u.status,
          },
        });
      } catch {
        // ignore duplicate empNo race
      }
    }

    return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /* ───── Roles & Permissions Management ───── */

  @Get('roles')
  @Requires('dashboard:view')
  async listRoles(): Promise<RoleDefinitionDTO[]> {
    const [defs, activeUsers] = await Promise.all([
      this.prisma.roleDefinition.findMany({ orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.user.findMany({
        where: { deletedAt: null, status: { not: 'DISABLED' } },
        select: { role: true, customRoleKey: true },
      }),
    ]);

    const systemOrder = ROLES as readonly string[];
    const sorted = [...defs].sort((a, b) => {
      const ia = systemOrder.indexOf(a.key);
      const ib = systemOrder.indexOf(b.key);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return sorted.map((d) => {
      const usersCount = activeUsers.filter((u) =>
        u.customRoleKey ? u.customRoleKey === d.key : u.role === d.key,
      ).length;
      return {
        key: d.key,
        name: d.name,
        description: d.description,
        color: d.color,
        baseRole: d.baseRole,
        permissions: d.key === 'OWNER' ? [...PERMISSIONS] : d.permissions,
        isSystem: d.isSystem,
        usersCount,
        updatedAt: d.updatedAt.toISOString(),
      };
    });
  }

  @Post('roles')
  @Requires('users:manage')
  async createRole(
    @Body(new ZodPipe(zCreateRoleInput)) body: z.infer<typeof zCreateRoleInput>,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
  ): Promise<RoleDefinitionDTO> {
    const rawKey =
      body.key ||
      body.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 36);
    if (!rawKey || rawKey.length < 2) throw badRequest('Provide a valid role name');

    const exists = await this.prisma.roleDefinition.findUnique({ where: { key: rawKey } });
    if (exists) throw conflict(`A role with key "${rawKey}" already exists`);

    const cleanPerms = body.permissions.filter(
      (p) => (PERMISSIONS as readonly string[]).includes(p) && !OWNER_ONLY.includes(p as Permission),
    );
    if (!cleanPerms.includes('dashboard:view')) cleanPerms.unshift('dashboard:view');

    const created = await this.prisma.roleDefinition.create({
      data: {
        key: rawKey,
        name: body.name.trim(),
        description: body.description.trim(),
        color: body.color || 'emerald',
        baseRole: body.baseRole === 'OWNER' ? 'MANAGER' : body.baseRole,
        permissions: cleanPerms,
        isSystem: false,
      },
    });

    await this.audit.record({
      actor: me,
      action: 'role.create',
      entityType: 'RoleDefinition',
      entityId: created.id,
      summary: `Created custom role "${created.name}" (${created.key}) with ${cleanPerms.length} permissions`,
      req,
    });

    return {
      key: created.key,
      name: created.name,
      description: created.description,
      color: created.color,
      baseRole: created.baseRole,
      permissions: created.permissions,
      isSystem: created.isSystem,
      usersCount: 0,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  @Patch('roles/:key')
  @Requires('users:manage')
  async updateRole(
    @Param('key') key: string,
    @Body(new ZodPipe(zUpdateRoleInput)) body: z.infer<typeof zUpdateRoleInput>,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
  ): Promise<RoleDefinitionDTO> {
    const existing = await this.prisma.roleDefinition.findUnique({ where: { key } });
    if (!existing) throw notFound('Role definition');
    if (existing.key === 'OWNER') throw badRequest('The Owner role always holds all permissions and cannot be restricted');

    const cleanPerms = body.permissions
      ? body.permissions.filter(
          (p) => (PERMISSIONS as readonly string[]).includes(p) && !OWNER_ONLY.includes(p as Permission),
        )
      : existing.permissions;

    const nextBaseRole = existing.isSystem
      ? existing.baseRole
      : body.baseRole && body.baseRole !== 'OWNER'
        ? body.baseRole
        : existing.baseRole;

    const updated = await this.prisma.roleDefinition.update({
      where: { key },
      data: {
        name: body.name?.trim() ?? existing.name,
        description: body.description !== undefined ? body.description.trim() : existing.description,
        color: body.color ?? existing.color,
        baseRole: nextBaseRole,
        permissions: cleanPerms,
      },
    });

    // Synchronize permissions to all users currently assigned to this role
    if (body.syncToUsers !== false) {
      const { grants, revokes } = computeGrantsAndRevokes(updated.baseRole, updated.permissions);
      if (updated.isSystem) {
        await this.prisma.user.updateMany({
          where: { role: updated.baseRole, customRoleKey: null, deletedAt: null },
          data: { grants, revokes },
        });
      } else {
        await this.prisma.user.updateMany({
          where: { customRoleKey: updated.key, deletedAt: null },
          data: {
            role: updated.baseRole,
            customRoleName: updated.name,
            grants,
            revokes,
          },
        });
      }
    }

    const usersCount = await this.prisma.user.count({
      where: {
        deletedAt: null,
        status: { not: 'DISABLED' },
        ...(updated.isSystem ? { role: updated.baseRole, customRoleKey: null } : { customRoleKey: updated.key }),
      },
    });

    await this.audit.record({
      actor: me,
      action: 'role.update',
      entityType: 'RoleDefinition',
      entityId: updated.id,
      summary: `Updated role "${updated.name}" (${updated.key}) — ${updated.permissions.length} permissions`,
      req,
    });

    return {
      key: updated.key,
      name: updated.name,
      description: updated.description,
      color: updated.color,
      baseRole: updated.baseRole,
      permissions: updated.permissions,
      isSystem: updated.isSystem,
      usersCount,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  @Delete('roles/:key')
  @Requires('users:manage')
  async deleteRole(@Param('key') key: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const existing = await this.prisma.roleDefinition.findUnique({ where: { key } });
    if (!existing) throw notFound('Role definition');
    if (existing.isSystem) throw badRequest('Built-in hotel roles cannot be deleted, but you can customize their permissions');

    await this.prisma.user.updateMany({
      where: { customRoleKey: key },
      data: { customRoleKey: null, customRoleName: null },
    });

    await this.prisma.roleDefinition.delete({ where: { key } });

    await this.audit.record({
      actor: me,
      action: 'role.delete',
      entityType: 'RoleDefinition',
      entityId: existing.id,
      summary: `Deleted custom role "${existing.name}" (${existing.key})`,
      req,
    });

    return { ok: true, deleted: true };
  }

  /** The staff list is visible to anyone who can assign work (inbox, cleaning, HR). */
  @Get()
  @Requires('dashboard:view')
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
    const roleLabel = user.customRoleName || ROLE_WORD[user.role] || user.role;
    await this.notifications.email({
      to: user.email,
      subject: `${me.name} invited you to the Reberon Suite`,
      heading: 'You have been invited',
      paragraphs: [`Hello ${user.name.split(' ')[0]},`, `${me.name} has given you access to the Reberon Hotel Suite (${roleLabel}). Choose a password to start. The link works for seven days.`],
      action: { label: 'Accept and set a password', url },
    });
    return env.NODE_ENV === 'production' ? undefined : url;
  }

  private async sendCredentialsEmail(user: User, plainPassword: string, me: AuthUser) {
    if (!user.email) throw badRequest('Add an official email address first before sending credentials');
    const loginUrl = `${env.ADMIN_URL}/login`;
    const roleLabel = user.customRoleName || ROLE_WORD[user.role] || user.role;
    await this.notifications.email({
      to: user.email,
      subject: 'Your Reberon Hotel Suite login credentials',
      heading: 'Your Reberon Suite Access',
      paragraphs: [
        `Hello ${user.name.split(' ')[0]},`,
        `${me.name} has configured your sign-in credentials for the Reberon Hotel Management Suite (${roleLabel}).`,
        'Use the official email and password below to sign in. Once signed in, you can change or reset your password at any time under Account settings.',
      ],
      facts: [
        ['Official Email', user.email],
        ['Password', plainPassword],
        ['Role', roleLabel],
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

  /** Add or assign an HR employee to a role. With canSignIn they either receive a direct password (and optional credentials email) or an invitation link; without, they are a staff record only. */
  @Post()
  @Requires('users:manage')
  async create(@Body(new ZodPipe(zStaffCreateInput)) body: z.infer<typeof zStaffCreateInput>, @CurrentUser() me: AuthUser, @Req() req: Request) {
    let staffProfile = body.staffProfileId
      ? await this.prisma.staffProfile.findUnique({ where: { id: body.staffProfileId } })
      : null;

    let existing = staffProfile?.userId
      ? await this.prisma.user.findFirst({ where: { id: staffProfile.userId, deletedAt: null } })
      : null;

    if (!existing && body.email) {
      existing = await this.prisma.user.findUnique({ where: { email: body.email } });
      if (existing && !body.staffProfileId && !(existing.status === 'INVITED' && !existing.deletedAt)) {
        throw conflict('Someone with that email is already on the staff list');
      }
    }

    if (existing && existing.id === me.id && body.role !== existing.role) {
      throw badRequest('Ask another owner to change your own access role');
    }

    const phone = body.phone ? (normalizePhone(body.phone) ?? body.phone) : null;
    const passwordHash = body.canSignIn && body.password ? await argon2.hash(body.password, ARGON_OPTS) : undefined;
    const status = !body.canSignIn ? 'ACTIVE' : passwordHash || existing?.passwordHash ? 'ACTIVE' : 'INVITED';

    let finalRole: Role = body.role;
    let customRoleKey: string | null = null;
    let customRoleName: string | null = null;
    let grants: string[] = [];
    let revokes: string[] = [];

    if (body.customRoleKey) {
      const def = await this.prisma.roleDefinition.findUnique({ where: { key: body.customRoleKey } });
      if (def) {
        finalRole = def.baseRole;
        if (!def.isSystem) {
          customRoleKey = def.key;
          customRoleName = def.name;
        }
        const gr = computeGrantsAndRevokes(def.baseRole, def.permissions);
        grants = gr.grants;
        revokes = gr.revokes;
      }
    } else {
      const sysDef = await this.prisma.roleDefinition.findUnique({ where: { key: body.role } });
      if (sysDef && sysDef.key !== 'OWNER') {
        const gr = computeGrantsAndRevokes(body.role, sysDef.permissions);
        grants = gr.grants;
        revokes = gr.revokes;
      }
    }

    const fields = {
      name: body.name,
      jobTitle: body.jobTitle ?? customRoleName ?? null,
      phone,
      role: finalRole,
      customRoleKey,
      customRoleName,
      grants,
      revokes,
      canSignIn: body.canSignIn,
      ...(body.email ? { email: body.email } : {}),
      ...(passwordHash ? { passwordHash, status: 'ACTIVE' as const, failedLogins: 0, lockedUntil: null } : {}),
    };
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: fields })
      : await this.prisma.user.create({ data: { ...fields, email: body.email ?? null, status } });

    // Link or synchronize with HR StaffProfile
    if (staffProfile) {
      await this.prisma.staffProfile
        .update({
          where: { id: staffProfile.id },
          data: {
            userId: user.id,
            ...(body.email ? { email: body.email } : {}),
            ...(phone ? { phone } : {}),
            ...(body.jobTitle ? { jobTitle: body.jobTitle } : {}),
          },
        })
        .catch(() => undefined);
    } else if (user.email) {
      await this.prisma.staffProfile
        .updateMany({
          where: { email: { equals: user.email, mode: 'insensitive' }, userId: null },
          data: { userId: user.id },
        })
        .catch(() => undefined);
    }

    let inviteUrl: string | undefined;
    let credentialsEmailed = false;
    if (body.canSignIn) {
      if (body.password) {
        if (body.sendCredentials && user.email) {
          await this.sendCredentialsEmail(user, body.password, me);
          credentialsEmailed = true;
        }
      } else if (!existing?.passwordHash) {
        inviteUrl = await this.sendInvite(user, me);
      }
    }

    const roleLabel = customRoleName || ROLE_WORD[user.role] || user.role;
    await this.audit.record({
      actor: me,
      action: existing ? 'user.update' : 'user.create',
      entityType: 'User',
      entityId: user.id,
      summary: existing
        ? `Assigned role ${roleLabel} to ${user.name}${credentialsEmailed ? ' and emailed credentials' : ''}`
        : `Assigned ${user.name} to ${roleLabel}${!body.canSignIn ? ', no sign-in' : body.password ? (credentialsEmailed ? ' with password and emailed credentials' : ' with password set') : ' and sent an invitation'}`,
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
    const accessFields = ['role', 'customRoleKey', 'status', 'canSignIn', 'signInFrom', 'signInUntil', 'accessExpiresAt', 'grants', 'revokes'] as const;
    if (self && accessFields.some((k) => body[k] !== undefined && JSON.stringify(body[k]) !== JSON.stringify(k === 'accessExpiresAt' ? (before.accessExpiresAt?.toISOString() ?? null) : before[k]))) {
      throw badRequest('Ask another owner to change your own access');
    }
    // Never leave the hotel without an owner who can get in.
    const losesOwner = before.role === 'OWNER' && ((body.role && body.role !== 'OWNER') || body.customRoleKey || body.status === 'DISABLED' || body.canSignIn === false || body.accessExpiresAt);
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

    const { password, sendCredentials, customRoleKey, ...restBody } = body;
    const passwordHash = password ? await argon2.hash(password, ARGON_OPTS) : undefined;

    let customRoleUpdate: { customRoleKey?: string | null; customRoleName?: string | null } = {};
    if (customRoleKey !== undefined) {
      if (customRoleKey) {
        const def = await this.prisma.roleDefinition.findUnique({ where: { key: customRoleKey } });
        if (def && !def.isSystem) {
          customRoleUpdate = { customRoleKey: def.key, customRoleName: def.name };
          restBody.role = def.baseRole;
        } else {
          customRoleUpdate = { customRoleKey: null, customRoleName: null };
        }
      } else {
        customRoleUpdate = { customRoleKey: null, customRoleName: null };
      }
    } else if (restBody.role && restBody.role !== before.role) {
      customRoleUpdate = { customRoleKey: null, customRoleName: null };
    }

    const data = {
      ...restBody,
      ...customRoleUpdate,
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
    const beforeRoleLabel = before.customRoleName || ROLE_WORD[before.role] || before.role;
    const afterRoleLabel = user.customRoleName || ROLE_WORD[user.role] || user.role;
    const bits = [
      beforeRoleLabel !== afterRoleLabel ? `role ${beforeRoleLabel} → ${afterRoleLabel}` : '',
      added.length ? `can now: ${added.join(', ')}` : '',
      removed.length ? `no longer: ${removed.join(', ')}` : '',
      body.canSignIn !== undefined && body.canSignIn !== before.canSignIn ? (body.canSignIn ? 'may sign in' : 'no sign-in') : '',
      body.status && body.status !== before.status ? body.status.toLowerCase() : '',
      body.signInFrom !== undefined && body.signInFrom !== before.signInFrom ? (body.signInFrom ? `hours ${body.signInFrom}–${body.signInUntil}` : 'any hour') : '',
      body.accessExpiresAt !== undefined ? (body.accessExpiresAt ? `access ends ${body.accessExpiresAt.slice(0, 10)}` : 'no end date') : '',
      password ? (sendCredentials && user.email ? `password set & emailed to ${user.email}` : 'password set') : '',
    ].filter(Boolean);
    await this.audit.record({ actor: me, action: 'user.update', entityType: 'User', entityId: id, summary: `${user.name}: ${bits.join('; ') || 'details updated'}`, before: { role: before.role, customRoleKey: before.customRoleKey, grants: before.grants, revokes: before.revokes, status: before.status }, after: restBody, req });
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

  /** Delete staff account. Only available to the owner. */
  @Delete(':id')
  @HttpCode(200)
  @Requires('users:manage')
  async deleteUser(@Param('id') id: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    if (me.role !== 'OWNER') throw forbidden('Only the hotel owner can delete staff accounts');
    if (me.id === id) throw forbidden('You cannot delete your own owner account');

    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound('User');

    // Revoke all active sessions
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });

    // Soft delete user record & rename email tombstone to free up email address for future use
    const tombstoneEmail = user.email ? `deleted_${Date.now()}_${user.email}` : null;
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DISABLED',
        canSignIn: false,
        email: tombstoneEmail,
      },
    });

    // Also terminate linked StaffProfile if one exists
    await this.prisma.staffProfile.updateMany({
      where: { userId: id },
      data: { status: 'TERMINATED' },
    });

    await this.audit.record({
      actor: me,
      action: 'user.delete',
      entityType: 'User',
      entityId: id,
      summary: `Permanently deleted user ${user.name} (${user.email || 'no email'})`,
      req,
    });

    return { ok: true, deleted: true };
  }
}
