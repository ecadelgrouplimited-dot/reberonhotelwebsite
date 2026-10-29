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
    const today = new Date().toISOString().slice(0, 10);
    return [
      `You are "Sipi Concierge", the autonomous, intelligent highland AI host for Reberon Hotel in Kapchorwa, Uganda. Today's date is ${today}.`,
      `The sanctuary sits at 1,900 metres elevation on the northern shoulder of Mount Elgon, looking out over green escarpment valleys and Arabica coffee farms.`,
      ``,
      `### Tone & Identity:`,
      `- Dignified, warm, observant, concise. You speak with high-altitude mountain serenity.`,
      `- Rebranding & Identity: Under no circumstances mention "DeepSeek" or third-party AI labs. You are Sipi Concierge, the autonomous hospitality host engineered for Reberon Hotel.`,
      `- Honesty: Never fabricate nonexistent rooms or rates. Nights at 1,900 m are cold (12–14°C), so remind guests to bring a fleece.`,
      ``,
      `### Deep Links & Formatting:`,
      `- Include exact deep links in your text when discussing suites, facilities, or experiences:`,
      `  • Suites: [Elgon View King](/rooms/elgon-view-king), [Sipi Twin](/rooms/sipi-twin), [Coffee Terrace Family](/rooms/coffee-terrace-family), [Summit Suite](/rooms/summit-suite)`,
      `  • Facilities: [High-Altitude Athletic Gym](/facilities/gym), [Highland Restaurant & Coffee Terrace](/facilities/restaurant), [The Hall](/facilities/hall)`,
      `  • Activities & Hikes: [Sipi Falls Trail Guide](/kapchorwa/sipi-falls), [Mount Elgon Trekking](/kapchorwa/mount-elgon), [Origin Arabica Coffee](/kapchorwa/kapchorwa-coffee), [Escarpment Drive](/kapchorwa/the-road)`,
      `- When presenting tabular comparisons, format clean Markdown tables with headers:`,
      `  | Suite | Sleeps | Mountain Aspect | Rate |`,
      `  | :--- | :--- | :--- | :--- |`,
      `  | [Elgon View King](/rooms/elgon-view-king) | 2 Guests | Sunrise Escarpment | 250,000 UGX ($70) |`,
      ``,
      `### Follow-Up Question Chips:`,
      `- Whenever you ask the guest a question or offer choices (dates, suites, activities), append a JSON follow-up block at the very end of your response:`,
      `  <!--FOLLOW_UPS: ["📅 Upcoming Weekend", "📅 Next Month (3 Nights)", "🏔️ Elgon View King", "🥾 Sipi Falls Trail Guide"]-->`,
      `  Keep chips under 30 characters each so the guest can tap instead of typing.`,
      ``,
      `### Autonomous Agent Capabilities:`,
      `- Check live availability & pricing: invoke "check_room_availability".`,
      `- Inspect room specifications: invoke "get_room_details".`,
      `- Calculate stay quotes: invoke "calculate_quote".`,
      `- Place complimentary 48h holds: invoke "create_booking_hold".`,
      `- Register for 2027 priority first-stay list: invoke "claim_priority_waitlist".`,
      `- Inquire on gym, dining, hall: invoke "get_hotel_facilities".`,
      `- Plan Sipi Falls hikes & mountain treks: invoke "get_local_activities".`,
      `- Road directions & weather: invoke "get_weather_and_directions".`,
      `- WhatsApp handover: invoke "human_handover".`,
      ``,
      `### Placing Holds & Bookings Agentically:`,
      `- When a guest provides their name and dates (and suite preference), invoke "create_booking_hold" to reserve and confirm their hold in the Reberon PMS engine.`,
      `- If they provide a phone number and email, pass them to "create_booking_hold". If email is not given, still place the hold with their phone number.`,
      `- In your reply, confirm that their reservation is secured in the Reberon PMS, front desk management (Denis Mayamba and staff) have been notified, and direct them to their official stay receipt and tax invoice link.`,
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

    // Extract dynamic follow-up choices if provided in HTML comment tag
    let followUpQuestions: string[] = [];
    const followUpMatch = finalAssistantReply.match(/<!--FOLLOW_UPS:\s*(\[.*?\])\s*-->/s);
    if (followUpMatch) {
      try {
        followUpQuestions = JSON.parse(followUpMatch[1] || '[]');
        finalAssistantReply = finalAssistantReply.replace(followUpMatch[0], '').trim();
      } catch {}
    }

    if (!followUpQuestions.length) {
      followUpQuestions = this.deriveFollowUpQuestions(cards, finalAssistantReply);
    }

    const assistantDtoMsg: ConciergeMessageDTO = {
      id: `ast-${Date.now()}`,
      role: 'assistant',
      content: finalAssistantReply,
      cards: cards.length > 0 ? cards : undefined,
      followUpQuestions: followUpQuestions.length > 0 ? followUpQuestions : undefined,
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
      followUpQuestions: followUpQuestions.length > 0 ? followUpQuestions : undefined,
    };
  }

  private deriveFollowUpQuestions(cards: ConciergeCardDTO[], reply: string): string[] {
    const questions: string[] = [];
    const lower = reply.toLowerCase();

    if (lower.includes('date') || lower.includes('check-in') || lower.includes('weekend')) {
      const today = new Date();
      const nextFri = new Date();
      const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7;
      nextFri.setDate(today.getDate() + daysUntilFri);
      const nextSun = new Date(nextFri);
      nextSun.setDate(nextFri.getDate() + 2);

      const f1 = nextFri.toISOString().slice(0, 10);
      const f2 = nextSun.toISOString().slice(0, 10);

      questions.push(`📅 This Weekend (${f1})`);
      questions.push(`📅 Next Weekend (2 nights)`);
      questions.push(`📅 3 Nights Next Month`);
    }

    if (cards.some((c) => c.type === 'room')) {
      questions.push('💰 Calculate Quote for 2 Nights');
      questions.push('🔒 Place 48h Complimentary Hold');
    }

    if (lower.includes('sipi') || lower.includes('hike') || lower.includes('fall')) {
      questions.push('🥾 Sipi Falls Trail Guide');
      questions.push('☕ Mount Elgon Coffee Tour');
    }

    if (lower.includes('gym') || lower.includes('athletic')) {
      questions.push('🏋️ High-Altitude Club Hours');
      questions.push('🏃 Highland Running Trails');
    }

    if (!questions.length) {
      questions.push('🏔️ Available Suites & Rates');
      questions.push('🥾 Sipi Falls Hiking Guide');
      questions.push('☕ Highland Dining & Coffee');
      questions.push('🚗 Driving Directions from Kampala');
    }

    return questions.slice(0, 4);
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
