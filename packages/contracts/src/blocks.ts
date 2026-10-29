import { z } from 'zod';
import { zLText, zLRich } from './localized.js';

/**
 * Page blocks are declared once as field definitions. The same definition
 * produces the Zod validator (api) and the editing form (admin page builder).
 */
export type FieldDef =
  | { kind: 'text'; name: string; label: string; required?: boolean; help?: string; placeholder?: string }
  | { kind: 'ltext'; name: string; label: string; required?: boolean; multiline?: boolean; help?: string }
  | { kind: 'lrich'; name: string; label: string; required?: boolean; help?: string }
  | { kind: 'number'; name: string; label: string; required?: boolean; min?: number; max?: number; help?: string }
  | { kind: 'boolean'; name: string; label: string; help?: string }
  | { kind: 'select'; name: string; label: string; options: { value: string; label: string }[]; required?: boolean }
  | { kind: 'media'; name: string; label: string; required?: boolean; help?: string }
  | { kind: 'mediaList'; name: string; label: string; min?: number; help?: string }
  | { kind: 'refs'; name: string; label: string; entity: RefEntity; help?: string }
  | { kind: 'ref'; name: string; label: string; entity: RefEntity; required?: boolean; help?: string }
  | { kind: 'ctas'; name: string; label: string; max?: number }
  | { kind: 'list'; name: string; label: string; itemLabel: string; fields: FieldDef[]; max?: number };

export type RefEntity = 'roomType' | 'facility' | 'destination' | 'faqGroup';

export const CTA_ACTIONS = ['whatsapp', 'enquire', 'waitlist', 'call', 'link', 'book'] as const;
export type CtaAction = (typeof CTA_ACTIONS)[number];

export const zCta = z.object({
  label: zLText,
  action: z.enum(CTA_ACTIONS),
  href: z.string().optional(),
  style: z.enum(['primary', 'secondary', 'ghost']).default('primary'),
  prefill: z.string().optional(),
});
export type Cta = z.infer<typeof zCta>;

const zId = z.string().min(1);

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  switch (f.kind) {
    case 'text':
      return f.required ? z.string().min(1) : z.string().optional();
    case 'ltext':
      return f.required ? zLText : zLText.optional();
    case 'lrich':
      return f.required ? zLRich : zLRich.optional();
    case 'number': {
      let n = z.number();
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      return f.required ? n : n.optional();
    }
    case 'boolean':
      return z.boolean().optional();
    case 'select': {
      const s = z.enum(f.options.map((o) => o.value) as [string, ...string[]]);
      return f.required ? s : s.optional();
    }
    case 'media':
    case 'ref':
      return f.required ? zId : zId.nullable().optional();
    case 'mediaList':
      return z.array(zId).min(f.min ?? 0).default([]);
    case 'refs':
      return z.array(zId).default([]);
    case 'ctas':
      return z.array(zCta).max(f.max ?? 3).default([]);
    case 'list':
      return z.array(objectSchema(f.fields)).max(f.max ?? 50).default([]);
  }
}

export function objectSchema(fields: FieldDef[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)])));
}

export interface BlockDefinition {
  type: string;
  label: string;
  description: string;
  icon: string;
  variants?: { value: string; label: string }[];
  fields: FieldDef[];
  /** Block needs data the API resolves (rooms, progress…) */
  resolves?: boolean;
  /** Reserved for a later Movement; hidden from the palette. */
  later?: boolean;
}

const heading = (label = 'Heading', required = false): FieldDef => ({ kind: 'ltext', name: 'heading', label, required });
const eyebrow: FieldDef = { kind: 'ltext', name: 'eyebrow', label: 'Eyebrow (small line above heading)' };
const intro: FieldDef = { kind: 'ltext', name: 'intro', label: 'Intro', multiline: true };

export const BLOCKS: BlockDefinition[] = [
  {
    type: 'hero',
    label: 'Hero',
    description: 'The first screen of a page: big image, headline, actions.',
    icon: 'mountain',
    variants: [
      { value: 'mist', label: 'Mist (layered, animated)' },
      { value: 'fullbleed', label: 'Full-bleed photo' },
      { value: 'split', label: 'Split: text and image' },
      { value: 'compact', label: 'Compact (inner pages)' },
    ],
    fields: [
      eyebrow,
      heading('Headline', true),
      { kind: 'ltext', name: 'sub', label: 'Sub-headline', multiline: true },
      { kind: 'mediaList', name: 'media', label: 'Images (first is main; mist uses up to 3 layers)', min: 0 },
      { kind: 'ctas', name: 'ctas', label: 'Buttons', max: 3 },
      { kind: 'boolean', name: 'showScrollCue', label: 'Show scroll cue' },
    ],
  },
  {
    type: 'story',
    label: 'Story',
    description: 'Text beside an image. Use for "Why Kapchorwa", "Who built it".',
    icon: 'book-open',
    variants: [
      { value: 'right', label: 'Image right' },
      { value: 'left', label: 'Image left' },
      { value: 'stacked', label: 'Image above' },
    ],
    fields: [eyebrow, heading(), { kind: 'lrich', name: 'body', label: 'Body' }, { kind: 'media', name: 'media', label: 'Image' }, { kind: 'ctas', name: 'ctas', label: 'Buttons', max: 2 }],
  },
  {
    type: 'stats',
    label: 'Facts row',
    description: 'A row of short numeric facts.',
    icon: 'hash',
    fields: [
      {
        kind: 'list',
        name: 'items',
        label: 'Facts',
        itemLabel: 'Fact',
        max: 6,
        fields: [
          { kind: 'text', name: 'value', label: 'Value', required: true, placeholder: '1,900 m' },
          { kind: 'ltext', name: 'label', label: 'Label', required: true },
        ],
      },
    ],
  },
  {
    type: 'roomGrid',
    label: 'Rooms grid',
    description: 'Room types as cards with from-price.',
    icon: 'bed-double',
    resolves: true,
    fields: [eyebrow, heading(), intro, { kind: 'refs', name: 'roomTypeIds', label: 'Rooms (empty = all published)', entity: 'roomType' }, { kind: 'boolean', name: 'showFromPrice', label: 'Show from-price' }],
  },
  {
    type: 'roomSpotlight',
    label: 'Room spotlight',
    description: 'One room type, large.',
    icon: 'sparkles',
    resolves: true,
    fields: [eyebrow, heading('Heading override'), { kind: 'ref', name: 'roomTypeId', label: 'Room type', entity: 'roomType', required: true }],
  },
  {
    type: 'facilities',
    label: 'Facilities',
    description: 'Only what exists. Coming-soon items are labelled.',
    icon: 'building',
    resolves: true,
    fields: [eyebrow, heading(), intro, { kind: 'refs', name: 'facilityIds', label: 'Facilities (empty = all visible)', entity: 'facility' }],
  },
  {
    type: 'gallery',
    label: 'Gallery',
    description: 'A set of photos or drawings.',
    icon: 'images',
    variants: [
      { value: 'book', label: 'Book flip slider' },
      { value: 'mosaic', label: 'Mosaic' },
      { value: 'filmstrip', label: 'Filmstrip (horizontal scroll)' },
      { value: 'masonry', label: 'Masonry' },
    ],
    fields: [eyebrow, heading(), { kind: 'mediaList', name: 'media', label: 'Images', min: 1 }],
  },
  {
    type: 'progressTimeline',
    label: 'Hotel rising timeline',
    description: 'Latest construction updates.',
    icon: 'hammer',
    resolves: true,
    fields: [eyebrow, heading(), intro, { kind: 'number', name: 'limit', label: 'How many updates', min: 1, max: 50 }, { kind: 'boolean', name: 'showLink', label: 'Link to full timeline' }],
  },
  {
    type: 'destinationCards',
    label: 'Destination cards',
    description: 'Sipi, Elgon, coffee, the road…',
    icon: 'map',
    resolves: true,
    fields: [eyebrow, heading(), intro, { kind: 'refs', name: 'destinationIds', label: 'Destinations (empty = all published)', entity: 'destination' }],
  },
  {
    type: 'journey',
    label: 'The road',
    description: 'A route drawn stop by stop, with honest hours.',
    icon: 'route',
    fields: [
      eyebrow,
      heading(),
      intro,
      {
        kind: 'list',
        name: 'stops',
        label: 'Stops',
        itemLabel: 'Stop',
        max: 12,
        fields: [
          { kind: 'ltext', name: 'name', label: 'Place', required: true },
          { kind: 'number', name: 'minutesFromPrev', label: 'Minutes from previous stop', min: 0 },
          { kind: 'number', name: 'altitude', label: 'Altitude (m)', min: 0 },
          { kind: 'ltext', name: 'note', label: 'Note', multiline: true },
        ],
      },
    ],
  },
  {
    type: 'seasonStrip',
    label: 'When to come',
    description: 'Twelve months of highland weather, honestly.',
    icon: 'cloud-sun',
    fields: [
      eyebrow,
      heading(),
      intro,
      {
        kind: 'list',
        name: 'months',
        label: 'Months',
        itemLabel: 'Month',
        max: 12,
        fields: [
          { kind: 'text', name: 'month', label: 'Month (Jan…Dec)', required: true },
          { kind: 'select', name: 'season', label: 'Season', options: [{ value: 'dry', label: 'Dry' }, { value: 'short-rains', label: 'Short rains' }, { value: 'long-rains', label: 'Long rains' }], required: true },
          { kind: 'number', name: 'rainyDays', label: 'Typical rainy days', min: 0, max: 31 },
          { kind: 'ltext', name: 'note', label: 'Note' },
        ],
      },
    ],
  },
  {
    type: 'nowStrip',
    label: 'Kapchorwa now',
    description: 'Live local time, weather, sunrise and sunset on the mountain.',
    icon: 'cloud-sun',
    variants: [
      { value: 'band', label: 'Full-width band' },
      { value: 'card', label: 'Card' },
    ],
    fields: [
      eyebrow,
      heading(),
      intro,
      { kind: 'boolean', name: 'showForecast', label: 'Show the next three days' },
      { kind: 'boolean', name: 'compareKampala', label: 'Compare with Kampala (“7° cooler than Kampala”)' },
    ],
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'A line worth pausing on.',
    icon: 'quote',
    fields: [{ kind: 'ltext', name: 'text', label: 'Quote', required: true, multiline: true }, { kind: 'ltext', name: 'attribution', label: 'Attribution' }, { kind: 'media', name: 'media', label: 'Background image' }],
  },
  {
    type: 'tourEmbed',
    label: 'Virtual tour',
    description: 'Walk a space: the hall (empty and set), the lobby, the compound or a room. Hidden until tours are switched on and one is published.',
    icon: 'rotate-3d',
    resolves: true,
    fields: [
      eyebrow,
      heading(),
      intro,
      { kind: 'select', name: 'space', label: 'Which space', required: true, options: [{ value: 'HALL', label: 'The hall' }, { value: 'LOBBY', label: 'Lobby' }, { value: 'COMPOUND', label: 'The compound' }, { value: 'BEYOND', label: 'Beyond the gate' }, { value: 'ROOM_TYPE', label: 'A room type' }] },
      { kind: 'ref', name: 'roomTypeId', label: 'Room type (when the space is a room)', entity: 'roomType' },
    ],
  },
  {
    type: 'voices',
    label: 'Guest voices',
    description: 'What guests said, in their words — only those who agreed to be quoted.',
    icon: 'message-circle-heart',
    resolves: true,
    fields: [eyebrow, heading(), intro, { kind: 'number', name: 'limit', label: 'How many', min: 1, max: 12 }],
  },
  {
    type: 'faq',
    label: 'Questions',
    description: 'An FAQ group as an accordion.',
    icon: 'circle-help',
    resolves: true,
    fields: [eyebrow, heading(), { kind: 'ref', name: 'faqGroupId', label: 'FAQ group', entity: 'faqGroup', required: true }],
  },
  {
    type: 'map',
    label: 'Map & directions',
    description: 'The pin, the last mile, the hours.',
    icon: 'map-pin',
    fields: [eyebrow, heading(), { kind: 'lrich', name: 'directions', label: 'Last-mile directions' }, { kind: 'number', name: 'zoom', label: 'Zoom', min: 5, max: 18 }],
  },
  {
    type: 'contactCard',
    label: 'Contact card',
    description: 'Phones, WhatsApp, email, hours — from settings.',
    icon: 'phone',
    fields: [eyebrow, heading(), intro],
  },
  {
    type: 'enquiryForm',
    label: 'Enquiry form',
    description: 'Short form that lands in the inbox.',
    icon: 'message-square',
    fields: [
      eyebrow,
      heading(),
      intro,
      { kind: 'select', name: 'intent', label: 'Default subject', options: [{ value: 'STAY', label: 'A stay' }, { value: 'EVENT', label: 'An event / the hall' }, { value: 'GROUP', label: 'A group' }, { value: 'GENERAL', label: 'Something else' }] },
      { kind: 'ltext', name: 'successMessage', label: 'Message after sending', multiline: true },
    ],
  },
  {
    type: 'waitlistForm',
    label: 'First-stay (waitlist) form',
    description: 'Names against rooms before keys exist.',
    icon: 'list-plus',
    fields: [eyebrow, heading(), intro, { kind: 'ltext', name: 'successMessage', label: 'Message after sending', multiline: true }],
  },
  {
    type: 'ctaBand',
    label: 'Call to action band',
    description: 'A closing invitation with buttons.',
    icon: 'megaphone',
    fields: [heading('Heading', true), { kind: 'ltext', name: 'sub', label: 'Sub', multiline: true }, { kind: 'ctas', name: 'ctas', label: 'Buttons', max: 3 }, { kind: 'media', name: 'media', label: 'Background image' }],
  },
  {
    type: 'features',
    label: 'Feature list',
    description: 'Short titled points with icons.',
    icon: 'list-checks',
    variants: [
      { value: 'grid', label: 'Grid' },
      { value: 'list', label: 'List' },
    ],
    fields: [
      eyebrow,
      heading(),
      intro,
      {
        kind: 'list',
        name: 'items',
        label: 'Items',
        itemLabel: 'Item',
        max: 12,
        fields: [
          { kind: 'text', name: 'icon', label: 'Icon name (lucide)', placeholder: 'sun' },
          { kind: 'ltext', name: 'title', label: 'Title', required: true },
          { kind: 'ltext', name: 'text', label: 'Text', multiline: true },
        ],
      },
    ],
  },
  {
    type: 'richText',
    label: 'Text',
    description: 'Long-form text: legal pages, notes.',
    icon: 'align-left',
    variants: [
      { value: 'prose', label: 'Reading width' },
      { value: 'wide', label: 'Wide' },
    ],
    fields: [eyebrow, heading(), { kind: 'lrich', name: 'body', label: 'Body', required: true }],
  },
  {
    type: 'spacer',
    label: 'Spacer / contour divider',
    description: 'Breathing room, optionally with a contour line.',
    icon: 'separator-horizontal',
    variants: [
      { value: 'contour', label: 'Contour line' },
      { value: 'space', label: 'Empty space' },
    ],
    fields: [{ kind: 'select', name: 'size', label: 'Size', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] }],
  },
  {
    type: 'packageCards',
    label: 'Packages',
    description: 'Named days sold with the room (Movement II).',
    icon: 'gift',
    later: true,
    resolves: true,
    fields: [eyebrow, heading()],
  },
  {
    type: 'tourEmbed',
    label: 'Virtual tour',
    description: 'Walk the room before paying (Movement III).',
    icon: 'rotate-3d',
    later: true,
    fields: [heading(), { kind: 'text', name: 'tourId', label: 'Tour', required: true }],
  },
];

export const BLOCK_MAP: Record<string, BlockDefinition> = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));
export const BLOCK_TYPES = BLOCKS.map((b) => b.type);

export const zBlock = z
  .object({
    id: z.string().min(1),
    type: z.string(),
    variant: z.string().optional(),
    hidden: z.boolean().optional(),
    anchor: z.string().optional(),
    tone: z.enum(['default', 'warm', 'dark', 'moss']).optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .superRefine((block, ctx) => {
    const def = BLOCK_MAP[block.type];
    if (!def) {
      ctx.addIssue({ code: 'custom', message: `Unknown block type "${block.type}"`, path: ['type'] });
      return;
    }
    if (def.variants && block.variant && !def.variants.some((v) => v.value === block.variant)) {
      ctx.addIssue({ code: 'custom', message: `Unknown variant "${block.variant}"`, path: ['variant'] });
    }
    const res = objectSchema(def.fields).safeParse(block.data);
    if (!res.success) {
      for (const issue of res.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: ['data', ...issue.path.map(String)] });
      }
    }
  });
export type Block = z.infer<typeof zBlock>;
export const zBlocks = z.array(zBlock);

/** Drafts may be incomplete while someone is editing; strict validation happens at publish. */
export const zBlockDraft = z.object({
  id: z.string().min(1),
  type: z.string().refine((v) => v in BLOCK_MAP, 'Unknown block type'),
  variant: z.string().optional(),
  hidden: z.boolean().optional(),
  anchor: z.string().optional(),
  tone: z.enum(['default', 'warm', 'dark', 'moss']).optional(),
  data: z.record(z.string(), z.unknown()),
});
export const zBlockDrafts = z.array(zBlockDraft).max(80);

/** Media IDs referenced anywhere inside a block's data. */
export function collectMediaIds(block: Block): string[] {
  const def = BLOCK_MAP[block.type];
  if (!def) return [];
  const out: string[] = [];
  const walk = (fields: FieldDef[], data: Record<string, unknown> | undefined) => {
    if (!data) return;
    for (const f of fields) {
      const v = data[f.name];
      if (f.kind === 'media' && typeof v === 'string') out.push(v);
      if (f.kind === 'mediaList' && Array.isArray(v)) out.push(...(v as string[]));
      if (f.kind === 'list' && Array.isArray(v)) v.forEach((item) => walk(f.fields, item as Record<string, unknown>));
    }
  };
  walk(def.fields, block.data);
  return out;
}

/** Collect references to entities of one kind across blocks. */
export function collectRefIds(block: Block, entity: RefEntity): string[] {
  const def = BLOCK_MAP[block.type];
  if (!def) return [];
  const out: string[] = [];
  for (const f of def.fields) {
    const v = block.data[f.name];
    if (f.kind === 'ref' && f.entity === entity && typeof v === 'string') out.push(v);
    if (f.kind === 'refs' && f.entity === entity && Array.isArray(v)) out.push(...(v as string[]));
  }
  return out;
}
