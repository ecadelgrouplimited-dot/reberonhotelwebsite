import { MILESTONES } from '@reberon/contracts';
import type { EntityConfig } from '@/components/forms/entity-editor';
import { WEB_URL } from '@/lib/api';

type V = Record<string, unknown>;
const en = (v: unknown) => ((v as Record<string, string> | undefined)?.en ?? '');
const seoToForm = (r: V) => ({ seoTitle: (r.seo as V | undefined)?.title, seoDescription: (r.seo as V | undefined)?.description });
const seoToInput = (v: V) => ({ seo: { ...(v.seoTitle ? { title: v.seoTitle } : {}), ...(v.seoDescription ? { description: v.seoDescription } : {}) } });
const seoSection = { title: 'Search & sharing', fields: [{ kind: 'ltext' as const, name: 'seoTitle', label: 'Search title', help: 'Defaults to the name' }, { kind: 'ltext' as const, name: 'seoDescription', label: 'Search description', multiline: true, help: 'About 150 characters' }] };
const statusField = { kind: 'select' as const, name: 'status', label: 'Visibility', required: true, options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft (not on the site)' }, { value: 'HIDDEN', label: 'Hidden' }] };
const slugField = { kind: 'text' as const, name: 'slug', label: 'Address', required: true, help: 'lowercase-with-dashes' };

export const roomConfig: EntityConfig = {
  endpoint: '/room-types',
  listHref: '/website/rooms',
  noun: 'Room type',
  crumbs: [{ label: 'Website' }, { label: 'Rooms', href: '/website/rooms' }],
  title: (v) => en(v.name),
  viewUrl: (v) => (v.status === 'PUBLISHED' ? `${WEB_URL}/rooms/${v.slug}` : null),
  empty: { name: {}, slug: '', tagline: {}, sleepsAdults: 2, sleepsChildren: 0, bedConfig: {}, galleryIds: [], amenityIds: [], status: 'DRAFT' },
  toForm: (r) => ({ ...r, ...seoToForm(r) }),
  toInput: (v) => {
    const { seoTitle: _a, seoDescription: _b, rooms: _c, media: _d, gallery: _e, ...rest } = v;
    return { ...rest, ...seoToInput(v), fromPriceUgx: v.fromPriceUgx ?? null, fromPriceUsd: v.fromPriceUsd ?? null };
  },
  sections: [
    {
      title: 'The room',
      description: 'Told as a place, not a code. Facts a guest can decide on.',
      fields: [
        { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'name', label: 'Name', required: true }, slugField] },
        { kind: 'ltext', name: 'tagline', label: 'Tagline', help: 'One line. Shown on cards.' },
        { kind: 'lrich', name: 'description', label: 'Description' },
      ],
    },
    {
      title: 'Facts',
      fields: [
        { kind: 'group', label: '', columns: 3, fields: [{ kind: 'number', name: 'sleepsAdults', label: 'Adults', min: 1, max: 12, required: true }, { kind: 'number', name: 'sleepsChildren', label: 'Children', min: 0, max: 12 }, { kind: 'number', name: 'sizeSqm', label: 'Size (m²)', min: 1 }] },
        { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'bedConfig', label: 'Beds', help: 'e.g. One king or two singles' }, { kind: 'ltext', name: 'view', label: 'View' }] },
        { kind: 'refs', name: 'amenityIds', label: 'In the room', entity: 'amenity' },
      ],
    },
    {
      title: 'Pictures',
      description: 'Real photographs when they exist; drawings until then — marked as drawings.',
      fields: [
        { kind: 'media', name: 'heroMediaId', label: 'Main image' },
        { kind: 'mediaList', name: 'galleryIds', label: 'Gallery' },
        { kind: 'media', name: 'floorPlanMediaId', label: 'Floor plan (optional)' },
      ],
    },
    seoSection,
  ],
  side: [
    statusField,
    { kind: 'money', name: 'fromPriceUgx', label: 'From-price', currency: 'UGX', help: 'Per night. A starting figure.' },
    { kind: 'money', name: 'fromPriceUsd', label: 'From-price (USD)', currency: 'USD', help: 'Leave empty to show UGX only. Never converted.' },
  ],
  deleteWarning: 'Only possible when no physical rooms use this type. Consider hiding it instead.',
};

export const facilityConfig: EntityConfig = {
  endpoint: '/facilities',
  listHref: '/website/facilities',
  noun: 'Facility',
  crumbs: [{ label: 'Website' }, { label: 'Facilities', href: '/website/facilities' }],
  title: (v) => en(v.name),
  viewUrl: (v) => `${WEB_URL}/facilities/${v.slug}`,
  empty: { name: {}, slug: '', summary: {}, icon: 'building', mediaIds: [], status: 'AVAILABLE' },
  // The page details live in one JSON field; the form edits them as d_* fields.
  toForm: ({ details, ...r }) => ({ ...r, ...Object.fromEntries(Object.entries((details as V | null) ?? {}).map(([k, v]) => [`d_${k}`, v])) }),
  toInput: ({ media: _m, ...v }) => {
    const details: V = {};
    const rest: V = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('d_')) {
        const empty = val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length) || (typeof val === 'object' && !Array.isArray(val) && !Object.values(val as V).some(Boolean));
        if (!empty) details[k.slice(2)] = val;
      } else rest[k] = val;
    }
    return { ...rest, details: Object.keys(details).length ? details : null };
  },
  sections: [
    {
      title: 'Facility',
      description: 'Only what exists. Things still being built are shown as “being built”.',
      fields: [
        { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'name', label: 'Name', required: true }, slugField] },
        { kind: 'ltext', name: 'summary', label: 'Summary', multiline: true },
        { kind: 'lrich', name: 'body', label: 'More detail' },
        { kind: 'mediaList', name: 'mediaIds', label: 'Pictures' },
      ],
    },
    {
      title: 'Facility page details',
      description: 'Chips, facts and highlights on the facility card and page. Only say what is true today — anything left empty is simply not shown.',
      fields: [
        { kind: 'list', name: 'd_tags', label: 'Chips (on the card)', itemLabel: 'Chip', max: 8, fields: [{ kind: 'ltext', name: 'text', label: 'Text', required: true }] },
        {
          kind: 'list',
          name: 'd_specs',
          label: 'Good to know (facts)',
          itemLabel: 'Fact',
          max: 12,
          fields: [
            { kind: 'text', name: 'icon', label: 'Icon' },
            { kind: 'ltext', name: 'label', label: 'Label', required: true },
            { kind: 'ltext', name: 'value', label: 'Value', required: true },
          ],
        },
        { kind: 'list', name: 'd_highlights', label: 'What to expect (highlights)', itemLabel: 'Highlight', max: 12, fields: [{ kind: 'ltext', name: 'text', label: 'Text', required: true, multiline: true }] },
        {
          kind: 'group',
          label: 'Enquiries',
          fields: [
            { kind: 'ltext', name: 'd_badge', label: 'Badge', help: 'e.g. “Open daily”. Empty shows the status.' },
            { kind: 'ltext', name: 'd_enquireLabel', label: 'Enquire button text' },
            {
              kind: 'select',
              name: 'd_enquireIntent',
              label: 'Enquiry subject',
              options: [
                { value: 'GENERAL', label: 'Something else' },
                { value: 'STAY', label: 'A stay' },
                { value: 'EVENT', label: 'An event / the hall' },
                { value: 'GROUP', label: 'A group' },
              ],
            },
          ],
        },
        { kind: 'ltext', name: 'd_note', label: 'Note beside the buttons', multiline: true },
        { kind: 'text', name: 'd_whatsappText', label: 'Pre-filled WhatsApp message' },
      ],
    },
  ],
  side: [
    { kind: 'select', name: 'status', label: 'Status', required: true, options: [{ value: 'AVAILABLE', label: 'Available' }, { value: 'COMING_SOON', label: 'Being built' }, { value: 'HIDDEN', label: 'Hidden' }] },
    { kind: 'text', name: 'icon', label: 'Icon', required: true },
  ],
};

export const destinationConfig: EntityConfig = {
  endpoint: '/destinations',
  listHref: '/website/destinations',
  noun: 'Destination',
  crumbs: [{ label: 'Website' }, { label: 'Kapchorwa', href: '/website/destinations' }],
  title: (v) => en(v.name),
  viewUrl: (v) => (v.status === 'PUBLISHED' ? `${WEB_URL}/kapchorwa/${v.slug}` : null),
  empty: { name: {}, slug: '', kind: 'PLACE', tagline: {}, galleryIds: [], stops: [], blocks: [], status: 'DRAFT' },
  toForm: (r) => ({ ...r, ...seoToForm(r), stops: ((r.stops as V[]) ?? []).map(({ id: _i, destinationId: _d, order: _o, ...s }) => s) }),
  toInput: (v) => {
    const { seoTitle: _a, seoDescription: _b, media: _c, ...rest } = v;
    return { ...rest, ...seoToInput(v) };
  },
  sections: [
    {
      title: 'The story',
      description: 'Kapchorwa is why they drive. Context, not a tour-operator brochure.',
      fields: [
        { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'name', label: 'Name', required: true }, slugField] },
        { kind: 'ltext', name: 'tagline', label: 'Tagline', multiline: true },
        { kind: 'lrich', name: 'body', label: 'Story' },
      ],
    },
    {
      title: 'Pictures',
      fields: [
        { kind: 'media', name: 'heroMediaId', label: 'Main image' },
        { kind: 'mediaList', name: 'galleryIds', label: 'Gallery' },
      ],
    },
    {
      title: 'The road (optional)',
      description: 'Stops draw an altitude profile on the page. Leave empty for places.',
      fields: [
        {
          kind: 'list',
          name: 'stops',
          label: 'Stops',
          itemLabel: 'Stop',
          fields: [
            { kind: 'ltext', name: 'name', label: 'Place', required: true },
            { kind: 'number', name: 'minutesFromPrev', label: 'Minutes from previous stop', min: 0 },
            { kind: 'number', name: 'altitude', label: 'Altitude (m)', min: 0 },
            { kind: 'ltext', name: 'note', label: 'Note', multiline: true },
          ],
        },
      ],
    },
    { title: 'Extra sections', fields: [{ kind: 'blocks', name: 'blocks', label: 'Sections after the story', help: 'e.g. “When to come” uses a twelve-month season chart.' }] },
    seoSection,
  ],
  side: [
    statusField,
    { kind: 'select', name: 'kind', label: 'Kind', required: true, options: [{ value: 'PLACE', label: 'Place' }, { value: 'ROUTE', label: 'Route' }, { value: 'THEME', label: 'Theme' }, { value: 'SEASON', label: 'Season' }, { value: 'PRACTICAL', label: 'Practical' }] },
    { kind: 'number', name: 'driveMinutes', label: 'Drive time (minutes)', min: 0 },
    { kind: 'number', name: 'distanceKm', label: 'Distance (km)', min: 0 },
  ],
};

const MILESTONE_LABEL: Record<string, string> = { GROUNDBREAKING: 'Ground broken', FOUNDATION: 'Foundations', STRUCTURE: 'Structure', ROOF: 'Roof on', FINISHES: 'Finishes', FURNISHING: 'Furnishing', OPENING: 'Opening' };

export const progressConfig: EntityConfig = {
  endpoint: '/progress',
  listHref: '/website/rising',
  noun: 'Update',
  crumbs: [{ label: 'Website' }, { label: 'Hotel rising', href: '/website/rising' }],
  title: (v) => en(v.title),
  viewUrl: (v) => (v.status === 'PUBLISHED' ? `${WEB_URL}/rising/${v.slug}` : null),
  empty: { title: {}, happenedOn: new Date().toISOString().slice(0, 10), mediaIds: [], status: 'PUBLISHED' },
  toInput: ({ media: _m, cover: _c, slug: _s, ...v }) => v,
  sections: [
    {
      title: 'What happened on site',
      description: 'Honest progress, not an apology. Photos straight from the phone are fine.',
      fields: [
        { kind: 'ltext', name: 'title', label: 'Title', required: true },
        { kind: 'mediaList', name: 'mediaIds', label: 'Photos' },
        { kind: 'lrich', name: 'body', label: 'A few lines' },
      ],
    },
  ],
  side: [
    { kind: 'select', name: 'status', label: 'Visibility', required: true, options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }] },
    { kind: 'date', name: 'happenedOn', label: 'Date', required: true },
    { kind: 'select', name: 'milestone', label: 'Milestone reached', options: MILESTONES.map((m) => ({ value: m, label: MILESTONE_LABEL[m]! })) },
    { kind: 'number', name: 'percentComplete', label: 'Percent built', min: 0, max: 100 },
  ],
};
