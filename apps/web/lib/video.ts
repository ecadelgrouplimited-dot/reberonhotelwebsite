export type VideoSource = { kind: 'youtube' | 'vimeo'; id: string } | { kind: 'file'; url: string };

/** YouTube, Vimeo or a direct video file; anything else is ignored. */
export function parseVideo(raw: string): VideoSource | null {
  const url = raw.trim();
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1) ? { kind: 'youtube', id: u.pathname.slice(1).split('/')[0]! } : null;
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const v = u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1];
    return v ? { kind: 'youtube', id: v } : null;
  }
  if (host.endsWith('vimeo.com')) {
    const id = u.pathname.match(/(\d{5,})/)?.[1];
    return id ? { kind: 'vimeo', id } : null;
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname) && u.protocol === 'https:') return { kind: 'file', url };
  return null;
}
