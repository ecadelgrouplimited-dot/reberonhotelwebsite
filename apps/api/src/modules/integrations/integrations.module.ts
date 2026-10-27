import { Body, Controller, Get, Global, HttpCode, Module, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { INTEGRATION_KINDS, zIntegrationInput, type IntegrationKind } from '@reberon/contracts';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { notFound } from '../../common/errors.js';
import { IntegrationsService } from './integrations.service.js';

const kindOf = (k: string) => {
  if (!(INTEGRATION_KINDS as readonly string[]).includes(k)) throw notFound('Integration');
  return k as IntegrationKind;
};

/** Owner only: the keys to the payment and messaging providers. */
@Controller('v1/admin/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @Requires('vault:manage')
  list() {
    return this.integrations.list();
  }

  @Put(':kind')
  @Requires('vault:manage')
  update(@Param('kind') kind: string, @Body(new ZodPipe(zIntegrationInput)) body: z.infer<typeof zIntegrationInput>, @CurrentUser() user: AuthUser) {
    return this.integrations.update(kindOf(kind), body, user);
  }

  @Post(':kind/test')
  @HttpCode(200)
  @Requires('vault:manage')
  test(@Param('kind') kind: string, @CurrentUser() user: AuthUser) {
    return this.integrations.test(kindOf(kind), user);
  }

  @Post('SMTP/test-email')
  @HttpCode(200)
  @Requires('vault:manage')
  testEmail(@Body(new ZodPipe(z.object({ to: z.string().trim().email() }))) body: { to: string }, @CurrentUser() user: AuthUser) {
    return this.integrations.sendTestEmail(body.to, user);
  }
}

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
