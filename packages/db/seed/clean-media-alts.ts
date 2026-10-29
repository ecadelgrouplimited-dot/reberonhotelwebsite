import { config } from 'dotenv';
import { resolve } from 'node:path';
import { repoRoot } from '@reberon/media';
import { prisma, en } from './lib.js';

config({ path: resolve(repoRoot(), '.env'), quiet: true });

function isRaw(text?: string | null): boolean {
  if (!text) return true;
  const s = text.trim();
  if (!s) return true;
  if (/^[0-9a-f]{8}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{12}$/i.test(s)) return true;
  if (/\b(pexels|unsplash|shutterstock|adobestock)\b/i.test(s)) return true;
  if (/^(img|dsc|dji|screenshot|asset|file|upload|screen)[_-\s]?[0-9]+/i.test(s)) return true;
  if (/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(s)) return true;
  const stripped = s.replace(/[^0-9]/g, '');
  if (stripped.length >= 6 && stripped.length / s.length > 0.45) return true;
  if (/^[0-9a-f]{4,8}(\s+[0-9a-f]{4,8})+$/i.test(s)) return true;
  return false;
}

export async function run() {
  const assets = await prisma.mediaAsset.findMany();
  let cleaned = 0;

  for (const a of assets) {
    const rawAlt = (a.alt as Record<string, string>)?.en;
    const rawCap = (a.caption as Record<string, string>)?.en;

    const altIsRaw = isRaw(rawAlt);
    const capIsRaw = isRaw(rawCap);

    if (!altIsRaw && !capIsRaw) continue;

    let cleanAlt = rawAlt;
    if (altIsRaw) {
      if (a.folder === 'Rooms') cleanAlt = 'Highland suite and mountain view · Reberon Hotel';
      else if (a.folder === 'Facilities') cleanAlt = 'Highland sanctuary facility · Reberon Hotel';
      else cleanAlt = 'Mount Elgon Highland Sanctuary · Kapchorwa';
    }

    const cleanCap = capIsRaw ? null : rawCap;

    await prisma.mediaAsset.update({
      where: { id: a.id },
      data: {
        alt: en(cleanAlt),
        caption: cleanCap ? en(cleanCap) : undefined,
      },
    });
    cleaned++;
  }

  console.log(`✓ Cleaned ${cleaned} media assets in database with human-readable sanctuary labels.`);
}

if (process.argv[1]?.endsWith('clean-media-alts.ts')) {
  run()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
