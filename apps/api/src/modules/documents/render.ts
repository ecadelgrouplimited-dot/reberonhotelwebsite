import type { DocumentData } from '@reberon/contracts';
import { formatMoney, type Currency } from '@reberon/utils';
import { renderQrSvg } from './qr.js';

export type Paper = 'A4' | '80MM';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (m: string | bigint, c: string) => formatMoney(BigInt(m), c as Currency).replace(/\.00$/, '');
const day = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00Z`),
  );
const stamp = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Kampala',
  }).format(new Date(iso));

export interface RenderInput {
  kind: 'RECEIPT' | 'REFUND' | 'INVOICE' | 'STATEMENT' | 'QUOTATION';
  number: string;
  issuedAt: string;
  currency: string;
  amountMinor: string;
  issuedTo: { name: string; phone?: string | null; email?: string | null };
  data: DocumentData;
  checkCode: string | null;
  voided: { at: string; reason: string } | null;
  /** 0 = the original; n = the nth copy. */
  copy: number;
  paper: Paper;
  autoprint: boolean;
  nonce: string;
  verifyUrl: string | null;
  /** Direct QR target URL override (e.g. for statements). */
  qrUrlOverride?: string | null;
  /** The same document on the other paper size (keeps any access token). */
  altPaperUrl: string;
}

/** One HTML page per document. Print it, or save it as a PDF from the print dialog. */
export function renderDocument(d: RenderInput): string {
  const narrow = d.paper === '80MM';
  const x = d.data;
  const cur = d.currency;
  const isInvoice = d.kind === 'INVOICE' || d.kind === 'STATEMENT' || d.kind === 'QUOTATION';
  const isQuotation = d.kind === 'QUOTATION';

  const qrTarget =
    d.qrUrlOverride ??
    (d.checkCode && d.verifyUrl
      ? `https://${d.verifyUrl.replace(/^https?:\/\//, '')}?number=${encodeURIComponent(d.number)}&check=${encodeURIComponent(d.checkCode)}`
      : null);
  const qrSvg = qrTarget ? renderQrSvg(qrTarget, narrow ? 88 : 108) : '';

  const hotelLines = [
    x.hotel.legalName && x.hotel.legalName !== x.hotel.name ? x.hotel.legalName : null,
    x.hotel.address,
    [x.hotel.phone, x.hotel.email].filter(Boolean).join(' · ') || null,
    x.hotel.tin ? `TIN ${x.hotel.tin}` : null,
  ].filter(Boolean);

  const rows = (lines: { date: string; description: string; amountMinor: string }[], negate = false) =>
    lines
      .map(
        (l) =>
          `<tr><td class="d">${esc(day(l.date))}</td><td>${esc(l.description)}</td><td class="n">${esc(money(negate ? -BigInt(l.amountMinor) : BigInt(l.amountMinor), cur))}</td></tr>`,
      )
      .join('');

  const body = isInvoice
    ? `
      <table class="lines"><thead><tr><th class="d">Date</th><th>${isQuotation ? 'Package / Item Description' : 'Item'}</th><th class="n">Amount</th></tr></thead><tbody>${rows(x.lines)}</tbody>
        <tfoot>
          <tr class="sum"><td></td><td>${isQuotation ? 'Total Quoted' : 'Total Charges'}</td><td class="n">${esc(money(x.totals.chargesMinor, cur))}</td></tr>
          ${x.vat ? `<tr class="vat"><td></td><td>Includes VAT ${x.vat.ratePercent}%</td><td class="n">${esc(money(x.vat.includedMinor, cur))}</td></tr>` : ''}
        </tfoot>
      </table>
      ${x.payments.length ? `<h3>Payments Received</h3><table class="lines"><tbody>${rows(x.payments, true)}</tbody></table>` : ''}
      <div class="total"><span>${isQuotation ? 'Total Quotation Amount' : BigInt(x.totals.balanceMinor) > 0n ? 'Balance due' : BigInt(x.totals.balanceMinor) < 0n ? 'In credit' : 'Paid in full'}</span><b>${esc(money(BigInt(x.totals.balanceMinor) < 0n ? -BigInt(x.totals.balanceMinor) : BigInt(x.totals.balanceMinor), cur))}</b></div>
      ${x.amountInWords ? `<p class="words">${esc(x.amountInWords)}</p>` : ''}`
    : `
      <div class="amount"><span>${d.kind === 'REFUND' ? 'Refunded' : 'Amount Received'}</span><b>${esc(money(d.amountMinor, cur))}</b></div>
      <p class="words">${esc(x.amountInWords)}</p>
      ${
        x.lines && x.lines.length > 0
          ? `<h3>Itemized Breakdown</h3><table class="lines"><thead><tr><th class="d">Date</th><th>Description</th><th class="n">Amount</th></tr></thead><tbody>${rows(x.lines)}</tbody></table>`
          : ''
      }
      <dl class="facts">
        ${x.payment ? `<div><dt>Purpose</dt><dd>${esc(x.payment.purpose)}</dd></div><div><dt>Payment Method</dt><dd>${esc(x.payment.method)}${x.payment.reference ? ` · Ref: ${esc(x.payment.reference)}` : ''}</dd></div>` : ''}
        ${x.reservation ? `<div><dt>Balance after this payment</dt><dd><b>${esc(money(BigInt(x.totals.balanceMinor) > 0n ? x.totals.balanceMinor : '0', cur))}</b></dd></div>` : ''}
      </dl>`;

  const recipientLabel =
    d.kind === 'REFUND' ? 'Refunded to' : isQuotation ? 'Prepared for' : isInvoice ? 'Billed to' : 'Received from';

  const contextSection = x.reservation
    ? isQuotation
      ? `<div><h4>Event &amp; Venue</h4><p><b>${esc(x.reservation.code)}</b> · ${esc(x.reservation.room)}</p><p>${
          x.reservation.arrival === x.reservation.departure
            ? esc(day(x.reservation.arrival))
            : `${esc(day(x.reservation.arrival))} → ${esc(day(x.reservation.departure))}`
        }</p><p>${esc(x.reservation.guests)}</p></div>`
      : `<div><h4>Stay Details</h4><p><b>${esc(x.reservation.code)}</b> · ${esc(x.reservation.room)}</p><p>${esc(day(x.reservation.arrival))} → ${esc(day(x.reservation.departure))} · ${x.reservation.nights} night${x.reservation.nights === 1 ? '' : 's'}</p><p>${esc(x.reservation.guests)}</p></div>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(x.title)} ${esc(d.number)}</title>
<style nonce="${d.nonce}">
  @page { size: ${narrow ? '80mm auto' : 'A4'}; margin: ${narrow ? '4mm' : '14mm'}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #ECE8DF; color: #121513; font: ${narrow ? '12px' : '13.5px'}/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { position: relative; width: ${narrow ? '72mm' : '180mm'}; min-height: ${narrow ? 'auto' : '250mm'}; margin: 24px auto; background: #fff; padding: ${narrow ? '4mm' : '14mm 16mm'}; box-shadow: 0 10px 40px -20px rgb(0 0 0 / .35); overflow: hidden; }
  header { display: flex; ${narrow ? 'flex-direction: column; text-align: center; gap: 2mm;' : 'justify-content: space-between; gap: 10mm;'} border-bottom: 2px solid #121513; padding-bottom: ${narrow ? '3mm' : '6mm'}; }
  .brand-head { display: inline-flex; align-items: center; ${narrow ? 'justify-content: center;' : ''} gap: 8px; margin-bottom: 3px; }
  .brand-logo { width: ${narrow ? '26px' : '32px'}; height: ${narrow ? '16px' : '20px'}; flex-shrink: 0; }
  .brand b { display: block; font: 600 ${narrow ? '17px' : '23px'}/1.1 Georgia, "Times New Roman", serif; letter-spacing: .01em; }
  .brand span { display: block; color: #55594F; font-size: ${narrow ? '10.5px' : '12px'}; }
  .doc { text-align: ${narrow ? 'center' : 'right'}; }
  .doc .t { font-size: ${narrow ? '13px' : '12px'}; letter-spacing: .18em; text-transform: uppercase; color: #9E2A2B; font-weight: 700; }
  .doc .no { font: 600 ${narrow ? '15px' : '18px'}/1.3 ui-monospace, "SFMono-Regular", Menlo, monospace; }
  .doc .dt { color: #55594F; font-size: 12px; }
  .copy { display: inline-block; margin-top: 1mm; padding: 1px 8px; border: 1px solid #121513; font-size: 10.5px; letter-spacing: .15em; font-weight: 700; }
  .to { display: grid; grid-template-columns: ${narrow ? '1fr' : '1fr 1fr'}; gap: 4mm; margin: ${narrow ? '3mm 0' : '7mm 0'}; }
  .to h4, h3 { margin: 0 0 1mm; font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: #8A867B; font-weight: 600; }
  .to p { margin: 0; }
  .amount { display: flex; justify-content: space-between; align-items: baseline; border: 1.5px solid #121513; background: #FAF8F3; padding: ${narrow ? '3mm' : '5mm 6mm'}; margin-top: ${narrow ? '2mm' : '4mm'}; }
  .amount span { color: #55594F; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .1em; }
  .amount b { font-size: ${narrow ? '20px' : '28px'}; font-variant-numeric: tabular-nums; }
  .words { margin: 2mm 0 0; font-style: italic; color: #33372F; }
  .facts { margin: ${narrow ? '3mm' : '6mm'} 0 0; display: grid; gap: 1.5mm; }
  .facts div { display: flex; justify-content: space-between; gap: 4mm; border-bottom: 1px dotted #CFCBC0; padding-bottom: 1.5mm; }
  .facts dt { color: #55594F; } .facts dd { margin: 0; text-align: right; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 3mm; }
  .lines th { text-align: left; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: #8A867B; font-weight: 600; border-bottom: 1px solid #121513; padding: 1.5mm 0; }
  .lines td { padding: 1.6mm 0; border-bottom: 1px solid #E7E2D6; vertical-align: top; }
  .lines .d { width: ${narrow ? '18mm' : '28mm'}; color: #55594F; white-space: nowrap; padding-right: 3mm; }
  .lines .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding-left: 3mm; }
  .lines tfoot td { border: 0; }
  .lines .sum td { font-weight: 700; border-top: 1px solid #121513; padding-top: 2mm; }
  .lines .vat td { color: #55594F; font-size: 12px; }
  h3 { margin-top: 5mm; }
  .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4mm; padding: 3mm 0; border-top: 2px solid #121513; font-size: ${narrow ? '14px' : '16px'}; }
  .total b { font-size: ${narrow ? '17px' : '22px'}; }
  footer { margin-top: ${narrow ? '4mm' : '10mm'}; padding-top: 4mm; border-top: 1px solid #CFCBC0; color: #55594F; font-size: 11.5px; ${narrow ? 'text-align:center;' : 'display:flex; justify-content:space-between; align-items:center; gap:6mm;'} }
  footer p { margin: 0 0 1.2mm; }
  footer a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .qr-box { ${narrow ? 'margin: 3mm auto 0;' : 'flex-shrink: 0;'} text-align: center; }
  .qr-box a { text-decoration: none; color: inherit; display: inline-block; }
  .qr-box svg { border: 1.5px solid #121513; border-radius: 6px; background: #fff; display: block; margin: 0 auto; }
  .qr-box span { display: block; font-size: 9.5px; font-weight: 600; color: #121513; letter-spacing: .06em; text-transform: uppercase; margin-top: 3px; }
  .credit { margin-top: 2.5mm; font-size: 10px; color: #7C786E; }
  .check { font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: .08em; color: #121513; background: #F4F1EA; padding: 1px 5px; border-radius: 3px; }
  .note { margin-top: 4mm; padding: 2.5mm 3.5mm; background: #F4F1EA; border-left: 3px solid #121513; font-size: 12px; }
  .void { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .void span { transform: rotate(-24deg); font: 700 ${narrow ? '42px' : '110px'}/1 Georgia, serif; color: rgb(158 42 43 / .18); border: 6px solid rgb(158 42 43 / .18); padding: 0 6mm; letter-spacing: .1em; }
  .voidnote { color: #9E2A2B; font-weight: 600; }
  .toolbar { position: sticky; top: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 10px; background: rgb(236 232 223 / .92); backdrop-filter: blur(6px); z-index: 10; border-bottom: 1px solid #D8D3C8; }
  .toolbar button, .toolbar a { font: 600 13px system-ui, sans-serif; padding: 8px 16px; border-radius: 999px; border: 1px solid #121513; background: #121513; color: #fff; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
  .toolbar a { background: transparent; color: #121513; }
  .toolbar button:hover { background: #262B27; }
  .toolbar a:hover { background: #E2DED4; }
  @media print {
    body { background: #fff !important; }
    .sheet { margin: 0 !important; box-shadow: none !important; width: 100% !important; min-height: 0 !important; padding: ${narrow ? '0' : '2mm 0'} !important; }
    .toolbar { display: none !important; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button type="button" id="print"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>Print / Save PDF</button>
    <a href="${esc(d.altPaperUrl)}">${narrow ? 'Switch to A4 Page' : 'Switch to 80 mm Thermal'}</a>
    ${qrTarget ? `<a href="${esc(qrTarget)}" target="_blank" rel="noopener">Verify Authenticity ↗</a>` : ''}
  </div>
  <main class="sheet">
    ${d.voided ? '<div class="void" aria-hidden="true"><span>VOID</span></div>' : ''}
    <header>
      <div class="brand">
        <div class="brand-head">
          <svg viewBox="0 0 40 24" class="brand-logo" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path d="M1 22 L11 9 L16 14 L24 3 L39 22" />
            <path d="M6 22 L13 15.5" opacity=".5" />
            <circle cx="30" cy="6" r="2.2" fill="#CF8F2E" stroke="none" />
          </svg>
          <b>${esc(x.hotel.name)}</b>
        </div>
        ${hotelLines.map((l) => `<span>${esc(l)}</span>`).join('')}
      </div>
      <div class="doc">
        <div class="t">${esc(x.title)}</div>
        <div class="no">${esc(d.number)}</div>
        <div class="dt">${esc(stamp(d.issuedAt))}</div>
        ${d.copy > 0 ? `<span class="copy">COPY ${d.copy + 1}</span>` : d.kind !== 'STATEMENT' ? '<span class="copy">ORIGINAL</span>' : ''}
      </div>
    </header>
    <section class="to">
      <div><h4>${recipientLabel}</h4><p><b>${esc(d.issuedTo.name)}</b></p>${d.issuedTo.phone ? `<p>${esc(d.issuedTo.phone)}</p>` : ''}${d.issuedTo.email ? `<p>${esc(d.issuedTo.email)}</p>` : ''}</div>
      ${contextSection}
    </section>
    ${body}
    ${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}
    <footer>
      <div>
        ${d.voided ? `<p class="voidnote">Voided ${esc(stamp(d.voided.at))}: ${esc(d.voided.reason)}</p>` : ''}
        ${x.issuedBy ? `<p>Issued by <b>${esc(x.issuedBy)}</b></p>` : ''}
        ${x.footer ? `<p>${esc(x.footer)}</p>` : ''}
        ${d.checkCode ? `<p>Verification Code: <span class="check">${esc(d.checkCode)}</span>${d.verifyUrl ? ` · Verify online at <a href="${esc(qrTarget ?? `https://${d.verifyUrl}`)}" target="_blank" rel="noopener">${esc(d.verifyUrl)}</a>` : ''}</p>` : ''}
        ${d.kind === 'STATEMENT' ? '<p><b>Interim statement of account — not an official tax receipt.</b></p>' : ''}
        ${d.kind === 'QUOTATION' ? '<p><b>Official Pro-Forma Quotation — subject to terms &amp; validity stated above.</b></p>' : ''}
        <p class="credit">Technology created and managed by <a href="https://ecadelgroup.com" target="_blank" rel="noopener">ECADEL GROUP LIMITED</a></p>
      </div>
      ${qrSvg ? `<div class="qr-box"><a href="${esc(qrTarget ?? '#')}" target="_blank" rel="noopener" title="Scan or click to verify">${qrSvg}<span>Scan to verify</span></a></div>` : ''}
    </footer>
  </main>
  <script nonce="${d.nonce}">
    document.getElementById('print').addEventListener('click', function () { window.print(); });
    ${d.autoprint ? "window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });" : ''}
  </script>
</body></html>`;
}
