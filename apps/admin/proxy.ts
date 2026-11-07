import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/forgot-password', '/reset-password', '/accept-invite'];

/** Route guard: no session hint → sign in. The API still checks every request. */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  const hasSession = req.cookies.has('rb_session');
  if (!isPublic && !hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (pathname === '/login' && hasSession && !req.nextUrl.searchParams.has('expired')) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|v1|favicon|icon|sw\\.js|manifest\\.webmanifest|pwa/|brand/|.*\\.(?:svg|png|jpg|webp|ico|js|webmanifest)$).*)'] };
