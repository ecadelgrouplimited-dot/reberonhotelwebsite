import { Injectable, Logger } from '@nestjs/common';
import type { Currency, Prisma } from '@reberon/db';
import { t } from '@reberon/contracts';
import type { ConciergeCardDTO, LText, BookingInput } from '@reberon/contracts';
import { referenceCode } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { PricingService } from '../booking/pricing.service.js';
import { BookingService } from '../booking/booking.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { env } from '../../config.js';
import { DeepSeekToolDefinition } from './deepseek.client.js';

const toLText = (v: unknown): LText => (v && typeof v === 'object' ? (v as LText) : {});
const tr = (v: unknown, fallback = ''): string => t(toLText(v)) || fallback;
const getMediaUrl = (id?: string | null) => (id ? `${env.MEDIA_PUBLIC_URL || 'https://reberonhotel.com/media'}/i/${id}/1280.webp` : undefined);

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function roomTypeWhere(raw: string) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { id: '00000000-0000-0000-0000-000000000000' };
  if (isUuid(trimmed)) return { id: trimmed };
  const clean = trimmed.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const prefix = clean.replace(/-suite|-king|-family|-twin/g, '');
  return {
    OR: [
      { slug: clean },
      ...(prefix && prefix.length >= 3 ? [{ slug: { contains: prefix } }] : []),
    ],
  };
}

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
    private readonly notifications: NotificationsService,
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
      {
        type: 'function',
        function: {
          name: 'lookup_reservation',
          description:
            'Look up an existing reservation by code (e.g. RB-XXXXX) or guest contact phone to check live status, room assignments, balance, and printable receipt link.',
          parameters: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Reservation reference code, e.g. "RB-JKHD5" or "RB-XXXXX".' },
              phone: { type: 'string', description: 'Guest contact phone number if code is not remembered.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'request_airport_transfer',
          description:
            'Arrange private 4x4 sanctuary airport transfers between Entebbe International Airport (EBB) or Kampala and Reberon Hotel Kapchorwa.',
          parameters: {
            type: 'object',
            properties: {
              pickupLocation: { type: 'string', description: 'Pickup location (e.g. "Entebbe Airport (EBB)", "Kampala", "Jinja", "Mbale").' },
              date: { type: 'string', description: 'Desired transfer date in YYYY-MM-DD format.' },
              passengers: { type: 'number', description: 'Number of passengers (1-6).' },
              guestName: { type: 'string', description: 'Guest name.' },
              phone: { type: 'string', description: 'Guest WhatsApp or mobile phone.' },
              flightNumber: { type: 'string', description: 'Flight number if arriving at Entebbe Airport.' },
            },
            required: ['pickupLocation', 'guestName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_dining_and_dietary',
          description:
            'Get details on highland dining, Mount Elgon fresh trout, farm-to-table breakfast, Arabica coffee ceremony, and dietary accommodations (vegetarian, vegan, halal).',
          parameters: {
            type: 'object',
            properties: {
              interest: {
                type: 'string',
                enum: ['trout', 'breakfast', 'coffee', 'dietary', 'all'],
                description: 'Dining topic of interest.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_weather_and_packing_guide',
          description:
            'Get Mount Elgon altitude packing recommendations, microclimate advice (1,900 m ASL), daytime vs evening temperatures, and road highway navigation.',
          parameters: {
            type: 'object',
            properties: {
              season: { type: 'string', description: 'Travel month or season.' },
            },
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
        case 'lookup_reservation':
          return await this.handleLookupReservation(toolCall.id, toolCall.args);
        case 'request_airport_transfer':
          return await this.handleRequestTransfer(toolCall.id, toolCall.args);
        case 'get_dining_and_dietary':
          return await this.handleGetDining(toolCall.id, toolCall.args);
        case 'get_weather_and_packing_guide':
          return await this.handleGetWeatherAndPacking(toolCall.id, toolCall.args);
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
          galleryUrls: (first.galleryIds || []).slice(0, 3).map((gid: string) => getMediaUrl(gid)).filter(Boolean) as string[],
          viewAspect: tr(first.view, 'Mount Elgon Ridge View'),
          actionUrl: `/rooms/${first.slug}`,
          actionLabel: `Reserve ${tr(first.name)}`,
          secondaryActionUrl: `/book?room=${first.slug}`,
          secondaryActionLabel: 'Instant 48h Hold',
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
    let rt = await this.prisma.roomType.findFirst({
      where: {
        ...roomTypeWhere(slug),
        status: 'PUBLISHED',
        deletedAt: null,
      },
      include: {
        hero: true,
        amenities: { include: { amenity: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!rt) {
      const allRooms = await this.prisma.roomType.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        include: {
          hero: true,
          amenities: { include: { amenity: true }, orderBy: { order: 'asc' } },
        },
      });
      rt = allRooms.find((r) => r.slug.toLowerCase().includes(slug) || tr(r.name).toLowerCase().includes(slug)) || null;
    }

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
      galleryUrls: (rt.galleryIds || []).slice(0, 3).map((gid: string) => getMediaUrl(gid)).filter(Boolean) as string[],
      viewAspect: tr(rt.view, 'Mount Elgon Ridge View'),
      bedSetup: `${rt.sleepsAdults} adults, ${rt.sleepsChildren} children`,
      actionUrl: `/book?room=${rt.slug}`,
      actionLabel: `Book ${tr(rt.name)}`,
      secondaryActionUrl: `/rooms/${rt.slug}`,
      secondaryActionLabel: 'View Floor Plan & Photos',
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
    const slug = String(args.roomSlug || '').trim();
    const arrival = String(args.arrival || '').trim();
    const departure = String(args.departure || '').trim();
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    let rt = await this.prisma.roomType.findFirst({
      where: {
        ...roomTypeWhere(slug),
        status: 'PUBLISHED',
        deletedAt: null,
      },
    });

    if (!rt) {
      const allRooms = await this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null } });
      rt = allRooms.find((r) => r.slug.toLowerCase().includes(slug.toLowerCase()) || tr(r.name).toLowerCase().includes(slug.toLowerCase())) || null;
    }

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
      actionUrl: `/book?room=${rt?.slug || ''}&arrival=${arrival}&departure=${departure}`,
      actionLabel: 'Hold Suite at This Rate',
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
    const slug = String(args.roomSlug || '').trim();
    const arrivalStr = String(args.arrival || '').trim();
    const departureStr = String(args.departure || '').trim();
    const adults = Math.max(1, Number(args.adults) || 2);
    const children = Math.max(0, Number(args.children) || 0);
    const guestName = String(args.guestName || '').trim() || 'Valued Guest';
    const phone = String(args.phone || '').trim();
    const email = String(args.email || '').trim().toLowerCase();
    const specialRequests = String(args.specialRequests || '');
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    let rt = await this.prisma.roomType.findFirst({
      where: {
        ...roomTypeWhere(slug),
        status: 'PUBLISHED',
        deletedAt: null,
      },
    });

    if (!rt) {
      const allRooms = await this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null } });
      rt = allRooms.find((r) => r.slug.toLowerCase().includes(slug.toLowerCase()) || tr(r.name).toLowerCase().includes(slug.toLowerCase())) || null;
    }

    if (!rt) {
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({ error: `Selected suite "${slug}" not found in hotel catalog.` }),
      };
    }

    let ratePlan = await this.prisma.ratePlan.findFirst({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    if (!ratePlan) {
      ratePlan = await this.prisma.ratePlan.findFirst();
    }
    if (!ratePlan) {
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({ error: 'No active rate plan found in system.' }),
      };
    }

    const guestEmail = email && email.includes('@')
      ? email
      : `${guestName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'guest'}@guest.reberonhotel.com`;
    const guestPhone = phone || '+256760512691';

    try {
      const bookingResult = await this.booking.start({
        arrival: arrivalStr,
        departure: departureStr,
        adults,
        children,
        currency,
        roomTypeId: rt.id,
        ratePlanId: ratePlan.id,
        rooms: 1,
        extras: [],
        payInFull: false,
        payAtPremises: true,
        guest: {
          name: guestName,
          phone: guestPhone,
          email: guestEmail,
        },
        notes: specialRequests
          ? `Sipi Concierge AI Hold: ${specialRequests}`
          : 'Booked via Sipi Concierge AI (48-hr complimentary hold / Pay at premises)',
        consent: true,
      });

      const token = bookingResult.accessToken || this.booking.accessToken(bookingResult.code);
      const webBase = env.WEB_URL || 'https://reberonhotel.com';
      const stayUrl = `${webBase}/stay?code=${bookingResult.code}&t=${encodeURIComponent(token)}`;
      const paymentUrl = `${webBase}/book/return?code=${bookingResult.code}&t=${encodeURIComponent(token)}`;

      // Register unread Conversation in PMS inbox for front desk team (Denis Mayamba)
      try {
        const contact = await this.prisma.contact.findFirst({
          where: { OR: [{ phone: guestPhone }, ...(email ? [{ email }] : [])] },
        });
        if (contact) {
          await this.prisma.conversation.create({
            data: {
              reference: referenceCode('CN'),
              contactId: contact.id,
              channel: 'WEB_FORM',
              intent: 'STAY',
              status: 'NEW',
              subject: `Concierge Agentic Hold: ${guestName} (${bookingResult.code})`,
              context: {
                source: 'Sipi Concierge AI',
                reservationCode: bookingResult.code,
                suite: tr(rt.name),
                arrival: arrivalStr,
                departure: departureStr,
                phone: guestPhone,
                email: email || null,
                notes: specialRequests || null,
              },
            },
          });
        }
      } catch (err) {
        this.log.warn(`Could not create inbox conversation for concierge booking: ${err}`);
      }

      // Send direct staff email notification
      try {
        const staffEmails = ((await this.prisma.setting.findUnique({ where: { key: 'notifications.staffEmails' } }))?.value as string[] | undefined) ?? [];
        for (const staffTo of staffEmails) {
          await this.notifications.email({
            to: staffTo,
            subject: `🤖 Sipi Concierge: Reservation ${bookingResult.code} (${guestName})`,
            heading: `New Concierge Reservation: ${guestName}`,
            paragraphs: [
              `Sipi Concierge completed a confirmed reservation hold for **${guestName}**.`,
              `**Suite**: ${tr(rt.name)} | **Dates**: ${arrivalStr} to ${departureStr} (${adults} adults${children ? `, ${children} children` : ''})`,
              `**Contact**: ${guestPhone} ${email ? `| ${email}` : ''}`,
              specialRequests ? `**Special Requests**: ${specialRequests}` : 'No special requests specified.',
            ],
            facts: [
              ['Reservation Code', bookingResult.code],
              ['Status', 'CONFIRMED (Pay at premises / 48h hold)'],
              ['Suite', tr(rt.name)],
            ],
            action: {
              label: 'View in PMS Admin',
              url: `${env.ADMIN_URL || 'https://reberonhotel.com'}/reservations/${bookingResult.code}`,
            },
          });
        }
      } catch (err) {
        this.log.warn(`Could not send staff notification email: ${err}`);
      }

      // Fetch the created reservation total
      const resRecord = await this.prisma.reservation.findUnique({ where: { code: bookingResult.code } });
      const totalStr = resRecord ? `${Number(resRecord.totalMinor).toLocaleString()} ${resRecord.currency}` : `${currency === 'USD' ? '$' : ''}Confirmed`;

      const card: ConciergeCardDTO = {
        type: 'reservation',
        code: bookingResult.code,
        status: 'CONFIRMED · 48-HR HOLD',
        roomName: tr(rt.name),
        arrival: arrivalStr,
        departure: departureStr,
        total: totalStr,
        currency,
        stayUrl,
        receiptUrl: stayUrl,
        paymentUrl,
        actionUrl: stayUrl,
        actionLabel: 'View & Print Stay Receipt',
        secondaryActionUrl: paymentUrl,
        secondaryActionLabel: 'Pay Deposit Online',
      };

      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({
          success: true,
          reservationCode: bookingResult.code,
          guestName,
          roomName: tr(rt.name),
          stayDates: `${arrivalStr} to ${departureStr}`,
          status: 'Confirmed & held in Reberon PMS',
          stayUrl,
          receiptUrl: stayUrl,
          paymentUrl,
          instructions:
            'Reservation is confirmed and secured in the PMS. The guest can view and print their official stay receipt and tax invoice using the stay link, or pay their deposit online. Staff have been alerted.',
        }),
        card,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to execute booking.start in concierge: ${errMsg}`);
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({
          error: errMsg,
          guestName,
          room: tr(rt.name),
          guidance: 'Inform the guest of the issue or offer an alternative room / dates.',
        }),
      };
    }
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
      actionUrl: '/rising',
      actionLabel: 'Track Sanctuary Rising',
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
    const dbFacilities = await this.prisma.facility.findMany({
      where: { status: { not: 'HIDDEN' }, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    const matched = category === 'all'
      ? dbFacilities
      : dbFacilities.filter((f) => f.slug.toLowerCase().includes(category.toLowerCase()));

    const target = matched[0] || dbFacilities[0];
    const card: ConciergeCardDTO | undefined = target
      ? {
          type: 'facility',
          slug: target.slug,
          name: tr(target.name),
          hours: '06:00 – 22:00',
          imageUrl: getMediaUrl(target.mediaIds?.[0]),
          galleryUrls: (target.mediaIds || []).slice(0, 3).map((mid: string) => getMediaUrl(mid)).filter(Boolean) as string[],
          features: [tr(target.summary) || 'High-altitude mountain facility'],
          actionUrl: `/facilities/${target.slug}`,
          actionLabel: `Explore ${tr(target.name)}`,
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'get_hotel_facilities',
      output: JSON.stringify({
        altitude: '1,900 m on Mount Elgon ridge',
        facilities: dbFacilities.map((f) => ({
          slug: f.slug,
          name: tr(f.name),
          summary: tr(f.summary),
          url: `/facilities/${f.slug}`,
        })),
      }),
      card,
    };
  }

  /* ── 7. Local Activities ── */
  private async handleGetActivities(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const activity = String(args.activity || 'all');
    const dbDestinations = await this.prisma.destination.findMany({
      where: { status: { not: 'HIDDEN' }, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    const targetDest = dbDestinations.find((d) => d.slug.includes(activity)) || dbDestinations[0];

    const card: ConciergeCardDTO | undefined = targetDest
      ? {
          type: 'activity',
          slug: targetDest.slug,
          title: tr(targetDest.name) || 'Sipi Falls Trail Guide',
          difficulty: targetDest.slug === 'mount-elgon' ? 'Challenging (High-Altitude Trek)' : 'Moderate Walk',
          duration: targetDest.slug === 'mount-elgon' ? '1 to 4 days' : '2.5 to 3.5 hours',
          bestTime: 'Morning (08:00 – 11:00)',
          notes: tr(targetDest.tagline) || 'Guided highland trail with local community rangers.',
          imageUrl: getMediaUrl(targetDest.heroMediaId),
          galleryUrls: (targetDest.galleryIds || []).slice(0, 3).map((gid: string) => getMediaUrl(gid)).filter(Boolean) as string[],
          actionUrl: `/kapchorwa/${targetDest.slug}`,
          actionLabel: `Read ${tr(targetDest.name)} Trail Guide`,
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'get_local_activities',
      output: JSON.stringify({
        activities: dbDestinations.map((d) => ({
          slug: d.slug,
          name: tr(d.name),
          tagline: tr(d.tagline),
          url: `/kapchorwa/${d.slug}`,
        })),
        hotelAssistance: 'Reberon concierge arranges trusted community guides and trail transport on request.',
      }),
      card,
    };
  }

  /* ── 8. Weather & Directions ── */
  private async handleGetWeatherAndDirections(id: string): Promise<ToolExecutionResult> {
    const card: ConciergeCardDTO = {
      type: 'activity',
      slug: 'the-road',
      title: 'Scenic Escarpment Drive to Kapchorwa (295 km)',
      difficulty: 'Smooth Tarmac Highway (No 4x4 needed)',
      duration: '6 to 7 hours driving time',
      bestTime: 'Daytime driving for escarpment views',
      notes: 'Route: Kampala → Jinja (Nile Bridge) → Iganga → Mbale → Kapchorwa. Gated compound with overnight security and lit vehicle bays.',
      actionUrl: 'https://maps.google.com/?q=Reberon+Hotel+Kapchorwa',
      actionLabel: 'Open Google Maps Navigation',
    };

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
      card,
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
      actionUrl: whatsappUrl,
      actionLabel: 'Chat with Denis Mayamba',
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

  /* ── 10. Lookup Existing Reservation ── */
  private async handleLookupReservation(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const rawCode = String(args.code || '').trim().toUpperCase();
    const phone = String(args.phone || '').trim();

    let reservation = null;
    if (rawCode) {
      reservation = await this.prisma.reservation.findFirst({
        where: { code: rawCode },
        include: { contact: true, rooms: true, ratePlan: true },
      });
    }
    if (!reservation && phone) {
      reservation = await this.prisma.reservation.findFirst({
        where: { contact: { phone } },
        include: { contact: true, rooms: true, ratePlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!reservation) {
      return {
        toolCallId: id,
        name: 'lookup_reservation',
        output: JSON.stringify({
          found: false,
          message: `No reservation found matching code "${rawCode || phone}". Please verify your code or connect with front desk on WhatsApp.`,
        }),
      };
    }

    const r = reservation;
    const token = this.booking.accessToken(r.code);
    const webBase = env.WEB_URL || 'https://reberonhotel.com';
    const stayUrl = `${webBase}/stay?code=${r.code}&t=${encodeURIComponent(token)}`;
    const balanceMinor = r.totalMinor - r.paidMinor;
    const paymentUrl = balanceMinor > 0n ? `${webBase}/book/return?code=${r.code}&t=${encodeURIComponent(token)}` : undefined;

    const firstRoom = r.rooms[0];
    let roomName = 'Mount Elgon Suite';
    if (firstRoom) {
      const rt = await this.prisma.roomType.findUnique({ where: { id: firstRoom.roomTypeId } });
      if (rt) roomName = tr(rt.name);
    }

    const nights = Math.max(1, Math.round((r.departure.getTime() - r.arrival.getTime()) / (1000 * 60 * 60 * 24)));
    const arrivalStr = r.arrival.toISOString().slice(0, 10);
    const departureStr = r.departure.toISOString().slice(0, 10);

    const card: ConciergeCardDTO = {
      type: 'lookup',
      code: r.code,
      status: r.status,
      guestName: r.contact.name,
      roomName,
      arrival: arrivalStr,
      departure: departureStr,
      nights,
      total: `${Number(r.totalMinor).toLocaleString()} ${r.currency}`,
      paid: `${Number(r.paidMinor).toLocaleString()} ${r.currency}`,
      balance: `${Number(balanceMinor).toLocaleString()} ${r.currency}`,
      currency: r.currency,
      stayUrl,
      receiptUrl: stayUrl,
      paymentUrl,
      actionUrl: stayUrl,
      actionLabel: 'View & Print Official Receipt',
      secondaryActionUrl: paymentUrl,
      secondaryActionLabel: balanceMinor > 0n ? 'Pay Balance Online' : undefined,
    };

    return {
      toolCallId: id,
      name: 'lookup_reservation',
      output: JSON.stringify({
        found: true,
        code: r.code,
        status: r.status,
        guestName: r.contact.name,
        room: roomName,
        dates: `${arrivalStr} to ${departureStr} (${nights} nights)`,
        total: `${Number(r.totalMinor).toLocaleString()} ${r.currency}`,
        paid: `${Number(r.paidMinor).toLocaleString()} ${r.currency}`,
        balanceDue: `${Number(balanceMinor).toLocaleString()} ${r.currency}`,
        stayUrl,
        receiptUrl: stayUrl,
        paymentUrl,
        checkInTime: '14:00',
        checkOutTime: '10:30',
      }),
      card,
    };
  }

  /* ── 11. Request Airport / Sanctuary Transfer ── */
  private async handleRequestTransfer(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const pickupLocation = String(args.pickupLocation || 'Entebbe Airport (EBB)').trim();
    const date = String(args.date || '').trim() || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const passengers = Number(args.passengers) || 2;
    const guestName = String(args.guestName || 'Valued Guest').trim();
    const phone = String(args.phone || '').trim();
    const flightNumber = String(args.flightNumber || '').trim();

    const isMbale = pickupLocation.toLowerCase().includes('mbale');
    const travelTime = isMbale ? '1 hour 15 minutes' : '6 to 7 hours scenic drive';
    const costUgx = isMbale ? '120,000 UGX' : '450,000 UGX ($120)';

    try {
      let contact = await this.prisma.contact.findFirst({
        where: { OR: [phone ? { phone } : { id: '00000000-0000-0000-0000-000000000000' }, { name: guestName }] },
      });
      if (!contact) {
        contact = await this.prisma.contact.create({
          data: { name: guestName, phone: phone || null },
        });
      }

      await this.prisma.conversation.create({
        data: {
          reference: referenceCode('CN'),
          contactId: contact.id,
          channel: 'WEB_FORM',
          intent: 'GENERAL',
          status: 'NEW',
          subject: `Transfer Request: ${guestName} (${pickupLocation})`,
          context: {
            source: 'Sipi Concierge AI',
            pickupLocation,
            date,
            passengers,
            phone,
            flightNumber: flightNumber || null,
            estimatedCost: costUgx,
          },
        },
      });
    } catch (err) {
      this.log.warn(`Could not log transfer ticket: ${err}`);
    }

    const whatsappUrl = `https://wa.me/256760512691?text=${encodeURIComponent(
      `Hello Denis, I would like to confirm my private 4x4 transfer from ${pickupLocation} to Reberon Hotel for ${guestName} on ${date} (${passengers} passengers).`
    )}`;

    const card: ConciergeCardDTO = {
      type: 'transfer',
      pickupLocation,
      destination: 'Reberon Hotel, Kapchorwa (1,900 m ASL)',
      vehicleType: 'Executive 4x4 Safari SUV / Land Cruiser Prado',
      travelTime,
      estimatedCost: costUgx,
      currency: 'UGX',
      inclusions: [
        'Dedicated professional licensed mountain driver',
        'Chilled spring water & Mount Elgon dried fruits / Arabica roast flask',
        'Tarmac highway toll fees & luggage handling included',
        'Scenic stops at River Nile Bridge (Jinja) & Tororo rock vistas on request',
      ],
      notes: `Pickup on ${date} for ${passengers} passenger(s)${flightNumber ? ` · Flight: ${flightNumber}` : ''}. Concierge desk notified.`,
      actionUrl: whatsappUrl,
      actionLabel: 'Confirm Transfer with Denis Mayamba',
    };

    return {
      toolCallId: id,
      name: 'request_airport_transfer',
      output: JSON.stringify({
        confirmedInquiry: true,
        pickupLocation,
        destination: 'Reberon Hotel, Kapchorwa',
        travelTime,
        vehicle: 'Executive 4x4 SUV',
        cost: costUgx,
        inclusions: card.inclusions,
        whatsappConfirmation: whatsappUrl,
        message: 'Transfer request logged with Front Desk. Click to confirm directly with Denis on WhatsApp.',
      }),
      card,
    };
  }

  /* ── 12. Dining & Dietary Intelligence ── */
  private async handleGetDining(id: string, _args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const card: ConciergeCardDTO = {
      type: 'dining',
      venue: 'The Highland Dining Room & Arabica Coffee Terrace',
      cuisine: 'High-Altitude Ugandan & Mountain Trout Fusion',
      hours: 'Breakfast 06:30 – 10:30 · Lunch 12:30 – 15:30 · Dinner 18:30 – 22:00',
      highlights: [
        'Fresh Mount Elgon River Trout pan-seared with wild mountain herbs and lemon beurre blanc',
        'Farm-fresh highland eggs, smoked beef bacon, and organic yellow corn cakes',
        'Hand-pulled single-origin Kapchorwa Arabica coffee roasted daily on premise',
        'Crisp terrace fire pit dining overlooking the northern escarpment valley',
      ],
      dietaryOptions: [
        '100% Halal certified meats and preparation',
        'Dedicated vegetarian & vegan farm-to-plate selections',
        'Gluten-free sorghum and millet breakfast crumbles',
        'High-protein endurance athlete nutrition plans for mountain runners',
      ],
      coffeeExperience:
        'Kapchorwa volcanic soils produce some of East Africa\'s finest specialty Arabica (grown at 1,800–2,200 m). We offer pour-over, Chemex, and live bean roasting sessions on the terrace.',
      actionUrl: '/facilities/restaurant',
      actionLabel: 'View Restaurant & Terrace Menu',
    };

    return {
      toolCallId: id,
      name: 'get_dining_and_dietary',
      output: JSON.stringify({
        venue: card.venue,
        cuisine: card.cuisine,
        hours: card.hours,
        highlights: card.highlights,
        dietary: card.dietaryOptions,
        coffee: card.coffeeExperience,
      }),
      card,
    };
  }

  /* ── 13. Weather & Packing Guidance ── */
  private async handleGetWeatherAndPacking(id: string, _args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const card: ConciergeCardDTO = {
      type: 'weather',
      altitude: '1,900 m ASL (Kapchorwa Northern Escarpment)',
      temperatureRange: 'Daytime 21°C–25°C · Evenings 12°C–15°C',
      dayClimate: 'Crisp mountain sunshine with refreshing alpine breeze',
      nightClimate: 'Cool highland air — terrace fire bowls lit nightly',
      packingChecklist: [
        'Warm fleece, lightweight knit sweater, or down gilet for cool evenings',
        'Sturdy trail running shoes or ankle-support hiking boots for Sipi Falls trails',
        'Lightweight waterproof shell or rain jacket for waterfall spray and mist',
        'UV sunglasses, broad-brim hat, and SPF sunscreen (high altitude sun is strong)',
        'Camera or binoculars for valley birdwatching (crested cranes, turacos, eagles)',
        'Universal travel plug adapter (Uganda uses UK Type G 240V)',
      ],
      routeStatus: '100% paved tarmac highway from Kampala / Jinja / Mbale to hotel entrance. No 4x4 strictly required.',
      actionUrl: '/kapchorwa/the-road',
      actionLabel: 'Read Highway Travel Guide',
    };

    return {
      toolCallId: id,
      name: 'get_weather_and_packing_guide',
      output: JSON.stringify({
        altitude: card.altitude,
        temperatures: card.temperatureRange,
        day: card.dayClimate,
        night: card.nightClimate,
        packingList: card.packingChecklist,
        road: card.routeStatus,
      }),
      card,
    };
  }
}
