import { Injectable, Logger } from '@nestjs/common';
import type {
  ConciergeCardDTO,
  ConciergeChatInput,
  ConciergeChatResponseDTO,
  ConciergeMessageDTO,
} from '@reberon/contracts';
import { DeepSeekChatMessage, DeepSeekClient } from './deepseek.client.js';
import { ConciergeToolsService } from './concierge-tools.service.js';

interface SessionState {
  id: string;
  messages: DeepSeekChatMessage[];
  dtoMessages: ConciergeMessageDTO[];
  lastActive: number;
}

@Injectable()
export class ConciergeService {
  private readonly log = new Logger('ConciergeService');
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly deepseek: DeepSeekClient,
    private readonly tools: ConciergeToolsService,
  ) {
    // Periodic session cleanup for sessions older than 4 hours
    setInterval(() => {
      const now = Date.now();
      for (const [key, session] of this.sessions.entries()) {
        if (now - session.lastActive > 4 * 60 * 60 * 1000) {
          this.sessions.delete(key);
        }
      }
    }, 15 * 60 * 1000).unref();
  }

  private getOrCreateSession(sessionId: string): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        messages: [],
        dtoMessages: [],
        lastActive: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }
    session.lastActive = Date.now();
    return session;
  }

  private buildSystemPrompt(extraNotes = ''): string {
    return [
      `You are "Sipi Concierge", the autonomous, intelligent AI host and digital concierge for Reberon Hotel in Kapchorwa, Uganda.`,
      `The sanctuary sits at 1,900 metres elevation on the northern shoulder of Mount Elgon, looking out over green escarpment valleys and Arabica coffee farms.`,
      ``,
      `### Tone & Personality:`,
      `- Dignified, warm, honest, observant, concise. You speak with high-altitude serenity.`,
      `- Never fabricate nonexistent rooms, fake pricing, or exaggerated road times. The drive from Kampala takes 6 to 7 hours; nights at 1,900 m are cold (12–14°C), so always suggest guests pack a warm fleece.`,
      `- We have ten exclusive suites facing the sunrise and valley, an athletic health club & gym, a slow-food highland restaurant (fresh trout & local coffee), 24/7 solar hot water, and The Hall.`,
      ``,
      `### Autonomous Agent Capabilities:`,
      `- You have direct access to tools to check live room availability, calculate quotes, hold reservations, register guests on the VIP waitlist, inspect facilities, share trekking intelligence, and hand over to human staff.`,
      `- When a guest mentions dates or asking about rooms, invoke "check_room_availability".`,
      `- When a guest asks about a specific suite or wants specifications, invoke "get_room_details".`,
      `- When a guest wants price totals, invoke "calculate_quote".`,
      `- When a guest wants to hold a booking and provides their name and phone, invoke "create_booking_hold".`,
      `- When dates are in 2027 opening season or sold out, invoke "claim_priority_waitlist".`,
      `- When a guest asks about the gym, dining, or hall, invoke "get_hotel_facilities".`,
      `- When a guest asks about hiking Sipi Falls or Mount Elgon, invoke "get_local_activities".`,
      `- When a guest asks for directions or packing advice, invoke "get_weather_and_directions".`,
      `- If a guest wants direct phone or WhatsApp assistance, invoke "human_handover".`,
      ``,
      `### Format:`,
      `- Reply with structured, crisp Markdown. Keep your prose elegant and readable.`,
      extraNotes ? `\nManagement Notes:\n${extraNotes}` : '',
    ].join('\n');
  }

  async chat(input: ConciergeChatInput): Promise<ConciergeChatResponseDTO> {
    const session = this.getOrCreateSession(input.sessionId);
    const config = await this.deepseek.getConfig();

    // Context metadata injection for personalized response
    let guestContext = '';
    if (input.guestName || input.phone || input.email) {
      guestContext = ` [Guest profile: ${input.guestName || 'Friend'}, Phone: ${input.phone || 'N/A'}, Email: ${input.email || 'N/A'}]`;
    }

    const userMessageContent = input.message + (guestContext && !session.messages.length ? guestContext : '');
    const userMsg: DeepSeekChatMessage = { role: 'user', content: userMessageContent };
    session.messages.push(userMsg);

    const userDtoMsg: ConciergeMessageDTO = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: input.message,
      createdAt: new Date().toISOString(),
    };
    session.dtoMessages.push(userDtoMsg);

    const systemPrompt = this.buildSystemPrompt(config.systemPromptExtra);
    const activeMessages: DeepSeekChatMessage[] = [{ role: 'system', content: systemPrompt }, ...session.messages];

    const cards: ConciergeCardDTO[] = [];
    let iterations = 0;
    const maxIterations = 4;
    let finalAssistantReply = '';

    while (iterations < maxIterations) {
      iterations++;
      const response = await this.deepseek.completeChat({
        messages: activeMessages,
        tools: this.tools.getToolDefinitions(),
        tool_choice: 'auto',
      });

      if (response.tool_calls && response.tool_calls.length > 0) {
        // Record assistant tool calls in conversation history
        const assistantMsg: DeepSeekChatMessage = {
          role: 'assistant',
          content: response.content,
          tool_calls: response.tool_calls,
        };
        activeMessages.push(assistantMsg);
        session.messages.push(assistantMsg);

        // Execute each tool
        for (const tc of response.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }

          const result = await this.tools.executeTool({
            id: tc.id,
            name: tc.function.name,
            args,
          });

          if (result.card) {
            cards.push(result.card);
          }

          const toolMsg: DeepSeekChatMessage = {
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: result.output,
          };
          activeMessages.push(toolMsg);
          session.messages.push(toolMsg);
        }
      } else {
        // Final text response reached
        finalAssistantReply =
          response.content ||
          "I am here at Reberon Hotel to assist you. How can I guide your journey to Mount Elgon today?";
        break;
      }
    }

    if (!finalAssistantReply) {
      finalAssistantReply =
        "I have processed your request with the hotel systems. Let me know if you would like me to confirm dates, calculate rates, or connect you with the concierge.";
    }

    const assistantDtoMsg: ConciergeMessageDTO = {
      id: `ast-${Date.now()}`,
      role: 'assistant',
      content: finalAssistantReply,
      cards: cards.length > 0 ? cards : undefined,
      createdAt: new Date().toISOString(),
    };
    session.dtoMessages.push(assistantDtoMsg);

    // Derive smart suggested action pills based on cards & context
    const suggestedActions = this.deriveSuggestedActions(cards, finalAssistantReply);

    return {
      sessionId: input.sessionId,
      reply: finalAssistantReply,
      messages: session.dtoMessages,
      cards: cards.length > 0 ? cards : undefined,
      suggestedActions,
    };
  }

  private deriveSuggestedActions(cards: ConciergeCardDTO[], reply: string): string[] {
    const actions = new Set<string>();

    const hasRoom = cards.some((c) => c.type === 'room');
    const hasQuote = cards.some((c) => c.type === 'quote');
    const hasRes = cards.some((c) => c.type === 'reservation');

    if (hasRoom && !hasQuote) {
      actions.add('Calculate quote for 2 nights');
      actions.add('Tell me about room amenities');
    }
    if (hasQuote && !hasRes) {
      actions.add('Hold this reservation for me');
      actions.add('Ask about payment options');
    }
    if (hasRes) {
      actions.add('What should I pack for the weather?');
      actions.add('How do I drive from Kampala?');
    }

    if (reply.toLowerCase().includes('waitlist')) {
      actions.add('Claim a first stay on waitlist');
    }

    if (!actions.size) {
      actions.add('Check room rates & availability');
      actions.add('Explore Sipi Falls hiking');
      actions.add('High-altitude athletic gym');
      actions.add('Chat with human host on WhatsApp');
    }

    return Array.from(actions).slice(0, 4);
  }

  getSessionHistory(sessionId: string): ConciergeMessageDTO[] {
    return this.sessions.get(sessionId)?.dtoMessages ?? [];
  }

  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}
