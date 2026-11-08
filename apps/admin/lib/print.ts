'use client';
import { BRAND_COPPER, BRAND_NAVY, brandNow, loadBrand, type Brand } from './brand';

/**
 * One way to print anything in the House: a screen, a dialog or a table.
 *
 * The content is copied into a hidden frame as a clean A4 document: the hotel's
 * letterhead, the title and period, who printed it and when, page numbers in the
 * margin, and none of the screen's buttons, filters or tabs. "Save as PDF" in the
 * print dialog turns it into a shareable PDF named after the document.
 */
export interface PrintOptions {
  title: string;
  subtitle?: string;
  /** Extra facts under the letterhead, e.g. [["Period", "1–30 Nov"], ["Department", "Bar"]]. */
  meta?: [string, string][];
  /** A live element to copy (its screen controls are dropped). */
  node?: HTMLElement | null;
  /** Or ready-made HTML (tables from exports). */
  html?: string;
  orientation?: 'portrait' | 'landscape';
  /** A closing line printed after the content. */
  note?: string;
  /** Saved-PDF name without extension. */
  filename?: string;
}

let author: string | null = null;
/** The shell tells us who is signed in, so every page says who printed it. */
export function setDocumentAuthor(name: string | null) {
  author = name;
}

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cssString = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

export const kampalaStamp = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

export const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document';

/** Screen-only things that never belong on paper. */
const STRIP = [
  'button',
  'input',
  'select',
  'textarea',
  'dialog',
  '[role="tablist"]',
  '[role="search"]',
  '.no-print',
  '[data-page-header]',
  '[data-no-print]',
  '.skeleton',
  'script',
  'noscript',
  'iframe',
].join(',');

function cleanClone(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  // Inputs that carry meaning on paper (a filled textarea) become text first.
  const live = node.querySelectorAll<HTMLTextAreaElement>('textarea[data-print-value]');
  clone.querySelectorAll<HTMLTextAreaElement>('textarea[data-print-value]').forEach((t, i) => {
    const p = document.createElement('p');
    p.textContent = live[i]?.value ?? '';
    p.style.whiteSpace = 'pre-wrap';
    t.replaceWith(p);
  });
  clone.querySelectorAll(STRIP).forEach((el) => el.remove());
  clone.querySelectorAll('[aria-hidden="true"]:empty').forEach((el) => el.remove());
  // Links read as text on paper.
  clone.querySelectorAll('a').forEach((a) => a.removeAttribute('href'));
  return clone;
}

export function letterhead(brand: Brand, o: Pick<PrintOptions, 'title' | 'subtitle' | 'meta'>) {
  const contact = [brand.address, brand.phone, brand.email].filter(Boolean).map(escapeHtml).join(' · ');
  const facts: [string, string][] = [...(o.meta ?? []), ['Printed', `${kampalaStamp()}${author ? ` · ${author}` : ''}`]];
  return `
  <div class="rb-mast">
    <div class="rb-brand">
      <img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}" />
      ${contact ? `<div class="rb-contact">${contact}</div>` : ''}
    </div>
    <div class="rb-title">
      <div class="rb-kicker">${escapeHtml(brand.name)}</div>
      <h1>${escapeHtml(o.title)}</h1>
      ${o.subtitle ? `<div class="rb-sub">${escapeHtml(o.subtitle)}</div>` : ''}
    </div>
  </div>
  <div class="rb-facts">${facts.map(([k, v]) => `<span><b>${escapeHtml(k)}</b> ${escapeHtml(v)}</span>`).join('')}</div>`;
}

export const DOC_CSS = `
  html, body { background: #fff !important; color: #0f172a !important; margin: 0; }
  body { font-size: 11px; font-family: var(--font-sans, ui-sans-serif), system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rb-page { padding: 0; }
  .rb-mast { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-bottom: 10px; border-bottom: 2.5px solid ${BRAND_NAVY}; }
  .rb-brand img { height: 40px; width: auto; display: block; }
  .rb-contact { margin-top: 5px; font-size: 8.5px; color: #64748b; max-width: 320px; line-height: 1.4; }
  .rb-title { text-align: right; }
  .rb-kicker { font-size: 8px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${BRAND_COPPER}; }
  .rb-title h1 { margin: 2px 0 0; font-size: 19px; line-height: 1.15; font-weight: 800; color: ${BRAND_NAVY}; letter-spacing: -.01em; }
  .rb-sub { margin-top: 2px; font-size: 10px; color: #475569; }
  .rb-facts { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 6px 0 12px; font-size: 8.5px; color: #64748b; border-bottom: 1px solid #e2e8f0; margin-bottom: 14px; }
  .rb-facts b { color: #334155; font-weight: 700; margin-right: 2px; }
  .rb-end { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8.5px; color: #64748b; }

  /* Copied screens: flatten what only makes sense on a monitor. */
  .rb-doc * { box-shadow: none !important; animation: none !important; transition: none !important; }
  .rb-doc, .rb-doc * { overflow: visible !important; max-height: none !important; }
  .rb-doc .sticky, .rb-doc .fixed { position: static !important; }
  .rb-doc .card, .rb-doc section { border-color: #e2e8f0 !important; background: #fff !important; }
  .rb-doc tr, .rb-doc li, .rb-doc .card > header { break-inside: avoid; }
  .rb-doc h2, .rb-doc h3, .rb-doc header { break-after: avoid; }
  .rb-doc thead { display: table-header-group; }
  .rb-doc table { width: 100%; }
  .rb-doc a { color: inherit !important; text-decoration: none !important; }
  .rb-doc .card > :not(header) { break-inside: auto; }

  /* Tables made for paper (exports). */
  table.rb-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  table.rb-table thead th { background: ${BRAND_NAVY}; color: #fff; text-align: left; font-weight: 700; padding: 6px 7px; font-size: 8.5px; letter-spacing: .04em; text-transform: uppercase; }
  table.rb-table td { padding: 5px 7px; border-bottom: 1px solid #e8ecf2; vertical-align: top; }
  table.rb-table tbody tr:nth-child(even) td { background: #f8fafc; }
  table.rb-table .nw { white-space: nowrap; }
  table.rb-table .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.rb-table tfoot td { font-weight: 800; border-top: 2px solid ${BRAND_NAVY}; border-bottom: 0; padding-top: 7px; background: #fff; }
  .rb-count { margin: 0 0 6px; font-size: 9px; color: #64748b; }
`;

function pageCss(brand: Brand, o: PrintOptions) {
  const left = `${brand.name} · ${o.title}`;
  return `
  @page {
    size: A4 ${o.orientation ?? 'portrait'};
    margin: 13mm 12mm 15mm;
    @bottom-left { content: ${cssString(left)}; font: 7.5pt system-ui, sans-serif; color: #64748b; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt system-ui, sans-serif; color: #64748b; }
  }`;
}

async function settle(doc: Document) {
  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  const imgs = [...doc.images];
  await Promise.race([
    Promise.all([
      ...links.map((l) => (l.sheet ? Promise.resolve() : new Promise((r) => { l.onload = l.onerror = r; }))),
      ...imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; }))),
      doc.fonts?.ready,
    ]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
}

export async function printDocument(o: PrintOptions) {
  const brand = await Promise.race([loadBrand(), new Promise<Brand>((r) => setTimeout(() => r(brandNow()), 1500))]);
  const body = o.node ? cleanClone(o.node).outerHTML : (o.html ?? '');
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join('\n');
  const name = o.filename ?? `${fileSlug(brand.name)}-${fileSlug(o.title)}`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html lang="en" data-theme="light" class="${escapeHtml(document.documentElement.className)}"><head>
    <meta charset="utf-8"><base href="${escapeHtml(location.origin)}/"><title>${escapeHtml(name)}</title>
    ${styles}
    <style>${DOC_CSS}${pageCss(brand, o)}</style>
  </head><body class="${escapeHtml(document.body.className)}"><div class="rb-page">
    ${letterhead(brand, o)}
    <div class="rb-doc">${body}</div>
    <div class="rb-end">${o.note ? `${escapeHtml(o.note)} · ` : ''}Internal document of ${escapeHtml(brand.name)}. UGX and USD are shown separately and never converted.</div>
  </div></body></html>`);
  doc.close();
  await settle(doc);

  const before = document.title;
  document.title = name;
  const cleanup = () => {
    document.title = before;
    setTimeout(() => frame.remove(), 500);
  };
  frame.contentWindow!.addEventListener('afterprint', cleanup, { once: true });
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  // Some browsers never fire afterprint for frames.
  setTimeout(() => frame.isConnected && cleanup(), 60_000);
}

/** Print the current screen (Ctrl/Cmd+P and every page's Print button). */
export function printScreen(opts: Partial<PrintOptions> & { node?: HTMLElement | null } = {}) {
  const main = opts.node ?? document.querySelector<HTMLElement>('main');
  if (!main) return window.print();
  const h1 = main.querySelector('[data-page-header] h1, [data-page-header] h2') ?? main.querySelector('h1');
  const sub = h1?.parentElement?.querySelector('p');
  return printDocument({
    title: opts.title ?? h1?.textContent?.trim() ?? document.title,
    subtitle: opts.subtitle ?? sub?.textContent?.trim() ?? undefined,
    ...opts,
    node: main,
  });
}
