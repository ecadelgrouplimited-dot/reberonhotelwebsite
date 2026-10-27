import { prisma, storage } from './lib.js';
import { mediaKeys } from '@reberon/media';

/** Remove every demo row (isSeed = true). Reference data stays. Run before launch. */
async function main() {
  const media = await prisma.mediaAsset.findMany({ where: { isSeed: true }, select: { id: true } });
  // Movement II demo: payments first (they restrict deletes), then reservations (folio cascades).
  const demoRes = await prisma.reservation.findMany({ where: { isSeed: true }, select: { id: true } });
  await prisma.$transaction([
    prisma.paymentIntent.deleteMany({ where: { reservationId: { in: demoRes.map((r) => r.id) } } }),
    prisma.roomAssignment.deleteMany({ where: { room: { isSeed: true } } }),
    prisma.reservation.deleteMany({ where: { isSeed: true } }),
    prisma.housekeepingTask.deleteMany({ where: { isSeed: true } }),
    prisma.issuedDocument.deleteMany({ where: { isSeed: true } }),
    prisma.tour.deleteMany({ where: { isSeed: true } }),
    prisma.roomBlock.deleteMany({ where: { room: { isSeed: true } } }),
    prisma.inventoryDay.deleteMany({}),
    prisma.extra.deleteMany({ where: { isSeed: true } }),
    prisma.package.deleteMany({ where: { isSeed: true } }),
    prisma.posOrder.deleteMany({}),
    prisma.posOutlet.deleteMany({ where: { isSeed: true } }),
    prisma.healthClubAccessLog.deleteMany({}),
    prisma.healthClubMembership.deleteMany({ where: { isSeed: true } }),
    prisma.quotation.deleteMany({}),
    prisma.requisition.deleteMany({}),
    prisma.stockMovement.deleteMany({}),
    prisma.inventoryItem.deleteMany({ where: { isSeed: true } }),
    prisma.staffAnnouncement.deleteMany({ where: { isSeed: true } }),
    prisma.terminalDevice.deleteMany({ where: { isSeed: true } }),
  ]);
  const counts = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { isSeed: true } }),
    prisma.waitlistEntry.deleteMany({ where: { isSeed: true } }),
    prisma.conversation.deleteMany({ where: { isSeed: true } }),
    prisma.contact.deleteMany({ where: { isSeed: true } }),
    prisma.navigationItem.deleteMany({}),
    prisma.page.deleteMany({ where: { isSeed: true } }),
    prisma.faqGroup.deleteMany({ where: { isSeed: true } }),
    prisma.progressUpdate.deleteMany({ where: { isSeed: true } }),
    prisma.destination.deleteMany({ where: { isSeed: true } }),
    prisma.facility.deleteMany({ where: { isSeed: true } }),
    prisma.room.deleteMany({ where: { isSeed: true } }),
    prisma.roomType.deleteMany({ where: { isSeed: true } }),
    prisma.testimonial.deleteMany({ where: { isSeed: true } }),
    prisma.mediaAsset.deleteMany({ where: { isSeed: true } }),
  ]);
  // Numbering starts again at 1 when no documents are left (a clean start for launch).
  if (!(await prisma.issuedDocument.count())) await prisma.documentSequence.deleteMany({});
  for (const m of media) await storage.remove(mediaKeys.variant(m.id, 0).replace(/\/0\.webp$/, ''));
  console.log('Purged demo rows:', counts.map((c) => c.count).reduce((a, b) => a + b, 0), `(and ${media.length} media folders)`);
  console.log('Seed users are kept so you can still sign in; disable them in Settings → Users.');
}

main().finally(() => prisma.$disconnect());
