/**
 * Integration tests against a running API (pnpm dev, or node dist/main.js)
 * with the demo seed loaded. Every test cleans up what it creates.
 *
 *   API_URL=http://localhost:4000 pnpm --filter @reberon/api test
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Reberon@Elgon1900';
const RUN_IP = `10.${(process.pid >> 8) & 255}.${process.pid & 255}.${Math.floor(Math.random() * 250) + 1}`;

class Client {
  cookies = new Map<string, string>();
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${API}/v1${path}`, {
      method,
      headers: {
        'x-forwarded-for': RUN_IP,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-reberon-client': 'admin' } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair!.split('=');
      if (!v || /Expires=Thu, 01 Jan 1970/.test(c)) this.cookies.delete(k!);
      else this.cookies.set(k!, v);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown, h?: Record<string, string>) => this.req('POST', p, b ?? {}, h);
  patch = (p: string, b: unknown, h?: Record<string, string>) => this.req('PATCH', p, b, h);
  del = (p: string) => this.req('DELETE', p);
  async login(email: string, password = PASSWORD) {
    return this.post('/admin/auth/login', { email, password });
  }
}

const sessions = new Map<string, Client>();
/** One signed-in client per account, reused across tests (logins are rate-limited). */
const as = async (email: string) => {
  const cached = sessions.get(email);
  if (cached) return cached;
  const c = new Client();
  const r = await c.login(email);
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
  sessions.set(email, c);
  return c;
};

describe('public API', () => {
  test('site settings and navigation', async () => {
    const r = await new Client().get('/public/site');
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Reberon Hotel');
    assert.ok(r.body.nav.HEADER.length > 0);
  });

  test('home page resolves blocks and media', async () => {
    const r = await new Client().get('/public/page?slug=');
    assert.equal(r.status, 200);
    assert.equal(r.body.blocks[0].type, 'hero');
    const grid = r.body.blocks.find((b: { type: string }) => b.type === 'roomGrid');
    assert.ok(grid.resolved.roomTypes.length >= 1);
    assert.ok(Object.keys(r.body.media).length > 0);
  });

  test('unknown pages are problem+json 404s', async () => {
    const r = await new Client().get('/public/page?slug=does-not-exist');
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 'NOT_FOUND');
  });

  test('money is serialised as strings, both currencies, never converted', async () => {
    const r = await new Client().get('/public/room-types');
    for (const room of r.body) {
      assert.equal(typeof room.fromPrice.ugx, 'string');
      assert.ok(room.fromPrice.usd === null || typeof room.fromPrice.usd === 'string');
    }
  });

  test('enquiry validation returns field errors', async () => {
    const r = await new Client().post('/public/enquiries', { name: 'A' });
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'VALIDATION_FAILED');
    const paths = r.body.errors.map((e: { path: string }) => e.path);
    assert.ok(paths.includes('name') && paths.includes('consent'));
  });

  test('a repeated Idempotency-Key replays the first result', async () => {
    const key = `test-${Date.now()}`;
    const body = { name: 'Idempotency Test', phone: '0772000111', message: 'Testing idempotency', consent: true };
    const a = await new Client().post('/public/enquiries', body, { 'idempotency-key': key });
    const b = await new Client().post('/public/enquiries', body, { 'idempotency-key': key });
    assert.equal(a.status, 201);
    assert.equal(a.body.reference, b.body.reference);
  });

  test('WhatsApp intent carries the room and a reference', async () => {
    const r = await new Client().post('/public/whatsapp-intent', { roomTypeSlug: 'summit-suite', pagePath: '/rooms/summit-suite' });
    assert.equal(r.status, 200);
    assert.match(r.body.waUrl, /^https:\/\/wa\.me\/\d+\?text=/);
    assert.match(decodeURIComponent(r.body.waUrl), /Summit Suite/);
  });
});

describe('auth', () => {
  test('wrong password is rejected with a generic message', async () => {
    const r = await new Client().login('unknown.staff@reberonhotel.com', 'wrong-password-123');
    assert.equal(r.status, 401);
    assert.doesNotMatch(r.body.detail, /unknown\.staff@/);
  });

  test('admin routes need a session', async () => {
    const r = await new Client().get('/admin/dashboard');
    assert.equal(r.status, 401);
  });

  test('mutations without the client header are refused (CSRF wall)', async () => {
    const c = await as('manager@reberonhotel.com');
    const r = await c.req('PATCH', '/admin/settings', {}, { 'x-reberon-client': '' });
    assert.equal(r.status, 403);
  });

  test('refresh rotates; reusing an old refresh token ends the family', async () => {
    const c = new Client();
    assert.equal((await c.login('desk@reberonhotel.com')).status, 200);
    const old = c.cookies.get('rb_rt')!;
    const r1 = await c.post('/admin/auth/refresh');
    assert.equal(r1.status, 200);
    assert.notEqual(c.cookies.get('rb_rt'), old);
    const thief = new Client();
    thief.cookies.set('rb_rt', old);
    assert.equal((await thief.post('/admin/auth/refresh')).status, 401);
    // The legitimate session was revoked too.
    assert.equal((await c.post('/admin/auth/refresh')).status, 401);
  });
});

describe('role walls (the API is the wall)', () => {
  let desk: Client;
  let hk: Client;
  let manager: Client;
  before(async () => {
    [desk, hk, manager] = await Promise.all([as('desk@reberonhotel.com'), as('housekeeping@reberonhotel.com'), as('manager@reberonhotel.com')]);
  });

  test('housekeeping cannot see the inbox, content or payments-adjacent data', async () => {
    for (const p of ['/admin/conversations', '/admin/pages', '/admin/waitlist', '/admin/dashboard', '/admin/audit']) {
      assert.equal((await hk.get(p)).status, 403, p);
    }
  });

  test('desk can work the inbox but not edit the website', async () => {
    assert.equal((await desk.get('/admin/conversations')).status, 200);
    assert.equal((await desk.get('/admin/pages')).status, 403);
    assert.equal((await desk.patch('/admin/settings', { 'hotel.name': 'X' })).status, 403);
  });

  test('manager cannot flip feature flags or manage people', async () => {
    assert.equal((await manager.patch('/admin/settings', { 'features.bookingEnabled': true })).status, 403);
    assert.equal((await manager.post('/admin/users/invite', { email: 'x@example.com', name: 'X Y', role: 'DESK' })).status, 403);
  });

  test('the timezone is locked', async () => {
    const owner = await as('owner@reberonhotel.com');
    const r = await owner.patch('/admin/settings', { 'hotel.timezone': 'Europe/London' });
    assert.equal(r.status, 400);
  });
});

describe('pages: draft → publish', () => {
  test('drafts are private; publish validates strictly; versions are kept', async () => {
    const m = await as('manager@reberonhotel.com');
    const slug = `test-page-${Date.now()}`;
    const created = await m.post('/admin/pages', { title: { en: 'Test page' }, slug });
    assert.equal(created.status, 201);
    const id = created.body.id;
    try {
      // Not public while a draft.
      assert.equal((await new Client().get(`/public/page?slug=${slug}`)).status, 404);

      // Incomplete block: draft save allowed, publish refused with a named field.
      let r = await m.patch(`/admin/pages/${id}`, { blocks: [{ id: 'q1', type: 'quote', data: {} }] }, { 'if-match': String(created.body.version) });
      assert.equal(r.status, 200);
      const bad = await m.post(`/admin/pages/${id}/publish`, {});
      assert.equal(bad.status, 422);
      assert.match(bad.body.errors[0].message, /Quote \(#1\): “Quote” is required/);

      // Stale version is a conflict.
      const stale = await m.patch(`/admin/pages/${id}`, { blocks: [] }, { 'if-match': String(created.body.version) });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, 'CONFLICT_VERSION');

      // Fix and publish.
      r = await m.patch(`/admin/pages/${id}`, { blocks: [{ id: 'q1', type: 'quote', data: { text: { en: 'Hello from the test.' } } }] }, { 'if-match': String(r.body.version) });
      const ok = await m.post(`/admin/pages/${id}/publish`, {});
      assert.equal(ok.status, 201);
      const pub = await new Client().get(`/public/page?slug=${slug}`);
      assert.equal(pub.status, 200);
      assert.equal(pub.body.blocks[0].data.text.en, 'Hello from the test.');

      // Renaming a published page leaves a redirect behind.
      await m.patch(`/admin/pages/${id}`, { slug: `${slug}-moved` }, { 'if-match': String(r.body.version) });
      const redirects = await new Client().get('/public/redirects');
      assert.ok(redirects.body.some((x: { fromPath: string; toPath: string }) => x.fromPath === `/${slug}` && x.toPath === `/${slug}-moved`));

      const versions = await m.get(`/admin/pages/${id}/versions`);
      assert.equal(versions.body.length, 1);
    } finally {
      await m.del(`/admin/pages/${id}`);
      const reds = await m.get('/admin/redirects');
      for (const x of reds.body.filter((x: { fromPath: string }) => x.fromPath.startsWith('/test-page-'))) await m.del(`/admin/redirects/${x.id}`);
    }
  });

  test('home and system pages cannot be deleted', async () => {
    const m = await as('manager@reberonhotel.com');
    const home = (await m.get('/admin/pages')).body.find((p: { slug: string }) => p.slug === '');
    assert.equal((await m.del(`/admin/pages/${home.id}`)).status, 400);
  });
});

describe('media', () => {
  test('an image in use cannot be deleted', async () => {
    const m = await as('manager@reberonhotel.com');
    const room = (await m.get('/admin/room-types')).body[0];
    const heroId = room.hero.id;
    const r = await m.del(`/admin/media/${heroId}`);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'IN_USE');
  });
});

describe('lockout', () => {
  test('five failures lock the account for a while', async () => {
    const email = 'wilson@ecadelgroup.com';
    const c = new Client();
    for (let i = 0; i < 5; i++) await c.login(email, `nope-${i}-password`);
    const locked = await c.login(email, PASSWORD);
    assert.equal(locked.status, 429);
  });
});

describe('the house (Movement IV)', () => {
  const OWNER = 'owner@reberonhotel.com';
  const DESK = 'desk@reberonhotel.com';
  const HK = 'housekeeping@reberonhotel.com';

  test('the desk board adds up', async () => {
    const r = await (await as(DESK)).get('/admin/desk');
    assert.equal(r.status, 200);
    const b = r.body;
    assert.match(b.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(b.counts.inHouse, b.inHouse.length);
    assert.ok(b.inHouse.every((s: { status: string }) => s.status === 'IN_HOUSE'));
    assert.ok(b.arrivals.every((s: { arrival: string }) => s.arrival === b.date));
    // Every guest in the house sits in exactly one occupied room.
    const occupied = b.rooms.filter((x: { occupant: unknown }) => x.occupant);
    const assigned = b.inHouse.flatMap((s: { rooms: { assigned: unknown[] }[] }) => s.rooms.flatMap((x) => x.assigned));
    assert.equal(occupied.length, assigned.length);
  });

  test('housekeeping sees rooms, never money or phone numbers', async () => {
    const hk = await as(HK);
    const r = await hk.get('/admin/housekeeping');
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    assert.doesNotMatch(text, /Minor|phone|email/i);
    for (const path of ['/admin/desk', '/admin/guests', '/admin/reservations', '/admin/feedback', `/admin/reports/house?from=2026-01-01&to=2026-01-31`]) {
      assert.equal((await hk.get(path)).status, 403, path);
    }
  });

  test('desk cannot block rooms, credit bills or read the owner reports', async () => {
    const desk = await as(DESK);
    const board = (await desk.get('/admin/desk')).body;
    const room = board.rooms[0];
    assert.equal((await desk.post('/admin/room-blocks', { roomId: room.id, fromDate: '2030-01-01', toDate: '2030-01-02', reason: 'STAFF' })).status, 403);
    const guest = board.inHouse[0];
    if (guest) assert.equal((await desk.post(`/admin/desk/reservations/${guest.id}/charges`, { kind: 'ADJUSTMENT', description: 'Goodwill', amount: '1000', credit: true })).status, 403);
    assert.equal((await desk.get('/admin/reports/house?from=2026-01-01&to=2026-01-31')).status, 403);
  });

  test('a room with a guest in it cannot be blocked', async () => {
    const owner = await as(OWNER);
    const board = (await owner.get('/admin/desk')).body;
    const busy = board.rooms.find((x: { occupant: { departsToday: boolean } | null }) => x.occupant && !x.occupant.departsToday);
    if (!busy) return;
    const next = new Date(Date.parse(`${board.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const r = await owner.post('/admin/room-blocks', { roomId: busy.id, fromDate: board.date, toDate: next, reason: 'MAINTENANCE' });
    assert.equal(r.status, 409);
  });

  test('check-in and no-show wait for the arrival day', async () => {
    const desk = await as(DESK);
    const future = (await desk.get('/admin/reservations?status=CONFIRMED')).body.data.find((x: { arrival: string }) => x.arrival > new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
    assert.ok(future, 'a future confirmed booking in the seed');
    const ci = await desk.post(`/admin/desk/reservations/${future.id}/check-in`, {});
    assert.equal(ci.status, 400);
    assert.match(ci.body.detail, /arrives on/);
    assert.equal((await desk.post(`/admin/desk/reservations/${future.id}/no-show`, {})).status, 400);
    assert.equal((await desk.post(`/admin/desk/reservations/${future.id}/check-out`, {})).status, 400);
  });

  test('guest profiles keep ID numbers sealed', async () => {
    const desk = await as(DESK);
    const list = await desk.get('/admin/guests?filter=returning');
    assert.equal(list.status, 200);
    assert.ok(list.body.data.length > 0);
    const p = await desk.get(`/admin/guests/${list.body.data[0].id}`);
    assert.equal(p.status, 200);
    assert.ok(Array.isArray(p.body.reservations));
    assert.doesNotMatch(JSON.stringify(p.body), /idDocNumber/);
  });

  test('guest feedback needs the stay link', async () => {
    const desk = await as(DESK);
    const r = (await desk.get('/admin/reservations?status=CHECKED_OUT')).body.data[0];
    const res = await new Client().post(`/public/bookings/${r.code}/feedback`, { t: 'x'.repeat(32), score: 'GOOD' });
    assert.equal(res.status, 404);
  });

  test('the owner report is internally consistent', async () => {
    const owner = await as(OWNER);
    const today = (await owner.get('/admin/desk')).body.date as string;
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10);
    const r = await owner.get(`/admin/reports/house?from=${from}&to=${today}`);
    assert.equal(r.status, 200);
    const t = r.body.totals;
    assert.equal(r.body.days.length, 61);
    assert.equal(t.roomNightsSold, r.body.days.reduce((a: number, d: { sold: number }) => a + d.sold, 0));
    assert.ok(r.body.days.every((d: { sold: number; available: number }) => d.sold <= d.available));
    assert.ok(BigInt(t.roomRevenue.UGX) > 0n);
    assert.equal((await owner.get(`/admin/reports/house?from=${today}&to=${from}`)).status, 422);
  });
});

describe('the walk (Movement III) and messaging', () => {
  test('tours stay off the website until switched on', async () => {
    const owner = await as('owner@reberonhotel.com');
    const settings = (await owner.get('/admin/settings')).body as Record<string, { value: unknown }>;
    const prev = settings?.['features.toursEnabled']?.value;
    await owner.patch('/admin/settings', { 'features.toursEnabled': false });
    try {
      const r = await new Client().get('/public/tours');
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, []);
      const room = await new Client().get('/public/room-types/elgon-view-king');
      assert.equal(room.body.tour, null);
    } finally {
      if (prev !== undefined && prev !== false) {
        await owner.patch('/admin/settings', { 'features.toursEnabled': prev });
      }
    }
  });

  test('tour links are checked and the desk cannot edit tours', async () => {
    const owner = await as('owner@reberonhotel.com');
    const bad = await owner.post('/admin/tours', { slug: 'test-bad-link', title: { en: 'TEST' }, space: 'LOBBY', provider: 'MATTERPORT', embedUrl: 'https://example.com/x', stage: 'LIVE', status: 'PUBLISHED' });
    assert.equal(bad.status, 422);
    assert.equal((await (await as('desk@reberonhotel.com')).post('/admin/tours', {})).status, 403);
    assert.equal((await new Client().post('/public/tours/00000000-0000-7000-8000-000000000000/events', { sessionId: 'x', event: 'OPENED', context: 'PAGE' })).status, 422);
  });

  test('only the owner holds the keys; templates refuse unknown fields', async () => {
    assert.equal((await (await as('manager@reberonhotel.com')).get('/admin/integrations')).status, 403);
    const owner = await as('owner@reberonhotel.com');
    const list = await owner.get('/admin/integrations');
    assert.equal(list.status, 200);
    assert.doesNotMatch(JSON.stringify(list.body), /secretsEnc|consumerSecret":"[^"n]/);
    const tpls = (await owner.get('/admin/message-templates')).body as { id: string; key: string; channel: string }[];
    const sms = tpls.find((x) => x.key === 'booking.confirmed' && x.channel === 'SMS')!;
    const r = await owner.req('PUT', `/admin/message-templates/${sms.id}`, { body: 'Hello {{notAField}}' });
    assert.equal(r.status, 422);
  });
});

describe('people, access and receipts', () => {
  test('staff records without sign-in are on the list and can be given cleaning', async () => {
    const owner = await as('owner@reberonhotel.com');
    const people = (await owner.get('/admin/users')).body as { id: string; name: string; canSignIn: boolean; email: string | null }[];
    const esther = people.find((p) => p.name === 'Esther Chebet');
    assert.ok(esther && !esther.canSignIn && esther.email === null);
    const staff = (await owner.get('/admin/housekeeping')).body.staff as { id: string }[];
    assert.ok(staff.some((s) => s.id === esther!.id));
  });

  test('per-person access: owner-only powers cannot be granted; changes are reversible', async () => {
    const owner = await as('owner@reberonhotel.com');
    const people = (await owner.get('/admin/users')).body as { id: string; email: string | null; grants: string[]; revokes: string[] }[];
    const joan = people.find((p) => p.email === 'relief.desk@reberonhotel.com')!;
    const r = await owner.patch(`/admin/users/${joan.id}`, { grants: ['reports:read', 'vault:manage'] });
    assert.equal(r.status, 200);
    assert.ok(r.body.permissions.includes('reports:read'));
    assert.ok(!r.body.permissions.includes('vault:manage'));
    assert.ok(!r.body.permissions.includes('payments:record'), 'her removed permission stays removed');
    const back = await owner.patch(`/admin/users/${joan.id}`, { grants: joan.grants });
    assert.deepEqual(back.body.grants, joan.grants);
    const self = (await owner.get('/admin/auth/me')).body.id as string;
    assert.equal((await owner.patch(`/admin/users/${self}`, { revokes: ['reports:read'] })).status, 400);
    assert.equal((await (await as('manager@reberonhotel.com')).patch(`/admin/users/${joan.id}`, { grants: [] })).status, 403);

    // Super admin (owner) can directly set another user's password and send credentials to their official email
    const newPass = 'Reberon#AdminSet2026!';
    const setPw = await owner.post(`/admin/users/${joan.id}/password`, { password: newPass, sendCredentials: true });
    assert.equal(setPw.status, 200);
    assert.equal(setPw.body.emailed, true);
    assert.equal(setPw.body.user.hasPassword, true);

    // Non-owner cannot set another user's password
    assert.equal((await (await as('manager@reberonhotel.com')).post(`/admin/users/${joan.id}/password`, { password: newPass, sendCredentials: false })).status, 403);

    // Restore Joan's password to SEED_PASSWORD
    const restorePw = await owner.post(`/admin/users/${joan.id}/password`, { password: PASSWORD, sendCredentials: false });
    assert.equal(restorePw.status, 200);
  });

  test('receipts are numbered, verifiable and walled', async () => {
    const owner = await as('owner@reberonhotel.com');
    const reg = await owner.get('/admin/documents?kind=RECEIPT');
    assert.equal(reg.status, 200);
    const docs = reg.body.data as { number: string; checkCode: string; amountMinor: string }[];
    assert.ok(docs.length > 0);
    assert.ok(docs.every((d) => /^RCT-\d{4}-\d{5}$/.test(d.number)));
    const v = await new Client().get(`/public/documents/verify?number=${docs[0]!.number}&check=${docs[0]!.checkCode}`);
    assert.equal(v.body.valid, true);
    assert.equal(v.body.amountMinor, docs[0]!.amountMinor);
    assert.deepEqual((await new Client().get(`/public/documents/verify?number=${docs[0]!.number}&check=0000-0000`)).body, { valid: false });
    assert.equal((await (await as('housekeeping@reberonhotel.com')).get('/admin/documents')).status, 403);
    assert.equal((await (await as('desk@reberonhotel.com')).post(`/admin/documents/00000000-0000-7000-8000-000000000000/void`, { reason: 'test' })).status, 403);
  });
});

describe('movement V: POS, health club, quotations, inventory & requisitions', () => {
  test('POS outlets, orders, KDS queue and auto-issued receipts', async () => {
    const owner = await as('owner@reberonhotel.com');
    const outletsRes = await owner.get('/admin/pos/outlets');
    assert.equal(outletsRes.status, 200);
    const outlets = outletsRes.body as { id: string; code: string; categories: { items: { id: string }[] }[] }[];
    assert.ok(outlets.length >= 4);
    const bar = outlets.find((o) => o.code === 'BAR') ?? outlets[0]!;
    const item = bar.categories[0]!.items[0]!;

    const orderRes = await owner.post('/admin/pos/orders', {
      outletId: bar.id,
      customerName: 'POS Test Guest',
      tableOrRoom: 'Terrace 2',
      paymentMethod: 'CASH',
      currency: 'UGX',
      items: [{ itemId: item.id, quantity: 2, notes: 'Extra hot' }],
    });
    assert.equal(orderRes.status, 201);
    assert.match(orderRes.body.orderNumber, /^ORD-\d{4}-\d{5}$/);
    assert.ok(orderRes.body.documentId, 'cash POS order auto-issues a receipt');

    const kds = await owner.patch(`/admin/pos/orders/${orderRes.body.id}/status`, { status: 'COMPLETED' });
    assert.equal(kds.status, 200);
    assert.equal(kds.body.status, 'COMPLETED');
  });

  test('health club check-in, gym towel issuance and return reconciliation', async () => {
    const owner = await as('owner@reberonhotel.com');
    const dash = await owner.get('/admin/healthclub');
    assert.equal(dash.status, 200);
    assert.ok(dash.body.stats.activeMembers >= 1);

    const checkIn = await owner.post('/admin/healthclub/checkin', {
      guestName: 'Altitude Runner',
      guestPhone: '+256772000111',
      service: 'FULL_COMBO',
      tier: 'DAILY_PASS',
      currency: 'UGX',
      amountPaidMinor: '60000',
      paymentMethod: 'CASH',
      gymTowelsIssued: 2,
      sandalsIssued: true,
      showerCapIssued: true,
      ropeIssued: true,
      lockerNumber: 'L-09',
    });
    assert.equal(checkIn.status, 201);
    assert.equal(checkIn.body.gymTowelsIssued, 2);
    assert.ok(checkIn.body.documentId, 'walk-in daily pass issues an official receipt');

    const checkOut = await owner.patch(`/admin/healthclub/access/${checkIn.body.id}/checkout`, {
      gymTowelsReturned: 2,
    });
    assert.equal(checkOut.status, 200);
    assert.equal(checkOut.body.gymTowelsReturned, 2);
    assert.ok(checkOut.body.checkedOutAt);
  });

  test('quotation creation, QR verification, and conversion to invoice & receipt', async () => {
    const owner = await as('owner@reberonhotel.com');
    const created = await owner.post('/admin/quotations', {
      clientName: 'Kapchorwa Coffee Union',
      clientOrganization: 'KCU Co-op',
      clientPhone: '+256772123999',
      clientEmail: 'events@kcu.ug',
      eventType: 'CONFERENCE',
      eventTitle: 'Annual Highland Growers Symposium',
      attendees: 40,
      hallSetup: 'Banquet',
      validDays: 14,
      currency: 'UGX',
      discountMinor: '0',
      lines: [
        {
          category: 'CONFERENCE',
          description: 'Sipi Grand Hall Full Day Package',
          quantity: 40,
          unit: 'PAX',
          unitPriceMinor: '85000',
        },
      ],
    });
    assert.equal(created.status, 201);
    assert.match(created.body.number, /^QUO-\d{4}-\d{5}$/);

    // Public verification of Quotation number + checkCode (used by QR code)
    const verifyQuo = await new Client().get(
      `/public/documents/verify?number=${created.body.number}&check=${created.body.checkCode}`,
    );
    assert.equal(verifyQuo.status, 200);
    assert.equal(verifyQuo.body.valid, true);
    assert.equal(verifyQuo.body.amountMinor, '3400000');

    // Convert quotation -> official Invoice + Payment Receipt
    const conv = await owner.post(`/admin/quotations/${created.body.id}/convert`, {
      recordPaymentNow: true,
      paymentMethod: 'MOBILE_MONEY',
      paymentReference: 'MOMO-TEST-991',
    });
    assert.equal(conv.status, 200);
    assert.equal(conv.body.quotation.status, 'CONVERTED');
    assert.ok(conv.body.invoiceId);
    assert.ok(conv.body.receiptId);
  });

  test('segregated linen inventory (gym vs room towels) and departmental requisitions', async () => {
    const owner = await as('owner@reberonhotel.com');
    const inv = await owner.get('/admin/inventory');
    assert.equal(inv.status, 200);
    assert.ok(inv.body.summary.gymTowelsClean > 0, 'gym towels tracked separately');
    assert.ok(inv.body.summary.roomTowelsClean > 0, 'room bathroom towels tracked separately');

    const reqRes = await owner.post('/admin/requisitions', {
      department: 'HEALTH_CLUB',
      title: 'Steam Bath Eucalyptus Oil Restock',
      priority: 'NORMAL',
      items: [
        {
          itemName: 'Organic Eucalyptus Steam Oil (Litres)',
          unit: 'LITRE',
          quantityRequested: 5,
          estimatedUnitMinor: '45000',
        },
      ],
    });
    assert.equal(reqRes.status, 201);
    assert.match(reqRes.body.number, /^REQ-\d{4}-\d{5}$/);

    const mgr = await owner.post(`/admin/requisitions/${reqRes.body.id}/review`, { action: 'MANAGER_APPROVE' });
    assert.equal(mgr.status, 200);
    assert.equal(mgr.body.status, 'MANAGER_APPROVED');

    const dir = await owner.post(`/admin/requisitions/${reqRes.body.id}/review`, { action: 'DIRECTOR_APPROVE' });
    assert.equal(dir.status, 200);
    assert.equal(dir.body.status, 'DIRECTOR_APPROVED');

    const disb = await owner.post(`/admin/requisitions/${reqRes.body.id}/review`, { action: 'DISBURSE' });
    assert.equal(disb.status, 200);
    assert.equal(disb.body.status, 'DISBURSED');
  });
});
