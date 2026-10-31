import { z } from 'zod';

export interface ConciergeGuestIdentityDTO {
  name: string;
  phone?: string;
  email?: string;
  bookingCode?: string;
  contactId?: string;
  isVip?: boolean;
  isVerified?: boolean;
  identifiedAt?: string;
}

export interface ConciergeDocumentItemDTO {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'REFUND' | 'QUOTATION';
  number: string;
  amount: string;
  currency: string;
  issuedAt: string;
  checkCode: string;
  reservationCode?: string;
  status: string;
  printUrl?: string;
  verifyUrl: string;
}

export interface ConciergeActivityItemDTO {
  id: string;
  kind: 'RESERVATION' | 'DOCUMENT' | 'POS_ORDER' | 'HEALTH_CLUB' | 'GUEST_REQUEST' | 'WAITLIST' | 'INQUIRY' | 'QUOTATION';
  title: string;
  subtitle: string;
  reference?: string;
  status: string;
  amount?: string;
  timestamp: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface ConciergeGuestDossierDTO {
  identity: ConciergeGuestIdentityDTO;
  summary: {
    reservationsCount: number;
    documentsCount: number;
    activitiesCount: number;
    activeStayCode?: string;
  };
  reservations: {
    code: string;
    status: string;
    roomName: string;
    arrival: string;
    departure: string;
    nights: number;
    total: string;
    paid: string;
    balance: string;
    currency: string;
    stayUrl: string;
    paymentUrl?: string;
  }[];
  documents: ConciergeDocumentItemDTO[];
  recentActivities: ConciergeActivityItemDTO[];
}

export interface ConciergeMessageDTO {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  toolCalls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  cards?: ConciergeCardDTO[];
  followUpQuestions?: string[];
  createdAt: string;
}

export type ConciergeCardDTO =
  | {
      type: 'room';
      slug: string;
      name: string;
      price: string;
      currency: string;
      imageUrl?: string;
      galleryUrls?: string[];
      viewAspect?: string;
      bedSetup?: string;
      actionUrl?: string;
      actionLabel?: string;
      secondaryActionUrl?: string;
      secondaryActionLabel?: string;
    }
  | {
      type: 'quote';
      roomName: string;
      arrival: string;
      departure: string;
      nights: number;
      total: string;
      deposit: string;
      currency: string;
      inclusions: string[];
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'reservation';
      code: string;
      status: string;
      roomName: string;
      arrival: string;
      departure: string;
      total: string;
      currency: string;
      paymentUrl?: string;
      receiptUrl?: string;
      stayUrl?: string;
      actionUrl?: string;
      actionLabel?: string;
      secondaryActionUrl?: string;
      secondaryActionLabel?: string;
    }
  | {
      type: 'waitlist';
      reference: string;
      guestName: string;
      preferredDates?: string;
      roomType?: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'facility';
      slug: string;
      name: string;
      hours?: string;
      imageUrl?: string;
      galleryUrls?: string[];
      features: string[];
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'activity';
      slug?: string;
      title: string;
      difficulty: string;
      duration: string;
      bestTime: string;
      notes: string;
      imageUrl?: string;
      galleryUrls?: string[];
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'handover';
      phone: string;
      whatsappUrl: string;
      message: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'lookup';
      code: string;
      status: string;
      guestName: string;
      roomName: string;
      arrival: string;
      departure: string;
      nights: number;
      total: string;
      paid: string;
      balance: string;
      currency: string;
      stayUrl: string;
      receiptUrl: string;
      paymentUrl?: string;
      documents?: ConciergeDocumentItemDTO[];
      actionUrl?: string;
      actionLabel?: string;
      secondaryActionUrl?: string;
      secondaryActionLabel?: string;
    }
  | {
      type: 'transfer';
      pickupLocation: string;
      destination: string;
      vehicleType: string;
      travelTime: string;
      estimatedCost: string;
      currency: string;
      inclusions: string[];
      notes: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'dining';
      venue: string;
      cuisine: string;
      hours: string;
      highlights: string[];
      dietaryOptions: string[];
      menuItems?: { name: string; category: string; price: string }[];
      coffeeExperience?: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'weather';
      altitude: string;
      temperatureRange: string;
      dayClimate: string;
      nightClimate: string;
      packingChecklist: string[];
      routeStatus: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'documents';
      guestName: string;
      documents: ConciergeDocumentItemDTO[];
      actionUrl?: string;
      actionLabel?: string;
    }
  | {
      type: 'activity_log';
      guestName: string;
      summary: {
        reservationsCount: number;
        documentsCount: number;
        activitiesCount: number;
      };
      activities: ConciergeActivityItemDTO[];
      documents?: ConciergeDocumentItemDTO[];
    }
  | {
      type: 'document_verify';
      valid: boolean;
      kind?: string;
      number: string;
      checkCode?: string;
      issuedTo?: string;
      amount?: string;
      issuedAt?: string;
      voided?: boolean;
      verifyUrl: string;
    }
  | {
      type: 'guest_request';
      requestId: string;
      reservationCode: string;
      guestName: string;
      kind: string;
      status: string;
      note: string;
      createdAt: string;
      stayUrl?: string;
    };

export const zConciergeIdentifyInput = z.object({
  sessionId: z.string().min(1).max(128),
  guestName: z.string().min(1).max(120),
  phone: z.string().max(60).optional(),
  email: z.string().max(160).optional(),
  bookingCode: z.string().max(40).optional(),
});
export type ConciergeIdentifyInput = z.infer<typeof zConciergeIdentifyInput>;

export const zConciergeChatInput = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(2500),
  guestName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  bookingCode: z.string().optional(),
});
export type ConciergeChatInput = z.infer<typeof zConciergeChatInput>;

export interface ConciergeChatResponseDTO {
  sessionId: string;
  reply: string;
  messages: ConciergeMessageDTO[];
  cards?: ConciergeCardDTO[];
  suggestedActions?: string[];
  followUpQuestions?: string[];
  identity?: ConciergeGuestIdentityDTO;
  dossier?: ConciergeGuestDossierDTO;
}
