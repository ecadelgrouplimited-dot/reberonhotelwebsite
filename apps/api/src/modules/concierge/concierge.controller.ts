import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  zConciergeChatInput,
  zConciergeIdentifyInput,
  type ConciergeChatInput,
  type ConciergeChatResponseDTO,
  type ConciergeGuestDossierDTO,
  type ConciergeIdentifyInput,
} from '@reberon/contracts';
import { ZodPipe } from '../../common/zod.pipe.js';
import { ConciergeService } from './concierge.service.js';
import { DeepSeekClient } from './deepseek.client.js';

@Controller('v1/public/concierge')
export class ConciergeController {
  constructor(
    private readonly concierge: ConciergeService,
    private readonly deepseek: DeepSeekClient,
  ) {}

  @Get('status')
  async status() {
    const isConfigured = await this.deepseek.isConfigured();
    return {
      name: 'Sipi Concierge',
      title: 'Highland Sanctuary AI Host',
      elevation: '1,900 m ASL',
      configured: isConfigured,
      engine: 'Sipi Concierge Intelligence',
    };
  }

  @Post('identify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async identify(
    @Body(new ZodPipe(zConciergeIdentifyInput)) body: ConciergeIdentifyInput,
  ): Promise<ConciergeGuestDossierDTO> {
    return this.concierge.identifyGuest(body);
  }

  @Get('dossier/:sessionId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async getDossier(
    @Param('sessionId') sessionId: string,
    @Query('name') name?: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('code') code?: string,
  ) {
    const dossier = await this.concierge.getDossier(sessionId, { name, phone, email, code });
    return { sessionId, dossier };
  }

  @Post('chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 25, ttl: 60_000 } })
  async chat(
    @Body(new ZodPipe(zConciergeChatInput)) body: ConciergeChatInput,
  ): Promise<ConciergeChatResponseDTO> {
    return this.concierge.chat(body);
  }

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const state = this.concierge.getSessionHistory(sessionId);
    return {
      sessionId,
      messages: state.messages,
      identity: state.identity,
      dossier: state.dossier,
    };
  }

  @Delete('session/:sessionId')
  @HttpCode(200)
  async deleteSession(@Param('sessionId') sessionId: string) {
    const success = this.concierge.clearSession(sessionId);
    return { ok: success };
  }
}
