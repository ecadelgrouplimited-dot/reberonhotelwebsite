import { Injectable, Logger } from '@nestjs/common';
import { IntegrationsService } from '../integrations/integrations.service.js';

export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
}

export interface DeepSeekToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface DeepSeekChatResponse {
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class DeepSeekClient {
  private readonly log = new Logger('DeepSeekClient');

  constructor(private readonly integrations: IntegrationsService) {}

  async isConfigured(): Promise<boolean> {
    const config = await this.integrations.get('DEEPSEEK');
    return Boolean(config?.values?.apiKey || process.env.DEEPSEEK_API_KEY);
  }

  async getConfig(): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    systemPromptExtra: string;
  }> {
    const integration = await this.integrations.get('DEEPSEEK');
    const values = integration?.values ?? {};

    const apiKey = values.apiKey || process.env.DEEPSEEK_API_KEY || '';
    const baseUrl = (values.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    const model = values.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const temperature = Number(values.temperature || process.env.DEEPSEEK_TEMPERATURE || 0.3);
    const systemPromptExtra = values.systemPromptExtra || process.env.DEEPSEEK_SYSTEM_PROMPT_EXTRA || '';

    return { apiKey, baseUrl, model, temperature, systemPromptExtra };
  }

  async completeChat(opts: {
    messages: DeepSeekChatMessage[];
    tools?: DeepSeekToolDefinition[];
    tool_choice?: 'auto' | 'none';
    temperature?: number;
  }): Promise<DeepSeekChatResponse> {
    const { apiKey, baseUrl, model, temperature: defaultTemp } = await this.getConfig();

    if (!apiKey) {
      this.log.warn('DeepSeek API key is not configured in Settings → Integrations or environment.');
      return {
        content:
          "Hello! I am Sipi Concierge. The DeepSeek API is currently being configured by the hotel management. You can explore our rooms and facilities, or speak directly to our human concierge on WhatsApp at +256 760 512 691.",
        model: 'unconfigured-fallback',
      };
    }

    const payload: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? defaultTemp,
    };

    if (opts.tools && opts.tools.length > 0) {
      payload.tools = opts.tools;
      payload.tool_choice = opts.tool_choice ?? 'auto';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const endpoint = `${baseUrl}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.log.error(`DeepSeek API error ${res.status}: ${errorText}`);
        throw new Error(`DeepSeek error (${res.status}): ${errorText.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
          };
        }[];
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model?: string;
      };

      const choice = json.choices?.[0]?.message;
      return {
        content: choice?.content ?? null,
        tool_calls: choice?.tool_calls,
        model: json.model ?? model,
        usage: json.usage,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('DeepSeek API request timed out after 45s');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
