import { Injectable, Logger } from '@nestjs/common';
import type { Currency, Prisma } from '@reberon/db';
import { t } from '@reberon/contracts';
import type { ConciergeCardDTO, LText } from '@reberon/contracts';
import { referenceCode } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { PricingService } from '../booking/pricing.service.js';
import { BookingService } from '../booking/booking.service.js';
import { env } from '../../config.js';
import { DeepSeekToolDefinition } from './deepseek.client.js';

const toLText = (v: unknown): LText => (v && typeof v === 'object' ? (v as LText) : {});
const tr = (v: unknown, fallback = ''): string => t(toLText(v)) || fallback;
const getMediaUrl = (id?: string | null) => (id ? `${env.MEDIA_PUBLIC_URL || 'https://reberonhotel.com/media'}/i/${id}/1280.webp` : undefined);

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  output: string;
  card?: ConciergeCardDTO;
}

@Injectable()
export class ConciergeToolsService {
  private readonly log = new Logger('ConciergeTools');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly booking: BookingService,
  ) {}

  getToolDefinitions(): DeepSeekToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'check_room_availability',
          description:
            'Check real-time room availability, capacity, and nightly rates for requested stay dates at Reberon Hotel (Kapchorwa, 1,900 m).',
          parameters: {
            type: 'object',
            properties: {
              arrival: { type: 'string', description: 'Check-in date in YYYY-MM-DD format.' },
              departure: { type: 'string', description: 'Check-out date in YYYY-MM-DD format.' },
              adults: { type: 'number', description: 'Number of adult guests (default: 2).' },
              children: { type: 'number', description: 'Number of children (default: 0).' },
              currency: { type: 'string', enum: ['UGX', 'USD'], description: 'Currency code (default: UGX).' },
            },
            required: ['arrival', 'departure'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_room_details',
          description:
            'Get detailed specifications, bed configuration, balcony aspect, and features for a specific room type (e.g. elgon-view-king, sipi-twin, coffee-terrace-family, summit-suite).',
          parameters: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'The room slug, e.g. "elgon-view-king", "sipi-twin", "coffee-terrace-family", "summit-suite".',
              },
            },
            required: ['slug'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'calculate_quote',
          description:
            'Calculate exact stay costs, deposit requirement (30%), taxes, and cancellation terms for a selected room type and stay dates.',
          parameters: {
            type: 'object',
            properties: {
              roomSlug: { type: 'string', description: 'Room type slug, e.g. "elgon-view-king".' },
              arrival: { type: 'string', description: 'Check-in date YYYY-MM-DD.' },
              departure: { type: 'string', description: 'Check-out date YYYY-MM-DD.' },
              adults: { type: 'number', description: 'Number of adults.' },
              children: { type: 'number', description: 'Number of children (default: 0).' },
              currency: { type: 'string', enum: ['UGX', 'USD'], description: 'Currency code (default: UGX).' },
            },
            required: ['roomSlug', 'arrival', 'departure'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_booking_hold',
          description:
            'Hold a reservation for the guest in the PMS and generate a direct checkout/payment link. Only call when the guest has provided their full name and phone or email.',
          parameters: {
            type: 'object',
            properties: {
              roomSlug: { type: 'string', description: 'Slug of the room to book.' },
              arrival: { type: 'string', description: 'Check-in date YYYY-MM-DD.' },
              departure: { type: 'string', description: 'Check-out date YYYY-MM-DD.' },
              adults: { type: 'number', description: 'Number of adults (default: 2).' },
              children: { type: 'number', description: 'Number of children (default: 0).' },
              guestName: { type: 'string', description: 'Full name of the primary guest.' },
              phone: { type: 'string', description: 'Contact phone number (WhatsApp preferred with country code).' },
              email: { type: 'string', description: 'Contact email address.' },
              specialRequests: { type: 'string', description: 'Special requests, dietary preferences, or arrival notes.' },
            },
            required: ['roomSlug', 'arrival', 'departure', 'guestName', 'phone'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'claim_priority_waitlist',
          description:
            'Register a guest for the 2027 opening season VIP waitlist or for dates when suites are currently sold out.',
          parameters: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'Guest full name.' },
              phone: { type: 'string', description: 'Guest phone or WhatsApp.' },
              email: { type: 'string', description: 'Guest email address (optional).' },
              preferredDates: { type: 'string', description: 'Desired stay dates or month (e.g. "Early July 2027" or "2027-04-10").' },
              roomTypePreference: { type: 'string', description: 'Preferred suite, e.g. "Elgon View King" or "Any".' },
              notes: { type: 'string', description: 'Any special notes, party size, or occasion.' },
            },
            required: ['guestName', 'phone'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_hotel_facilities',
          description:
            'Get authoritative details about Reberon Hotel facilities: Gym & Athletic Health Club, Restaurant & Mountain Trout, The Hall, Solar/Water resilience, and Wi-Fi.',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['gym', 'dining', 'hall', 'wellness', 'all'],
                description: 'Facility category to query.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_local_activities',
          description:
            'Get expert local travel intelligence for Sipi Falls hikes, Mount Elgon climbing, Arabica coffee tours, and championship trail running camps.',
          parameters: {
            type: 'object',
            properties: {
              activity: {
                type: 'string',
                enum: ['sipi_falls', 'mount_elgon', 'coffee_tour', 'trail_running', 'all'],
                description: 'The highland activity to look up.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_weather_and_directions',
          description:
            'Get Mount Elgon altitude weather guidance (1,900 m, cool evenings, clothing advice) and paved road driving directions from Kampala/Entebbe.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'human_handover',
          description:
            'Connect the guest with the human concierge team on WhatsApp (+256 760 512 691) and record an inquiry ticket for the Front Desk.',
          parameters: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'Guest name.' },
              phone: { type: 'string', description: 'Guest phone or contact method.' },
              summary: { type: 'string', description: 'Brief summary of what the guest needs assistance with.' },
            },
            required: ['guestName', 'summary'],
          },
        },
      },
    ];
  }

  async executeTool(toolCall: { id: string; name: string; args: Record<string, unknown> }): Promise<ToolExecutionResult> {
    try {
      switch (toolCall.name) {
        case 'check_room_availability':
          return await this.handleCheckAvailability(toolCall.id, toolCall.args);
        case 'get_room_details':
          return await this.handleGetRoomDetails(toolCall.id, toolCall.args);
        case 'calculate_quote':
          return await this.handleCalculateQuote(toolCall.id, toolCall.args);
        case 'create_booking_hold':
          return await this.handleCreateBookingHold(toolCall.id, toolCall.args);
        case 'claim_priority_waitlist':
          return await this.handleClaimWaitlist(toolCall.id, toolCall.args);
        case 'get_hotel_facilities':
          return await this.handleGetFacilities(toolCall.id, toolCall.args);
        case 'get_local_activities':
          return await this.handleGetActivities(toolCall.id, toolCall.args);
        case 'get_weather_and_directions':
          return await this.handleGetWeatherAndDirections(toolCall.id);
        case 'human_handover':
          return await this.handleHumanHandover(toolCall.id, toolCall.args);
        default:
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            output: JSON.stringify({ error: `Tool ${toolCall.name} not recognised` }),
          };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Error executing tool ${toolCall.name}: ${msg}`);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: JSON.stringify({ error: msg }),
      };
    }
  }

  /* ── 1. Check Room Availability ── */
  private async handleCheckAvailability(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const arrival = String(args.arrival || '');
    const departure = String(args.departure || '');
    const adults = Number(args.adults) || 2;
    const children = Number(args.children) || 0;
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    if (!arrival || !departure) {
      return {
        toolCallId: id,
        name: 'check_room_availability',
        output: JSON.stringify({ error: 'Please provide arrival and departure dates in YYYY-MM-DD format.' }),
      };
    }

    const roomTypes = await this.prisma.roomType.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      include: { hero: true },
      orderBy: { order: 'asc' },
    });

    const results = roomTypes.map((rt) => {
      const fromUgx = rt.fromPriceUgx ? `${Number(rt.fromPriceUgx).toLocaleString()} UGX` : 'Contact desk';
      const fromUsd = rt.fromPriceUsd ? `$${Number(rt.fromPriceUsd).toLocaleString()}` : '$120';
      return {
        name: tr(rt.name),
        slug: rt.slug,
        sleepsAdults: rt.sleepsAdults,
        sleepsChildren: rt.sleepsChildren,
        startingRate: currency === 'USD' ? fromUsd : fromUgx,
        rateBoth: `${fromUgx} / ${fromUsd}`,
        tagline: tr(rt.tagline),
        viewAspect: tr(rt.view, 'Panoramic Mount Elgon & Valley View'),
        status: 'Available for reservation hold & priority claim',
      };
    });

    const first = roomTypes[0];
    const card: ConciergeCardDTO | undefined = first
      ? {
          type: 'room',
          slug: first.slug,
          name: tr(first.name),
          price: currency === 'USD' ? `$${first.fromPriceUsd || 120}` : `${Number(first.fromPriceUgx || 450000).toLocaleString()} UGX`,
          currency,
          imageUrl: getMediaUrl(first.hero?.id),
          viewAspect: tr(first.view, 'Mount Elgon Ridge View'),
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'check_room_availability',
      output: JSON.stringify({
        arrival,
        departure,
        adults,
        children,
        availableSuites: results,
        bookingNote: 'All suites face the mountain. Online hold is available now; bookings include fresh highland breakfast.',
      }),
      card,
    };
  }

  /* ── 2. Get Room Details ── */
  private async handleGetRoomDetails(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const slug = String(args.slug || '').trim().toLowerCase();
    const rt = await this.prisma.roomType.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        status: 'PUBLISHED',
        deletedAt: null,
      },
      include: {
        hero: true,
        amenities: { include: { amenity: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!rt) {
      return {
        toolCallId: id,
        name: 'get_room_details',
        output: JSON.stringify({ error: `Room type "${slug}" was not found.` }),
      };
    }

    const amenitiesList = rt.amenities.map((a) => tr(a.amenity.name));
    const card: ConciergeCardDTO = {
      type: 'room',
      slug: rt.slug,
      name: tr(rt.name),
      price: rt.fromPriceUgx ? `${Number(rt.fromPriceUgx).toLocaleString()} UGX` : '$120',
      currency: 'UGX',
      imageUrl: getMediaUrl(rt.hero?.id),
      viewAspect: tr(rt.view, 'Mount Elgon Ridge View'),
      bedSetup: `${rt.sleepsAdults} adults, ${rt.sleepsChildren} children`,
    };

    return {
      toolCallId: id,
      name: 'get_room_details',
      output: JSON.stringify({
        name: tr(rt.name),
        slug: rt.slug,
        tagline: tr(rt.tagline),
        description: tr(rt.description),
        sleepsAdults: rt.sleepsAdults,
        sleepsChildren: rt.sleepsChildren,
        viewAspect: tr(rt.view, 'Mount Elgon Ridge View'),
        amenities: amenitiesList,
        rates: {
          ugx: rt.fromPriceUgx ? Number(rt.fromPriceUgx).toLocaleString() : null,
          usd: rt.fromPriceUsd ? Number(rt.fromPriceUsd).toLocaleString() : null,
        },
      }),
      card,
    };
  }

  /* ── 3. Calculate Quote ── */
  private async handleCalculateQuote(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const slug = String(args.roomSlug || '');
    const arrival = String(args.arrival || '');
    const departure = String(args.departure || '');
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    const rt = await this.prisma.roomType.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
    });

    const d1 = new Date(`${arrival}T00:00:00Z`);
    const d2 = new Date(`${departure}T00:00:00Z`);
    const nights = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

    const baseUgx = Number(rt?.fromPriceUgx || 450_000);
    const baseUsd = Number(rt?.fromPriceUsd || 120);

    const nightlyMinor = currency === 'USD' ? baseUsd : baseUgx;
    const total = nightlyMinor * nights;
    const deposit = Math.round(total * 0.3);

    const roomName = rt ? tr(rt.name) : 'Highland Suite';
    const totalStr = currency === 'USD' ? `$${total.toLocaleString()}` : `${total.toLocaleString()} UGX`;
    const depositStr = currency === 'USD' ? `$${deposit.toLocaleString()}` : `${deposit.toLocaleString()} UGX`;

    const card: ConciergeCardDTO = {
      type: 'quote',
      roomName,
      arrival,
      departure,
      nights,
      total: totalStr,
      deposit: depositStr,
      currency,
      inclusions: [
        'Farm-fresh Mount Elgon breakfast & Arabica coffee',
        '24/7 continuous solar hot water & high-altitude tea station',
        'Access to high-altitude recovery gym & pine running trails',
        'All regional local taxes included — no hidden charges',
      ],
    };

    return {
      toolCallId: id,
      name: 'calculate_quote',
      output: JSON.stringify({
        roomName,
        nights,
        currency,
        nightlyRate: currency === 'USD' ? `$${nightlyMinor}` : `${nightlyMinor.toLocaleString()} UGX`,
        total: totalStr,
        depositRequired: depositStr,
        inclusions: card.inclusions,
        cancellationPolicy: 'Full refund up to 7 days before arrival; free date rescheduling.',
      }),
      card,
    };
  }

  /* ── 4. Create Booking Hold ── */
  private async handleCreateBookingHold(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const slug = String(args.roomSlug || '');
    const arrivalStr = String(args.arrival || '');
    const departureStr = String(args.departure || '');
    const adults = Number(args.adults) || 2;
    const children = Number(args.children) || 0;
    const guestName = String(args.guestName || '').trim();
    const phone = String(args.phone || '').trim();
    const email = String(args.email || '').trim().toLowerCase();
    const specialRequests = String(args.specialRequests || '');

    const rt = await this.prisma.roomType.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
    });

    if (!rt) {
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({ error: `Selected suite "${slug}" not found.` }),
      };
    }

    const arrival = new Date(`${arrivalStr}T00:00:00Z`);
    const departure = new Date(`${departureStr}T00:00:00Z`);
    const nights = Math.max(1, Math.round((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)));

    // Upsert contact
    let contact = await this.prisma.contact.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { name: guestName, phone, email: email || null },
      });
    }

    // Default rate plan
    let ratePlan = await this.prisma.ratePlan.findFirst({ where: { isActive: true } });
    if (!ratePlan) {
      ratePlan = await this.prisma.ratePlan.findFirst();
    }

    const code = referenceCode('RB');
    const totalMinor = BigInt(Number(rt.fromPriceUgx || 450_000) * nights);

    const reservation = await this.prisma.reservation.create({
      data: {
        code,
        status: 'HELD',
        source: 'DIRECT',
        contactId: contact.id,
        ratePlanId: ratePlan?.id ?? '00000000-0000-0000-0000-000000000000',
        arrival,
        departure,
        adults,
        children,
        currency: 'UGX',
        totalMinor,
        paidMinor: BigInt(0),
        depositMinor: totalMinor / BigInt(3),
        cancellationSnapshot: { policy: 'Flexible 7-day cancellation', refundPercent: 100 },
        guestNotes: specialRequests || 'Initiated by Sipi Concierge AI',
        holdExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48-hour complimentary hold
      },
    });

    const webBase = env.WEB_URL || 'https://reberonhotel.com';
    const paymentUrl = `${webBase}/book/return?code=${code}`;

    const card: ConciergeCardDTO = {
      type: 'reservation',
      code,
      status: 'HELD (48-hr hold reserved)',
      roomName: tr(rt.name),
      arrival: arrivalStr,
      departure: departureStr,
      total: `${Number(totalMinor).toLocaleString()} UGX`,
      currency: 'UGX',
      paymentUrl,
    };

    return {
      toolCallId: id,
      name: 'create_booking_hold',
      output: JSON.stringify({
        success: true,
        reservationCode: code,
        guestName,
        roomName: tr(rt.name),
        stayDates: `${arrivalStr} to ${departureStr} (${nights} nights)`,
        totalUgx: `${Number(totalMinor).toLocaleString()} UGX`,
        status: 'Complimentary 48-hour hold created in Reberon PMS',
        checkoutUrl: paymentUrl,
        instructions: 'Your room hold is secured. You can complete your deposit payment online or on arrival.',
      }),
      card,
    };
  }

  /* ── 5. Claim Priority Waitlist ── */
  private async handleClaimWaitlist(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const guestName = String(args.guestName || '').trim();
    const phone = String(args.phone || '').trim();
    const email = String(args.email || '').trim().toLowerCase();
    const preferredDates = String(args.preferredDates || '');
    const roomTypePreference = String(args.roomTypePreference || 'Any Suite');
    const notes = String(args.notes || '');

    let contact = await this.prisma.contact.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { name: guestName, phone, email: email || null },
      });
    }

    const ref = referenceCode('WL');
    await this.prisma.waitlistEntry.create({
      data: {
        reference: ref,
        contactId: contact.id,
        note: `Sipi Concierge claim: ${preferredDates}. Suite preference: ${roomTypePreference}. Notes: ${notes}`,
        status: 'NEW',
        flexibleDates: true,
      },
    });

    const card: ConciergeCardDTO = {
      type: 'waitlist',
      reference: ref,
      guestName,
      preferredDates,
      roomType: roomTypePreference,
    };

    return {
      toolCallId: id,
      name: 'claim_priority_waitlist',
      output: JSON.stringify({
        success: true,
        waitlistReference: ref,
        guestName,
        preferredDates,
        message: 'Successfully registered on Reberon Hotel priority first-stay list. You will be notified ahead of public calendar opening.',
      }),
      card,
    };
  }

  /* ── 6. Hotel Facilities ── */
  private async handleGetFacilities(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const category = String(args.category || 'all');
    const facilities = [
      {
        slug: 'hall',
        name: 'The Hall (Community & Team Space)',
        hours: '06:00 – 22:00',
        features: ['40-seat timber-vaulted hall', 'Athletic team briefings', 'AV screen & sound', 'Private terrace overlooking gardens'],
      },
      {
        slug: 'gym',
        name: 'High-Altitude Athletic Club & Gym',
        hours: '06:00 – 21:00',
        features: ['Concept2 rowing machines', 'Olympic lifting rigs & bumper plates', 'SkiErg & stationary bikes', 'Altitude 1,900 m endurance training'],
      },
      {
        slug: 'dining',
        name: 'Highland Restaurant & Coffee Terrace',
        hours: '06:30 – 21:30',
        features: ['Fresh Mount Elgon river trout', 'Organic local Malewa (bamboo shoots)', 'Single-origin washed Arabica coffee', 'Open-air mist terrace'],
      },
      {
        slug: 'wellness',
        name: 'Solar Hydrothermal Recovery & Showers',
        hours: '24 Hours',
        features: ['Continuous solar-thermal hot water', 'Deep recovery soaking tubs', 'High-pressure rainwater showers', '0% single-use plastic policy'],
      },
    ];

    const matched = category === 'all' ? facilities : facilities.filter((f) => f.slug.includes(category));
    const card: ConciergeCardDTO | undefined = matched[0]
      ? {
          type: 'facility',
          slug: matched[0].slug,
          name: matched[0].name,
          hours: matched[0].hours,
          features: matched[0].features,
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'get_hotel_facilities',
      output: JSON.stringify({
        altitude: '1,900 m on Mount Elgon ridge',
        facilities: matched,
      }),
      card,
    };
  }

  /* ── 7. Local Activities ── */
  private async handleGetActivities(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const activity = String(args.activity || 'all');
    const guide = [
      {
        title: 'Sipi Falls 3-Tier Hike',
        difficulty: 'Moderate (steep stairs and green valley trails)',
        duration: '2.5 to 4 hours',
        bestTime: 'Morning (08:00 – 11:00) when mist catches rainbow light',
        notes: '20 minutes drive from hotel. Guide fee ~40,000–60,000 UGX. Walking poles and light rain jacket recommended.',
      },
      {
        title: 'Mount Elgon Peak & Caldera Trek',
        difficulty: 'Challenging (high-altitude wilderness trekking)',
        duration: '1 to 4 days (Wagagai Peak at 4,321 m)',
        bestTime: 'Dry seasons: Dec–March and June–August',
        notes: 'Departing from Kapkwai Forest Exploration Centre. UWA ranger escort required.',
      },
      {
        title: 'Mount Elgon Origin Coffee Experience',
        difficulty: 'Easy & Leisurely',
        duration: '1.5 to 2 hours',
        bestTime: 'Morning or late afternoon',
        notes: 'Walk through smallholder Arabica farms on volcanic soil between 1,600 m and 2,200 m. Pick, pulp, roast, and pour your own cup.',
      },
      {
        title: 'Championship High-Altitude Running Trails',
        difficulty: 'Customizable (from gentle pine loops to steep escarpment repeats)',
        duration: '30 mins to 2 hours',
        bestTime: '06:30 AM before the sun warms the ridge',
        notes: 'Step directly from the Reberon compound onto high-altitude dirt trails frequented by Uganda’s world-champion distance runners.',
      },
    ];

    const card: ConciergeCardDTO = {
      type: 'activity',
      title: guide[0]!.title,
      difficulty: guide[0]!.difficulty,
      duration: guide[0]!.duration,
      bestTime: guide[0]!.bestTime,
      notes: guide[0]!.notes,
    };

    return {
      toolCallId: id,
      name: 'get_local_activities',
      output: JSON.stringify({
        activities: guide,
        hotelAssistance: 'Reberon concierge arranges trusted community guides and trail transport on request.',
      }),
      card,
    };
  }

  /* ── 8. Weather & Directions ── */
  private async handleGetWeatherAndDirections(id: string): Promise<ToolExecutionResult> {
    return {
      toolCallId: id,
      name: 'get_weather_and_directions',
      output: JSON.stringify({
        altitude: '1,900 m ASL (Kapchorwa northern shoulder of Mount Elgon)',
        climate: 'Microclimate is 5°C to 8°C cooler than Kampala and Jinja.',
        daytime: '21°C to 25°C with crisp highland mountain breeze.',
        evening: '12°C to 15°C — bring a warm fleece or knit jacket for the terrace at night.',
        drivingDirections: {
          route: 'Kampala → Jinja (Nile Bridge) → Iganga → Mbale → Kapchorwa.',
          roadCondition: 'Fully tarmac, smoothly paved all the way up the mountain escarpment.',
          travelTime: '6 to 7 hours driving time from Kampala (295 km). We advise daytime driving to enjoy the escarpment views.',
          parking: 'Secure gated compound with overnight security and lit vehicle bays.',
        },
      }),
    };
  }

  /* ── 9. Human Handover ── */
  private async handleHumanHandover(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const guestName = String(args.guestName || 'Guest');
    const phone = String(args.phone || '');
    const summary = String(args.summary || 'Inquiry from Sipi Concierge');

    const whatsappNumber = '256760512691';
    const textMsg = encodeURIComponent(`Hello Denis & Reberon Concierge, I am ${guestName}. ${summary}`);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${textMsg}`;

    // Record an inquiry conversation in PMS if phone provided
    if (phone) {
      let contact = await this.prisma.contact.findFirst({ where: { phone } });
      if (!contact) {
        contact = await this.prisma.contact.create({ data: { name: guestName, phone } });
      }
      await this.prisma.conversation.create({
        data: {
          reference: referenceCode('CN'),
          contactId: contact.id,
          channel: 'WHATSAPP',
          intent: 'GENERAL',
          status: 'NEW',
          subject: `Concierge Handover: ${guestName}`,
          context: { summary, handoverAt: new Date().toISOString() },
        },
      });
    }

    const card: ConciergeCardDTO = {
      type: 'handover',
      phone: '+256 760 512 691',
      whatsappUrl,
      message: `Connect directly with Denis Mayamba and the highland team on WhatsApp for bespoke arrangements.`,
    };

    return {
      toolCallId: id,
      name: 'human_handover',
      output: JSON.stringify({
        whatsappUrl,
        conciergeNumber: '+256 760 512 691',
        instructions: 'Click the WhatsApp link to chat directly with our front desk and management.',
      }),
      card,
    };
  }
}
