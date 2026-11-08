'use client';
import { brandNow, loadBrand, type Brand } from './brand';
import { escapeHtml, fileSlug, kampalaStamp, printDocument } from './print';
import { money } from './money';

/**
 * Every list and report in the House exports through here, in three forms:
 *  - Excel (.xlsx): letterhead rows, a styled header, real numbers with currency
 *    formats, totals, frozen header and filters — ready to send to an accountant.
 *  - CSV: plain data for other systems (no letterhead, numbers unformatted).
 *  - PDF: the same table printed as a branded A4 document.
 * Money cells carry their own currency, so UGX and USD are never added together.
 */
export type MoneyCell = { money: string | number | bigint | null | undefined; currency: string };
export type Cell = string | number | boolean | null | undefined | MoneyCell;
export type ColumnKind = 'text' | 'number' | 'money' | 'percent' | 'date';
export interface Column {
  label: string;
  kind?: ColumnKind;
  /** Approximate width in characters (Excel). */
  width?: number;
}
export interface ExportSpec {
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  columns: (Column | string)[];
  rows: Cell[][];
  /** A final totals row (money cells allowed). */
  totals?: Cell[];
  /** File name without extension; defaults to hotel-title-date. */
  filename?: string;
  orientation?: 'portrait' | 'landscape';
}
export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

const isMoney = (v: Cell): v is MoneyCell => !!v && typeof v === 'object' && 'currency' in v;
const cols = (s: ExportSpec): Column[] => s.columns.map((c) => (typeof c === 'string' ? { label: c } : c));
const kindOf = (c: Column, values: Cell[]): ColumnKind =>
  c.kind ?? (values.some(isMoney) ? 'money' : values.length && values.every((v) => v === null || v === undefined || v === '' || typeof v === 'number') ? 'number' : 'text');

/** Minor units → major units as a number (UGX has no minor unit, USD has cents). */
const major = (m: MoneyCell) => {
  if (m.money === null || m.money === undefined || m.money === '') return null;
  const n = Number(BigInt(m.money));
  return m.currency === 'USD' ? n / 100 : n;
};
const display = (v: Cell): string => {
  if (isMoney(v)) return v.money === null || v.money === undefined ? '' : money(v.money, v.currency);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString('en-GB');
  return v ?? '';
};
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
/** Kampala time, sortable: 2026-11-08 14:05. */
const sheetTime = (t: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const defaultName = (brand: Brand, s: ExportSpec) => s.filename ?? `${fileSlug(brand.name)}-${fileSlug(s.title)}-${today()}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ─────────────────────────── CSV ─────────────────────────── */

function toCsv(s: ExportSpec) {
  const c = cols(s);
  // A single-currency money column becomes plain numbers with the currency in its header.
  const currencyOf = c.map((_, i) => {
    const set = new Set(s.rows.map((r) => r[i]).filter(isMoney).map((m) => m.currency));
    return set.size === 1 ? [...set][0]! : null;
  });
  const cell = (v: Cell, i: number) => {
    if (isMoney(v)) return currencyOf[i] ? String(major(v) ?? '') : display(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return v ?? '';
  };
  const esc = (v: unknown) => {
    const t = String(v);
    return /[",\r\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${(/^[=+\-@]/.test(t) && Number.isNaN(Number(t)) ? `'${t}` : t).replace(/"/g, '""')}"` : t;
  };
  const head = c.map((x, i) => (currencyOf[i] && !x.label.includes(currencyOf[i]!) ? `${x.label} (${currencyOf[i]})` : x.label));
  const lines = [head, ...s.rows.map((r) => c.map((_, i) => cell(r[i], i))), ...(s.totals ? [c.map((_, i) => cell(s.totals![i], i))] : [])];
  return '﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n');
}

/* ─────────────────────────── XLSX ─────────────────────────── */

const xml = (v: unknown) => escapeHtml(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Style indexes (see styles.xml below).
const S = { text: 0, brand: 1, title: 2, muted: 3, head: 4, cell: 5, num: 6, ugx: 7, usd: 8, pct: 9, totText: 10, totNum: 11, totUgx: 12, totUsd: 13, money: 14, totMoney: 15 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;UGX&quot; #,##0"/><numFmt numFmtId="165" formatCode="&quot;USD&quot; #,##0.00"/><numFmt numFmtId="166" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="167" formatCode="#,##0"/></numFmts>
<fonts count="6">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF1A1E43"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><color rgb="FFD76E1B"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1A1E43"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill></fills>
<borders count="3"><border/><border><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border><border><top style="medium"><color rgb="FF1A1E43"/></top></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="16">
<xf/>
<xf fontId="1" applyFont="1"/>
<xf fontId="2" applyFont="1"/>
<xf fontId="3" applyFont="1"/>
<xf fontId="4" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="167" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="5" fillId="3" borderId="2" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="167" fontId="5" fillId="3" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="5" fillId="3" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="5" fillId="3" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf borderId="1" applyBorder="1"><alignment horizontal="right"/></xf>
<xf fontId="5" fillId="3" borderId="2" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(brand: Brand, s: ExportSpec) {
  const c = cols(s);
  const kinds = c.map((col, i) => kindOf(col, s.rows.map((r) => r[i])));
  const rows: string[] = [];
  let r = 0;
  const str = (ref: string, v: string, st: number) => `<c r="${ref}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  const num = (ref: string, v: number, st: number) => `<c r="${ref}" s="${(st === S.num || st === S.totNum) && !Number.isInteger(v) ? (st === S.num ? S.cell : S.totText) : st}"><v>${v}</v></c>`;
  const line = (cells: string, height?: number) => {
    r++;
    rows.push(`<row r="${r}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`);
  };

  line(str('A1', brand.name, S.brand), 22);
  line(str(`A${r + 1}`, s.title, S.title), 18);
  if (s.subtitle) line(str(`A${r + 1}`, s.subtitle, S.muted));
  const facts = [...(s.meta ?? []), ['Generated', kampalaStamp()] as [string, string]];
  line(str(`A${r + 1}`, facts.map(([k, v]) => `${k}: ${v}`).join('   ·   '), S.muted));
  const contact = [brand.address, brand.phone, brand.email].filter(Boolean).join(' · ');
  if (contact) line(str(`A${r + 1}`, contact, S.muted));
  line('');
  const headRow = r + 1;
  line(c.map((col, i) => str(`${colName(i)}${headRow}`, col.label, S.head)).join(''), 20);

  const write = (vals: Cell[], total: boolean) => {
    const at = r + 1;
    const cells = c.map((_, i) => {
      const ref = `${colName(i)}${at}`;
      const v = vals[i];
      if (isMoney(v)) {
        const n = major(v);
        if (n === null) return str(ref, '', total ? S.totText : S.cell);
        if (v.currency === 'UGX') return num(ref, n, total ? S.totUgx : S.ugx);
        if (v.currency === 'USD') return num(ref, n, total ? S.totUsd : S.usd);
        return str(ref, display(v), total ? S.totMoney : S.money);
      }
      if (typeof v === 'number' && Number.isFinite(v)) return num(ref, v, total ? S.totNum : kinds[i] === 'percent' ? S.pct : S.num);
      if (typeof v === 'string' && kinds[i] === 'number' && v.trim() !== '' && Number.isFinite(Number(v))) return num(ref, Number(v), total ? S.totNum : S.num);
      const t = display(v ?? '');
      return str(ref, ISO_TIME.test(t) ? sheetTime(t) : t, total ? S.totText : S.cell);
    });
    line(cells.join(''));
  };
  s.rows.forEach((row) => write(row, false));
  const lastData = r;
  if (s.totals) write(s.totals, true);

  const widths = c.map((col, i) => {
    if (col.width) return col.width;
    const sample = [col.label, ...s.rows.slice(0, 300).map((row) => display(row[i]))];
    return Math.min(48, Math.max(9, ...sample.map((t) => String(t).length + 2)));
  });
  const last = colName(c.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${last}${Math.max(r, 1)}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
${s.rows.length ? `<autoFilter ref="A${headRow}:${last}${lastData}"/>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${s.orientation ?? (c.length > 7 ? 'landscape' : 'portrait')}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L${xml(brand.name)} · ${xml(s.title)}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>
</worksheet>`;
}

// Minimal ZIP (stored, no compression) — enough for an .xlsx, no dependency.
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(files: [string, string][]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = enc.encode(text);
    const fname = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, fname.length, true);
    parts.push(new Uint8Array(local.buffer), fname, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, fname.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), fname);
    offset += 30 + fname.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function toXlsx(brand: Brand, s: ExportSpec) {
  const sheet = s.title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';
  return zip([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ],
    [
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(s.title)}</dc:title><dc:creator>${xml(brand.name)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetXml(brand, s)],
  ]);
}

/* ─────────────────────────── PDF (print) ─────────────────────────── */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Paper reads dates the way people say them; spreadsheets keep ISO so they sort. */
const paperText = (t: string) => {
  if (ISO_DAY.test(t)) return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${t}T00:00:00Z`));
  if (ISO_TIME.test(t)) return kampalaStamp(new Date(t));
  return t;
};

function toHtmlTable(s: ExportSpec) {
  const c = cols(s);
  const kinds = c.map((col, i) => kindOf(col, s.rows.map((r) => r[i])));
  const right = (i: number) => (kinds[i] === 'money' || kinds[i] === 'number' || kinds[i] === 'percent' ? ' class="r"' : '');
  const fmt = (v: Cell, i: number) => (typeof v === 'number' && kinds[i] === 'percent' ? `${v}%` : typeof v === 'string' ? paperText(v) : display(v));
  const td = (v: Cell, i: number) => {
    const t = fmt(v, i);
    const cls = right(i) ? ' class="r"' : t.length <= 24 && !/\s/.test(t) ? ' class="nw"' : /^\d{1,2} \w{3} \d{4}/.test(t) ? ' class="nw"' : '';
    return `<td${cls}>${escapeHtml(t)}</td>`;
  };
  return `<p class="rb-count">${s.rows.length.toLocaleString('en-GB')} ${s.rows.length === 1 ? 'row' : 'rows'}</p>
  <table class="rb-table"><thead><tr>${c.map((x, i) => `<th${right(i)}>${escapeHtml(x.label)}</th>`).join('')}</tr></thead>
  <tbody>${s.rows.map((r) => `<tr>${c.map((_, i) => td(r[i], i)).join('')}</tr>`).join('')}</tbody>
  ${s.totals ? `<tfoot><tr>${c.map((_, i) => `<td${right(i)}>${escapeHtml(fmt(s.totals![i], i))}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}

export async function exportData(format: ExportFormat, s: ExportSpec) {
  const brand = await Promise.race([loadBrand(), new Promise<Brand>((r) => setTimeout(() => r(brandNow()), 1500))]);
  const name = defaultName(brand, s);
  if (format === 'csv') return download(new Blob([toCsv(s)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
  if (format === 'xlsx') return download(toXlsx(brand, s), `${name}.xlsx`);
  return printDocument({
    title: s.title,
    subtitle: s.subtitle,
    meta: s.meta,
    html: toHtmlTable(s),
    filename: name,
    orientation: s.orientation ?? (cols(s).length > 7 ? 'landscape' : 'portrait'),
  });
}

/** Shorthand for money cells. */
export const m = (minor: string | number | bigint | null | undefined, currency: string): MoneyCell => ({ money: minor, currency });
