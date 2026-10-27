import { prisma } from './lib.js';
import { seedSettings } from './reference/settings.js';
import { seedAmenities } from './reference/amenities.js';
import { seedUsers } from './demo/users.js';
import { seedRooms } from './demo/rooms.js';
import { seedFacilities } from './demo/facilities.js';
import { seedDestinations } from './demo/destinations.js';
import { seedProgress } from './demo/progress.js';
import { seedFaqs } from './demo/faqs.js';
import { seedPages } from './demo/pages.js';
import { seedNavigation } from './demo/navigation.js';
import { seedInboxAndWaitlist } from './demo/inbox.js';
import { seedAudit } from './demo/audit.js';
import { seedBooking } from './demo/booking.js';
import { seedArrivalsToday, seedHouse } from './demo/house.js';
import { seedTours } from './demo/tours.js';
import { seedOperations } from './demo/operations.js';

const referenceOnly = process.argv.includes('--reference-only');

async function main() {
  const t0 = Date.now();
  console.log('Seeding reference data');
  await seedSettings();
  await seedAmenities();
  if (referenceOnly) return;
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-demo-in-production')) {
    throw new Error('Refusing to seed demo data in production');
  }
  console.log('Seeding demo data');
  const users = await seedUsers();
  const rooms = await seedRooms();
  const facilities = await seedFacilities();
  const destinations = await seedDestinations();
  await seedProgress();
  const faqs = await seedFaqs();
  await seedPages({ rooms, facilities, destinations, faqs }, users['owner@reberonhotel.com']!);
  await seedNavigation();
  const staff = [users['owner@reberonhotel.com']!, users['manager@reberonhotel.com']!, users['desk@reberonhotel.com']!];
  await seedInboxAndWaitlist(staff, Object.values(rooms));
  await seedAudit(staff);
  await seedBooking(users['owner@reberonhotel.com']!, users['desk@reberonhotel.com']!);
  await seedHouse({ ownerId: users['owner@reberonhotel.com']!, deskId: users['desk@reberonhotel.com']!, housekeepingId: users['housekeeping@reberonhotel.com']! });
  await seedArrivalsToday(users['desk@reberonhotel.com']!);
  await seedTours();
  await seedOperations({
    ownerId: users['owner@reberonhotel.com']!,
    managerId: users['manager@reberonhotel.com']!,
    deskId: users['desk@reberonhotel.com']!,
    barId: users['bar@reberonhotel.com'],
    kitchenId: users['kitchen@reberonhotel.com'],
    gymId: users['gym@reberonhotel.com'],
  });
  const shareImage = await prisma.mediaAsset.findFirst({ where: { storageKey: 'seed/page-share-default' } });
  if (shareImage) await prisma.setting.update({ where: { key: 'seo.shareImageId' }, data: { value: shareImage.id } });
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
