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
      viewAspect?: string;
      bedSetup?: string;
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
    }
  | {
      type: 'waitlist';
      reference: string;
      guestName: string;
      preferredDates?: string;
      roomType?: string;
    }
  | {
      type: 'facility';
      slug: string;
      name: string;
      hours?: string;
      imageUrl?: string;
      features: string[];
    }
  | {
      type: 'activity';
      title: string;
      difficulty: string;
      duration: string;
      bestTime: string;
      notes: string;
    }
  | {
      type: 'handover';
      phone: string;
      whatsappUrl: string;
      message: string;
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
}
