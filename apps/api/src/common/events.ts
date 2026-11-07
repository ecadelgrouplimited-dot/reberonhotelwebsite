/** Internal domain events (EventEmitter2). */
export const Events = {
  ContentChanged: 'content.changed',
  EnquiryCreated: 'enquiry.created',
  WaitlistCreated: 'waitlist.created',
  MediaUploaded: 'media.uploaded',
  AuditRecorded: 'audit.recorded',
} as const;

export interface ContentChangedEvent {
  tags: string[];
}
export interface EnquiryCreatedEvent {
  conversationId: string;
}
export interface WaitlistCreatedEvent {
  entryId: string;
}
export interface AuditRecordedEvent {
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  actorId: string | null;
  actorName: string | null;
}
