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

const FACILITY_MAP: Record<string, FacilityFeatureData> = {
  restaurant: {
    tags: ['Breakfast from 6:30', 'Dinner until 21:30', 'Local Fresh Produce', 'Packed Trail Lunches'],
    specs: [
      { icon: 'clock', label: 'Service Hours', value: 'Breakfast 06:30–10:30 · Dinner until 21:30' },
      { icon: 'users', label: 'Dining Capacity', value: '40 seats indoor with mountain ridge vistas' },
      { icon: 'utensils', label: 'Cuisine & Sourcing', value: 'Farm-to-table slope vegetables, fresh river trout, local matooke' },
      { icon: 'coffee', label: 'Artisan Coffee', value: 'Single-origin 1,900m Mount Elgon Arabica French press' },
      { icon: 'gift', label: 'Stay Inclusions', value: 'Full country breakfast included with bed & breakfast bookings' },
      { icon: 'backpack', label: 'Hiking & Excursions', value: 'Packed lunches arranged the night before for Sipi trail walks' },
    ],
    highlights: [
      'Early service from 6:30 AM to catch the magical morning light over Sipi Falls',
      'Fresh river trout sourced directly as it arrives from the mountain streams',
      'Seasonal slope ingredients: matooke, slow-cooked highland beans, and fresh market greens',
      'Mount Elgon Arabica coffee harvested and roasted within the district',
      'Custom group menus and packed trail rations prepared for hikers and athletes',
    ],
    ctaLabel: 'Inquire About Dining & Tables',
    ctaIntent: 'STAY',
    whatsappText: 'Hello Reberon Hotel, I would like to inquire about dining, breakfast hours, or reserve a table at the Restaurant.',
    note: 'Breakfast is included on all bed-and-breakfast room bookings. Walk-in dining is warmly welcomed subject to table availability.',
    badge: 'Open Daily',
  },

  hall: {
    tags: ['Capacity: 40 Guests', 'HD Screen & Audio', 'Ridge Windows', 'Event Packages'],
    specs: [
      { icon: 'users', label: 'Event Capacity', value: '40 theatre style · 24 around tables · 50 reception' },
      { icon: 'presentation', label: 'Audio & Visual', value: 'High-definition projection screen & wireless speech audio' },
      { icon: 'wifi', label: 'Connectivity', value: 'Dual high-speed Wi-Fi and universal workstation power outlets' },
      { icon: 'mountain', label: 'Ridge Setting', value: 'Panoramic escarpment windows overlooking Mount Elgon' },
      { icon: 'coffee', label: 'Catering Breaks', value: 'Highland coffee, teas, fresh pastries, and seated lunches' },
      { icon: 'door-open', label: 'Terrace Access', value: 'Direct breakout doors to the open-air garden terrace' },
    ],
    highlights: [
      'Versatile layout: theatre seating for 40, boardroom configuration for 24, or clear floor for private receptions',
      'Modern presentation technology: high-definition screen, crisp public-address audio, and HDMI/wireless casting',
      'Floor-to-ceiling windows framing the Mount Elgon ridge to give delegates natural daylight and refreshing mountain air',
      'Seamless breakout space opening directly onto the scenic garden terrace for morning coffee and sunset chats',
      'Tailored catering packages from continuous artisan coffee stations to three-course plated executive lunches',
      'Combined room blocks: reserve accommodation for your delegates alongside hall bookings under a single quotation',
    ],
    ctaLabel: 'Request Event Proposal & Quote',
    ctaIntent: 'EVENT',
    whatsappText: 'Hello Reberon Hotel, I would like to request availability and a proposal for hosting an event, meeting, or workshop in The Hall.',
    note: 'Fast turnaround: receive a tailored one-page quote within 24 hours. Groups can hold suite blocks alongside the hall.',
    badge: 'Meetings & Events',
  },

  parking: {
    tags: ['Inside Compound', '24/7 Gate Guarded', 'Night Floodlit', 'Minibus Space'],
    specs: [
      { icon: 'shield-check', label: 'Security & Access', value: 'Gated private perimeter with 24/7 stationed watch' },
      { icon: 'car', label: 'Vehicle Capacity', value: '15+ saloon cars, SUVs, and safari 4x4 minibuses' },
      { icon: 'sun', label: 'Lighting', value: 'Full compound floodlighting throughout the night' },
      { icon: 'route', label: 'Road Access', value: '1 km murram spur off the Mbale–Kapchorwa tarmac highway' },
      { icon: 'clock', label: 'Arrivals', value: 'Late night arrival reception and lighted vehicle escort' },
    ],
    highlights: [
      'Secure enclosed compound protected round-the-clock by dedicated gate personnel',
      'Spacious paved parking bays accommodating family saloons, safari cruisers, and tour coasters',
      'Bright perimeter and flood illumination ensuring safety at all nighttime hours',
      'Safe turning bay allowing easy maneuvering for large tour vans and minibuses',
      'Driver rest facilities and wash assistance available upon request at front desk',
    ],
    ctaLabel: 'Inquire About Parking & Access',
    ctaIntent: 'GENERAL',
    whatsappText: 'Hello Reberon Hotel, I would like to inquire about road conditions, vehicle parking, or arrivals for my vehicle.',
    note: 'The 1km access road from the highway is standard murram: easily handled by saloon cars during dry weather, take gentle care during rains.',
    badge: 'Secure & Complimentary',
  },

  power: {
    tags: ['Grid + Solar Array', 'Lithium Battery Storage', 'Instant Failover', '24/7 Hot Water'],
    specs: [
      { icon: 'zap', label: 'Solar Capacity', value: 'Rooftop photovoltaic solar array with intelligent inverter' },
      { icon: 'battery-charging', label: 'Battery Reserve', value: 'High-capacity lithium battery bank for silent nighttime backup' },
      { icon: 'plug', label: 'Failover Response', value: 'Instant automated changeover during national grid interruptions' },
      { icon: 'wifi', label: 'Always Connected', value: 'Continuous uninterrupted power to Wi-Fi routers and room sockets' },
      { icon: 'shower-head', label: 'Hot Showers', value: 'Dedicated solar-thermal & electric water heating in all bathrooms' },
    ],
    highlights: [
      'Dual-layer hybrid clean energy system combining national grid, rooftop solar, and lithium battery storage',
      'Automatic instant switchover so room lights, workstation sockets, and Wi-Fi continue without a flicker during grid outages',
      'Heavy-duty emergency standby generator maintained for prolonged regional transmission outages',
      'High-pressure hot showers guaranteed in every guest room, morning and night',
      'Work-friendly sanctuary: charge cameras, laptops, and drones reliably at 1,900m altitude',
    ],
    ctaLabel: 'Ask About Work & Power Setup',
    ctaIntent: 'GENERAL',
    whatsappText: 'Hello Reberon Hotel, I have a question regarding power reliability, remote work setup, or charging equipment at the hotel.',
    note: 'Ideal for digital nomads, mountain runners recording GPS sessions, and photographers backing up daily expedition footage.',
    badge: '100% Redundant Backup',
  },

  water: {
    tags: ['Deep Borehole', 'UV Filtered', 'Hot Water 24/7', 'Zero Single-Use Plastic'],
    specs: [
      { icon: 'droplets', label: 'Water Source', value: 'Dedicated deep volcanic rock borehole on the compound' },
      { icon: 'shield-check', label: 'Purification', value: 'Multi-stage sediment filtration and ultraviolet water treatment' },
      { icon: 'shower-head', label: 'Hot Water Supply', value: 'High-pressure continuous hot water to all suites all day' },
      { icon: 'coffee', label: 'Drinking Water', value: 'Complimentary purified glass-bottled water replenished daily' },
      { icon: 'trees', label: 'Eco Commitment', value: 'Zero single-use plastic water bottles purchased or discarded' },
    ],
    highlights: [
      'Self-sufficient natural water supply tapped directly from deep Mount Elgon volcanic aquifers',
      'Rigorous multi-stage filtration and UV purification ensuring clean, safe, soft water throughout the property',
      'Generous high-pressure hot water in every suite bathroom, soothing tired muscles after trail hikes',
      'Eco-conscious hospitality: refillable glass carafes in all rooms eliminate single-use plastic waste',
      'Pure natural water used in all restaurant cooking and artisan coffee brewing',
    ],
    ctaLabel: 'Ask Front Desk About Amenities',
    ctaIntent: 'GENERAL',
    whatsappText: 'Hello Reberon Hotel, I would like to inquire about suite amenities, water supply, or guest provisions.',
    note: 'Fresh drinking water is provided complimentary in every room and refilled daily by housekeeping.',
    badge: 'Borehole & UV Purified',
  },

  terrace: {
    tags: ['Mountain Ridge Views', 'Morning Mist Coffee', 'Evening Wood Firepit', 'Birdwatching Vistas'],
    specs: [
      { icon: 'mountain', label: 'Panoramic Elevation', value: '1,900m ASL escarpment facing the slopes of Mount Elgon' },
      { icon: 'coffee', label: 'Morning Ritual', value: 'Artisan Arabica coffee as dawn breaks and the valley mist clears' },
      { icon: 'flame', label: 'Evening Firepit', value: 'Cozy open wood fire pit lit when highland mountain chill arrives' },
      { icon: 'utensils', label: 'Outdoor Dining', value: 'Al-fresco breakfast, sundowner drinks, and fireside tapas' },
      { icon: 'trees', label: 'Nature Viewing', value: 'Canopy birdwatching overlooking indigenous trees and flowers' },
    ],
    highlights: [
      'Spacious elevated terrace situated between the main dining room and landscaped hillside gardens',
      'Direct east-facing orientation catching early morning alpine sun rays over Mount Elgon',
      'Open wood hearth and firepit crackling nightly to warm guests against crisp highland breezes',
      'Relaxed outdoor lounge seating for morning contemplation, afternoon reading, or twilight cocktails',
      'Stunning dark-sky stargazing opportunities with zero light pollution from major cities',
    ],
    ctaLabel: 'Inquire About Stays & Sundowners',
    ctaIntent: 'STAY',
    whatsappText: 'Hello Reberon Hotel, I would like to inquire about the Garden Terrace, sunset drinks, or upcoming stays.',
    note: 'Currently receiving its finishing stone accents and artisan firepit hearth. Walk-in guests are welcome to enjoy the view.',
    badge: 'Being Built · Opening Soon',
  },
};

export function getFacilityFeatures(facility: FacilityDTO): FacilityFeatureData {
  const custom = FACILITY_MAP[facility.slug.toLowerCase()];
  if (custom) return custom;

  // Fallback for custom facilities created dynamically via Admin CMS
  const name = t(facility.name);
  const summary = t(facility.summary);

  return {
    tags: [
      facility.status === 'COMING_SOON' ? 'Being Built' : 'Available',
      'Sanctuary Amenity',
      'Guest Facilities',
    ],
    specs: [
      { icon: facility.icon || 'sparkles', label: 'Facility', value: name },
      { icon: 'clock', label: 'Availability', value: facility.status === 'COMING_SOON' ? 'Opening Soon' : 'Available for Guests' },
      { icon: 'mountain', label: 'Location', value: 'Reberon Hotel Sanctuary, Kapchorwa' },
    ],
    highlights: [
      summary || `${name} is provided for the comfort and enrichment of guests staying at Reberon Hotel.`,
      'Designed to blend authentic high-altitude hospitality with reliable modern amenities.',
      'Maintained with care by our dedicated local hospitality team in Kapchorwa.',
    ],
    ctaLabel: `Inquire About ${name}`,
    ctaIntent: 'GENERAL',
    whatsappText: `Hello Reberon Hotel, I would like to inquire about the ${name} facility.`,
    note: 'Our front desk team is delighted to arrange access, answer questions, or coordinate bespoke arrangements.',
    badge: facility.status === 'COMING_SOON' ? 'Being Built' : 'Available',
  };
}
