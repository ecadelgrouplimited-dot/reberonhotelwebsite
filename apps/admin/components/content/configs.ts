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

/* ───────────── Events & careers ───────────── */

const toMajor = (minor: unknown, currency: unknown) => (minor === null || minor === undefined || minor === '' ? undefined : Number(minor) / (currency === 'USD' ? 100 : 1));
const toMinor = (major: unknown, currency: unknown) => (major === null || major === undefined || major === '' || Number(major) <= 0 ? null : String(Math.round(Number(major) * (currency === 'USD' ? 100 : 1))));
const orNull = (v: unknown) => (v === undefined || v === '' ? null : v);

export const eventConfig: EntityConfig = {
  endpoint: '/events',
  listHref: '/website/events',
  noun: 'Event',
  crumbs: [{ label: 'Website' }, { label: 'Events', href: '/website/events' }],
  title: (v) => en(v.title),
  viewUrl: (v) => (v.status !== 'DRAFT' && v.slug ? `${WEB_URL}/events/${v.slug}` : null),
  empty: { title: {}, summary: {}, category: 'MUSIC', galleryIds: [], rsvpEnabled: true, maxPartySize: 6, featured: false, status: 'DRAFT', currency: 'UGX' },
  toForm: (r) => ({ ...r, ...seoToForm(r), priceMajor: toMajor(r.priceMinor, r.currency), currency: r.currency ?? 'UGX' }),
  toInput: (v) => {
    const { seoTitle: _a, seoDescription: _b, cover: _c, gallery: _d, seatsLeft: _e, priceMajor, priceMinor: _p, ...rest } = v;
    const priceMinor = toMinor(priceMajor, v.currency);
    return {
      ...rest,
      ...seoToInput(v),
      priceMinor,
      currency: priceMinor ? (v.currency ?? 'UGX') : null,
      endsAt: orNull(v.endsAt),
      rsvpClosesAt: orNull(v.rsvpClosesAt),
      capacity: orNull(v.capacity),
      coverId: orNull(v.coverId),
      venue: orNull(v.venue),
      venueDetail: orNull(v.venueDetail),
    };
  },
  sections: [
    {
      title: 'The event',
      description: 'Say what it is and why it is worth the drive. The summary shows on cards and in search.',
      fields: [
        { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'title', label: 'Name', required: true }, slugField] },
        { kind: 'ltext', name: 'summary', label: 'Summary', multiline: true, help: 'One or two lines.' },
        { kind: 'lrich', name: 'body', label: 'The full story' },
        { kind: 'select', name: 'category', label: 'Kind', required: true, options: Object.entries({ MUSIC: 'Music & nights', FOOD_DRINK: 'Food & drink', COFFEE: 'Coffee', OUTDOOR: 'Outdoors & hikes', CULTURE: 'Culture', WELLNESS: 'Wellness', FAMILY: 'Family', CONFERENCE: 'Talks & conferences', OTHER: 'Other' }).map(([value, label]) => ({ value, label })) },
      ],
    },
    {
      title: 'When & where',
      fields: [
        { kind: 'group', label: '', fields: [{ kind: 'datetime', name: 'startsAt', label: 'Starts', required: true }, { kind: 'datetime', name: 'endsAt', label: 'Ends' }] },
        { kind: 'group', label: '', fields: [{ kind: 'text', name: 'venue', label: 'Venue', placeholder: 'e.g. The terrace' }, { kind: 'text', name: 'venueDetail', label: 'Address or directions', help: 'For events away from the hotel' }] },
        { kind: 'boolean', name: 'offsite', label: 'Away from the hotel' },
      ],
    },
    {
      title: 'Pictures',
      fields: [
        { kind: 'media', name: 'coverId', label: 'Cover image', help: 'Shown on cards and when shared. Landscape works best.' },
        { kind: 'mediaList', name: 'galleryIds', label: 'More photos' },
      ],
    },
    {
      title: 'Places & price',
      description: 'Guests book online. When full, they join a waiting list and are confirmed automatically if places free up.',
      fields: [
        { kind: 'group', label: '', columns: 3, fields: [{ kind: 'number', name: 'priceMajor', label: 'Price per person', min: 0, help: 'Empty = free' }, { kind: 'select', name: 'currency', label: 'Currency', options: [{ value: 'UGX', label: 'UGX' }, { value: 'USD', label: 'USD' }] }, { kind: 'number', name: 'capacity', label: 'Places in total', min: 1, help: 'Empty = no limit' }] },
        { kind: 'ltext', name: 'priceNote', label: 'Price note', help: 'e.g. Includes a glass of wine; children under 12 free' },
        { kind: 'group', label: '', fields: [{ kind: 'number', name: 'maxPartySize', label: 'Most people per booking', min: 1, max: 50 }, { kind: 'datetime', name: 'rsvpClosesAt', label: 'Stop taking bookings at', help: 'Empty = when it ends' }] },
        { kind: 'boolean', name: 'rsvpEnabled', label: 'Take bookings online' },
      ],
    },
    seoSection,
  ],
  side: [
    { kind: 'select', name: 'status', label: 'Visibility', required: true, options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft (not on the site)' }, { value: 'CANCELLED', label: 'Cancelled (guests are emailed)' }] },
    { kind: 'boolean', name: 'featured', label: 'Feature it on the home page' },
  ],
  deleteWarning: 'An event with live bookings must be cancelled first (guests are emailed). Past events can be deleted; their guest lists go with them.',
};

export function jobConfig(departments: { code: string; name: string }[]): EntityConfig {
  return {
    endpoint: '/careers/jobs',
    listHref: '/careers',
    noun: 'Job',
    writePerm: 'careers:manage',
    crumbs: [{ label: 'Human Resources' }, { label: 'Careers', href: '/careers' }],
    title: (v) => en(v.title),
    viewUrl: (v) => (v.status !== 'DRAFT' && v.slug ? `${WEB_URL}/careers/${v.slug}` : null),
    empty: { title: {}, summary: {}, employmentType: 'FULL_TIME', location: 'Kapchorwa, Uganda', openings: 1, status: 'DRAFT', questions: [], showSalary: false, currency: 'UGX', salaryPeriod: 'MONTH' },
    toForm: (r) => ({ ...r, ...seoToForm(r), salaryMinMajor: toMajor(r.salaryMinMinor, r.currency), salaryMaxMajor: toMajor(r.salaryMaxMinor, r.currency), currency: r.currency ?? 'UGX', salaryPeriod: r.salaryPeriod ?? 'MONTH' }),
    toInput: (v) => {
      const { seoTitle: _a, seoDescription: _b, cover: _c, salaryMinMajor, salaryMaxMajor, salaryMinMinor: _m, salaryMaxMinor: _x, ...rest } = v;
      const lo = toMinor(salaryMinMajor, v.currency);
      const hi = toMinor(salaryMaxMajor, v.currency);
      const questions = ((v.questions as { id?: string; label?: string; required?: boolean }[]) ?? [])
        .filter((q) => q.label && q.label.trim().length >= 3)
        .map((q, i) => ({ id: q.id || `q${i + 1}-${Math.random().toString(36).slice(2, 6)}`, label: q.label!.trim(), required: !!q.required }));
      return { ...rest, ...seoToInput(v), salaryMinMinor: lo, salaryMaxMinor: hi, currency: lo || hi ? (v.currency ?? 'UGX') : null, questions, closesOn: orNull(v.closesOn), coverId: orNull(v.coverId), departmentCode: orNull(v.departmentCode) };
    },
    sections: [
      {
        title: 'The role',
        description: 'Write it the way you would explain it to a friend. Short paragraphs and lists read best on a phone.',
        fields: [
          { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'title', label: 'Job title', required: true }, slugField] },
          { kind: 'ltext', name: 'summary', label: 'Summary', multiline: true, help: 'One or two lines — shown in the list and when shared.' },
          { kind: 'lrich', name: 'description', label: 'What you will do' },
          { kind: 'lrich', name: 'requirements', label: 'What we look for' },
          { kind: 'lrich', name: 'benefits', label: 'What we offer' },
        ],
      },
      {
        title: 'Details',
        fields: [
          { kind: 'group', label: '', fields: [{ kind: 'select', name: 'departmentCode', label: 'Department', options: departments.map((d) => ({ value: d.code, label: d.name })) }, { kind: 'select', name: 'employmentType', label: 'Type', required: true, options: [{ value: 'FULL_TIME', label: 'Full time' }, { value: 'PART_TIME', label: 'Part time' }, { value: 'CONTRACT', label: 'Contract' }, { value: 'INTERNSHIP', label: 'Internship' }, { value: 'SEASONAL', label: 'Seasonal' }, { value: 'VOLUNTEER', label: 'Volunteer' }] }] },
          { kind: 'group', label: '', columns: 3, fields: [{ kind: 'text', name: 'location', label: 'Location', required: true }, { kind: 'number', name: 'openings', label: 'Openings', min: 1, max: 100 }, { kind: 'date', name: 'closesOn', label: 'Applications close' }] },
        ],
      },
      {
        title: 'Pay',
        description: 'Showing pay gets more and better applications. Hidden unless you switch it on.',
        fields: [
          { kind: 'group', label: '', columns: 3, fields: [{ kind: 'number', name: 'salaryMinMajor', label: 'From', min: 0 }, { kind: 'number', name: 'salaryMaxMajor', label: 'To', min: 0 }, { kind: 'select', name: 'currency', label: 'Currency', options: [{ value: 'UGX', label: 'UGX' }, { value: 'USD', label: 'USD' }] }] },
          { kind: 'select', name: 'salaryPeriod', label: 'Per', options: [{ value: 'MONTH', label: 'Month' }, { value: 'YEAR', label: 'Year' }, { value: 'DAY', label: 'Day' }, { value: 'HOUR', label: 'Hour' }] },
          { kind: 'boolean', name: 'showSalary', label: 'Show pay on the website' },
        ],
      },
      {
        title: 'Questions for applicants',
        description: 'Up to eight. Keep them few and specific — e.g. "Which kitchens have you worked in?"',
        fields: [{ kind: 'list', name: 'questions', label: 'Questions', itemLabel: 'Question', max: 8, fields: [{ kind: 'text', name: 'label', label: 'Question', required: true }, { kind: 'boolean', name: 'required', label: 'Must be answered' }] }],
      },
      { title: 'Picture', fields: [{ kind: 'media', name: 'coverId', label: 'Image (optional)', help: 'Used when the job is shared.' }] },
      seoSection,
    ],
    side: [{ kind: 'select', name: 'status', label: 'Status', required: true, options: [{ value: 'OPEN', label: 'Open — taking applications' }, { value: 'DRAFT', label: 'Draft (not on the site)' }, { value: 'CLOSED', label: 'Closed' }] }],
    deleteWarning: 'Deleting removes the job from the website. Applications are kept (and deleted after a year).',
  };
}
