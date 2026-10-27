import type { SettingGroup } from '../../src/index.js';
import { prisma, en, log } from '../lib.js';

/** Defaults for every setting key. Created once; never overwritten by a re-seed. */
export const SETTING_DEFAULTS: { key: string; group: SettingGroup; value: unknown }[] = [
  { key: 'hotel.name', group: 'GENERAL', value: 'Reberon Hotel' },
  { key: 'hotel.legalName', group: 'GENERAL', value: 'Reberon Hotel Limited' },
  { key: 'hotel.tagline', group: 'GENERAL', value: en('Ten rooms on the shoulder of Mount Elgon') },
  { key: 'hotel.timezone', group: 'GENERAL', value: 'Africa/Kampala' },
  { key: 'hotel.currencies', group: 'GENERAL', value: ['UGX', 'USD'] },
  { key: 'hotel.defaultCurrency', group: 'GENERAL', value: 'UGX' },
  { key: 'hotel.checkInTime', group: 'BOOKING', value: '14:00' },
  { key: 'hotel.checkOutTime', group: 'BOOKING', value: '10:30' },
  { key: 'hotel.openingLabel', group: 'GENERAL', value: en('Opening 2027') },
  { key: 'hotel.logoId', group: 'GENERAL', value: null },
  { key: 'hotel.footerNote', group: 'GENERAL', value: en('Technology created and managed by ECADEL GROUP LIMITED.') },
  { key: 'contact.phones', group: 'CONTACT', value: ['+256 700 000 000'] },
  { key: 'contact.whatsapp', group: 'CONTACT', value: '+256700000000' },
  { key: 'contact.email', group: 'CONTACT', value: 'hello@reberonhotel.com' },
  { key: 'contact.address', group: 'CONTACT', value: en('Kapchorwa, on the Mbale–Kapchorwa road, Eastern Uganda') },
  { key: 'contact.geo', group: 'CONTACT', value: { lat: 1.396, lng: 34.45 } },
  { key: 'contact.hours', group: 'CONTACT', value: en('Enquiries answered 7:00–21:00, every day') },
  { key: 'contact.responsePromise', group: 'CONTACT', value: en('We reply within four hours, 7:00–21:00.') },
  { key: 'social', group: 'CONTACT', value: { tiktok: 'https://tiktok.com/@reberonhotel', instagram: 'https://instagram.com/reberonhotel', facebook: 'https://facebook.com/reberonhotel', x: 'https://x.com/reberonhotel' } },
  { key: 'seo.titleTemplate', group: 'SEO', value: '%s · Reberon Hotel, Kapchorwa' },
  { key: 'seo.defaultTitle', group: 'SEO', value: 'Reberon Hotel — Kapchorwa, Mount Elgon' },
  {
    key: 'seo.defaultDescription',
    group: 'SEO',
    value: en('A ten-room hotel in Kapchorwa, above Sipi Falls and among the coffee of Mount Elgon. Claim a first stay.'),
  },
  { key: 'seo.shareImageId', group: 'SEO', value: null },
  { key: 'features.bookingEnabled', group: 'FEATURES', value: false },
  { key: 'features.waitlistEnabled', group: 'FEATURES', value: true },
  { key: 'features.progressEnabled', group: 'FEATURES', value: true },
  { key: 'features.toursEnabled', group: 'FEATURES', value: false },
  { key: 'features.stayOtp', group: 'FEATURES', value: false },
  { key: 'receipts.tin', group: 'BOOKING', value: '' },
  { key: 'receipts.vatRegistered', group: 'BOOKING', value: false },
  { key: 'receipts.footer', group: 'BOOKING', value: 'Thank you for staying with us on the mountain. Keep this for your records.' },
  { key: 'receipts.paper', group: 'BOOKING', value: 'A4' },
  { key: 'notifications.staffEmails', group: 'NOTIFICATIONS', value: ['alerts@reberonhotel.com'] },
  { key: 'notifications.ownerBriefTime', group: 'NOTIFICATIONS', value: '19:00' },
];

export async function seedSettings() {
  for (const s of SETTING_DEFAULTS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: { key: s.key, group: s.group, value: s.value as object },
      update: {},
    });
  }
  // Ensure legacy .ug domain values in settings are migrated to .com
  const contactEmail = await prisma.setting.findUnique({ where: { key: 'contact.email' } });
  if (contactEmail && typeof contactEmail.value === 'string' && contactEmail.value.endsWith('@reberonhotel.ug')) {
    await prisma.setting.update({ where: { key: 'contact.email' }, data: { value: contactEmail.value.replace('@reberonhotel.ug', '@reberonhotel.com') } });
  }
  const staffEmails = await prisma.setting.findUnique({ where: { key: 'notifications.staffEmails' } });
  if (staffEmails && Array.isArray(staffEmails.value) && staffEmails.value.some((e) => String(e).includes('@reberonhotel.ug') || String(e).includes('frontdesk@'))) {
    await prisma.setting.update({ where: { key: 'notifications.staffEmails' }, data: { value: ['alerts@reberonhotel.com'] } });
  }
  const privacyPage = await prisma.page.findUnique({ where: { slug: 'legal/privacy' } });
  if (privacyPage) {
    const raw = JSON.stringify(privacyPage.publishedBlocks ?? []);
    if (raw.includes('reberonhotel.ug')) {
      const updatedBlocks = JSON.parse(raw.replace(/reberonhotel\.ug/g, 'reberonhotel.com'));
      const updatedDraft = JSON.parse(JSON.stringify(privacyPage.draftBlocks ?? []).replace(/reberonhotel\.ug/g, 'reberonhotel.com'));
      await prisma.page.update({ where: { id: privacyPage.id }, data: { publishedBlocks: updatedBlocks, draftBlocks: updatedDraft } });
    }
  }
  log('settings', `${SETTING_DEFAULTS.length} keys`);
}
