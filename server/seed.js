// Demo data so the platform is alive on first launch: two shippers, one carrier fleet, live and historic loads.
import { db, save, id, hashPassword, writeUpload } from './db.js';
import { route, pathLength, pointAlong, haversine } from './geo.js';
import { quote, invoice, economics, DEFAULT_SETTINGS } from './pricing.js';
import { PHOTO_SLOTS } from './constants.js';
import { newLoadShell, updateEta } from './fleet.js';

const P = {
  mississauga: { name: 'Northwind DC — Mississauga', address: '6855 Airport Rd', city: 'Mississauga', region: 'ON', lat: 43.6905, lng: -79.6215, contact: 'Receiving desk', phone: '905-555-0142' },
  toronto: { name: 'Northwind Bakery Plant', address: '255 Bremner Blvd', city: 'Toronto', region: 'ON', lat: 43.6416, lng: -79.3871, contact: 'Shipping office', phone: '416-555-0119' },
  hamilton: { name: 'Maple Steel — Mill 2', address: '1330 Burlington St E', city: 'Hamilton', region: 'ON', lat: 43.2637, lng: -79.7898, contact: 'Gate 4', phone: '905-555-0177' },
  ottawa: { name: 'FreshCo Distribution', address: '1900 Bank St', city: 'Ottawa', region: 'ON', lat: 45.3712, lng: -75.6553, contact: 'Dock supervisor', phone: '613-555-0163' },
  montreal: { name: 'Port de Montréal — Terminal Viau', address: '4400 Rue Notre-Dame E', city: 'Montréal', region: 'QC', lat: 45.5596, lng: -73.5263, contact: 'Terminal office', phone: '514-555-0101' },
  kingston: { name: 'Metro Grocers Kingston', address: '1300 Bath Rd', city: 'Kingston', region: 'ON', lat: 44.2437, lng: -76.5584, contact: 'Back dock', phone: '613-555-0192' },
  windsor: { name: 'Lakeshore Cold Storage', address: '3800 Rhodes Dr', city: 'Windsor', region: 'ON', lat: 42.2955, lng: -82.9799, contact: 'Cold dock', phone: '519-555-0136' },
  detroit: { name: 'Motor City Fabrication', address: '6501 E Jefferson Ave', city: 'Detroit', region: 'MI', lat: 42.3536, lng: -82.9849, contact: 'Yard office', phone: '313-555-0188' },
  quebec: { name: 'Épicerie Laurentide', address: '2500 Bd Wilfrid-Hamel', city: 'Québec', region: 'QC', lat: 46.8007, lng: -71.2876, contact: 'Réception', phone: '418-555-0124' },
  sudbury: { name: 'Northern Mining Supply', address: '1600 Kingsway', city: 'Sudbury', region: 'ON', lat: 46.5004, lng: -80.9502, contact: 'Warehouse', phone: '705-555-0157' },
  london: { name: 'Forest City Foods', address: '1151 Wilton Grove Rd', city: 'London', region: 'ON', lat: 42.9298, lng: -81.1844, contact: 'Dock 3', phone: '519-555-0172' },
  barrie: { name: 'Georgian Retail DC', address: '400 Bayview Dr', city: 'Barrie', region: 'ON', lat: 44.3549, lng: -79.6776, contact: 'Inbound', phone: '705-555-0115' },
  kitchener: { name: 'Grand River Packaging', address: '1305 Bleams Rd', city: 'Kitchener', region: 'ON', lat: 43.4093, lng: -80.4662, contact: 'Receiving', phone: '519-555-0149' },
  buffalo: { name: 'Niagara Frontier Logistics', address: '2255 Walden Ave', city: 'Buffalo', region: 'NY', lat: 42.9077, lng: -78.7586, contact: 'Dispatch', phone: '716-555-0181' },
};
const yard = { lat: 43.7315, lng: -79.7624 }; // Brampton

const H = 3600e3;
const D = 24 * H;
const rnd = (a, b) => a + Math.random() * (b - a);

function placeholderPhoto(label, phase, hue) {
  const name = `seed_${Math.random().toString(36).slice(2)}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},18%,72%)"/><stop offset="1" stop-color="hsl(${hue + 30},14%,38%)"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#g)"/>
<rect x="110" y="190" width="520" height="210" rx="10" fill="hsl(${hue},8%,92%)" stroke="hsl(${hue},8%,60%)" stroke-width="4"/>
<rect x="630" y="250" width="90" height="150" rx="10" fill="hsl(${hue},40%,45%)"/>
<circle cx="200" cy="420" r="34" fill="#222"/><circle cx="280" cy="420" r="34" fill="#222"/><circle cx="560" cy="420" r="34" fill="#222"/><circle cx="680" cy="420" r="34" fill="#222"/>
<text x="40" y="70" font-family="-apple-system,Helvetica,Arial" font-size="34" font-weight="600" fill="#fff">${label}</text>
<text x="40" y="112" font-family="-apple-system,Helvetica,Arial" font-size="24" fill="#fff" opacity=".85">Sample ${phase} photo · demo data</text>
</svg>`;
  return writeUpload(name, svg);
}

function photoSet(phase, t, place, by) {
  return PHOTO_SLOTS.filter((s) => s.required || Math.random() > 0.4).map((s, i) => ({
    id: id('pho'), slot: s.key, url: placeholderPhoto(s.label, phase, 200 + i * 9), t: t + i * 40000,
    lat: place.lat, lng: place.lng, by, note: '',
  }));
}

function syntheticLeg(a, b) {
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    pts.push({ lat: a.lat + (b.lat - a.lat) * t + Math.sin(Math.PI * t) * 0.04, lng: a.lng + (b.lng - a.lng) * t });
  }
  return { points: pts, distanceKm: haversine(a, b) * 1.2, source: 'estimate' };
}

export async function seed() {
  console.log('Seeding demo data…');
  db.settings = { ...DEFAULT_SETTINGS, nextRef: 10200 };
  const s = db.settings;
  const pw = hashPassword('demo');

  const northwind = { id: id('cmp'), type: 'shipper', name: 'Northwind Foods Inc.', city: 'Mississauga, ON', phone: '905-555-0100' };
  const maple = { id: id('cmp'), type: 'shipper', name: 'Maple Steel Ltd.', city: 'Hamilton, ON', phone: '905-555-0170' };
  const velocity = { id: id('cmp'), type: 'carrier', name: 'Velocity Freight Lines', city: 'Brampton, ON', phone: '905-555-0300', yard, usdot: '3187421', nsc: 'ON-58219' };
  db.companies.push(northwind, maple, velocity);

  const user = (o) => ({ id: id('usr'), password: pw, rating: null, ...o });
  const dana = user({ companyId: northwind.id, role: 'shipper', name: 'Dana Whitfield', email: 'dana@northwind.com', phone: '905-555-0101', color: '#007AFF', demo: 'shipper' });
  const priya = user({ companyId: maple.id, role: 'shipper', name: 'Priya Shah', email: 'priya@maplesteel.ca', phone: '905-555-0171', color: '#AF52DE' });
  const alex = user({ companyId: velocity.id, role: 'dispatcher', name: 'Alex Moreau', email: 'alex@velocityfreight.ca', phone: '905-555-0301', color: '#5856D6', demo: 'dispatcher' });
  const drv = (name, email, color, payType, rate, extra = {}) => user({
    companyId: velocity.id, role: 'driver', name, email, color, phone: `647-555-0${Math.floor(rnd(110, 199))}`, status: 'available',
    payType, hourlyRate: payType === 'hourly' ? rate : 32, perKmRate: payType === 'per_km' ? rate : 0.6,
    licenseClass: 'AZ', hireDate: Date.now() - rnd(200, 2000) * D, locationSource: 'sim', ...extra,
  });
  const drivers = [
    drv('Marcus Reid', 'marcus@velocityfreight.ca', '#FF9500', 'hourly', 34, { demo: 'driver' }),
    drv('Sofia Alvarez', 'sofia@velocityfreight.ca', '#34C759', 'per_km', 0.64),
    drv('Jean-Luc Tremblay', 'jeanluc@velocityfreight.ca', '#FF2D55', 'hourly', 36),
    drv('Aisha Khan', 'aisha@velocityfreight.ca', '#00C7BE', 'per_km', 0.66),
    drv('Tom Becker', 'tom@velocityfreight.ca', '#AF52DE', 'hourly', 31),
    drv('Wei Chen', 'wei@velocityfreight.ca', '#FF3B30', 'per_km', 0.6),
  ];
  db.users.push(dana, priya, alex, ...drivers);

  const specs = [
    ['101', 'Freightliner', 'Cascadia 126', 2023, 'dry_van', 412880, 35.2],
    ['102', 'Volvo', 'VNL 860', 2024, 'reefer', 188420, 37.9],
    ['103', 'Kenworth', 'T680', 2022, 'flatbed', 531200, 38.6],
    ['104', 'Peterbilt', '579', 2023, 'dry_van', 297640, 34.8],
    ['105', 'International', 'LT625', 2021, 'step_deck', 644910, 39.4],
    ['106', 'Mack', 'Anthem', 2024, 'reefer', 92350, 36.1],
  ];
  const trucks = specs.map(([unit, make, model, year, equipment, odo, lp], i) => ({
    id: id('trk'), carrierId: velocity.id, unit, make, model, year, equipment, odometerKm: odo, fuelLPer100: lp, tankL: 950,
    plate: `${['BX', 'CK', 'DR', 'AT', 'FM', 'HN'][i]}${Math.floor(rnd(10, 99))} ${Math.floor(rnd(100, 999))}`,
    vin: `1XK${Math.random().toString(36).slice(2, 16).toUpperCase()}`,
    driverId: drivers[i].id, nextServiceKm: odo + Math.floor(rnd(-800, 20000)),
    location: { lat: yard.lat + rnd(-0.004, 0.004), lng: yard.lng + rnd(-0.006, 0.006), heading: rnd(0, 360), speed: 0, updatedAt: Date.now() },
  }));
  drivers.forEach((d, i) => { d.truckId = trucks[i].id; });
  trucks[0].notes = [{ id: id('nte'), text: 'Reefer unit serviced last week. Left mirror bracket is loose, book at next yard stop.', by: alex.name, role: 'dispatcher', t: Date.now() - 2 * D, loadRef: null }];
  trucks[4].notes = [{ id: id('nte'), text: 'Service due soon. Keep on short runs until it is booked.', by: alex.name, role: 'dispatcher', t: Date.now() - 5 * H, loadRef: null }];
  db.trucks.push(...trucks);
  const trailerSpecs = [
    ['T-201', 'dry_van', 'Utility', 2022, 53], ['T-202', 'dry_van', 'Great Dane', 2021, 53], ['T-203', 'reefer', 'Utility 3000R', 2023, 53],
    ['T-204', 'reefer', 'Wabash ArcticLite', 2024, 53], ['T-205', 'flatbed', 'Fontaine', 2020, 48], ['T-206', 'step_deck', 'Manac', 2022, 53],
    ['T-207', 'dry_van', 'Stoughton', 2019, 53], ['T-208', 'flatbed', 'Doepker', 2023, 48],
  ];
  const trailers = trailerSpecs.map(([unit, equipment, make, year, lengthFt], i) => ({
    id: id('trl'), carrierId: velocity.id, unit, equipment, make, year, lengthFt, plate: `T${Math.floor(rnd(10000, 99999))}`,
    vin: `2T${Math.random().toString(36).slice(2, 15).toUpperCase()}`, status: i === 6 ? 'shop' : 'available',
    nextInspection: Date.now() + rnd(-5, 120) * D, notes: i === 6 ? 'Door seal replacement' : '',
  }));
  db.trailers.push(...trailers);
  drivers.forEach((d, i) => {
    const base = [['06:00', '16:00'], ['07:00', '18:00'], ['05:00', '17:00']][i % 3];
    const workDays = i % 3 === 2 ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    d.schedule = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((dow) => [dow, workDays.includes(dow) ? { start: base[0], end: dow === 5 && i % 2 === 0 ? '14:00' : base[1] } : null]));
    d.licenseNumber = `${d.name.split(' ').pop()[0]}${Math.floor(rnd(1000, 9999))}-${Math.floor(rnd(10000, 99999))}-${Math.floor(rnd(10000, 99999))}`;
    d.timeOff = i === 4 ? [{ id: id('off'), from: Date.now() + 4 * D, to: Date.now() + 6 * D, reason: 'Vacation' }] : [];
    d.documents = [];
    d.licenseExpiry = i === 5 ? Date.now() + 18 * D : i === 3 ? Date.now() + 40 * D : Date.now() + rnd(120, 900) * D;
  });

  const mkLoad = (shipper, by, from, to, cargo, options, created, legToDrop) => {
    const q = quote({ distanceKm: legToDrop.distanceKm, cargo, options }, s);
    const load = {
      id: id('lod'), ref: `RG-${++s.nextRef}`, status: 'requested', createdAt: created, updatedAt: created,
      shipperId: shipper.id, createdBy: by.id, carrierId: null, driverId: null, truckId: null,
      pickup: { ...from }, dropoff: { ...to },
      pickupWindow: { from: created + 2 * H, to: created + 5 * H }, deliveryWindow: null,
      cargo: { description: 'General freight', weightKg: 0, pallets: 0, hazmat: false, tempC: null, valueCad: 0, ...cargo },
      options: { liftgate: false, expedite: false, ...options }, notes: '', poNumber: `PO-${Math.floor(rnd(40000, 99999))}`,
      quote: q, ...newLoadShell(),
    };
    load.legs.toDropoff = legToDrop;
    load.timeline.push({ status: 'requested', t: created, by: by.name, note: 'Pickup requested' });
    return load;
  };

  /* ---------------- history: delivered loads over the last 30 days ---------------- */
  const lanes = [
    [northwind, dana, 'mississauga', 'ottawa', { equipment: 'reefer', description: 'Chilled dairy', weightKg: 16800, pallets: 22, tempC: 3 }],
    [northwind, dana, 'toronto', 'montreal', { equipment: 'dry_van', description: 'Packaged bread & baked goods', weightKg: 9200, pallets: 26 }],
    [maple, priya, 'hamilton', 'detroit', { equipment: 'flatbed', description: 'Hot-rolled steel coils', weightKg: 20400 }],
    [northwind, dana, 'mississauga', 'london', { equipment: 'reefer', description: 'Frozen vegetables', weightKg: 18100, pallets: 24, tempC: -18 }],
    [maple, priya, 'hamilton', 'sudbury', { equipment: 'step_deck', description: 'Structural beams', weightKg: 17600 }],
    [northwind, dana, 'toronto', 'kingston', { equipment: 'dry_van', description: 'Snack foods', weightKg: 7400, pallets: 20 }],
    [northwind, dana, 'mississauga', 'barrie', { equipment: 'dry_van', description: 'Canned goods', weightKg: 15800, pallets: 18 }],
    [maple, priya, 'hamilton', 'buffalo', { equipment: 'flatbed', description: 'Rebar bundles', weightKg: 21000 }],
    [northwind, dana, 'toronto', 'kitchener', { equipment: 'dry_van', description: 'Flour sacks', weightKg: 19400, pallets: 22 }],
    [northwind, dana, 'mississauga', 'quebec', { equipment: 'reefer', description: 'Fresh produce', weightKg: 14300, pallets: 24, tempC: 4 }],
    [maple, priya, 'hamilton', 'montreal', { equipment: 'flatbed', description: 'Steel plate', weightKg: 22100 }],
    [northwind, dana, 'mississauga', 'windsor', { equipment: 'reefer', description: 'Ice cream', weightKg: 12900, pallets: 20, tempC: -22 }],
    [northwind, dana, 'toronto', 'ottawa', { equipment: 'dry_van', description: 'Beverages', weightKg: 20800, pallets: 22 }],
    [maple, priya, 'hamilton', 'london', { equipment: 'step_deck', description: 'Machinery parts', weightKg: 11200 }],
    [northwind, dana, 'mississauga', 'kingston', { equipment: 'dry_van', description: 'Paper goods', weightKg: 6400, pallets: 26 }],
    [northwind, dana, 'toronto', 'buffalo', { equipment: 'reefer', description: 'Cheese', weightKg: 13800, pallets: 18, tempC: 2 }],
  ];
  lanes.forEach(([shipper, by, a, b, cargo], i) => {
    const created = Date.now() - (29 - i * 1.8) * D - rnd(2, 8) * H;
    const leg = syntheticLeg(P[a], P[b]);
    const load = mkLoad(shipper, by, P[a], P[b], cargo, { expedite: i % 7 === 3 }, created, leg);
    const di = i % drivers.length;
    const driver = drivers[di];
    const truck = trucks[di];
    load.carrierId = velocity.id; load.driverId = driver.id; load.truckId = truck.id;
    const deadhead = rnd(8, 55);
    const loaded = leg.distanceKm * rnd(0.99, 1.04);
    const dwellP = rnd(0.4, i % 5 === 1 ? 3.4 : 1.6);
    const dwellD = rnd(0.4, i % 6 === 2 ? 2.9 : 1.4);
    load.metrics = { deadheadKm: +deadhead.toFixed(1), loadedKm: +loaded.toFixed(1), driveHours: (deadhead + loaded) / rnd(74, 86), dwellHours: { pickup: dwellP, delivery: dwellD } };
    const t0 = created + rnd(0.2, 0.6) * H;
    load.acceptedAt = t0;
    load.startedAt = t0 + 0.3 * H;
    load.arrivedPickupAt = load.startedAt + (deadhead / 80) * H;
    load.departedPickupAt = load.arrivedPickupAt + dwellP * H;
    load.arrivedDeliveryAt = load.departedPickupAt + (loaded / 80) * H;
    load.deliveredAt = load.arrivedDeliveryAt + dwellD * H;
    load.status = 'delivered';
    load.timeline.push(
      { status: 'accepted', t: t0, by: alex.name, note: `Velocity Freight Lines accepted · ${driver.name}, unit ${truck.unit}` },
      { status: 'en_route_pickup', t: load.startedAt, by: driver.name },
      { status: 'at_pickup', t: load.arrivedPickupAt, by: driver.name, note: 'Detected automatically by GPS geofence' },
      { status: 'in_transit', t: load.departedPickupAt, by: driver.name },
      { status: 'at_delivery', t: load.arrivedDeliveryAt, by: driver.name, note: 'Detected automatically by GPS geofence' },
      { status: 'delivered', t: load.deliveredAt, by: driver.name },
    );
    load.photos.pickup = photoSet('pickup', load.arrivedPickupAt + 0.2 * H, P[a], driver.name);
    load.photos.delivery = photoSet('delivery', load.arrivedDeliveryAt + 0.2 * H, P[b], driver.name);
    const damaged = i === 4 || i === 11;
    load.damage = { hasDamage: damaged, notes: damaged ? (i === 4 ? 'Strap abrasion on two beams, photographed at delivery.' : 'One pallet crushed at the rear corner — receiver noted on BOL.') : '', t: load.arrivedDeliveryAt + 0.3 * H, by: driver.name };
    if (damaged) load.photos.delivery.push({ id: id('pho'), slot: 'damage', url: placeholderPhoto('Damage — close up', 'delivery', 10), t: load.arrivedDeliveryAt + 0.4 * H, lat: P[b].lat, lng: P[b].lng, by: driver.name, note: load.damage.notes });
    load.signature = { name: P[b].contact, url: null, t: load.deliveredAt - 60000 };
    load.track = leg.points.map((p, k) => ({ ...p, t: load.departedPickupAt + (k / leg.points.length) * (load.arrivedDeliveryAt - load.departedPickupAt), phase: 'loaded', speed: Math.round(rnd(70, 100)) }));
    load.odometer = { start: Math.round(truck.odometerKm - 30000 + i * 1500), end: Math.round(truck.odometerKm - 30000 + i * 1500 + loaded) };
    load.invoice = invoice(load, s);
    load.invoice.issuedAt = load.deliveredAt;
    load.invoice.paid = i < 11;
    if (i % 3 !== 2) load.rating = { stars: damaged ? 4 : 5, comment: damaged ? 'Handled the damage report well.' : 'On time, great communication.', t: load.deliveredAt + H };
    load.updatedAt = load.deliveredAt;

    // Fuel stop on the way, linked to the job.
    const litres = ((deadhead + loaded) * truck.fuelLPer100) / 100 * rnd(0.9, 1.1);
    const price = rnd(1.54, 1.72);
    const mid = leg.points[Math.floor(leg.points.length / 2)];
    db.fuelLogs.push({
      id: id('ful'), carrierId: velocity.id, truckId: truck.id, driverId: driver.id, loadId: load.id,
      t: load.departedPickupAt + (load.arrivedDeliveryAt - load.departedPickupAt) / 2, litres: +litres.toFixed(1), pricePerL: +price.toFixed(3),
      total: +(litres * price).toFixed(2), odometerKm: load.odometer.start + Math.round(loaded / 2),
      station: ['Petro-Canada', 'Esso', 'Pilot Flying J', 'Husky', 'Shell', 'Ultramar'][i % 6], fuelType: 'diesel', def: i % 4 === 0 ? 20 : 0,
      receiptUrl: sampleReceipt(['Petro-Canada', 'Esso', 'Pilot Flying J', 'Husky', 'Shell', 'Ultramar'][i % 6], litres, price), location: mid, by: driver.name,
    });
    load.economics = economics(load, driver, truck, db.fuelLogs, s);
    db.loads.push(load);

    // Shift for that day.
    db.shifts.push({ id: id('shf'), driverId: driver.id, carrierId: velocity.id, start: load.startedAt - 0.5 * H, end: load.deliveredAt + 0.4 * H, loadId: load.id, auto: true });
  });

  /* ---------------- live loads ---------------- */
  const now = Date.now();
  const live = [
    { sh: northwind, by: dana, a: 'mississauga', b: 'ottawa', cargo: { equipment: 'dry_van', description: 'Packaged snacks', weightKg: 14200, pallets: 24 }, d: 0, status: 'in_transit', progress: 0.38 },
    { sh: maple, by: priya, a: 'hamilton', b: 'montreal', cargo: { equipment: 'reefer', description: 'Industrial adhesives (temp controlled)', weightKg: 11800, pallets: 18, tempC: 8 }, d: 1, status: 'en_route_pickup', progress: 0.25 },
    { sh: northwind, by: dana, a: 'toronto', b: 'kingston', cargo: { equipment: 'flatbed', description: 'Bakery ovens (crated)', weightKg: 6900 }, d: 2, status: 'accepted' },
    { sh: northwind, by: dana, a: 'mississauga', b: 'windsor', cargo: { equipment: 'reefer', description: 'Frozen pastry', weightKg: 15400, pallets: 22, tempC: -18 } },
    { sh: maple, by: priya, a: 'hamilton', b: 'detroit', cargo: { equipment: 'flatbed', description: 'Cold-rolled steel coils', weightKg: 21800 } },
    { sh: northwind, by: dana, a: 'toronto', b: 'quebec', cargo: { equipment: 'dry_van', description: 'Holiday gift boxes', weightKg: 8600, pallets: 26 }, options: { expedite: true } },
    { sh: maple, by: priya, a: 'hamilton', b: 'sudbury', cargo: { equipment: 'step_deck', description: 'Conveyor sections', weightKg: 14100, hazmat: false } },
  ];
  const routes = await Promise.all(live.map((l) => route(P[l.a], P[l.b])));
  for (let i = 0; i < live.length; i++) {
    const L = live[i];
    const created = now - (i < 3 ? rnd(2, 4) : rnd(0.2, 1.5)) * H;
    const load = mkLoad(L.sh, L.by, P[L.a], P[L.b], L.cargo, L.options || {}, created, routes[i]);
    if (L.status) {
      const driver = drivers[L.d];
      const truck = trucks[L.d];
      Object.assign(load, { carrierId: velocity.id, driverId: driver.id, truckId: truck.id, acceptedAt: created + 0.3 * H, status: L.status });
      driver.status = 'on_job';
      load.timeline.push({ status: 'accepted', t: load.acceptedAt, by: alex.name, note: `Velocity Freight Lines accepted · ${driver.name}, unit ${truck.unit}` });
      load.legs.toPickup = await route(truck.location, load.pickup);
      if (L.status === 'en_route_pickup' || L.status === 'in_transit') {
        load.startedAt = load.acceptedAt + 0.2 * H;
        load.timeline.push({ status: 'en_route_pickup', t: load.startedAt, by: driver.name });
        db.shifts.push({ id: id('shf'), driverId: driver.id, carrierId: velocity.id, start: load.startedAt - 0.3 * H, end: null, loadId: load.id, auto: true });
      }
      if (L.status === 'en_route_pickup') {
        placeAlong(load, truck, 'toPickup', L.progress, 'empty');
        load.metrics.deadheadKm = +(load.legs.toPickup.distanceKm * L.progress).toFixed(1);
      }
      if (L.status === 'in_transit') {
        const dh = load.legs.toPickup.distanceKm;
        load.arrivedPickupAt = load.startedAt + 0.4 * H;
        load.departedPickupAt = load.arrivedPickupAt + 0.9 * H;
        load.metrics.deadheadKm = +dh.toFixed(1);
        load.metrics.dwellHours.pickup = 0.9;
        load.odometer.start = Math.round(truck.odometerKm);
        load.timeline.push(
          { status: 'at_pickup', t: load.arrivedPickupAt, by: driver.name, note: 'Detected automatically by GPS geofence' },
          { status: 'in_transit', t: load.departedPickupAt, by: driver.name },
        );
        load.photos.pickup = photoSet('pickup', load.arrivedPickupAt + 0.2 * H, P[L.a], driver.name);
        placeAlong(load, truck, 'toDropoff', L.progress, 'loaded');
        load.metrics.loadedKm = +(load.legs.toDropoff.distanceKm * L.progress).toFixed(1);
        load.messages.push(
          { id: id('msg'), userId: dana.id, name: dana.name, role: 'shipper', text: 'Hi Marcus — receiving in Ottawa closes at 6pm today.', t: load.departedPickupAt + 0.3 * H },
          { id: id('msg'), userId: driver.id, name: driver.name, role: 'driver', text: 'Got it, I’m well ahead of that. Will message if anything changes.', t: load.departedPickupAt + 0.35 * H },
        );
      }
      load.metrics.driveHours = (load.metrics.deadheadKm + load.metrics.loadedKm) / 80;
      updateEtaSafe(load, truck);
    }
    db.loads.push(load);
  }
  // Attach trailers: one per active load, and history so each trailer has a last job.
  for (const l of db.loads) {
    if (!l.carrierId) continue;
    const active = ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status);
    const t = trailers.find((x) => x.equipment === l.cargo.equipment && x.status !== 'shop' && (!active || !db.loads.some((o) => o !== l && o.trailerId === x.id && ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(o.status))));
    if (t) l.trailerId = t.id;
  }
  save();
}

function placeAlong(load, truck, legKey, progress, phase) {
  const leg = load.legs[legKey];
  const len = pathLength(leg.points);
  const cursor = len * progress;
  const pos = pointAlong(leg.points, cursor);
  truck.location = { lat: pos.lat, lng: pos.lng, heading: pos.heading, speed: 88, updatedAt: Date.now() };
  load.sim = { leg: legKey, cursorKm: cursor, creditedKm: leg.distanceKm * progress, source: 'sim' };
  const pts = [];
  for (let k = 0; k <= 20; k++) pts.push(pointAlong(leg.points, (cursor * k) / 20));
  load.track = pts.map((p, k) => ({ lat: p.lat, lng: p.lng, t: Date.now() - (20 - k) * 120000, phase, speed: 85 }));
}

function updateEtaSafe(load) {
  try { updateEta(load); } catch { /* trucks not yet indexed */ }
}

// Sample receipt image (SVG data URL) for seeded fill-ups.
function sampleReceipt(station, litres, price) {
  const row = (y, k, v, bold) => `<text x="20" y="${y}"${bold ? ' font-weight="bold"' : ''}>${k}</text><text x="280" y="${y}" text-anchor="end"${bold ? ' font-weight="bold"' : ''}>${v}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#fff"/><g font-family="monospace" font-size="16" fill="#222">`
    + `<text x="150" y="50" text-anchor="middle" font-size="20" font-weight="bold">${station.toUpperCase()}</text>`
    + row(110, 'DIESEL', '') + row(150, 'LITRES', litres.toFixed(1)) + row(180, '$/L', price.toFixed(3))
    + '<line x1="20" y1="210" x2="280" y2="210" stroke="#222" stroke-dasharray="4"/>'
    + row(245, 'TOTAL', `$${(litres * price).toFixed(2)}`, true)
    + '<text x="150" y="350" text-anchor="middle" font-size="13">THANK YOU</text></g></svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
