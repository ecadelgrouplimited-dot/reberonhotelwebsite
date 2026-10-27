import { prisma, log, REFRESH } from '../lib.js';

export async function seedOperations(users: {
  ownerId: string;
  managerId: string;
  deskId: string;
  barId?: string;
  kitchenId?: string;
  gymId?: string;
}) {
  // Always ensure social links and official contacts are populated
  await prisma.setting.upsert({
    where: { key: 'social' },
    create: {
      key: 'social',
      group: 'CONTACT',
      value: {
        tiktok: 'https://tiktok.com/@reberonhotel',
        instagram: 'https://instagram.com/reberonhotel',
        facebook: 'https://facebook.com/reberonhotel',
        x: 'https://x.com/reberonhotel',
      },
    },
    update: {
      value: {
        tiktok: 'https://tiktok.com/@reberonhotel',
        instagram: 'https://instagram.com/reberonhotel',
        facebook: 'https://facebook.com/reberonhotel',
        x: 'https://x.com/reberonhotel',
      },
    },
  });

  // Clean up any non-seed test rows from previous test runs & reset counters
  await prisma.quotation.deleteMany({ where: { isSeed: false } });
  await prisma.posOrder.deleteMany({ where: { isSeed: false } });
  await prisma.requisition.deleteMany({ where: { isSeed: false } });
  await prisma.healthClubAccessLog.deleteMany({ where: { isSeed: false } });

  // Always ensure DocumentSequence counters are past seeded demo numbers
  for (const [series, minNext] of [
    ['ORD-2026', 10],
    ['POS-2026', 10],
    ['QUO-2026', 10],
    ['REQ-2026', 10],
    ['HC-2026', 10],
  ] as const) {
    await prisma.documentSequence.upsert({
      where: { series },
      create: { series, next: minNext },
      update: { next: minNext },
    });
  }

  if ((await prisma.posOutlet.count()) > 0 && !REFRESH) {
    log('operations', 'exists, skipped');
    return;
  }

  // 1. Inventory Items (Segregated Linen, Consumables, Beverages, Kitchen, Fixed Assets)
  const invSpecs = [
    // LINEN_GYM — Strictly segregated Gym Towels
    { sku: 'GYM-TWL-01', name: 'Gym Workout Towel (Moss Green Trim)', category: 'LINEN_GYM' as const, department: 'HEALTH_CLUB' as const, unit: 'PIECE', onHand: 85, inUseOrLaundry: 15, parLevel: 40, unitCostMinor: 25_000n, location: 'Health Club Linen Cabinet' },
    { sku: 'GYM-TWL-02', name: 'Steam & Sauna Wrap Sheet (Moss Trim)', category: 'LINEN_GYM' as const, department: 'HEALTH_CLUB' as const, unit: 'PIECE', onHand: 60, inUseOrLaundry: 12, parLevel: 30, unitCostMinor: 38_000n, location: 'Health Club Linen Cabinet' },
    // LINEN_ROOM — Strictly segregated Bathroom / Room Towels
    { sku: 'RM-TWL-01', name: 'Luxury White Bath Sheet (650 GSM)', category: 'LINEN_ROOM' as const, department: 'HOUSEKEEPING' as const, unit: 'PIECE', onHand: 120, inUseOrLaundry: 24, parLevel: 50, unitCostMinor: 55_000n, location: 'Housekeeping Main Linen Store' },
    { sku: 'RM-TWL-02', name: 'White Bathroom Hand Towel', category: 'LINEN_ROOM' as const, department: 'HOUSEKEEPING' as const, unit: 'PIECE', onHand: 110, inUseOrLaundry: 20, parLevel: 45, unitCostMinor: 28_000n, location: 'Housekeeping Main Linen Store' },
    { sku: 'RM-BED-01', name: 'Egyptian Cotton King Duvet Set', category: 'LINEN_ROOM' as const, department: 'HOUSEKEEPING' as const, unit: 'PIECE', onHand: 42, inUseOrLaundry: 10, parLevel: 24, unitCostMinor: 180_000n, location: 'Housekeeping Main Linen Store' },
    // CONSUMABLE — Ropes, Sandals, Shower Caps, Guest Amenities
    { sku: 'SPA-SND-01', name: 'Sanitised Spa & Sauna Sandals', category: 'CONSUMABLE' as const, department: 'HEALTH_CLUB' as const, unit: 'PAIR', onHand: 75, inUseOrLaundry: 8, parLevel: 30, unitCostMinor: 18_000n, location: 'Health Club Reception' },
    { sku: 'SPA-CAP-01', name: 'Biodegradable Steam & Shower Caps', category: 'CONSUMABLE' as const, department: 'HEALTH_CLUB' as const, unit: 'PIECE', onHand: 185, inUseOrLaundry: 0, parLevel: 60, unitCostMinor: 1_500n, location: 'Health Club & Housekeeping' },
    { sku: 'GYM-RPE-01', name: 'Speed Fitness Skipping Ropes', category: 'CONSUMABLE' as const, department: 'HEALTH_CLUB' as const, unit: 'PIECE', onHand: 24, inUseOrLaundry: 4, parLevel: 15, unitCostMinor: 35_000n, location: 'Gym Equipment Rack' },
    { sku: 'RM-COF-01', name: 'Mount Elgon Single-Estate Drip Coffee Pouches', category: 'CONSUMABLE' as const, department: 'HOUSEKEEPING' as const, unit: 'PIECE', onHand: 240, inUseOrLaundry: 0, parLevel: 80, unitCostMinor: 3_500n, location: 'Housekeeping Pantry' },
    { sku: 'RM-SOP-01', name: 'Highland Botanical Shea & Eucalyptus Bar Soap', category: 'CONSUMABLE' as const, department: 'HOUSEKEEPING' as const, unit: 'PIECE', onHand: 165, inUseOrLaundry: 0, parLevel: 60, unitCostMinor: 4_000n, location: 'Housekeeping Pantry' },
    // BEVERAGE — Bar Stock
    { sku: 'BEV-COF-AA', name: 'Kapchorwa Washed Arabica Coffee Beans (1kg)', category: 'BEVERAGE' as const, department: 'BAR' as const, unit: 'KG', onHand: 22, inUseOrLaundry: 0, parLevel: 10, unitCostMinor: 45_000n, location: 'Bar Coffee Station' },
    { sku: 'BEV-BR-01', name: 'Nile Special Lager (500ml Bottle)', category: 'BEVERAGE' as const, department: 'BAR' as const, unit: 'BOTTLE', onHand: 144, inUseOrLaundry: 0, parLevel: 48, unitCostMinor: 4_500n, location: 'Bar Cold Room' },
    { sku: 'BEV-BR-02', name: 'Bell Lager (500ml Bottle)', category: 'BEVERAGE' as const, department: 'BAR' as const, unit: 'BOTTLE', onHand: 120, inUseOrLaundry: 0, parLevel: 48, unitCostMinor: 4_200n, location: 'Bar Cold Room' },
    { sku: 'BEV-SP-01', name: 'Jameson Irish Whiskey (750ml)', category: 'BEVERAGE' as const, department: 'BAR' as const, unit: 'BOTTLE', onHand: 14, inUseOrLaundry: 0, parLevel: 6, unitCostMinor: 115_000n, location: 'Bar Top Shelf' },
    { sku: 'BEV-WN-01', name: 'Nederburg Cabernet Sauvignon (750ml)', category: 'BEVERAGE' as const, department: 'BAR' as const, unit: 'BOTTLE', onHand: 18, inUseOrLaundry: 0, parLevel: 8, unitCostMinor: 65_000n, location: 'Bar Wine Cellar' },
    { sku: 'BEV-WT-01', name: 'Sipi Highland Spring Water (750ml Glass)', category: 'BEVERAGE' as const, department: 'BAR' as const, unit: 'BOTTLE', onHand: 96, inUseOrLaundry: 0, parLevel: 36, unitCostMinor: 2_500n, location: 'Bar & Dining Store' },
    // FOOD_KITCHEN — Kitchen Stock
    { sku: 'FD-BF-01', name: 'Aged Highland Beef Tenderloin', category: 'FOOD_KITCHEN' as const, department: 'KITCHEN' as const, unit: 'KG', onHand: 24, inUseOrLaundry: 0, parLevel: 10, unitCostMinor: 32_000n, location: 'Kitchen Walk-in Chiller' },
    { sku: 'FD-FS-01', name: 'Fresh Tilapia Fillets', category: 'FOOD_KITCHEN' as const, department: 'KITCHEN' as const, unit: 'KG', onHand: 16, inUseOrLaundry: 0, parLevel: 8, unitCostMinor: 28_000n, location: 'Kitchen Walk-in Chiller' },
    { sku: 'FD-HN-01', name: 'Wild Mount Elgon Forest Honey (500g Jar)', category: 'FOOD_KITCHEN' as const, department: 'KITCHEN' as const, unit: 'PIECE', onHand: 7, inUseOrLaundry: 0, parLevel: 10, unitCostMinor: 18_000n, location: 'Kitchen Dry Store' },
    // FIXED_ASSET — Equipment & Assets
    { sku: 'AST-GYM-01', name: 'LifeFitness Integrity Commercial Treadmill', category: 'FIXED_ASSET' as const, department: 'HEALTH_CLUB' as const, unit: 'UNIT', onHand: 4, inUseOrLaundry: 0, parLevel: 4, unitCostMinor: 14_500_000n, location: 'Gym Cardio Zone' },
    { sku: 'AST-GYM-02', name: 'Schwinn AC Performance Indoor Spin Bike', category: 'FIXED_ASSET' as const, department: 'HEALTH_CLUB' as const, unit: 'UNIT', onHand: 6, inUseOrLaundry: 0, parLevel: 6, unitCostMinor: 5_200_000n, location: 'Gym Studio' },
    { sku: 'AST-SPA-01', name: 'Harvia Club 15kW Commercial Sauna Stove & Steam Generator', category: 'FIXED_ASSET' as const, department: 'HEALTH_CLUB' as const, unit: 'UNIT', onHand: 2, inUseOrLaundry: 0, parLevel: 2, unitCostMinor: 9_800_000n, location: 'Spa Thermal Suite' },
    { sku: 'AST-BAR-01', name: 'La Marzocco Linea Classic 2-Group Espresso Machine', category: 'FIXED_ASSET' as const, department: 'BAR' as const, unit: 'UNIT', onHand: 1, inUseOrLaundry: 0, parLevel: 1, unitCostMinor: 28_000_000n, location: 'Main Bar Counter' },
    { sku: 'AST-CNF-01', name: 'Epson Pro L1070U 4K Laser Conference Projector & Motorized Screen', category: 'FIXED_ASSET' as const, department: 'CONFERENCE' as const, unit: 'UNIT', onHand: 2, inUseOrLaundry: 0, parLevel: 2, unitCostMinor: 12_000_000n, location: 'Sipi Grand Conference Hall' },
    { sku: 'AST-CNF-02', name: 'JBL EON715 Conference PA System & Shure Wireless Mics', category: 'FIXED_ASSET' as const, department: 'CONFERENCE' as const, unit: 'UNIT', onHand: 1, inUseOrLaundry: 0, parLevel: 1, unitCostMinor: 8_500_000n, location: 'Sipi Grand Conference Hall' },
  ];

  const invBySku: Record<string, string> = {};
  for (const item of invSpecs) {
    const row = await prisma.inventoryItem.upsert({
      where: { sku: item.sku },
      create: { ...item, lastCountedAt: new Date(), isSeed: true },
      update: {},
    });
    invBySku[item.sku] = row.id;
  }

  // Record sample stock movements
  await prisma.stockMovement.createMany({
    data: [
      { itemId: invBySku['GYM-TWL-01']!, type: 'LAUNDRY_SEND', quantity: 15, balanceAfter: 85, department: 'HEALTH_CLUB', reference: 'LND-MORN-01', notes: 'Morning gym towel batch sent to hotel laundry', recordedByName: 'Coach Daniel Cherop', isSeed: true },
      { itemId: invBySku['RM-TWL-01']!, type: 'LAUNDRY_RETURN', quantity: 30, balanceAfter: 120, department: 'HOUSEKEEPING', reference: 'LND-RET-04', notes: 'Freshly laundered white room bath sheets restocked', recordedByName: 'Sarah Chelangat', isSeed: true },
      { itemId: invBySku['BEV-BR-01']!, type: 'STOCK_IN', quantity: 48, balanceAfter: 144, department: 'BAR', reference: 'PO-2026-088', notes: '2 crates Nile Special received from Mbale distributor', recordedByName: 'Samuel Kiprop', isSeed: true },
    ],
  });

  // 2. POS Outlets, Categories & Menu Items
  const kitchenOutlet = await prisma.posOutlet.upsert({
    where: { code: 'KITCHEN' },
    create: {
      code: 'KITCHEN',
      name: 'Highland Kitchen & Dining',
      type: 'KITCHEN',
      description: 'Scheduled set menus — Breakfast, Highland Lunch, Mountain Dinner & Pastries (no custom on-demand prep).',
      deviceStation: 'KDS-KITCHEN-01 · 80mm Ticket Printer',
      isSeed: true,
    },
    update: {},
  });

  const barOutlet = await prisma.posOutlet.upsert({
    where: { code: 'MAIN_BAR' },
    create: {
      code: 'MAIN_BAR',
      name: 'The Ridge Bar & Coffee Lounge',
      type: 'BAR',
      description: 'Elgon single-origin coffees, hot & cold beverages, signature cocktails, beers, wines and premium spirits.',
      deviceStation: 'BAR-POS-01 · 80mm Thermal Printer',
      isSeed: true,
    },
    update: {},
  });

  const hcOutlet = await prisma.posOutlet.upsert({
    where: { code: 'HEALTH_CLUB' },
    create: {
      code: 'HEALTH_CLUB',
      name: 'Elgon Health Club & Spa',
      type: 'HEALTH_CLUB',
      description: 'Gym, Steam Room & Finnish Sauna — pay for individual access or Daily, Monthly and Annual packages.',
      deviceStation: 'GYM-TAB-01 · Health Club Desk',
      isSeed: true,
    },
    update: {},
  });

  const confOutlet = await prisma.posOutlet.upsert({
    where: { code: 'CONFERENCE_HALL' },
    create: {
      code: 'CONFERENCE_HALL',
      name: 'Sipi Grand Conference & Events',
      type: 'CONFERENCE',
      description: 'Activity-based packages for corporate meetings, workshops, retreats and wedding banquets.',
      deviceStation: 'FD-MAIN-01 · Front Desk A4 & 80mm',
      isSeed: true,
    },
    update: {},
  });

  const addMenu = async (
    outletId: string,
    catName: string,
    sortOrder: number,
    items: { sku: string; name: string; description: string; ugx: bigint; usd: bigint; prep?: number; invSku?: string }[],
  ) => {
    const cat = await prisma.posCategory.create({
      data: { outletId, name: catName, sortOrder, isSeed: true },
    });
    for (const it of items) {
      await prisma.posItem.upsert({
        where: { sku: it.sku },
        create: {
          categoryId: cat.id,
          sku: it.sku,
          name: it.name,
          description: it.description,
          priceMinorUGX: it.ugx,
          priceMinorUSD: it.usd,
          prepMinutes: it.prep ?? null,
          inventoryItemId: it.invSku ? invBySku[it.invSku] : null,
          isSeed: true,
        },
        update: {},
      });
    }
  };

  // Kitchen Menu (Scheduled Set Menus)
  await addMenu(kitchenOutlet.id, 'Scheduled Set Meals', 1, [
    { sku: 'KIT-BRK-01', name: 'Highland Full Morning Table (Set Breakfast)', description: 'Farm eggs, Elgon roast coffee, seasonal fruit, warm katogo or sourdough toast & wild honey.', ugx: 35_000n, usd: 1000n, prep: 15 },
    { sku: 'KIT-LUN-01', name: 'Sipi Grilled Tilapia Set Lunch', description: 'Pan-seared Lake Victoria tilapia, steamed matooke, highland greens & passion fruit tart.', ugx: 55_000n, usd: 1500n, prep: 25, invSku: 'FD-FS-01' },
    { sku: 'KIT-LUN-02', name: 'Kapchorwa Smoked Beef Stew Set Lunch', description: 'Slow-braised highland beef with coconut rice, roasted pumpkin & garden salad.', ugx: 50_000n, usd: 1400n, prep: 20, invSku: 'FD-BF-01' },
    { sku: 'KIT-DIN-01', name: 'Three-Course Mountain Table Dinner', description: 'Butternut soup starter, aged highland beef tenderloin or mushroom risotto, coffee mousse dessert.', ugx: 75_000n, usd: 2100n, prep: 30, invSku: 'FD-BF-01' },
  ]);
  await addMenu(kitchenOutlet.id, 'Afternoon Tea & Set Bites', 2, [
    { sku: 'KIT-TEA-01', name: 'Highland Afternoon Tea Tray (For One)', description: 'Freshly baked cinnamon scones, mandazi, beef samosas, Elgon honey & pot of tea or coffee.', ugx: 28_000n, usd: 800n, prep: 10 },
    { sku: 'KIT-SNK-01', name: 'Spiced Chicken Wings & Plantain Crisps', description: 'Glazed in wild Elgon honey and ginger.', ugx: 32_000n, usd: 900n, prep: 15 },
  ]);

  // Bar Menu (Hot & Cold, Alcoholic & Non-Alcoholic)
  await addMenu(barOutlet.id, 'Hot Beverages (Elgon Coffee & Teas)', 1, [
    { sku: 'BAR-HOT-01', name: 'Single-Estate Elgon Double Espresso', description: '100% SL14/SL28 washed Arabica grown at 1,950m.', ugx: 10_000n, usd: 300n, prep: 4, invSku: 'BEV-COF-AA' },
    { sku: 'BAR-HOT-02', name: 'Highland Cappuccino / Caffè Latte', description: 'Velvety steamed farm milk over double Elgon espresso.', ugx: 14_000n, usd: 400n, prep: 5, invSku: 'BEV-COF-AA' },
    { sku: 'BAR-HOT-03', name: 'V60 Hand-Poured Filter Coffee Carafe', description: 'Bright citrus and dark chocolate notes, brewed table-side.', ugx: 16_000n, usd: 500n, prep: 6, invSku: 'BEV-COF-AA' },
    { sku: 'BAR-HOT-04', name: 'Spiced African Masala Tea Pot', description: 'Whole cardamom, fresh ginger, cinnamon and highland milk.', ugx: 12_000n, usd: 350n, prep: 5 },
  ]);
  await addMenu(barOutlet.id, 'Cold Beverages & Mocktails (Non-Alcoholic)', 2, [
    { sku: 'BAR-CLD-01', name: 'Freshly Pressed Passion & Mint Cooler', description: 'Kapchorwa purple passion fruit, crushed ice and garden mint.', ugx: 12_000n, usd: 350n, prep: 4 },
    { sku: 'BAR-CLD-02', name: 'Sipi Virgin Mojito Mocktail', description: 'Fresh lime, mint leaves, cane sugar and sparkling spring water.', ugx: 18_000n, usd: 500n, prep: 5 },
    { sku: 'BAR-CLD-03', name: 'Sipi Highland Spring Water (750ml)', description: 'Chilled or room temperature.', ugx: 6_000n, usd: 200n, prep: 1, invSku: 'BEV-WT-01' },
  ]);
  await addMenu(barOutlet.id, 'Signature Cocktails, Beers & Spirits (Alcoholic)', 3, [
    { sku: 'BAR-ALC-01', name: 'Elgon Sunset Signature Cocktail', description: 'Uganda Waragi Premium, fresh passion fruit, hibiscus syrup & prosecco float.', ugx: 28_000n, usd: 800n, prep: 5 },
    { sku: 'BAR-ALC-02', name: 'Coffee Negroni on the Ridge', description: 'Gin, Campari, sweet vermouth infused with roasted Elgon coffee beans.', ugx: 32_000n, usd: 900n, prep: 5 },
    { sku: 'BAR-ALC-03', name: 'Nile Special Lager (500ml Chilled)', description: 'Crisp Ugandan gold-medal lager.', ugx: 10_000n, usd: 300n, prep: 1, invSku: 'BEV-BR-01' },
    { sku: 'BAR-ALC-04', name: 'Bell Lager (500ml Chilled)', description: 'Smooth classic lager.', ugx: 9_000n, usd: 280n, prep: 1, invSku: 'BEV-BR-02' },
    { sku: 'BAR-ALC-05', name: 'Jameson Irish Whiskey (Double Tot)', description: 'Served neat, on the rocks, or with ginger ale.', ugx: 24_000n, usd: 700n, prep: 2, invSku: 'BEV-SP-01' },
    { sku: 'BAR-ALC-06', name: 'Nederburg Cabernet Sauvignon (Bottle)', description: 'Full-bodied South African red wine.', ugx: 125_000n, usd: 3500n, prep: 2, invSku: 'BEV-WN-01' },
  ]);

  // Health Club POS Items (Single Unified System: Pay for what you want + Packages)
  await addMenu(hcOutlet.id, 'Single-Access Daily Passes', 1, [
    { sku: 'HC-DAY-GYM', name: 'Gym Only — Daily Pass', description: 'Full strength & cardio floor access, locker & 1 gym towel.', ugx: 20_000n, usd: 600n },
    { sku: 'HC-DAY-STM', name: 'Steam & Sauna Only — Daily Pass', description: 'Eucalyptus steam room & Finnish dry sauna, towel, sandals & shower cap.', ugx: 30_000n, usd: 850n },
    { sku: 'HC-DAY-CMB', name: 'Full Health Club Combo — Daily Pass', description: 'Unlimited Gym + Steam + Sauna + herbal tea, 2 gym towels, sandals & shower cap.', ugx: 45_000n, usd: 1300n },
  ]);
  await addMenu(hcOutlet.id, 'Monthly & Annual Membership Packages', 2, [
    { sku: 'HC-MTH-GYM', name: 'Gym Only — Monthly Membership', description: '30 days unlimited gym access & personal trainer orientation.', ugx: 220_000n, usd: 6000n },
    { sku: 'HC-MTH-CMB', name: 'Full Health Club (Gym + Steam + Sauna) — Monthly', description: '30 days full access to gym, steam room and sauna with towel service.', ugx: 380_000n, usd: 10500n },
    { sku: 'HC-ANN-CMB', name: 'Full Health Club Executive — Annual Package', description: '365 days unlimited access, priority locker, guest passes & spa discounts.', ugx: 3_500_000n, usd: 95000n },
  ]);

  // Conference Hall Packages
  await addMenu(confOutlet.id, 'Conference & Event Packages', 1, [
    { sku: 'CNF-PKG-FD', name: 'Full-Day Corporate Conference Package (Per Person)', description: 'Hall setup, 4K laser projector, PA system, morning break, buffet lunch, afternoon tea & stationery.', ugx: 85_000n, usd: 2400n },
    { sku: 'CNF-PKG-HD', name: 'Half-Day Workshop Package (Per Person)', description: 'Hall setup, projector, Wi-Fi, 1 tea/coffee break with pastries & mineral water.', ugx: 55_000n, usd: 1600n },
    { sku: 'CNF-PKG-WED', name: 'Highland Wedding & Banquet Venue Hire (Full Day)', description: 'Exclusive hall & manicured gardens, banquet seating for up to 200 guests, stage & sound.', ugx: 4_500_000n, usd: 125000n },
  ]);

  // 3. Sample POS Orders
  const barItem1 = await prisma.posItem.findUnique({ where: { sku: 'BAR-HOT-02' } });
  const barItem2 = await prisma.posItem.findUnique({ where: { sku: 'BAR-ALC-01' } });
  const kitItem1 = await prisma.posItem.findUnique({ where: { sku: 'KIT-DIN-01' } });
  if (barItem1 && barItem2 && kitItem1) {
    await prisma.posOrder.create({
      data: {
        orderNumber: 'ORD-2026-00001',
        outletId: barOutlet.id,
        tableOrRoom: 'Terrace Table 3',
        customerName: 'Dr. Patrick Mwangi',
        status: 'COMPLETED',
        paymentMethod: 'MOBILE_MONEY',
        currency: 'UGX',
        subtotalMinor: 70_000n,
        totalMinor: 70_000n,
        servedByName: 'Samuel Kiprop',
        isSeed: true,
        items: {
          create: [
            { itemId: barItem1.id, itemName: barItem1.name, quantity: 1, unitPriceMinor: 14_000n, totalMinor: 14_000n },
            { itemId: barItem2.id, itemName: barItem2.name, quantity: 2, unitPriceMinor: 28_000n, totalMinor: 56_000n },
          ],
        },
      },
    });
    await prisma.posOrder.create({
      data: {
        orderNumber: 'ORD-2026-00002',
        outletId: kitchenOutlet.id,
        tableOrRoom: 'Dining Room Table 1',
        customerName: 'Resident Guest — Room 102',
        status: 'PREPARING',
        paymentMethod: 'ROOM_FOLIO',
        currency: 'UGX',
        subtotalMinor: 150_000n,
        totalMinor: 150_000n,
        notes: 'Medium-rare tenderloin, extra Elgon honey glaze.',
        servedByName: 'Chef Isaac Mangusho',
        isSeed: true,
        items: {
          create: [
            { itemId: kitItem1.id, itemName: kitItem1.name, quantity: 2, unitPriceMinor: 75_000n, totalMinor: 150_000n },
          ],
        },
      },
    });
  }

  // 4. Health Club Memberships & Access Logs
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);
  const in365Days = new Date(now.getTime() + 365 * 86_400_000);

  const mem1 = await prisma.healthClubMembership.upsert({
    where: { membershipNo: 'HC-2026-0001' },
    create: {
      membershipNo: 'HC-2026-0001',
      memberName: 'Hon. Peter Chemaswet',
      memberPhone: '+256772300400',
      memberEmail: 'p.chemaswet@kapchorwa.go.ug',
      tier: 'ANNUAL',
      service: 'FULL_COMBO',
      currency: 'UGX',
      amountMinor: 3_500_000n,
      startDate: now,
      endDate: in365Days,
      isActive: true,
      notes: 'Executive Annual Pass — Locker #01',
      isSeed: true,
    },
    update: {},
  });

  const mem2 = await prisma.healthClubMembership.upsert({
    where: { membershipNo: 'HC-2026-0002' },
    create: {
      membershipNo: 'HC-2026-0002',
      memberName: 'Joshua Cheptegei Athletics Club (Group Rep)',
      memberPhone: '+256701888999',
      memberEmail: 'training@elgonrunners.ug',
      tier: 'MONTHLY',
      service: 'STEAM_SAUNA',
      currency: 'UGX',
      amountMinor: 380_000n,
      startDate: now,
      endDate: in30Days,
      isActive: true,
      notes: 'Recovery Steam & Sauna monthly subscription',
      isSeed: true,
    },
    update: {},
  });

  await prisma.healthClubMembership.upsert({
    where: { membershipNo: 'HC-2026-0003' },
    create: {
      membershipNo: 'HC-2026-0003',
      memberName: 'Mercy Chelangat',
      memberPhone: '+256782445566',
      tier: 'MONTHLY',
      service: 'GYM_ONLY',
      currency: 'UGX',
      amountMinor: 220_000n,
      startDate: now,
      endDate: in30Days,
      isActive: true,
      isSeed: true,
    },
    update: {},
  });

  await prisma.healthClubAccessLog.createMany({
    data: [
      {
        membershipId: mem1.id,
        guestName: mem1.memberName,
        guestPhone: mem1.memberPhone,
        service: 'FULL_COMBO',
        tier: 'ANNUAL',
        currency: 'UGX',
        amountPaidMinor: 0n,
        paymentMethod: 'MEMBER_PASS',
        gymTowelsIssued: 2,
        gymTowelsReturned: 2,
        sandalsIssued: true,
        showerCapIssued: true,
        ropeIssued: false,
        lockerNumber: 'L-01',
        attendantName: 'Coach Daniel Cherop',
        checkedInAt: new Date(now.getTime() - 3 * 3600_000),
        checkedOutAt: new Date(now.getTime() - 1 * 3600_000),
        isSeed: true,
      },
      {
        membershipId: mem2.id,
        guestName: mem2.memberName,
        guestPhone: mem2.memberPhone,
        service: 'STEAM_SAUNA',
        tier: 'MONTHLY',
        currency: 'UGX',
        amountPaidMinor: 0n,
        paymentMethod: 'MEMBER_PASS',
        gymTowelsIssued: 2,
        gymTowelsReturned: 0,
        sandalsIssued: true,
        showerCapIssued: true,
        ropeIssued: false,
        lockerNumber: 'L-08',
        attendantName: 'Coach Daniel Cherop',
        checkedInAt: new Date(now.getTime() - 45 * 60_000),
        checkedOutAt: null, // Currently inside the steam room!
        isSeed: true,
      },
      {
        membershipId: null,
        guestName: 'ivan Kissa (Walk-In Guest)',
        guestPhone: '+256752112233',
        service: 'FULL_COMBO',
        tier: 'DAILY_PASS',
        currency: 'UGX',
        amountPaidMinor: 45_000n,
        paymentMethod: 'MOBILE_MONEY',
        gymTowelsIssued: 1,
        gymTowelsReturned: 0,
        sandalsIssued: true,
        showerCapIssued: true,
        ropeIssued: true,
        lockerNumber: 'L-12',
        attendantName: 'Coach Daniel Cherop',
        checkedInAt: new Date(now.getTime() - 30 * 60_000),
        checkedOutAt: null,
        isSeed: true,
      },
    ],
  });

  // 5. Quotations (Quotation ➔ Invoice ➔ Payment ➔ Receipt pipeline)
  await prisma.quotation.upsert({
    where: { number: 'QUO-2026-00001' },
    create: {
      number: 'QUO-2026-00001',
      clientName: 'Dr. Richard Kiptoo',
      clientOrganization: 'Mount Elgon Coffee Exporters Association',
      clientPhone: '+256772998877',
      clientEmail: 'r.kiptoo@elgoncoffee.ug',
      eventType: 'CONFERENCE',
      eventTitle: 'Annual Highland Coffee Quality & Sustainability Summit (2 Days)',
      eventDate: new Date(now.getTime() + 14 * 86_400_000),
      endDate: new Date(now.getTime() + 15 * 86_400_000),
      attendees: 45,
      hallSetup: 'Classroom Style + 4K Projector',
      validUntil: new Date(now.getTime() + 10 * 86_400_000),
      currency: 'UGX',
      subtotalMinor: 9_850_000n,
      discountMinor: 350_000n,
      taxMinor: 0n,
      totalMinor: 9_500_000n,
      status: 'SENT',
      notes: 'Includes dedicated cupping tables and high-speed Starlink/Fiber Wi-Fi.',
      terms: '50% deposit upon confirmation; balance payable prior to event conclusion.',
      createdByName: 'Grace Chemutai',
      checkCode: 'QUO1-9500',
      isSeed: true,
      lines: {
        create: [
          { category: 'CONFERENCE', description: 'Full-Day Corporate Conference Package (45 Pax × 2 Days)', quantity: 90, unit: 'PAX_DAY', unitPriceMinor: 85_000n, totalMinor: 7_650_000n, sortOrder: 1 },
          { category: 'ACCOMMODATION', description: 'Executive Speaker Rooms (5 Rooms × 2 Nights)', quantity: 10, unit: 'ROOM_NIGHT', unitPriceMinor: 220_000n, totalMinor: 2_200_000n, sortOrder: 2 },
        ],
      },
    },
    update: {},
  });

  await prisma.quotation.upsert({
    where: { number: 'QUO-2026-00002' },
    create: {
      number: 'QUO-2026-00002',
      clientName: 'Eng.Timothy & Brenda Chebet',
      clientOrganization: 'Chebet Wedding Committee',
      clientPhone: '+256704556677',
      clientEmail: 'timothy.chebet@gmail.com',
      eventType: 'WEDDING',
      eventTitle: 'Highland Garden & Grand Hall Wedding Reception (180 Guests)',
      eventDate: new Date(now.getTime() + 30 * 86_400_000),
      attendees: 180,
      hallSetup: 'Banquet Round Tables + Bridal Stage',
      validUntil: new Date(now.getTime() + 14 * 86_400_000),
      currency: 'UGX',
      subtotalMinor: 15_300_000n,
      discountMinor: 300_000n,
      taxMinor: 0n,
      totalMinor: 15_000_000n,
      status: 'ACCEPTED',
      notes: 'Complimentary bridal suite night in Summit Suite included.',
      terms: '50% booking deposit required to lock venue date.',
      createdByName: 'Denis Mayamba',
      checkCode: 'WED2-1500',
      isSeed: true,
      lines: {
        create: [
          { category: 'VENUE', description: 'Sipi Grand Hall & Manicured Gardens Exclusive Wedding Hire', quantity: 1, unit: 'DAY', unitPriceMinor: 4_500_000n, totalMinor: 4_500_000n, sortOrder: 1 },
          { category: 'CATERING', description: 'Highland 3-Course Wedding Banquet Buffet & Welcome Mocktails', quantity: 180, unit: 'PAX', unitPriceMinor: 60_000n, totalMinor: 10_800_000n, sortOrder: 2 },
        ],
      },
    },
    update: {},
  });

  // 6. Departmental Requisitions
  await prisma.requisition.upsert({
    where: { number: 'REQ-2026-00001' },
    create: {
      number: 'REQ-2026-00001',
      department: 'HEALTH_CLUB',
      title: 'Replenish Biodegradable Shower Caps, Sauna Eucalyptus Oil &Sandals',
      priority: 'URGENT',
      status: 'MANAGER_APPROVED',
      currency: 'UGX',
      totalEstimatedMinor: 640_000n,
      notes: 'Weekend athletics group booked for steam and sauna sessions.',
      requestedByName: 'Coach Daniel Cherop',
      managerApprovedBy: 'Grace Chemutai',
      managerApprovedAt: new Date(now.getTime() - 2 * 3600_000),
      isSeed: true,
      items: {
        create: [
          { inventoryItemId: invBySku['SPA-SND-01'], itemName: 'Sanitised Spa & Sauna Sandals', unit: 'PAIR', quantityRequested: 20, quantityApproved: 20, estimatedUnitMinor: 18_000n, totalEstimatedMinor: 360_000n },
          { inventoryItemId: invBySku['SPA-CAP-01'], itemName: 'Biodegradable Steam & Shower Caps (Box of 100)', unit: 'PACK', quantityRequested: 2, quantityApproved: 2, estimatedUnitMinor: 140_000n, totalEstimatedMinor: 280_000n },
        ],
      },
    },
    update: {},
  });

  await prisma.requisition.upsert({
    where: { number: 'REQ-2026-00002' },
    create: {
      number: 'REQ-2026-00002',
      department: 'KITCHEN',
      title: 'Weekly Highland Honey, Beef Tenderloin & Fresh Produce Restock',
      priority: 'NORMAL',
      status: 'PENDING',
      currency: 'UGX',
      totalEstimatedMinor: 820_000n,
      notes: 'Wild honey stock fell below par level (7 jars remaining).',
      requestedByName: 'Chef Isaac Mangusho',
      isSeed: true,
      items: {
        create: [
          { inventoryItemId: invBySku['FD-HN-01'], itemName: 'Wild Mount Elgon Forest Honey (500g Jar)', unit: 'PIECE', quantityRequested: 20, estimatedUnitMinor: 18_000n, totalEstimatedMinor: 360_000n },
          { inventoryItemId: invBySku['FD-BF-01'], itemName: 'Aged Highland Beef Tenderloin', unit: 'KG', quantityRequested: 15, estimatedUnitMinor: 30_666n, totalEstimatedMinor: 460_000n },
        ],
      },
    },
    update: {},
  });

  // 7. Staff Announcements & Shift Handover Logbook
  await prisma.staffAnnouncement.createMany({
    data: [
      {
        department: null,
        title: 'Strict Separation of Gym Towels vs. Room Bathroom Towels',
        body: 'Reminder to Housekeeping, Front Desk, and Health Club staff: Moss-trimmed Gym Towels must stay exclusively in the Health Club & Spa laundry cycle. White 650 GSM Bath Sheets are strictly for guest rooms. Never mix the two.',
        priority: 'IMPORTANT',
        authorName: 'Denis Mayamba',
        authorRole: 'Director / Super Admin',
        isPinned: true,
        isSeed: true,
      },
      {
        department: 'FRONT_DESK',
        title: 'Morning Shift Handover — Conference Inquiry & VIP Arrival',
        body: 'Mount Elgon Coffee Exporters Association quotation (QUO-2026-00001) sent to Dr. Kiptoo. Also ensure welcome Elgon drip coffee tray is ready for Summit Suite check-in at 14:00.',
        priority: 'HANDOVER',
        authorName: 'Brian Cheptoek',
        authorRole: 'Front Desk Receptionist',
        isPinned: false,
        isSeed: true,
      },
    ],
  });

  // 8. Hardware & Terminal Devices
  const devices = [
    { code: 'FD-MAIN-01', name: 'Front Desk Master Workstation & Dual Printer', department: 'FRONT_DESK' as const, kind: 'WORKSTATION', paperSize: 'A4 & 80MM', ipOrPort: '192.168.10.10 (USB/LAN)', status: 'ONLINE' },
    { code: 'BAR-POS-01', name: 'Ridge Bar Touch Terminal & Cash Drawer', department: 'BAR' as const, kind: 'POS_TERMINAL', paperSize: '80MM', ipOrPort: '192.168.10.21:9100', status: 'ONLINE' },
    { code: 'KDS-KITCHEN-01', name: 'Highland Kitchen Display & Order Slip Printer', department: 'KITCHEN' as const, kind: 'KDS_DISPLAY', paperSize: '80MM', ipOrPort: '192.168.10.31:9100', status: 'ONLINE' },
    { code: 'GYM-TAB-01', name: 'Health Club & Spa Attendant Tablet', department: 'HEALTH_CLUB' as const, kind: 'TABLET', paperSize: '80MM', ipOrPort: '192.168.10.41 (Wi-Fi)', status: 'ONLINE' },
  ];
  for (const dev of devices) {
    await prisma.terminalDevice.upsert({
      where: { code: dev.code },
      create: { ...dev, isSeed: true },
      update: {},
    });
  }

  // 9. Clean up any non-seed test rows from previous test runs & reset counters
  await prisma.posOrder.deleteMany({ where: { isSeed: false } });
  await prisma.quotation.deleteMany({ where: { isSeed: false } });
  await prisma.requisition.deleteMany({ where: { isSeed: false } });
  await prisma.healthClubAccessLog.deleteMany({ where: { isSeed: false } });

  for (const [series, next] of [
    ['ORD-2026', 10],
    ['POS-2026', 10],
    ['QUO-2026', 10],
    ['REQ-2026', 10],
    ['HC-2026', 10],
  ] as const) {
    await prisma.documentSequence.upsert({
      where: { series },
      create: { series, next },
      update: { next },
    });
  }

  log('operations', '4 POS outlets, 25 inventory & linen items, 3 memberships, 2 quotations, 2 requisitions, 4 devices');
}
