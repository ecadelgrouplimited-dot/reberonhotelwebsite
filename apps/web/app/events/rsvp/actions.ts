'use server';
import { ApiError, cancelRsvpByToken } from '@/lib/api';

export async function cancelRsvp(token: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await cancelRsvpByToken(token);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? (e.body.detail ?? 'Could not cancel.') : 'We could not reach the hotel. Please try again.' };
  }
}
