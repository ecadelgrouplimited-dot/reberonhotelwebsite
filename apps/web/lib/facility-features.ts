import type { FacilityDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';

export interface FacilitySpec {
  icon: string;
  label: string;
  value: string;
}

export interface FacilityFeatureData {
  tags: string[];
  specs: FacilitySpec[];
  highlights: string[];
  ctaLabel: string;
  ctaIntent: 'EVENT' | 'STAY' | 'GROUP' | 'GENERAL';
  whatsappText: string;
  note?: string;
  badge?: string;
}

/**
 * What a facility page shows beyond its summary. Everything comes from the
 * facility's details in the House (Website → Facilities); when a detail is empty
 * the page simply leaves that part out.
 */
export function getFacilityFeatures(facility: FacilityDTO): FacilityFeatureData {
  const d = facility.details ?? {};
  const name = t(facility.name);
  return {
    tags: (d.tags ?? []).map((x) => t(x.text)).filter(Boolean),
    specs: (d.specs ?? []).map((x) => ({ icon: x.icon || facility.icon || 'sparkles', label: t(x.label), value: t(x.value) })).filter((x) => x.label && x.value),
    highlights: (d.highlights ?? []).map((x) => t(x.text)).filter(Boolean),
    ctaLabel: t(d.enquireLabel) || `Ask about ${name.toLowerCase().startsWith('the ') ? name : `the ${name.toLowerCase()}`}`,
    ctaIntent: d.enquireIntent ?? 'GENERAL',
    whatsappText: d.whatsappText || `Hello, I have a question about the ${name.toLowerCase()}.`,
    note: t(d.note) || undefined,
    badge: t(d.badge) || undefined,
  };
}
