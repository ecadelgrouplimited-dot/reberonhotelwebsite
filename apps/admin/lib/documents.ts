'use client';
import { toast } from 'sonner';

/**
 * Hotel documents (receipts, invoices, quotations, POS bills, kitchen tickets,
 * requisition vouchers) are rendered by the API with the hotel's letterhead.
 * Here they are printed in place, saved as a PDF, or shared — never opened in a
 * new tab. The PDF comes from the same page the printer gets, so they match.
 */
export type Paper = 'A4' | '80MM';

const strip = (url: string) => {
  const u = new URL(url, location.origin);
  u.searchParams.delete('autoprint');
  return u.pathname + u.search;
};

async function loadFrame(url: string): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Real size off-screen: the page lays out exactly as on paper.
  frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:900px;height:1300px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The document took too long to load')), 30_000);
    frame.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    frame.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not load the document'));
    };
    frame.src = strip(url);
  });
  const doc = frame.contentDocument;
  if (!doc?.querySelector('.sheet')) {
    frame.remove();
    throw new Error(doc?.body?.innerText?.slice(0, 160) || 'This document could not be opened');
  }
  doc.documentElement.classList.add('embedded');
  await Promise.race([doc.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  await new Promise((r) => setTimeout(r, 120));
  return frame;
}

/** Print a hotel document right here — the print dialog opens over the current screen. */
export async function printDoc(url: string) {
  const id = toast.loading('Preparing to print…');
  try {
    const frame = await loadFrame(url);
    toast.dismiss(id);
    const win = frame.contentWindow!;
    const done = () => setTimeout(() => frame.remove(), 500);
    win.addEventListener('afterprint', done, { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.isConnected && frame.remove(), 120_000);
  } catch (e) {
    toast.error((e as Error).message, { id });
  }
}

async function makePdf(url: string, title: string): Promise<Blob> {
  const frame = await loadFrame(url);
  try {
    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);
    const sheet = frame.contentDocument!.querySelector<HTMLElement>('.sheet')!;
    const narrow = sheet.getBoundingClientRect().width < 420;
    const canvas = await html2canvas(sheet, { scale: narrow ? 3 : 2.4, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const img = (c: HTMLCanvasElement) => c.toDataURL('image/jpeg', 0.94);
    let pdf: InstanceType<typeof jsPDF>;
    if (narrow) {
      // A thermal slip: one page as long as the slip, 80 mm wide.
      const w = 80;
      const h = Math.max(60, (canvas.height / canvas.width) * (w - 6) + 6);
      pdf = new jsPDF({ unit: 'mm', format: [w, h], compress: true });
      pdf.addImage(img(canvas), 'JPEG', 3, 3, w - 6, h - 6);
    } else {
      // A4 with print margins; long documents continue on further pages.
      pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const margin = 12;
      const w = 210 - margin * 2;
      const pageH = 297 - margin * 2;
      const pxPerMm = canvas.width / w;
      const slicePx = Math.floor(pageH * pxPerMm);
      for (let y = 0, page = 0; y < canvas.height; y += slicePx, page++) {
        const part = document.createElement('canvas');
        part.width = canvas.width;
        part.height = Math.min(slicePx, canvas.height - y);
        part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (page > 0) pdf.addPage();
        pdf.addImage(img(part), 'JPEG', margin, margin, w, part.height / pxPerMm);
      }
    }
    pdf.setProperties({ title, creator: 'The House · Reberon Hotel' });
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

const fileName = (name: string) => `${name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'document'}.pdf`;

/** One click: the document is saved as a PDF named after it (e.g. RCT-2026-00012.pdf). */
export async function downloadDoc(url: string, name: string) {
  const id = toast.loading('Making the PDF…');
  try {
    const blob = await makePdf(url, name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast.success(`${fileName(name)} downloaded`, { id });
  } catch (e) {
    toast.error((e as Error).message || 'Could not make the PDF', { id });
  }
}

export const canShareFiles = () => {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
};

/** Phones and tablets: hand the PDF to WhatsApp, email or any app. */
export async function shareDoc(url: string, name: string, text?: string) {
  const id = toast.loading('Making the PDF…');
  try {
    const blob = await makePdf(url, name);
    const file = new File([blob], fileName(name), { type: 'application/pdf' });
    toast.dismiss(id);
    await navigator.share({ files: [file], title: name, text });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return toast.dismiss(id);
    toast.error((e as Error).message || 'Could not share', { id });
  }
}
