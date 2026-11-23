import type { Response } from 'express';
import { env } from '../../config.js';
import type { PrismaService } from '../../common/prisma.service.js';
import { t } from '@reberon/contracts';
import { lt } from '../content/mappers.js';

/**
 * One letterhead for everything the House prints: receipts and invoices, POS bills
 * and kitchen tickets, requisition vouchers. Hotel details come from Settings
 * (name, legal name, address, phones, email, TIN, footer), never from code.
 */
export interface Hotel {
  name: string;
  legalName: string | null;
  tin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  tagline: string | null;
  footer: string | null;
  website: string;
}

export async function loadHotel(prisma: Pick<PrismaService, 'setting'>): Promise<Hotel> {
  const keys = ['hotel.name', 'hotel.legalName', 'hotel.tagline', 'contact.address', 'contact.phones', 'contact.email', 'contact.whatsapp', 'receipts.tin', 'receipts.footer'];
  const s = Object.fromEntries((await prisma.setting.findMany({ where: { key: { in: keys } } })).map((r) => [r.key, r.value]));
  const text = (v: unknown) => (typeof v === 'string' ? v : t(lt(v))) || null;
  return {
    name: text(s['hotel.name']) ?? 'Reberon Hotel',
    legalName: text(s['hotel.legalName']),
    tin: text(s['receipts.tin']),
    address: text(s['contact.address']),
    phone: (s['contact.phones'] as string[] | undefined)?.[0] ?? null,
    email: text(s['contact.email']),
    whatsapp: text(s['contact.whatsapp']),
    tagline: text(s['hotel.tagline']),
    footer: text(s['receipts.footer']),
    website: env.WEB_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The RH monogram in brand copper (or black for thermal paper). */
export const monogram = (px: number, color = '#D76E1B') =>
  `<svg viewBox="214 65 168 160" width="${px}" height="${Math.round(px * 0.95)}" fill="none" aria-hidden="true" class="mono">${MONO_PATHS.replace(/#D76E1B/g, color)}</svg>`;

const MONO_PATHS = `<path d="M 291.980469 154.832031 C 317.710938 156.78125 334.457031 187.140625 334.457031 216.847656 L 348.960938 216.847656 C 348.960938 163.941406 303.910156 158.609375 297.710938 150.070312 L 286.855469 150.070312 C 287.464844 152.484375 289.21875 154.550781 291.980469 154.832031 " fill="#D76E1B" fill-rule="nonzero"/><path d="M 273.332031 75.683594 L 299.234375 75.683594 C 315.636719 75.683594 325.996094 86.527344 325.996094 109.511719 C 325.996094 132.496094 300.613281 139 290.773438 142.039062 C 289.527344 142.429688 288.585938 143.160156 287.910156 144.066406 L 299 144.066406 C 307.558594 136.039062 340.675781 133.546875 340.675781 104.089844 C 340.675781 78.71875 322.199219 73.300781 299.578125 73.300781 L 256.410156 73.300781 C 256.238281 73.515625 256.238281 73.515625 256.238281 73.949219 C 259 75.683594 259 81.757812 259 86.527344 L 259 144.066406 L 273.332031 144.066406 Z M 273.332031 75.683594 " fill="#D76E1B" fill-rule="nonzero"/><path d="M 259.003906 203.621094 C 259.003906 208.175781 259.003906 214.246094 256.242188 216.195312 L 256.414062 216.847656 L 275.921875 216.847656 L 276.097656 216.195312 C 273.332031 214.246094 273.332031 208.175781 273.332031 203.621094 L 273.332031 150.070312 L 259.003906 150.070312 Z M 259.003906 203.621094 " fill="#D76E1B" fill-rule="nonzero"/><path d="M 373.617188 209.238281 C 373.796875 209.417969 373.796875 209.773438 373.441406 209.773438 L 353.164062 209.773438 C 352.808594 209.773438 352.808594 209.417969 352.988281 209.238281 C 355.859375 207.621094 355.859375 202.597656 355.859375 198.832031 L 355.859375 148.234375 L 239.941406 148.234375 L 239.941406 198.832031 C 239.941406 202.597656 239.941406 207.621094 242.632812 209.238281 C 242.992188 209.417969 242.992188 209.773438 242.632812 209.773438 L 222.179688 209.773438 C 222 209.773438 221.820312 209.417969 222.179688 209.238281 C 225.050781 207.621094 225.050781 202.597656 225.050781 198.832031 L 225.050781 101.945312 C 225.050781 98 225.050781 92.976562 222.179688 91.539062 C 221.820312 91.359375 222 91 222.179688 91 L 242.632812 91 C 242.992188 91 242.992188 91.359375 242.632812 91.539062 C 239.941406 92.976562 239.941406 98 239.941406 101.945312 L 239.941406 145.902344 L 355.859375 145.902344 L 355.859375 101.945312 C 355.859375 98 355.859375 92.976562 352.988281 91.539062 C 352.808594 91.359375 352.808594 91 353.164062 91 L 373.441406 91 C 373.796875 91 373.796875 91.359375 373.617188 91.539062 C 370.75 92.976562 370.75 98 370.75 101.945312 L 370.75 198.832031 C 370.75 202.597656 370.75 207.621094 373.617188 209.238281 " fill="#D76E1B" fill-rule="nonzero"/>`;

export const BRAND = { navy: '#1A1E43', copper: '#D76E1B', mist: '#F4F5F7', line: '#E4E6EC', muted: '#5B6180' } as const;

/** The top of every document: logo, hotel identity, and the document's own title block. */
export function letterhead(h: Hotel, o: { title: string; number?: string; date?: string; badge?: string; badgeTone?: 'ok' | 'warn' | 'bad'; narrow: boolean; thermal?: boolean }) {
  const contact = [h.phone, h.email].filter(Boolean).join(' · ');
  const id = [h.legalName && h.legalName !== h.name ? h.legalName : null, h.address, contact || null, h.tin ? `TIN ${h.tin}` : null].filter(Boolean);
  return `<header class="lh">
    <div class="lh-brand">
      <div class="lh-name">${monogram(o.narrow ? 30 : 40, o.thermal ? '#000' : BRAND.copper)}<b>${esc(h.name)}</b></div>
      ${id.map((l) => `<span>${esc(l)}</span>`).join('')}
    </div>
    <div class="lh-doc">
      <div class="lh-t">${esc(o.title)}</div>
      ${o.number ? `<div class="lh-no">${esc(o.number)}</div>` : ''}
      ${o.date ? `<div class="lh-dt">${esc(o.date)}</div>` : ''}
      ${o.badge ? `<span class="lh-badge ${o.badgeTone ?? ''}">${esc(o.badge)}</span>` : ''}
    </div>
  </header>`;
}

/** Footer: the hotel's own footer note and website, plus any document-specific lines. */
export function docFooter(h: Hotel, lines: string[] = [], o: { internal?: boolean } = {}) {
  return `<footer class="lh-foot">
    ${lines.map((l) => `<p>${l}</p>`).join('')}
    ${h.footer && !o.internal ? `<p>${esc(h.footer)}</p>` : ''}
    <p class="lh-web">${esc(h.tagline ?? h.name)} · ${esc(h.website)}</p>
  </footer>`;
}

/**
 * A complete page. The House prints it in place (hidden frame) or saves it as a
 * PDF from the \`.sheet\`; opened directly, a small toolbar offers Print.
 */
export function docShell(o: { title: string; nonce: string; narrow: boolean; thermal?: boolean; body: string; css?: string; autoprint?: boolean }) {
  const n = o.narrow;
  const ink = o.thermal ? '#000' : BRAND.navy;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<style nonce="${o.nonce}">
  @page { size: ${n ? '80mm auto' : 'A4'}; margin: ${n ? '3mm' : '12mm'}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${BRAND.mist}; color: ${ink}; font: ${n ? '11.5px' : '13px'}/1.45 ${o.thermal ? 'ui-monospace, "Cascadia Mono", Menlo, "Courier New", monospace' : 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { position: relative; width: ${n ? '74mm' : '186mm'}; ${n ? '' : 'min-height: 260mm;'} margin: 20px auto; background: #fff; padding: ${n ? '4mm 3mm' : '12mm 14mm'}; box-shadow: 0 10px 40px -20px rgb(0 0 0 / .35); }
  .lh { display: flex; ${n ? 'flex-direction: column; align-items: center; text-align: center; gap: 2mm;' : 'justify-content: space-between; align-items: flex-end; gap: 10mm;'} padding-bottom: ${n ? '2.5mm' : '5mm'}; border-bottom: ${n ? '1.5px dashed' : '2.5px solid'} ${ink}; }
  .lh-name { display: flex; align-items: center; ${n ? 'justify-content: center;' : ''} gap: 8px; margin-bottom: 3px; }
  .lh-name b { font: 700 ${n ? '16px' : '22px'}/1.1 ${o.thermal ? 'inherit' : 'Georgia, "Times New Roman", serif'}; letter-spacing: .01em; ${o.thermal ? 'text-transform: uppercase;' : ''} }
  .lh-brand span { display: block; color: ${o.thermal ? '#000' : BRAND.muted}; font-size: ${n ? '10px' : '11.5px'}; }
  .lh-doc { text-align: ${n ? 'center' : 'right'}; }
  .lh-t { font-size: ${n ? '11px' : '11.5px'}; letter-spacing: .16em; text-transform: uppercase; color: ${o.thermal ? '#000' : BRAND.copper}; font-weight: 800; }
  .lh-no { font: 700 ${n ? '14px' : '17px'}/1.3 ui-monospace, Menlo, monospace; }
  .lh-dt { color: ${o.thermal ? '#000' : BRAND.muted}; font-size: ${n ? '10.5px' : '12px'}; }
  .lh-badge { display: inline-block; margin-top: 3px; padding: 1px 8px; border: 1.5px solid; border-radius: 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .lh-badge.ok { color: ${o.thermal ? '#000' : '#15803d'}; } .lh-badge.bad { color: ${o.thermal ? '#000' : '#b91c1c'}; } .lh-badge.warn { color: ${o.thermal ? '#000' : '#b45309'}; }
  .qr { margin: 3mm auto 0; text-align: center; } .qr svg { display: block; margin: 0 auto; } .qr span { display: block; margin-top: 1mm; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .lh-foot { margin-top: ${n ? '4mm' : '9mm'}; padding-top: ${n ? '2.5mm' : '4mm'}; border-top: ${n ? '1.5px dashed' : '1px solid #D5D6D6'} ${o.thermal ? '#000' : ''}; color: ${o.thermal ? '#000' : BRAND.muted}; font-size: ${n ? '10px' : '11px'}; text-align: ${n ? 'center' : 'left'}; }
  .lh-foot p { margin: 0 0 1mm; }
  .lh-web { font-weight: 600; color: ${ink}; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; gap: 8px; padding: 10px; background: rgb(244 245 247 / .92); backdrop-filter: blur(6px); border-bottom: 1px solid ${BRAND.line}; }
  .toolbar button { font: 600 13px system-ui, sans-serif; padding: 8px 18px; border-radius: 999px; border: 0; background: ${BRAND.navy}; color: #fff; cursor: pointer; }
  .toolbar button:hover { background: ${BRAND.copper}; }
  html.embedded .toolbar { display: none; }
  html.embedded body { background: #fff; }
  html.embedded .sheet { margin: 0 auto; box-shadow: none; }
  @media print {
    body { background: #fff !important; }
    .sheet { margin: 0 !important; box-shadow: none !important; width: 100% !important; min-height: 0 !important; padding: ${n ? '0' : '0'} !important; }
    .toolbar { display: none !important; }
  }
  ${o.css ?? ''}
</style></head>
<body>
  <script nonce="${o.nonce}">if (window.self !== window.top) document.documentElement.classList.add('embedded');</script>
  <div class="toolbar"><button type="button" id="rb-print">Print</button></div>
  <main class="sheet">${o.body}</main>
  <script nonce="${o.nonce}">
    document.getElementById('rb-print').addEventListener('click', function () { window.print(); });
    ${o.autoprint ? "window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });" : ''}
  </script>
</body></html>`;
}

/** Send a printable page with its own strict policy: only its nonce'd style and script run; only the House and the site may frame it. */
export function sendDocument(res: Response, out: { html: string; nonce: string }) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${out.nonce}'; script-src 'nonce-${out.nonce}'; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self' ${env.WEB_URL} ${env.ADMIN_URL}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(out.html);
}
