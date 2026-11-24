import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { zLoginInput, zForgotInput, zResetInput, zAcceptInviteInput, zChangePasswordInput, zHousePrefs, zSetPinInput, zUnlockInput, zForgetTerminalInput, zPinCheckInput, zPinResetInput, zPinForgotInput } from '@reberon/contracts';
import type { z } from 'zod';
import { PrismaService } from '../../common/prisma.service.js';
import { CurrentUser, Public, REFRESH_COOKIE, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { badRequest } from '../../common/errors.js';
import { AuthService } from './auth.service.js';

@Controller('v1/admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 15 * 60_000 } })
  login(@Body(new ZodPipe(zLoginInput)) body: z.infer<typeof zLoginInput>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(body.email, body.password, req, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Public()
  @Post('forgot')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  async forgot(@Body(new ZodPipe(zForgotInput)) body: z.infer<typeof zForgotInput>, @Req() req: Request) {
    await this.auth.forgot(body.email, req);
    return { ok: true };
  }

  @Public()
  @Post('reset')
  @HttpCode(200)
  async reset(@Body(new ZodPipe(zResetInput)) body: z.infer<typeof zResetInput>, @Req() req: Request) {
    await this.auth.consumeToken(body.token, 'PASSWORD_RESET', body.password, req);
    return { ok: true };
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(@Body(new ZodPipe(zAcceptInviteInput)) body: z.infer<typeof zAcceptInviteInput>, @Req() req: Request) {
    await this.auth.consumeToken(body.token, 'INVITE', body.password, req);
    return { ok: true };
  }

  /** Shared terminals: who can come back on this device with a PIN. */
  @Public()
  @Get('terminal')
  terminal(@Req() req: Request) {
    return this.auth.terminalPeople(req);
  }

  @Public()
  @Post('unlock')
  @HttpCode(200)
  @Throttle({ default: { limit: 12, ttl: 15 * 60_000 } })
  unlock(@Body(new ZodPipe(zUnlockInput)) body: z.infer<typeof zUnlockInput>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.unlock(body, req, res);
  }

  @Public()
  @Post('terminal/forget')
  @HttpCode(204)
  async forget(@Body(new ZodPipe(zForgetTerminalInput)) body: z.infer<typeof zForgetTerminalInput>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.forgetOnTerminal(body.userId, req, res);
  }

  @Post('lock')
  @HttpCode(204)
  async lock(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.lock(user, req, res);
  }

  @Put('me/pin')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 15 * 60_000 } })
  async setPin(@Body(new ZodPipe(zSetPinInput)) body: z.infer<typeof zSetPinInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.auth.setPin(user.id, body.password, body.pin, req);
    return { ok: true };
  }

  /** Live check while choosing a PIN (signed in). */
  @Post('me/pin/check')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 15 * 60_000 } })
  checkPin(@Body(new ZodPipe(zPinCheckInput)) body: z.infer<typeof zPinCheckInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.checkPin(user.id, body.pin, req);
  }

  /** "Forgot PIN?" on a lock screen: emails a reset link to the person's own address. */
  @Public()
  @Post('pin/forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  forgotPin(@Body(new ZodPipe(zPinForgotInput)) body: z.infer<typeof zPinForgotInput>, @Req() req: Request) {
    return this.auth.forgotPin(body.userId, req);
  }

  @Public()
  @Get('pin/reset')
  pinResetInfo(@Query('token') token: string) {
    if (!token || token.length < 20 || token.length > 200) throw badRequest('This link is not complete.');
    return this.auth.pinResetInfo(token);
  }

  @Public()
  @Post('pin/check')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 15 * 60_000 } })
  checkPinWithToken(@Body(new ZodPipe(zPinCheckInput)) body: z.infer<typeof zPinCheckInput>, @Req() req: Request) {
    if (!body.token) throw badRequest('This link is not complete.');
    return this.auth.checkPinWithToken(body.token, body.pin, req);
  }

  @Public()
  @Post('pin/reset')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  async resetPin(@Body(new ZodPipe(zPinResetInput)) body: z.infer<typeof zPinResetInput>, @Req() req: Request) {
    await this.auth.resetPin(body.token, body.pin, req);
    return { ok: true };
  }

  @Delete('me/pin')
  @HttpCode(204)
  async removePin(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.auth.removePin(user.id, req);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.auth.me(u);
  }

  /** Each person edits only their own layout; no permission needed beyond being signed in. */
  @Patch('me/preferences')
  async savePreferences(@Body(new ZodPipe(zHousePrefs)) body: z.infer<typeof zHousePrefs>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.savePreferences(user.id, body, req);
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(@Body(new ZodPipe(zChangePasswordInput)) body: z.infer<typeof zChangePasswordInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword, req);
    return { ok: true };
  }
}
