import 'server-only';
import { draftMode, cookies } from 'next/headers';
import type {
  SiteDTO, PageDTO, RoomTypeCardDTO, RoomTypeDetailDTO, DestinationCardDTO, DestinationDetailDTO, FacilityDTO, FacilityDetailDTO, ProgressDTO, Paginated, LText, MeDTO,
} from '@reberon/contracts';

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Verify if the current browser request holds an active admin/staff session (rb_at or rb_rt cookie). */
export async function getStaffSession(): Promise<MeDTO | null> {
  try {
    const jar = await cookies();
    const at = jar.get('rb_at')?.value;
    const rt = jar.get('rb_rt')?.value;
    if (!at && !rt) return null;
    const cookieHeader = [at ? `rb_at=${at}` : '', rt ? `rb_rt=${rt}` : ''].filter(Boolean).join('; ');
    if (at) {
      const res = await fetch(`${API}/v1/admin/auth/me`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      });
      if (res.ok) return (await res.json()) as MeDTO;
    }
    if (rt) {
      const res = await fetch(`${API}/v1/admin/auth/refresh`, {
        method: 'POST',
        headers: { cookie: cookieHeader, 'x-reberon-client': 'admin' },
        cache: 'no-store',
      });
      if (res.ok) return (await res.json()) as MeDTO;
    }
    return null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { code?: string; detail?: string; errors?: { path: string; message: string }[] },
  ) {
    super(body.detail ?? `API ${status}`);
  }
}

/**
 * Every content read is tagged "content"; the API calls /api/revalidate with
 * that tag after any publish (instant). The 60s window is the safety net: if a
 * refresh call is ever lost, the site still catches up within a minute. In draft mode we bypass the cache and send the
 * preview token so the API returns drafts.
 */
async function get<T>(path: string): Promise<T> {
  let draft = false;
  try {
    // Throws outside a request (e.g. generateStaticParams at build time).
    draft = (await draftMode()).isEnabled;
  } catch {
    draft = false;
  }
  const headers: Record<string, string> = {};
  if (draft) {
    const token = (await cookies()).get('rb_preview')?.value;
    if (token) headers['x-preview-token'] = token;
  }
  const res = await fetch(`${API}/v1/public${path}`, {
    headers,
    ...(draft ? { cache: 'no-store' as const } : { next: { tags: ['content'], revalidate: 60 } }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json() as Promise<T>;
}

export async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export const api = {
  site: () => get<SiteDTO>('/site'),
  page: (slug: string) => get<PageDTO>(`/page?slug=${encodeURIComponent(slug)}`),
  pageIndex: () => get<{ path: string; updatedAt: string }[]>('/pages'),
  roomTypes: () => get<RoomTypeCardDTO[]>('/room-types'),
  roomType: (slug: string) => get<RoomTypeDetailDTO>(`/room-types/${encodeURIComponent(slug)}`),
  facilities: () => get<FacilityDTO[]>('/facilities'),
  facility: (slug: string) => get<FacilityDetailDTO>(`/facilities/${encodeURIComponent(slug)}`),
  destinations: () => get<DestinationCardDTO[]>('/destinations'),
  destination: (slug: string) => get<DestinationDetailDTO>(`/destinations/${encodeURIComponent(slug)}`),
  progress: (cursor?: string, limit = 20) => get<Paginated<ProgressDTO> & { percent: number | null }>(`/progress?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`),
  progressOne: (slug: string) =>
    get<ProgressDTO & { newer: { slug: string; title: LText } | null; older: { slug: string; title: LText } | null }>(`/progress/${encodeURIComponent(slug)}`),
  redirects: () => get<{ fromPath: string; toPath: string; statusCode: number }[]>('/redirects'),
};

/** Unauthenticated POST for forms (called from server actions only). */
export async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}/v1/public${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}
