import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: { absolute: 'Verify a document · Reberon Hotel' }, robots: { index: false } };

/** Anyone holding a Reberon receipt, invoice or quotation can confirm it is genuine. */
export default function VerifyPage() {
  return (
    <section className="container-x pb-24 pt-32 md:pt-40">
      <div className="mx-auto max-w-md">
        <p className="eyebrow">Document Verification</p>
        <h1 className="mt-4 text-step-5">Check a receipt or invoice</h1>
        <p className="mt-4 text-fg-muted">Every receipt, refund note, invoice and quotation from Reberon carries a document number, check code and QR code at the bottom. Scan the QR code or enter both below to confirm it is genuine.</p>
        <Suspense><VerifyForm /></Suspense>
      </div>
    </section>
  );
}
