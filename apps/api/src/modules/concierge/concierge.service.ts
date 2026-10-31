import { Injectable, Logger } from '@nestjs/common';
import type {
  ConciergeCardDTO,
  ConciergeChatInput,
  ConciergeChatResponseDTO,
  ConciergeGuestDossierDTO,
  ConciergeGuestIdentityDTO,
  ConciergeIdentifyInput,
  ConciergeMessageDTO,
} from '@reberon/contracts';
import { DeepSeekChatMessage, DeepSeekClient } from './deepseek.client.js';
import { ConciergeToolsService } from './concierge-tools.service.js';

interface SessionState {
  id: string;
  identity?: ConciergeGuestIdentityDTO;
  dossier?: ConciergeGuestDossierDTO;
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
    setInterval(() => {
      const now = Date.now();
      for (const [key, session] of this.sessions.entries()) {
        if (now - session.lastActive > 6 * 60 * 60 * 1000) {
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

  async identifyGuest(input: ConciergeIdentifyInput): Promise<ConciergeGuestDossierDTO> {
    const session = this.getOrCreateSession(input.sessionId);
    const mergedIdentity: ConciergeGuestIdentityDTO = {
      name: input.guestName.trim(),
      phone: input.phone?.trim() || session.identity?.phone,
      email: input.email?.trim() || session.identity?.email,
      bookingCode: input.bookingCode?.trim().toUpperCase() || session.identity?.bookingCode,
      identifiedAt: new Date().toISOString(),
    };

    const dossier = await this.tools.buildGuestDossier(mergedIdentity);
    session.identity = dossier.identity;
    session.dossier = dossier;

    return dossier;
  }

  async getDossier(
    sessionId: string,
    query?: { name?: string; phone?: string; email?: string; code?: string },
  ): Promise<ConciergeGuestDossierDTO | null> {
    const session = this.sessions.get(sessionId);
    if (query?.name || query?.phone || query?.email || query?.code) {
      const identity: ConciergeGuestIdentityDTO = {
        name: query.name || session?.identity?.name || 'Guest',
        phone: query.phone || session?.identity?.phone,
        email: query.email || session?.identity?.email,
        bookingCode: query.code || session?.identity?.bookingCode,
      };
      const dossier = await this.tools.buildGuestDossier(identity);
      if (session) {
        session.identity = dossier.identity;
        session.dossier = dossier;
      }
      return dossier;
    }
    if (session?.identity) {
      session.dossier = await this.tools.buildGuestDossier(session.identity);
      return session.dossier;
    }
    return null;
  }

  private buildSystemPrompt(
    identity?: ConciergeGuestIdentityDTO,
    dossier?: ConciergeGuestDossierDTO,
    extraNotes = '',
  ): string {
    const today = new Date().toISOString().slice(0, 10);
    const guestName = identity?.name || 'Guest';

    let dossierContext = '';
    if (dossier) {
      const resLines = dossier.reservations
        .slice(0, 4)
        .map((r) => `${r.code} (${r.status}: ${r.roomName}, ${r.arrival}→${r.departure}, Total ${r.total}, Balance ${r.balance})`)
        .join(' | ');
      const docLines = dossier.documents
        .slice(0, 5)
        .map((d) => `${d.kind} ${d.number} (${d.amount}, Check: ${d.checkCode})`)
        .join(' | ');
      dossierContext = [
        `### Active Guest Identity & Live PMS Dossier:`,
        `- Speaking with: **${guestName}** (Phone: ${identity?.phone || 'Not provided'}, Email: ${identity?.email || 'Not provided'}, Verified: ${identity?.isVerified ? 'Yes' : 'New Guest'})`,
        `- Active Reservations (${dossier.summary.reservationsCount}): ${resLines || 'None yet'}`,
        `- Official Documents (${dossier.summary.documentsCount}): ${docLines || 'None yet'}`,
        `- Recent System Activities Count: ${dossier.summary.activitiesCount}`,
      ].join('\n');
    }

    return [
      `You are "Sipi Concierge", the autonomous, real-time AI concierge and system operator for Reberon Hotel in Kapchorwa, Uganda (1,900 m ASL on Mount Elgon). Today is ${today}.`,
      ``,
      dossierContext,
      ``,
      `### STRICT STYLE RULES — ACTION-BASED, ZERO "BLUR-BLUR":`,
      `- NO LONG PARAGRAPHS OR FLUFF: Keep text responses ultra-compact (1 to 3 crisp sentences max, or a clean Markdown table/bullet list).`,
      `- LET CARDS DO THE WORK: When you invoke a tool, the UI renders an interactive Action Card with photos, prices, receipts, and buttons. Do NOT repeat everything already on the card in long prose.`,
      `- PERSONALIZED: Address ${guestName} by name naturally. Never ask for their name or phone again if already in their Active Guest Identity.`,
      `- IDENTITY: Never mention "DeepSeek" or external AI vendors. You are Sipi Concierge, built for Reberon Hotel.`,
      ``,
      `### Deep Links & Tables:`,
      `- Suites: [Elgon View King](/rooms/elgon-view-king), [Sipi Twin](/rooms/sipi-twin), [Coffee Terrace Family](/rooms/coffee-terrace-family), [Summit Suite](/rooms/summit-suite)`,
      `- Facilities: [Athletic Gym & Health Club](/facilities/gym), [Highland Restaurant](/facilities/restaurant), [The Hall](/facilities/hall)`,
      `- Hikes: [Sipi Falls](/kapchorwa/sipi-falls), [Mount Elgon](/kapchorwa/mount-elgon), [Arabica Coffee](/kapchorwa/kapchorwa-coffee), [The Road](/kapchorwa/the-road)`,
      ``,
      `### Follow-Up Action Chips (Mandatory on every reply):`,
      `- Append 3–4 short, action-oriented follow-up chips (< 28 chars each) at the very end of your reply:`,
      `  <!--FOLLOW_UPS: ["🧾 My Receipts & Invoices", "📋 My Recent Activity", "🔒 Hold Elgon View King", "🥾 Sipi Falls Guide"]-->`,
      ``,
      `### Full-System Autonomous Tools (Always call the matching tool immediately):`,
      `- "get_my_recent_activity": Check the guest's bookings, POS dining orders, gym check-ins, requests, waitlist, and recent actions across Reberon Hotel.`,
      `- "get_my_receipts_and_invoices": Fetch all official receipts (RCT-...), tax invoices (INV-...), refund notes (RFD-...), and quotations (QUO-...) with printable A4/80mm links.`,
      `- "verify_hotel_document": Verify any receipt, invoice, or quotation by number (RCT-..., INV-..., QUO-...).`,
      `- "lookup_reservation": Check any booking by code (RB-XXXXX), phone, email, or active guest identity.`,
      `- "submit_guest_request": Log a live PMS request for an active stay (LATE_CHECKOUT, GUIDE, TRANSFER, EXTRA, ADD_NIGHT, OTHER).`,
      `- "check_room_availability": Check live suite availability & rates for dates.`,
      `- "get_room_details": Inspect a specific suite's floor plan, photos, and specs.`,
      `- "calculate_quote": Calculate exact stay total & 30% deposit.`,
      `- "create_booking_hold": Lock a complimentary 48-hour reservation hold in the PMS.`,
      `- "request_airport_transfer": Arrange private 4x4 airport/city transfers.`,
      `- "get_dining_and_dietary": Fetch live restaurant POS menu items, Mount Elgon trout & Arabica coffee.`,
      `- "get_hotel_facilities" / "get_local_activities" / "get_weather_and_packing_guide" / "human_handover".`,
      extraNotes ? `\nManagement Notes:\n${extraNotes}` : '',
    ].join('\n');
  }

  async chat(input: ConciergeChatInput): Promise<ConciergeChatResponseDTO> {
    const session = this.getOrCreateSession(input.sessionId);
    const config = await this.deepseek.getConfig();

    // Update or enrich session identity if passed in request or detected in message
    const codeMatch = input.message.match(/\b(RB-[A-Z0-9]{4,8}|(?:RCT|INV|RFD|QUO)-\d{4}-\d{4,6})\b/i);
    const detectedCode = codeMatch ? codeMatch[1]!.toUpperCase() : undefined;

    if (input.guestName || input.phone || input.email || input.bookingCode || detectedCode) {
      session.identity = {
        name: input.guestName || session.identity?.name || 'Guest',
        phone: input.phone || session.identity?.phone,
        email: input.email || session.identity?.email,
        bookingCode: input.bookingCode || detectedCode || session.identity?.bookingCode,
        identifiedAt: session.identity?.identifiedAt || new Date().toISOString(),
      };
      session.dossier = await this.tools.buildGuestDossier(session.identity);
      session.identity = session.dossier.identity;
    }

    const userMsg: DeepSeekChatMessage = { role: 'user', content: input.message };
    session.messages.push(userMsg);

    const userDtoMsg: ConciergeMessageDTO = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: input.message,
      createdAt: new Date().toISOString(),
    };
    session.dtoMessages.push(userDtoMsg);

    const systemPrompt = this.buildSystemPrompt(session.identity, session.dossier, config.systemPromptExtra);
    const activeMessages: DeepSeekChatMessage[] = [{ role: 'system', content: systemPrompt }, ...session.messages];

    const cards: ConciergeCardDTO[] = [];
    let iterations = 0;
    const maxIterations = 4;
    let finalAssistantReply = '';

    const isConfigured = await this.deepseek.isConfigured();

    if (!isConfigured) {
      // Smart deterministic tool execution when LLM key is not configured
      const auto = await this.executeDeterministicIntent(input.message, session.identity);
      if (auto.card) cards.push(auto.card);
      finalAssistantReply = auto.reply;
    } else {
      while (iterations < maxIterations) {
        iterations++;
        const response = await this.deepseek.completeChat({
          messages: activeMessages,
          tools: this.tools.getToolDefinitions(),
          tool_choice: 'auto',
        });

        if (response.tool_calls && response.tool_calls.length > 0) {
          const assistantMsg: DeepSeekChatMessage = {
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls,
          };
          activeMessages.push(assistantMsg);
          session.messages.push(assistantMsg);

          for (const tc of response.tool_calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }

            const result = await this.tools.executeTool(
              {
                id: tc.id,
                name: tc.function.name,
                args,
              },
              session.identity,
            );

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
          finalAssistantReply =
            response.content ||
            `I have updated your request, ${session.identity?.name || 'friend'}. Select an action below to proceed.`;
          break;
        }
      }
    }

    if (!finalAssistantReply) {
      finalAssistantReply = `Your request has been processed with the Reberon PMS, ${session.identity?.name || 'friend'}. Review the action card below.`;
    }

    // Refresh dossier if a booking hold or guest request was created
    if (
      session.identity &&
      cards.some((c) => c.type === 'reservation' || c.type === 'guest_request' || c.type === 'waitlist')
    ) {
      session.dossier = await this.tools.buildGuestDossier(session.identity);
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

    const suggestedActions = this.deriveSuggestedActions(cards, finalAssistantReply);

    return {
      sessionId: input.sessionId,
      reply: finalAssistantReply,
      messages: session.dtoMessages,
      cards: cards.length > 0 ? cards : undefined,
      suggestedActions,
      followUpQuestions: followUpQuestions.length > 0 ? followUpQuestions : undefined,
      identity: session.identity,
      dossier: session.dossier,
    };
  }

  /** Fast deterministic tool router when LLM key is absent or for direct commands */
  private async executeDeterministicIntent(
    msg: string,
    identity?: ConciergeGuestIdentityDTO,
  ): Promise<{ reply: string; card?: ConciergeCardDTO }> {
    const lower = msg.toLowerCase();
    const name = identity?.name || 'Guest';

    if (lower.includes('receipt') || lower.includes('invoice') || lower.includes('document') || lower.includes('bill')) {
      const res = await this.tools.executeTool({ id: 'det-doc', name: 'get_my_receipts_and_invoices', args: {} }, identity);
      const count = res.card && res.card.type === 'documents' ? res.card.documents.length : 0;
      return {
        reply: count
          ? `${name}, I found **${count} official document(s)** (receipts, invoices, or quotations) linked to your profile. Click any document below to view or print in A4 or 80mm thermal format.`
          : `${name}, no issued receipts or invoices were found under your current profile yet. Provide a booking code (\`RB-XXXXX\`) or document number (\`RCT-...\`) to pull it up immediately.`,
        card: res.card,
      };
    }

    if (lower.includes('recent') || lower.includes('activity') || lower.includes('activities') || lower.includes('history') || lower.includes('dossier')) {
      const res = await this.tools.executeTool({ id: 'det-act', name: 'get_my_recent_activity', args: {} }, identity);
      return {
        reply: `Here is your live Reberon Hotel activity ledger, **${name}** — covering your reservations, official documents, POS orders, and concierge requests.`,
        card: res.card,
      };
    }

    if (lower.includes('verify') || /(?:rct|inv|rfd|quo)-\d{4}-\d+/i.test(msg)) {
      const numMatch = msg.match(/((?:RCT|INV|RFD|QUO)-\d{4}-\d+)/i);
      const res = await this.tools.executeTool(
        { id: 'det-ver', name: 'verify_hotel_document', args: { number: numMatch?.[1] || '' } },
        identity,
      );
      return {
        reply: `Document verification result for **${numMatch?.[1]?.toUpperCase() || 'requested document'}**:`,
        card: res.card,
      };
    }

    if (lower.includes('lookup') || lower.includes('check booking') || lower.includes('my booking') || lower.includes('my stay') || /rb-[a-z0-9]{4,8}/i.test(msg)) {
      const codeMatch = msg.match(/(RB-[A-Z0-9]{4,8})/i);
      const res = await this.tools.executeTool(
        { id: 'det-lkp', name: 'lookup_reservation', args: { code: codeMatch?.[1] || identity?.bookingCode } },
        identity,
      );
      return {
        reply: res.card
          ? `${name}, here is your live reservation status and financial summary from the Reberon PMS.`
          : `I could not locate a booking under that reference, ${name}. Share your \`RB-XXXXX\` code or phone number to look it up.`,
        card: res.card,
      };
    }

    if (lower.includes('dining') || lower.includes('trout') || lower.includes('menu') || lower.includes('food') || lower.includes('coffee')) {
      const res = await this.tools.executeTool({ id: 'det-din', name: 'get_dining_and_dietary', args: {} }, identity);
      return {
        reply: `${name}, here are the live Highland Restaurant & Coffee Terrace specials and POS menu highlights:`,
        card: res.card,
      };
    }

    if (lower.includes('transfer') || lower.includes('4x4') || lower.includes('airport') || lower.includes('entebbe')) {
      const res = await this.tools.executeTool(
        { id: 'det-trn', name: 'request_airport_transfer', args: { pickupLocation: 'Entebbe Airport (EBB)' } },
        identity,
      );
      return {
        reply: `${name}, I have prepared your private 4x4 sanctuary transfer details and logged the request for the Front Desk.`,
        card: res.card,
      };
    }

    if (lower.includes('hike') || lower.includes('sipi') || lower.includes('waterfall') || lower.includes('elgon')) {
      const res = await this.tools.executeTool(
        { id: 'det-actv', name: 'get_local_activities', args: { activity: 'sipi_falls' } },
        identity,
      );
      return {
        reply: `${name}, here is the Sipi Falls & Mount Elgon trail guide arranged from our 1,900 m ridge:`,
        card: res.card,
      };
    }

    if (lower.includes('weather') || lower.includes('pack') || lower.includes('direction') || lower.includes('drive')) {
      const res = await this.tools.executeTool({ id: 'det-wth', name: 'get_weather_and_packing_guide', args: {} }, identity);
      return {
        reply: `${name}, here is the 1,900 m altitude weather forecast, packing checklist, and highway status:`,
        card: res.card,
      };
    }

    // Default: check suite availability for upcoming weekend
    const d1 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const res = await this.tools.executeTool(
      { id: 'det-avl', name: 'check_room_availability', args: { arrival: d1, departure: d2 } },
      identity,
    );
    return {
      reply: `${name}, all 4 mountain-facing suites are available for instant 48-hour hold (${d1} → ${d2}). Select a suite or action below:`,
      card: res.card,
    };
  }

  private deriveFollowUpQuestions(cards: ConciergeCardDTO[], reply: string): string[] {
    const questions: string[] = [];
    const lower = reply.toLowerCase();

    if (cards.some((c) => c.type === 'documents' || c.type === 'activity_log')) {
      questions.push('🔍 Lookup My Booking');
      questions.push('🛎️ Request Late Checkout');
      questions.push('🏔️ Book Another Stay');
      questions.push('✅ Verify a Document');
      return questions;
    }

    if (cards.some((c) => c.type === 'lookup' || c.type === 'reservation')) {
      questions.push('🧾 Fetch My Receipts & Invoices');
      questions.push('🛎️ Request Late Checkout');
      questions.push('🚗 Arrange 4x4 Transfer');
      questions.push('🥾 Book Sipi Falls Guide');
      return questions;
    }

    if (cards.some((c) => c.type === 'room')) {
      questions.push('💰 Calculate 2-Night Quote');
      questions.push('🔒 Place 48h Complimentary Hold');
      questions.push('🧾 Check My Receipts');
    }

    if (lower.includes('date') || lower.includes('weekend')) {
      const today = new Date();
      const nextFri = new Date();
      const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7;
      nextFri.setDate(today.getDate() + daysUntilFri);
      const f1 = nextFri.toISOString().slice(0, 10);
      questions.push(`📅 This Weekend (${f1})`);
      questions.push(`📅 Next Weekend (2 Nights)`);
    }

    if (!questions.length) {
      questions.push('📋 My Recent Activity');
      questions.push('🧾 My Receipts & Invoices');
      questions.push('🏔️ Suites & Live Rates');
      questions.push('🥾 Sipi Falls Trail Guide');
    }

    return questions.slice(0, 4);
  }

  private deriveSuggestedActions(cards: ConciergeCardDTO[], _reply: string): string[] {
    const actions = new Set<string>();

    if (cards.some((c) => c.type === 'room')) {
      actions.add('Calculate quote for 2 nights');
      actions.add('Place 48h complimentary hold');
    }
    if (cards.some((c) => c.type === 'quote')) {
      actions.add('Lock 48-hour hold now');
    }
    if (cards.some((c) => c.type === 'reservation' || c.type === 'lookup')) {
      actions.add('Fetch all my receipts & invoices');
      actions.add('Request late check-out');
    }

    actions.add('Check my recent activity');
    actions.add('Fetch my receipts & invoices');
    actions.add('Check suite availability');

    return Array.from(actions).slice(0, 4);
  }

  getSessionHistory(sessionId: string): {
    messages: ConciergeMessageDTO[];
    identity?: ConciergeGuestIdentityDTO;
    dossier?: ConciergeGuestDossierDTO;
  } {
    const s = this.sessions.get(sessionId);
    return {
      messages: s?.dtoMessages ?? [],
      identity: s?.identity,
      dossier: s?.dossier,
    };
  }

  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}
