// Load lifecycle, live tracking, geofencing, realtime fan-out and the demo simulator.
import { db, save, find, id } from './db.js';
import { haversine, pathLength, pointAlong, route } from './geo.js';
import { invoice, economics, DEFAULT_SETTINGS } from './pricing.js';
import { ACTIVE, MOVING, PHOTO_SLOTS } from './constants.js';

export const settings = () => ({ ...DEFAULT_SETTINGS, ...db.settings, googleMapsKey: globalThis.process?.env?.GOOGLE_MAPS_BROWSER_KEY || globalThis.process?.env?.GOOGLE_MAPS_API_KEY || '' });
const ARRIVAL_RADIUS_KM = 0.3;

/* ----------------------------- visibility ----------------------------- */

export function publicUser(u, viewer) {
  if (!u) return null;
  const sameCompany = viewer && viewer.companyId === u.companyId;
  const base = {
    id: u.id, name: u.name, role: u.role, companyId: u.companyId, phone: u.phone,
    color: u.color, rating: u.rating, truckId: u.truckId, status: u.status, licenseClass: u.licenseClass,
  };
  if (sameCompany) {
    Object.assign(base, {
      email: u.email, payType: u.payType, hourlyRate: u.hourlyRate, perKmRate: u.perKmRate,
      hireDate: u.hireDate, locationSource: u.locationSource, schedule: u.schedule, timeOff: u.timeOff || [], licenseExpiry: u.licenseExpiry, licenseNumber: u.licenseNumber, hos: u.hos || null, hosEvents: u.hosEvents || [],
      // Documents are records for dispatch; a driver sees their own.
      documents: viewer.role === 'dispatcher' || viewer.id === u.id ? (u.documents || []) : undefined,
    });
  }
  return base;
}

export function canSee(viewer, col, item) {
  const c = viewer.companyId;
  switch (col) {
    case 'loads':
      if (viewer.role === 'shipper') return item.shipperId === c;
      if (viewer.role === 'dispatcher') return item.carrierId === c || item.status === 'requested';
      if (viewer.role === 'driver') return item.driverId === viewer.id || (item.teamDriverIds || []).includes(viewer.id);
      return false;
    case 'trucks':
      if (item.carrierId === c) return viewer.role !== 'driver' || item.id === viewer.truckId;
      if (viewer.role === 'shipper') return db.loads.some((l) => l.shipperId === c && l.truckId === item.id && ACTIVE.includes(l.status));
      return false;
    case 'users':
      if (item.companyId === c) return viewer.role !== 'driver' || item.id === viewer.id;
      if (viewer.role === 'shipper') return db.loads.some((l) => l.shipperId === c && (l.driverId === item.id || (l.teamDriverIds || []).includes(item.id)));
      return false;
    case 'companies':
      return true;
    case 'trailers':
      if (item.carrierId === c) return true;
      if (viewer.role === 'shipper') return db.loads.some((l) => l.shipperId === c && l.trailerId === item.id && ACTIVE.includes(l.status));
      return false;
    case 'fuelLogs':
    case 'shifts':
      if (item.carrierId !== c) return false;
      return viewer.role === 'dispatcher' || item.driverId === viewer.id;
    default:
      return false;
  }
}

export function view(viewer, col, item) {
  if (col === 'users') return publicUser(item, viewer);
  if (col === 'loads') {
    const out = { ...item };
    delete out.sim;
    if (viewer.role === 'shipper') delete out.economics;
    if (viewer.role !== 'shipper' && item.status === 'requested' && item.carrierId !== viewer.companyId) {
      // Carriers browsing the board only see the payout, not the shipper's invoice.
      out.quote = { ...item.quote, lines: undefined, tax: undefined, total: undefined, subtotal: undefined };
    }
    return out;
  }
  if (col === 'trucks' && viewer.role === 'shipper') {
    const { id: tid, unit, make, model, year, plate, location, equipment } = item;
    return { id: tid, unit, make, model, year, plate, location, equipment };
  }
  return item;
}

export function snapshot(viewer) {
  const pick = (col) => db[col].filter((x) => canSee(viewer, col, x)).map((x) => view(viewer, col, x));
  return {
    companies: db.companies,
    users: pick('users'),
    trucks: pick('trucks'),
    trailers: pick('trailers'),
    loads: pick('loads'),
    fuelLogs: pick('fuelLogs'),
    shifts: pick('shifts'),
  };
}

/* ------------------------------ realtime ------------------------------ */

const clients = new Set();
export function subscribe(viewer, res) {
  const client = { viewer, res };
  clients.add(client);
  return () => clients.delete(client);
}

export function publish(col, item) {
  for (const { viewer, res } of clients) {
    // Re-read the viewer so truck assignment changes take effect immediately.
    const v = find('users', viewer.id) || viewer;
    if (canSee(v, col, item)) res.write(`data: ${JSON.stringify({ type: 'upsert', col, item: view(v, col, item) })}\n\n`);
  }
}
export function publishRemove(col, itemId) {
  for (const { res } of clients) res.write(`data: ${JSON.stringify({ type: 'remove', col, id: itemId })}\n\n`);
}
export function notify(filter, message) {
  for (const { viewer, res } of clients) {
    if (filter(viewer)) res.write(`data: ${JSON.stringify({ type: 'toast', ...message })}\n\n`);
  }
}
setInterval(() => { for (const { res } of clients) res.write(': ping\n\n'); }, 20000).unref?.();

/* ------------------------------ lifecycle ----------------------------- */

export function nextRef() {
  db.settings.nextRef = (db.settings.nextRef || 10240) + 1;
  return `RG-${db.settings.nextRef}`;
}

export function addTimeline(load, status, by, note) {
  load.timeline.push({ status, t: Date.now(), by: by?.name || 'Rugo', note });
}

function touch(load) {
  load.updatedAt = Date.now();
  save();
  publish('loads', load);
}

const missingSlots = (load, phase) =>
  PHOTO_SLOTS.filter((s) => s.required && !load.photos[phase].some((p) => p.slot === s.key)).map((s) => s.label);

export function updateEta(load) {
  const s = settings();
  const truck = find('trucks', load.truckId);
  if (!truck?.location) return;
  let toPickupKm = 0;
  let loadedKm = 0;
  if (load.status === 'accepted' || load.status === 'en_route_pickup') {
    toPickupKm = legRemaining(load, 'toPickup', truck);
    loadedKm = load.quote.distanceKm;
  } else if (['at_pickup', 'in_transit'].includes(load.status)) {
    loadedKm = load.status === 'at_pickup' ? load.quote.distanceKm : legRemaining(load, 'toDropoff', truck);
  }
  const now = Date.now();
  const h = (km) => (km / s.avgSpeedKmh) * 3600 * 1000;
  load.eta = {
    remainingKm: Math.round((toPickupKm + loadedKm) * 10) / 10,
    toPickupKm: Math.round(toPickupKm * 10) / 10,
    pickupAt: toPickupKm ? now + h(toPickupKm) : null,
    deliveryAt: ['delivered', 'at_delivery'].includes(load.status) ? null : now + h(toPickupKm + loadedKm) + (load.status === 'at_pickup' || toPickupKm ? 45 * 60000 : 0),
    updatedAt: now,
  };
}

function legRemaining(load, leg, truck) {
  const L = load.legs?.[leg];
  if (!L) return 0;
  if (load.sim?.leg === leg && load.sim.source === 'sim') return Math.max(0, L.distanceKm - load.sim.creditedKm);
  const target = leg === 'toPickup' ? load.pickup : load.dropoff;
  return haversine(truck.location, target) * 1.18;
}

/** Trailers in use are derived from active loads; stored status is only 'available' or 'shop'. */
export const trailerInUse = (trailerId, exceptLoadId) => db.loads.some((l) => l.id !== exceptLoadId && l.trailerId === trailerId && ACTIVE.includes(l.status));
export function pickTrailer(carrierId, equipment) {
  return db.trailers.find((t) => t.carrierId === carrierId && t.equipment === equipment && t.status !== 'shop' && !trailerInUse(t.id));
}

export async function accept(load, carrierUser, driver, truck) {
  load.status = 'accepted';
  load.carrierId = carrierUser.companyId;
  load.driverId = driver.id;
  load.truckId = truck.id;
  if (!load.trailerId && load.cargo.equipment !== 'power_only') load.trailerId = pickTrailer(load.carrierId, load.cargo.equipment)?.id || null;
  load.acceptedAt = Date.now();
  driver.status = 'on_job';
  driver.truckId = truck.id;
  truck.driverId = driver.id;
  addTimeline(load, 'accepted', carrierUser, `${find('companies', carrierUser.companyId)?.name} accepted · ${driver.name}, unit ${truck.unit}`);
  const r = await route(truck.location, load.pickup);
  load.legs.toPickup = r;
  updateEta(load);
  touch(load);
  publish('users', driver);
  publish('trucks', truck);
  if (load.shipperId !== load.carrierId) notify((v) => v.companyId === load.shipperId, { title: 'Carrier found', body: `${load.ref} accepted — ${driver.name} is assigned.`, loadId: load.id });
  notify((v) => v.id === driver.id, { title: 'New job assigned', body: `${load.ref}: ${load.pickup.city} → ${load.dropoff.city}`, loadId: load.id });
}

/** Advance a load to the next status, enforcing the inspection rules. Returns an error string or null. */
export async function advance(load, to, actor, extra = {}) {
  const order = ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery', 'delivered'];
  const from = order.indexOf(load.status);
  if (order.indexOf(to) !== from + 1) return `Can't go from “${load.status}” to “${to}”.`;
  const now = Date.now();
  const truck = find('trucks', load.truckId);
  const driver = find('users', load.driverId);

  if (to === 'en_route_pickup') {
    load.startedAt = now;
    load.sim = { leg: 'toPickup', cursorKm: 0, creditedKm: 0, source: 'sim' };
    if (!load.legs.toPickup) load.legs.toPickup = await route(truck.location, load.pickup);
    clockIn(driver, load);
  }
  if (to === 'at_pickup') load.arrivedPickupAt = now;
  if (to === 'in_transit') {
    const missing = missingSlots(load, 'pickup');
    if (missing.length) return `Please take these photos first: ${missing.join(', ')}.`;
    load.departedPickupAt = now;
    load.metrics.dwellHours.pickup = (now - (load.arrivedPickupAt || now)) / 3.6e6;
    if (extra.odometer) load.odometer.start = Number(extra.odometer);
    load.sim = { leg: 'toDropoff', cursorKm: 0, creditedKm: 0, source: 'sim' };
    if (truck) Object.assign(truck.location, { lat: load.pickup.lat, lng: load.pickup.lng });
  }
  if (to === 'at_delivery') load.arrivedDeliveryAt = now;
  if (to === 'delivered') {
    const missing = missingSlots(load, 'delivery');
    if (missing.length) return `Please take these photos first: ${missing.join(', ')}.`;
    if (!load.signature) return 'The receiver needs to sign first.';
    if (extra.odometer) load.odometer.end = Number(extra.odometer);
    load.deliveredAt = now;
    load.metrics.dwellHours.delivery = (now - (load.arrivedDeliveryAt || now)) / 3.6e6;
    load.invoice = invoice(load, settings());
    const team = (load.teamDriverIds || []).map((x) => find('users', x)).filter(Boolean);
    load.economics = economics(load, driver, truck, db.fuelLogs, settings(), team);
    load.eta = null;
    delete load.sim;
    for (const d of [driver, ...team]) if (d) { d.status = 'available'; publish('users', d); }
  }
  load.status = to;
  addTimeline(load, to, actor, extra.note || (extra.auto ? 'Detected automatically by GPS geofence' : undefined));
  updateEta(load);
  touch(load);
  if (truck) publish('trucks', truck);

  const titles = {
    en_route_pickup: ['Driver is on the way', `${driver?.name} is heading to ${load.pickup.name || load.pickup.city}.`],
    at_pickup: ['Driver arrived at pickup', `${load.ref} — loading has started.`],
    in_transit: ['Your load is on the road', `${load.ref} left ${load.pickup.city}. Pickup photos are ready to view.`],
    at_delivery: ['Arrived at destination', `${load.ref} is at ${load.dropoff.name || load.dropoff.city}.`],
    delivered: ['Delivered', `${load.ref} delivered${load.damage?.hasDamage ? ' — damage was reported' : ' with no damage'}. Invoice ${load.invoice?.number} is ready.`],
  };
  if (titles[to]) {
    notify((v) => v.companyId === load.shipperId || (v.role === 'dispatcher' && v.companyId === load.carrierId),
      { title: titles[to][0], body: titles[to][1], loadId: load.id, tone: to === 'delivered' && load.damage?.hasDamage ? 'warn' : 'ok' });
  }
  return null;
}

export function clockIn(driver, load) {
  if (!driver) return;
  const open = db.shifts.find((s) => s.driverId === driver.id && !s.end);
  if (open) return open;
  const shift = { id: id('shf'), driverId: driver.id, carrierId: driver.companyId, start: Date.now(), end: null, loadId: load?.id || null, auto: !!load };
  db.shifts.push(shift);
  save();
  publish('shifts', shift);
  return shift;
}

export function clockOut(driver) {
  const open = db.shifts.find((s) => s.driverId === driver.id && !s.end);
  if (!open) return null;
  open.end = Date.now();
  save();
  publish('shifts', open);
  return open;
}

/* --------------------------- movement & GPS --------------------------- */

function recordMovement(load, truck, pos, kmDelta, hoursDelta, speedKmh) {
  truck.location = { lat: pos.lat, lng: pos.lng, heading: pos.heading ?? truck.location?.heading ?? 0, speed: speedKmh, updatedAt: Date.now() };
  truck.odometerKm = Math.round((truck.odometerKm + kmDelta) * 10) / 10;
  if (load) {
    const key = load.status === 'in_transit' ? 'loadedKm' : 'deadheadKm';
    load.metrics[key] = Math.round((load.metrics[key] + kmDelta) * 100) / 100;
    load.metrics.driveHours += hoursDelta;
    const last = load.track[load.track.length - 1];
    if (!last || haversine(last, pos) > 0.4) {
      load.track.push({ lat: +pos.lat.toFixed(5), lng: +pos.lng.toFixed(5), t: Date.now(), phase: key === 'loadedKm' ? 'loaded' : 'empty', speed: Math.round(speedKmh) });
      if (load.track.length > 3000) load.track.splice(1, 1);
    }
    updateEta(load);
    load.updatedAt = Date.now();
    publish('loads', load);
  }
  publish('trucks', truck);
  save();
}

/** Location pushed from the driver's phone. */
export async function gpsUpdate(driver, { lat, lng, speed, heading }, source = 'gps') {
  const truck = find('trucks', driver.truckId);
  if (!truck) return;
  const prev = truck.location;
  const load = db.loads.find((l) => l.driverId === driver.id && ACTIVE.includes(l.status));
  const now = Date.now();
  const pos = { lat, lng, heading: heading ?? prev?.heading ?? 0 };
  let km = prev ? haversine(prev, pos) : 0;
  if (km > 50) km = 0; // GPS jump — ignore distance
  const hours = prev?.updatedAt ? Math.min((now - prev.updatedAt) / 3.6e6, 0.1) : 0;
  truck.gpsAt = now;
  if (load?.sim) load.sim.source = source;
  const moving = load && MOVING.includes(load.status);
  recordMovement(moving ? load : null, truck, pos, moving ? km : 0, moving ? hours : 0, speed != null ? speed * 3.6 : km / Math.max(hours, 1e-6));
  if (moving) await checkGeofence(load, truck, driver);
}

/** Position reported by the truck's ELD / telematics unit. */
export async function eldPosition(truck, { lat, lng, speedKph, heading }) {
  const driver = db.users.find((u) => u.role === 'driver' && u.truckId === truck.id);
  if (driver) return gpsUpdate(driver, { lat, lng, speed: speedKph != null ? speedKph / 3.6 : null, heading }, 'eld');
  truck.location = { lat, lng, heading: heading ?? truck.location?.heading ?? 0, speed: speedKph ?? 0, updatedAt: Date.now() };
  truck.gpsAt = Date.now();
  publish('trucks', truck);
  save();
}

async function checkGeofence(load, truck, actor) {
  const target = load.status === 'en_route_pickup' ? load.pickup : load.dropoff;
  if (haversine(truck.location, target) <= ARRIVAL_RADIUS_KM) {
    await advance(load, load.status === 'en_route_pickup' ? 'at_pickup' : 'at_delivery', actor, { auto: true });
  }
}

/** Demo simulator: drives trucks along their planned route when no phone GPS is reporting. */
async function tick() {
  if (!settings().simulation) return;
  for (const load of db.loads.filter((l) => MOVING.includes(l.status))) {
    const truck = find('trucks', load.truckId);
    if (!truck || (truck.gpsAt && Date.now() - truck.gpsAt < (truck.eld ? 180000 : 60000))) continue; // real GPS/ELD wins
    const legKey = load.status === 'en_route_pickup' ? 'toPickup' : 'toDropoff';
    const leg = load.legs[legKey];
    if (!leg?.points?.length) continue;
    if (!load.sim || load.sim.leg !== legKey) load.sim = { leg: legKey, cursorKm: 0, creditedKm: 0, source: 'sim' };
    load.sim.source = 'sim';
    const len = leg.pathKm || (leg.pathKm = pathLength(leg.points)) || 0.001;
    const scale = leg.distanceKm / len; // road distance per unit of polyline length
    const step = Math.max(0.5, len / 70) * (0.85 + Math.random() * 0.3); // a leg takes ~2–3 minutes in the demo
    const moved = Math.min(step, Math.max(0, len - load.sim.cursorKm));
    load.sim.cursorKm += moved;
    const credited = moved * scale;
    load.sim.creditedKm += credited;
    const arrived = load.sim.cursorKm >= len - 1e-6;
    const pos = pointAlong(leg.points, arrived ? len : load.sim.cursorKm);
    const speed = arrived ? 0 : 78 + Math.random() * 22;
    recordMovement(load, truck, pos, credited, credited / 85, speed);
    if (arrived) {
      truck.location.speed = 0;
      await advance(load, legKey === 'toPickup' ? 'at_pickup' : 'at_delivery', find('users', load.driverId), { auto: true });
    }
  }
}

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try { await tick(); } catch (e) { console.error('simulator', e); } finally { running = false; }
}, 2000).unref?.();

export function newLoadShell() {
  return {
    photos: { pickup: [], delivery: [] },
    timeline: [], track: [], messages: [], legs: {},
    metrics: { deadheadKm: 0, loadedKm: 0, driveHours: 0, dwellHours: { pickup: 0, delivery: 0 } },
    odometer: { start: null, end: null },
    damage: null, signature: null, rating: null, invoice: null, economics: null, eta: null,
  };
}
