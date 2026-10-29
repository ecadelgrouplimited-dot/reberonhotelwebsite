import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  zConciergeChatInput,
  type ConciergeChatInput,
  type ConciergeChatResponseDTO,
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
    const config = await this.deepseek.getConfig();
    return {
      name: 'Sipi Concierge',
      title: 'Highland Sanctuary AI Host',
      elevation: '1,900 m ASL',
      configured: isConfigured,
      engine: 'Sipi Concierge Intelligence',
    };
  }

  @Post('chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(
    @Body(new ZodPipe(zConciergeChatInput)) body: ConciergeChatInput,
  ): Promise<ConciergeChatResponseDTO> {
    return this.concierge.chat(body);
  }

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const messages = this.concierge.getSessionHistory(sessionId);
    return { sessionId, messages };
  }

  @Delete('session/:sessionId')
  @HttpCode(200)
  async deleteSession(@Param('sessionId') sessionId: string) {
    const success = this.concierge.clearSession(sessionId);
    return { ok: success };
  }
}
