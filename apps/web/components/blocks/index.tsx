import { BLOCK_MAP, type LText, type MediaRef, type PageDTO, type SiteDTO } from '@reberon/contracts';
import type { CtaContext } from '@/lib/cta';
import { SectionHeading } from '@/components/ui/section-heading';
import { cn } from '@/lib/cn';
import { Hero } from './hero';
import { Story, Stats, RoomGrid, RoomSpotlight, Facilities, Features } from './content';
import { ProgressTimeline, DestinationCards, JourneyBlock, SeasonStrip } from './place';
import { Quote, Faq, ContactCard, MapBlock, FormBlock, CtaBand, RichTextBlock, Spacer } from './closing';
import { GalleryGrid } from './gallery';
import { NowStrip } from './now-strip';
import { Voices } from './voices';
import { TourEmbed } from './tour-embed';
import { Cards } from './cards';
import { Video } from './video';
import type { BlockProps } from './types';

function Gallery({ block, media }: BlockProps<{ eyebrow?: LText; heading?: LText; media?: string[] }>) {
  const items = (block.data.media ?? []).map((id) => media[id]).filter(Boolean) as MediaRef[];
  return (
    <div className="container-x">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} className="mb-12" />
      <GalleryGrid items={items} variant={block.variant} />
    </div>
  );
}

const REGISTRY: Record<string, (p: BlockProps<never, never>) => React.ReactNode> = {
  hero: Hero as never,
  story: Story as never,
  stats: Stats as never,
  roomGrid: RoomGrid as never,
  roomSpotlight: RoomSpotlight as never,
  facilities: Facilities as never,
  features: Features as never,
  gallery: Gallery as never,
  progressTimeline: ProgressTimeline as never,
  destinationCards: DestinationCards as never,
  journey: JourneyBlock as never,
  seasonStrip: SeasonStrip as never,
  quote: Quote as never,
  faq: Faq as never,
  contactCard: ContactCard as never,
  map: MapBlock as never,
  enquiryForm: ((p: BlockProps) => <FormBlock {...(p as BlockProps<Record<string, never>>)} kind="enquiry" />) as never,
  waitlistForm: ((p: BlockProps) => <FormBlock {...(p as BlockProps<Record<string, never>>)} kind="waitlist" />) as never,
  ctaBand: CtaBand as never,
  richText: RichTextBlock as never,
  spacer: Spacer as never,
  nowStrip: NowStrip as never,
  voices: Voices as never,
  tourEmbed: TourEmbed as never,
  cards: Cards as never,
  video: Video as never,
};

/** Blocks that manage their own vertical rhythm (full-bleed or spacing). */
const BLEED = new Set(['hero', 'quote', 'spacer', 'nowStrip']);

export function Blocks({ page, site, ctx = {} }: { page: Pick<PageDTO, 'blocks' | 'media'>; site: SiteDTO; ctx?: CtaContext }) {
  return (
    <>
      {page.blocks.map((block, index) => {
        const C = REGISTRY[block.type];
        if (!C) return null;
        const tone = block.tone && block.tone !== 'default' ? `tone-${block.tone}` : '';
        const el = <C block={block as never} media={page.media} site={site} ctx={ctx} index={index} />;
        if (BLEED.has(block.type)) {
          return (
            <div key={block.id} id={block.anchor ?? `b-${block.id}`} className={tone} data-block-id={block.id} data-block-label={BLOCK_MAP[block.type]?.label}>
              {el}
            </div>
          );
        }
        const prevTone = page.blocks[index - 1]?.tone ?? 'default';
        const tight = index > 0 && prevTone === (block.tone ?? 'default') && !BLEED.has(page.blocks[index - 1]!.type);
        return (
          <section key={block.id} id={block.anchor ?? `b-${block.id}`} className={cn(tone, 'section-y', tight && '!pt-0')} data-block-id={block.id} data-block-label={BLOCK_MAP[block.type]?.label}>
            {el}
          </section>
        );
      })}
    </>
  );
}
