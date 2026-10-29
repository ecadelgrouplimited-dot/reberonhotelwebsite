import { z } from 'zod';

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
      actionUrl?: string;
      actionLabel?: string;
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
    };

export const zConciergeChatInput = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(2500),
  guestName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});
export type ConciergeChatInput = z.infer<typeof zConciergeChatInput>;

export interface ConciergeChatResponseDTO {
  sessionId: string;
  reply: string;
  messages: ConciergeMessageDTO[];
  cards?: ConciergeCardDTO[];
  suggestedActions?: string[];
  followUpQuestions?: string[];
}
