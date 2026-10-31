import type { Metadata } from 'next';
import { ConciergeShowcase } from '@/components/concierge/concierge-showcase';

export const metadata: Metadata = {
  title: 'Sipi Concierge — Autonomous Highland AI Host & Live PMS Assistant',
  description:
    'Discover Sipi Concierge at Reberon Hotel (1,900 m ASL, Mount Elgon). Check live suite availability, lock 48-hour complimentary holds, track your recent hotel activity, and print official receipts and tax invoices in real time.',
};

export default function ConciergePage() {
  return <ConciergeShowcase />;
}
