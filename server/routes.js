// All API routes. Shared by the Node server (Express) and the in-browser demo build.
import { db, save, find, id, checkPassword, hashPassword, randomToken, saveUpload } from './db.js';
import { route } from './geo.js';
import { quote, EQUIPMENT } from './pricing.js';
import { STATUSES, PHOTO_SLOTS, DAMAGE_SLOT, ACTIVE } from './constants.js';
import {
  settings, snapshot, subscribe, publish, publishRemove, notify, accept, advance, addTimeline,
  gpsUpdate, clockIn, clockOut, loadEvent, nextRef, newLoadShell, publicUser, updateEta, trailerInUse,
} from './fleet.js';
import { PROVIDERS, providerMeta } from './eld/providers.js';
import { rankDrivers, matchSummary } from './dispatch.js';
import { chatRoutes, driverThread } from './chat.js';
import './weather.js'; // live weather at each truck
import { eldFor, publicIntegration, cleanCreds, testConnection, connect, disconnect, setMaps, syncIntegration, syncSoon, importUnlinked } from './eld/sync.js';

/** Weekly schedule: { 0..6: { start: 'HH:MM', end: 'HH:MM' } | null }. Accepts the older { days, start, end } shape too. */
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function normSchedule(s) {
  if (!s) return null;
  const out = {};
  if (Array.isArray(s.days)) { for (let d = 0; d < 7; d++) out[d] = s.days.map(Number).includes(d) ? { start: s.start || '07:00', end: s.end || '17:00' } : null; return out; }
  for (let d = 0; d < 7; d++) {
    const v = s[d] ?? s[String(d)];
    out[d] = v && HM.test(v.start) && HM.test(v.end) ? { start: v.start, end: v.end } : null;
  }
  return out;
}

const driverBusy = (driverId, exceptLoadId) => db.loads.some((l) => l.id !== exceptLoadId && ACTIVE.includes(l.status) && (l.driverId === driverId || (l.teamDriverIds || []).includes(driverId)));

export function routes(app) {
  /* -------------------------------- auth -------------------------------- */

  function startSession(user) {
    const token = randomToken(24);
    db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
    save();
    return token;
  }

  function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
    const session = db.sessions.find((s) => s.token === token);
    const user = session && find('users', session.userId);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    req.user = user;
    next();
  }
  const role = (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You don’t have access to this.' });

  const me = (u) => ({ ...publicUser(u, u), company: find('companies', u.companyId) });

  app.post('/api/auth/login', (req, res) => {
    const { email = '', password = '' } = req.body || {};
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || !checkPassword(password, user.password)) return res.status(401).json({ error: 'That email and password don’t match.' });
    res.json({ token: startSession(user), user: me(user) });
  });

  app.post('/api/auth/demo', (req, res) => {
    const user = db.users.find((u) => u.demo === req.body?.role);
    if (!user) return res.status(404).json({ error: 'Demo account not found.' });
    res.json({ token: startSession(user), user: me(user) });
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    // Signing out of the driver app ends the shift and GPS tracking.
    if (req.user.role === 'driver') {
      const live = db.loads.find((l) => (l.driverId === req.user.id || (l.teamDriverIds || []).includes(req.user.id)) && ['en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status));
      if (clockOut(req.user)) req.user.status = live ? 'on_job' : 'off_duty';
      gpsState(req.user, 'stopped', live);
      publish('users', req.user);
    }
    db.sessions = db.sessions.filter((s) => s.token !== token);
    save();
    res.json({ ok: true });
  });

  app.get('/api/bootstrap', auth, (req, res) => {
    res.json({
      me: me(req.user),
      settings: settings(),
      meta: { statuses: STATUSES, photoSlots: PHOTO_SLOTS, damageSlot: DAMAGE_SLOT, equipment: EQUIPMENT },
      ...snapshot(req.user),
    });
  });

  app.get('/api/stream', auth, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const off = subscribe(req.user, res);
    req.on('close', off);
  });

  /* -------------------------------- loads ------------------------------- */

  const validPlace = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.address;

  app.post('/api/quote', auth, async (req, res) => {
    const { pickup, dropoff, cargo, options } = req.body || {};
    if (!validPlace(pickup) || !validPlace(dropoff)) return res.status(400).json({ error: 'Choose a pickup and a destination.' });
    const r = await route(pickup, dropoff);
    res.json({ quote: quote({ distanceKm: r.distanceKm, cargo, options }, settings()), route: r });
  });

  app.post('/api/loads', auth, role('shipper', 'dispatcher'), async (req, res) => {
    const { pickup, dropoff, cargo = {}, options = {}, pickupWindow, deliveryWindow, notes, poNumber, driverId, customer, teamDriverId, truckId, rate, instructions } = req.body || {};
    if (!validPlace(pickup) || !validPlace(dropoff)) return res.status(400).json({ error: 'Choose a pickup and a destination.' });
    if (!EQUIPMENT[cargo.equipment]) return res.status(400).json({ error: 'Choose a trailer type.' });
    // Dispatch adding its own route: assign straight to one of its drivers (never posted on the board).
    const own = req.user.role === 'dispatcher';
    const ownDriver = own && find('users', driverId);
    const ownTruck = ownDriver && find('trucks', (truckId && find('trucks', truckId)?.carrierId === req.user.companyId) ? truckId : ownDriver.truckId);
    if (own && (!ownDriver || ownDriver.companyId !== req.user.companyId || ownDriver.role !== 'driver')) return res.status(400).json({ error: 'Choose a driver for this route.' });
    if (own && !ownTruck) return res.status(400).json({ error: `${ownDriver.name} has no truck. Assign one in Drivers & trucks.` });
    if (own && driverBusy(ownDriver.id) && !(pickupWindow?.from > Date.now() + 12 * 3.6e6)) return res.status(409).json({ error: `${ownDriver.name} is on another job right now.` });
    const r = await route(pickup, dropoff);
    const load = {
      id: id('lod'), ref: nextRef(), status: 'requested', createdAt: Date.now(), updatedAt: Date.now(),
      shipperId: req.user.companyId, createdBy: req.user.id, carrierId: null, driverId: null, truckId: null,
      pickup, dropoff, pickupWindow: pickupWindow || { from: Date.now() + 2 * 3600e3, to: Date.now() + 6 * 3600e3 },
      deliveryWindow: deliveryWindow || null,
      cargo: {
        description: cargo.description || 'General freight', equipment: cargo.equipment,
        weightKg: Number(cargo.weightKg) || 0, pallets: Number(cargo.pallets) || 0,
        hazmat: !!cargo.hazmat, tempC: cargo.tempC ?? null, valueCad: Number(cargo.valueCad) || 0,
      },
      options: { liftgate: !!options.liftgate, expedite: !!options.expedite },
      notes: notes || '', poNumber: poNumber || '',
      quote: quote({ distanceKm: r.distanceKm, cargo, options }, settings()),
      ...newLoadShell(),
    };
    load.legs.toDropoff = r;
    if (own) {
      load.customer = customer || '';
      load.instructions = Array.isArray(instructions) ? instructions.map(String).filter((x) => x.trim()).slice(0, 20) : [];
      const tr = req.body.trailerId && find('trailers', req.body.trailerId);
      if (tr && tr.carrierId === req.user.companyId) load.trailerId = tr.id;
      if (Number(rate) > 0) { load.quote.carrierPayout = Math.round(Number(rate) * 100) / 100; load.quote.customRate = true; }
      const team = teamDriverId && teamDriverId !== ownDriver.id && find('users', teamDriverId);
      if (team && team.companyId === req.user.companyId && team.role === 'driver') { load.teamDriverIds = [team.id]; team.status = 'on_job'; publish('users', team); }
      addTimeline(load, 'requested', req.user, `Route added by dispatch${customer ? ` for ${customer}` : ''}`);
      db.loads.push(load);
      await accept(load, req.user, ownDriver, ownTruck);
      return res.json(load);
    }
    addTimeline(load, 'requested', req.user, 'Pickup requested');
    db.loads.push(load);
    save();
    publish('loads', load);
    if (await autoDispatch(load)) return res.json(load);
    notify((v) => v.role === 'dispatcher', { title: 'New load on the board', body: `${load.ref}: ${pickup.city} → ${dropoff.city} · $${load.quote.carrierPayout.toFixed(0)}`, loadId: load.id });
    res.json(load);
  });

  function getLoad(req, res) {
    const load = find('loads', req.params.id);
    if (!load) { res.status(404).json({ error: 'Load not found.' }); return null; }
    const u = req.user;
    const ok = (u.role === 'shipper' && load.shipperId === u.companyId) ||
      (u.role === 'dispatcher' && (load.carrierId === u.companyId || load.status === 'requested')) ||
      (u.role === 'driver' && (load.driverId === u.id || (load.teamDriverIds || []).includes(u.id)));
    if (!ok) { res.status(403).json({ error: 'You don’t have access to this load.' }); return null; }
    return load;
  }

  app.post('/api/loads/:id/accept', auth, role('dispatcher'), async (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    if (load.status !== 'requested') return res.status(409).json({ error: 'Another carrier already accepted this load.' });
    const driver = find('users', req.body.driverId);
    const truck = find('trucks', req.body.truckId);
    if (!driver || driver.companyId !== req.user.companyId || driver.role !== 'driver') return res.status(400).json({ error: 'Choose one of your drivers.' });
    if (!truck || truck.carrierId !== req.user.companyId) return res.status(400).json({ error: 'Choose one of your trucks.' });
    if (driverBusy(driver.id)) return res.status(409).json({ error: `${driver.name} is already on a job.` });
    await accept(load, req.user, driver, truck);
    res.json(load);
  });

  app.post('/api/loads/:id/event', auth, role('driver', 'dispatcher'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    const err = loadEvent(load, req.body?.type, req.user, { fuelLogId: req.body?.fuelLogId });
    if (err) return res.status(400).json({ error: err });
    res.json(load);
  });

  app.post('/api/loads/:id/status', auth, role('driver', 'dispatcher'), async (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    const err = await advance(load, req.body.status, req.user, { odometer: req.body.odometer, note: req.body.note });
    if (err) return res.status(400).json({ error: err });
    res.json(load);
  });

  // Change who drives a load: replace the main driver, add a team driver, or remove one.
  app.post('/api/loads/:id/drivers', auth, role('dispatcher'), async (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    if (load.carrierId !== req.user.companyId || !ACTIVE.includes(load.status)) return res.status(409).json({ error: 'Drivers can only be changed on your loads that are in progress.' });
    const { action, driverId } = req.body || {};
    const d = find('users', driverId);
    if (!d || d.role !== 'driver' || d.companyId !== req.user.companyId) return res.status(400).json({ error: 'Choose one of your drivers.' });
    load.teamDriverIds = load.teamDriverIds || [];
    const onLoad = (id) => load.driverId === id || load.teamDriverIds.includes(id);
    const free = (x) => { if (x && !driverBusy(x.id, load.id)) { x.status = 'available'; publish('users', x); } };
    const loaded = ['at_pickup', 'in_transit', 'at_delivery'].includes(load.status);

    if (action === 'replace' || action === 'add') {
      if (onLoad(d.id) && !(action === 'replace' && load.teamDriverIds.includes(d.id))) return res.status(409).json({ error: `${d.name} is already on this load.` });
      if (driverBusy(d.id, load.id)) return res.status(409).json({ error: `${d.name} is on another job.` });
    }
    if (action === 'replace') {
      const old = find('users', load.driverId);
      load.teamDriverIds = load.teamDriverIds.filter((x) => x !== d.id);
      load.driverId = d.id;
      d.status = 'on_job';
      // Before loading, the new driver brings their own truck; once loaded the truck stays (relay swap).
      if (!loaded && d.truckId && d.truckId !== load.truckId) {
        const t = find('trucks', d.truckId);
        if (t) {
          load.truckId = t.id;
          if (t.location) load.legs.toPickup = await route(t.location, load.pickup);
          if (load.sim?.leg === 'toPickup') load.sim = { leg: 'toPickup', cursorKm: 0, creditedKm: 0, source: 'sim' };
        }
      }
      free(old);
      addTimeline(load, load.status, req.user, `Driver changed: ${old?.name || '—'} → ${d.name}${loaded ? ` (takes over unit ${find('trucks', load.truckId)?.unit})` : ''}`);
      notify((v) => v.id === d.id, { title: 'You have been assigned a load', body: `${load.ref}: ${load.pickup.city} → ${load.dropoff.city}`, loadId: load.id });
      if (old) notify((v) => v.id === old.id, { title: 'Load reassigned', body: `${load.ref} was moved to ${d.name}.`, loadId: load.id });
    } else if (action === 'add') {
      load.teamDriverIds.push(d.id);
      d.status = 'on_job';
      addTimeline(load, load.status, req.user, `${d.name} added as team driver`);
      notify((v) => v.id === d.id, { title: 'Added as team driver', body: `${load.ref}: ${load.pickup.city} → ${load.dropoff.city}`, loadId: load.id });
    } else if (action === 'remove') {
      if (!onLoad(d.id)) return res.status(400).json({ error: `${d.name} isn’t on this load.` });
      if (load.teamDriverIds.includes(d.id)) {
        load.teamDriverIds = load.teamDriverIds.filter((x) => x !== d.id);
        addTimeline(load, load.status, req.user, `${d.name} removed from the team`);
      } else if (load.teamDriverIds.length) {
        load.driverId = load.teamDriverIds.shift();
        addTimeline(load, load.status, req.user, `${d.name} removed · ${find('users', load.driverId)?.name} is now the main driver`);
      } else if (!loaded) {
        Object.assign(load, { status: 'requested', carrierId: null, driverId: null, truckId: null, eta: null });
        delete load.sim;
        addTimeline(load, 'requested', req.user, `${d.name} removed — load is back on the board`);
      } else {
        return res.status(409).json({ error: 'This load is already loaded. Replace the driver instead of removing them.' });
      }
      free(d);
      notify((v) => v.id === d.id, { title: 'Removed from a load', body: `${load.ref}`, loadId: load.id });
    } else {
      return res.status(400).json({ error: 'Unknown action.' });
    }
    updateEta(load);
    load.updatedAt = Date.now();
    save();
    publish('loads', load);
    for (const t of db.trucks.filter((x) => x.id === load.truckId)) publish('trucks', t);
    notify((v) => v.companyId === load.shipperId, { title: 'Driver update', body: `${load.ref} — driver details changed.`, loadId: load.id });
    res.json(load);
  });

  app.post('/api/loads/:id/cancel', auth, role('shipper', 'dispatcher'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    if (!['requested', 'accepted'].includes(load.status)) return res.status(409).json({ error: 'This load is already on its way and can’t be cancelled here. Please call the carrier.' });
    if (req.user.role === 'dispatcher') {
      // Carrier hands the load back to the board.
      const driver = find('users', load.driverId);
      if (driver) { driver.status = 'available'; publish('users', driver); }
      Object.assign(load, { status: 'requested', carrierId: null, driverId: null, truckId: null, eta: null });
      addTimeline(load, 'requested', req.user, 'Carrier released the load — back on the board');
    } else {
      const driver = find('users', load.driverId);
      if (driver) { driver.status = 'available'; publish('users', driver); }
      load.status = 'cancelled';
      addTimeline(load, 'cancelled', req.user, req.body?.reason || 'Cancelled by shipper');
    }
    load.updatedAt = Date.now();
    save();
    publish('loads', load);
    res.json(load);
  });


  app.post('/api/loads/:id/photos', auth, role('driver', 'dispatcher'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    const { phase, slot, dataUrl, lat, lng, note } = req.body || {};
    if (!['pickup', 'delivery'].includes(phase)) return res.status(400).json({ error: 'Unknown photo phase.' });
    const url = saveUpload(dataUrl);
    if (!url) return res.status(400).json({ error: 'That photo could not be read. Please try again.' });
    const photo = { id: id('pho'), slot, url, t: Date.now(), lat: lat ?? null, lng: lng ?? null, by: req.user.name, note: note || '' };
    if (slot !== 'damage') load.photos[phase] = load.photos[phase].filter((p) => p.slot !== slot);
    load.photos[phase].push(photo);
    load.updatedAt = Date.now();
    save();
    publish('loads', load);
    res.json(photo);
  });

  app.delete('/api/loads/:id/photos/:photoId', auth, role('driver', 'dispatcher'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    for (const k of ['pickup', 'delivery']) load.photos[k] = load.photos[k].filter((p) => p.id !== req.params.photoId);
    save();
    publish('loads', load);
    res.json({ ok: true });
  });

  app.post('/api/loads/:id/damage', auth, role('driver', 'dispatcher'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    load.damage = { hasDamage: !!req.body.hasDamage, notes: req.body.notes || '', t: Date.now(), by: req.user.name };
    save();
    publish('loads', load);
    res.json(load);
  });

  app.post('/api/loads/:id/signature', auth, role('driver', 'dispatcher'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    const url = saveUpload(req.body.dataUrl);
    if (!url || !req.body.name) return res.status(400).json({ error: 'Please type the receiver’s name and sign.' });
    load.signature = { name: req.body.name, url, t: Date.now() };
    save();
    publish('loads', load);
    res.json(load);
  });

  // Load notes: shared between the carrier's office and the driver(s) on the load.
  app.post('/api/loads/:id/messages', auth, role('dispatcher', 'driver'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    if (req.user.role === 'dispatcher' && load.carrierId !== req.user.companyId) return res.status(403).json({ error: 'Only the carrier on this load can add notes.' });
    const text = String(req.body.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Write a note first.' });
    const msg = { id: id('msg'), userId: req.user.id, name: req.user.name, role: req.user.role, text, t: Date.now() };
    load.messages.push(msg);
    save();
    publish('loads', load);
    notify((v) => v.id !== req.user.id && ((v.role === 'dispatcher' && v.companyId === load.carrierId) || v.id === load.driverId || (load.teamDriverIds || []).includes(v.id)),
      { title: `Note · ${load.ref}`, body: `${req.user.name}: ${text}`, loadId: load.id });
    res.json(msg);
  });

  app.post('/api/loads/:id/rate', auth, role('shipper'), (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    if (load.status !== 'delivered') return res.status(400).json({ error: 'You can rate after delivery.' });
    const stars = Math.max(1, Math.min(5, Number(req.body.stars) || 5));
    load.rating = { stars, comment: req.body.comment || '', t: Date.now() };
    const driver = find('users', load.driverId);
    if (driver) {
      const rated = db.loads.filter((l) => l.driverId === driver.id && l.rating);
      driver.rating = Math.round((rated.reduce((a, l) => a + l.rating.stars, 0) / rated.length) * 10) / 10;
      publish('users', driver);
    }
    save();
    publish('loads', load);
    res.json(load);
  });

  /* -------------------------------- driver ------------------------------ */

  app.post('/api/driver/location', auth, role('driver'), async (req, res) => {
    const { lat, lng, speed, heading } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Bad location.' });
    await gpsUpdate(req.user, { lat, lng, speed, heading });
    res.json({ ok: true });
  });

  app.post('/api/driver/clock', auth, role('driver'), (req, res) => {
    const shift = req.body.action === 'out' ? clockOut(req.user) : clockIn(req.user);
    req.user.status = req.body.action === 'out' ? 'off_duty' : (db.loads.some((l) => l.driverId === req.user.id && ACTIVE.includes(l.status)) ? 'on_job' : 'available');
    save();
    publish('users', req.user);
    res.json(shift || {});
  });

  /** The driver app reports whether its GPS is running. */
  function gpsState(u, state, live) {
    const prev = u.gps?.state;
    u.gps = { state, at: Date.now() };
    save();
    if (state !== 'on' && state !== 'off' && prev !== state && live) {
      const what = { denied: 'turned location off', unavailable: 'has no GPS signal', stopped: 'signed out of the app' }[state] || 'stopped GPS';
      notify((v) => v.role === 'dispatcher' && v.companyId === u.companyId, { title: 'GPS stopped', body: `${u.name} ${what} during ${live.ref}.`, loadId: live.id, tone: 'warn' });
    }
  }

  app.post('/api/driver/gps', auth, role('driver'), (req, res) => {
    const state = ['on', 'off', 'denied', 'unavailable'].includes(req.body?.state) ? req.body.state : 'off';
    const live = db.loads.find((l) => l.driverId === req.user.id && ['en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status));
    gpsState(req.user, state, live);
    publish('users', req.user);
    res.json({ ok: true });
  });

  app.post('/api/driver/preferences', auth, role('driver'), (req, res) => {
    if (['sim', 'gps'].includes(req.body.locationSource)) req.user.locationSource = req.body.locationSource;
    save();
    publish('users', req.user);
    res.json(me(req.user));
  });

  /* --------------------------------- fuel ------------------------------- */

  app.post('/api/fuel', auth, role('driver', 'dispatcher'), (req, res) => {
    const b = req.body || {};
    const truckId = req.user.role === 'driver' ? req.user.truckId : b.truckId;
    const truck = find('trucks', truckId);
    if (!truck || truck.carrierId !== req.user.companyId) return res.status(400).json({ error: 'Choose a truck.' });
    const litres = Number(b.litres);
    const pricePerL = Number(b.pricePerL);
    // Every driver fill-up needs a photo of the receipt.
    const receiptUrl = b.receipt ? saveUpload(b.receipt) : null;
    if (req.user.role === 'driver' && !receiptUrl) return res.status(400).json({ error: 'Take a photo of the fuel receipt to log this fill-up.' });
    if (!(litres > 0) || !(pricePerL > 0)) return res.status(400).json({ error: 'Enter litres and price per litre.' });
    const active = db.loads.find((l) => l.truckId === truck.id && ACTIVE.includes(l.status));
    const odo = Number(b.odometerKm) || truck.odometerKm;
    const log = {
      id: id('ful'), carrierId: req.user.companyId, truckId: truck.id,
      driverId: req.user.role === 'driver' ? req.user.id : (b.driverId || truck.driverId || null),
      loadId: b.loadId === undefined ? active?.id || null : b.loadId || null,
      t: b.t ? Number(b.t) : Date.now(), litres, pricePerL, total: Math.round(litres * pricePerL * 100) / 100,
      odometerKm: odo, station: b.station || '', fuelType: b.fuelType || 'diesel', def: Number(b.defLitres) || 0,
      receiptUrl, location: truck.location ? { lat: truck.location.lat, lng: truck.location.lng } : null,
      by: req.user.name,
    };
    if (odo > truck.odometerKm) truck.odometerKm = odo;
    db.fuelLogs.push(log);
    save();
    publish('fuelLogs', log);
    publish('trucks', truck);
    res.json(log);
  });

  app.delete('/api/fuel/:id', auth, role('dispatcher'), (req, res) => {
    const log = find('fuelLogs', req.params.id);
    if (!log || log.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Not found.' });
    db.fuelLogs = db.fuelLogs.filter((f) => f.id !== log.id);
    save();
    publishRemove('fuelLogs', log.id);
    res.json({ ok: true });
  });

  /* -------------------------------- fleet ------------------------------- */

  const COLORS = ['#FF9500', '#34C759', '#5856D6', '#FF2D55', '#00C7BE', '#AF52DE', '#FF3B30', '#007AFF'];

  function makeDriver(b, companyId) {
    const u = {
      id: id('usr'), companyId, role: 'driver', name: b.name, email: b.email, phone: b.phone || '',
      password: hashPassword(b.password || 'demo'), color: COLORS[db.users.length % COLORS.length], status: 'available',
      payType: b.payType === 'per_km' ? 'per_km' : 'hourly', hourlyRate: Number(b.hourlyRate) || 32, perKmRate: Number(b.perKmRate) || 0.62,
      truckId: b.truckId || null, licenseClass: b.licenseClass || 'AZ', hireDate: Date.now(), rating: null, locationSource: 'sim',
      schedule: normSchedule(b.schedule || { days: [1, 2, 3, 4, 5], start: '07:00', end: '17:00' }), timeOff: [], documents: [], licenseNumber: b.licenseNumber || '',
      licenseExpiry: b.licenseExpiry ? Number(b.licenseExpiry) : null,
    };
    db.users.push(u);
    const tk = u.truckId && find('trucks', u.truckId);
    if (tk && tk.carrierId === u.companyId) { tk.driverId = u.id; publish('trucks', tk); } else u.truckId = null;
    save();
    publish('users', u);
    driverThread(u);
    return u;
  }

  app.post('/api/drivers', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.email) return res.status(400).json({ error: 'Name and email are required.' });
    if (db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) return res.status(409).json({ error: 'That email is already used.' });
    res.json(publicUser(makeDriver(b, req.user.companyId), req.user));
  });

  app.patch('/api/drivers/:id', auth, role('dispatcher'), (req, res) => {
    const u = find('users', req.params.id);
    if (!u || u.companyId !== req.user.companyId || u.role !== 'driver') return res.status(404).json({ error: 'Driver not found.' });
    const b = req.body || {};
    for (const k of ['name', 'phone', 'licenseClass']) if (b[k] !== undefined) u[k] = String(b[k]);
    if (b.email && !db.users.some((x) => x.id !== u.id && x.email.toLowerCase() === String(b.email).toLowerCase())) u.email = String(b.email);
    if (b.licenseExpiry !== undefined) u.licenseExpiry = b.licenseExpiry ? Number(b.licenseExpiry) : null;
    if (b.schedule) u.schedule = normSchedule(b.schedule);
    if (b.licenseNumber !== undefined) u.licenseNumber = String(b.licenseNumber).slice(0, 40);
    if (Array.isArray(b.timeOff)) u.timeOff = b.timeOff.filter((x) => x.from && x.to).map((x) => ({ id: x.id || id('off'), from: Number(x.from), to: Number(x.to), reason: String(x.reason || '') }));
    if (b.payType) u.payType = b.payType === 'per_km' ? 'per_km' : 'hourly';
    if (b.hourlyRate !== undefined) u.hourlyRate = Number(b.hourlyRate);
    if (b.perKmRate !== undefined) u.perKmRate = Number(b.perKmRate);
    if (b.truckId !== undefined) {
      for (const t of db.trucks.filter((t) => t.driverId === u.id)) { t.driverId = null; publish('trucks', t); }
      u.truckId = b.truckId || null;
      const t = find('trucks', u.truckId);
      if (t) { t.driverId = u.id; publish('trucks', t); }
    }
    save();
    publish('users', u);
    res.json(publicUser(u, req.user));
  });

  function makeTruck(b, companyId) {
    const home = db.companies.find((c) => c.id === companyId)?.yard;
    const t = {
      id: id('trk'), carrierId: companyId, unit: String(b.unit), make: b.make || '', model: b.model || '', year: Number(b.year) || 2024,
      plate: b.plate || '', vin: b.vin || '', equipment: EQUIPMENT[b.equipment] ? b.equipment : 'dry_van',
      odometerKm: Number(b.odometerKm) || 0, fuelLPer100: Number(b.fuelLPer100) || 36, tankL: Number(b.tankL) || 900,
      driverId: null, location: home ? { ...home, heading: 0, speed: 0, updatedAt: Date.now() } : null,
      nextServiceKm: (Number(b.odometerKm) || 0) + 25000,
    };
    db.trucks.push(t);
    save();
    publish('trucks', t);
    return t;
  }

  app.post('/api/trucks', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (!b.unit) return res.status(400).json({ error: 'Unit number is required.' });
    res.json(makeTruck(b, req.user.companyId));
  });

  app.patch('/api/trucks/:id', auth, role('dispatcher'), (req, res) => {
    const t = find('trucks', req.params.id);
    if (!t || t.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Truck not found.' });
    const b = req.body || {};
    for (const k of ['unit', 'make', 'model', 'plate', 'vin']) if (b[k] !== undefined) t[k] = String(b[k]);
    for (const k of ['year', 'odometerKm', 'fuelLPer100', 'tankL', 'nextServiceKm']) if (b[k] !== undefined) t[k] = Number(b[k]);
    if (EQUIPMENT[b.equipment]) t.equipment = b.equipment;
    save();
    publish('trucks', t);
    res.json(t);
  });

  // Fleet notes on a truck (dispatch, or the truck's own driver).
  app.post('/api/trucks/:id/notes', auth, role('dispatcher', 'driver'), (req, res) => {
    const t = find('trucks', req.params.id);
    if (!t || t.carrierId !== req.user.companyId || (req.user.role === 'driver' && req.user.truckId !== t.id)) return res.status(404).json({ error: 'Truck not found.' });
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Write a note first.' });
    const active = db.loads.find((l) => l.truckId === t.id && ACTIVE.includes(l.status));
    t.notes = [...(t.notes || []), { id: id('nte'), text, by: req.user.name, role: req.user.role, t: Date.now(), loadRef: active?.ref || null }];
    save();
    publish('trucks', t);
    res.json(t);
  });

  app.delete('/api/trucks/:id/notes/:noteId', auth, role('dispatcher'), (req, res) => {
    const t = find('trucks', req.params.id);
    if (!t || t.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Truck not found.' });
    t.notes = (t.notes || []).filter((n) => n.id !== req.params.noteId);
    save();
    publish('trucks', t);
    res.json(t);
  });

  const ownDriver = (req, res) => {
    const u = find('users', req.params.id);
    if (!u || u.companyId !== req.user.companyId || u.role !== 'driver') { res.status(404).json({ error: 'Driver not found.' }); return null; }
    return u;
  };

  app.delete('/api/drivers/:id', auth, role('dispatcher'), (req, res) => {
    const u = ownDriver(req, res); if (!u) return;
    if (driverBusy(u.id)) return res.status(409).json({ error: `${u.name} is on a job. Replace them on that load first.` });
    for (const t of db.trucks.filter((t) => t.driverId === u.id)) { t.driverId = null; publish('trucks', t); }
    db.sessions = db.sessions.filter((x) => x.userId !== u.id);
    db.users = db.users.filter((x) => x.id !== u.id);
    save();
    publishRemove('users', u.id);
    res.json({ ok: true });
  });

  // Driver records: licence, abstract and other documents (image or PDF).
  app.post('/api/drivers/:id/documents', auth, role('dispatcher'), (req, res) => {
    const u = ownDriver(req, res); if (!u) return;
    const { kind = 'other', name = '', dataUrl, expires } = req.body || {};
    const url = saveUpload(dataUrl);
    if (!url) return res.status(400).json({ error: 'Upload a photo (JPG, PNG) or a PDF under 12 MB.' });
    const label = { licence: 'Driver’s licence', abstract: 'Driver abstract', medical: 'Medical certificate', other: 'Document' }[kind] || 'Document';
    u.documents = [...(u.documents || []), { id: id('doc'), kind, label, name: String(name).slice(0, 120), url, t: Date.now(), expires: expires ? Number(expires) : null, by: req.user.name }];
    save();
    publish('users', u);
    res.json(publicUser(u, req.user));
  });
  app.delete('/api/drivers/:id/documents/:docId', auth, role('dispatcher'), (req, res) => {
    const u = ownDriver(req, res); if (!u) return;
    u.documents = (u.documents || []).filter((d) => d.id !== req.params.docId);
    save();
    publish('users', u);
    res.json(publicUser(u, req.user));
  });

  app.delete('/api/trucks/:id', auth, role('dispatcher'), (req, res) => {
    const t = find('trucks', req.params.id);
    if (!t || t.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Truck not found.' });
    if (db.loads.some((l) => l.truckId === t.id && ACTIVE.includes(l.status))) return res.status(409).json({ error: `Unit ${t.unit} is on a job.` });
    for (const u of db.users.filter((u) => u.truckId === t.id)) { u.truckId = null; publish('users', u); }
    db.trucks = db.trucks.filter((x) => x.id !== t.id);
    save();
    publishRemove('trucks', t.id);
    res.json({ ok: true });
  });

  // Trailers
  const trailerBody = (t, b) => {
    for (const k of ['unit', 'make', 'plate', 'vin', 'notes']) if (b[k] !== undefined) t[k] = String(b[k]);
    for (const k of ['year', 'lengthFt']) if (b[k] !== undefined) t[k] = Number(b[k]);
    if (b.nextInspection !== undefined) t.nextInspection = b.nextInspection ? Number(b.nextInspection) : null;
    if (EQUIPMENT[b.equipment]) t.equipment = b.equipment;
    if (['available', 'shop'].includes(b.status)) t.status = b.status;
  };
  app.post('/api/trailers', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (!b.unit) return res.status(400).json({ error: 'Trailer number is required.' });
    const t = { id: id('trl'), carrierId: req.user.companyId, unit: '', equipment: 'dry_van', make: '', year: 2024, lengthFt: 53, plate: '', vin: '', status: 'available', nextInspection: null, notes: '' };
    trailerBody(t, b);
    db.trailers.push(t);
    save();
    publish('trailers', t);
    res.json(t);
  });
  app.patch('/api/trailers/:id', auth, role('dispatcher'), (req, res) => {
    const t = find('trailers', req.params.id);
    if (!t || t.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Trailer not found.' });
    trailerBody(t, req.body || {});
    save();
    publish('trailers', t);
    res.json(t);
  });
  app.delete('/api/trailers/:id', auth, role('dispatcher'), (req, res) => {
    const t = find('trailers', req.params.id);
    if (!t || t.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Trailer not found.' });
    if (trailerInUse(t.id)) return res.status(409).json({ error: `${t.unit} is attached to a load in progress.` });
    db.trailers = db.trailers.filter((x) => x.id !== t.id);
    save();
    publishRemove('trailers', t.id);
    res.json({ ok: true });
  });

  // Attach or change the trailer (and optionally the truck) on a load.
  app.post('/api/loads/:id/equipment', auth, role('dispatcher'), async (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    if (load.carrierId !== req.user.companyId || !ACTIVE.includes(load.status)) return res.status(409).json({ error: 'Only loads in progress can be changed.' });
    const { trailerId, truckId } = req.body || {};
    if (trailerId !== undefined) {
      if (trailerId) {
        const t = find('trailers', trailerId);
        if (!t || t.carrierId !== req.user.companyId) return res.status(400).json({ error: 'Choose one of your trailers.' });
        // Moving a trailer detaches it from the route it was on.
        for (const other of db.loads.filter((l) => l.id !== load.id && l.trailerId === t.id && ACTIVE.includes(l.status))) {
          other.trailerId = null;
          addTimeline(other, other.status, req.user, `Trailer ${t.unit} moved to ${load.ref}`);
          other.updatedAt = Date.now();
          publish('loads', other);
        }
        if (t.status === 'shop') return res.status(409).json({ error: `${t.unit} is in the shop.` });
        load.trailerId = t.id;
        addTimeline(load, load.status, req.user, `Trailer ${t.unit} attached`);
      } else {
        load.trailerId = null;
        addTimeline(load, load.status, req.user, 'Trailer detached');
      }
    }
    if (truckId) {
      const t = find('trucks', truckId);
      if (!t || t.carrierId !== req.user.companyId) return res.status(400).json({ error: 'Choose one of your trucks.' });
      const other = db.loads.find((l) => l.id !== load.id && l.truckId === t.id && ACTIVE.includes(l.status));
      if (other && ['at_pickup', 'in_transit', 'at_delivery'].includes(other.status)) return res.status(409).json({ error: `Unit ${t.unit} is loaded on ${other.ref}. Finish or reassign that route first.` });
      if (other) {
        const prevTruck = find('trucks', load.truckId);
        other.truckId = prevTruck && prevTruck.id !== t.id ? prevTruck.id : null; // swap trucks between the two routes
        addTimeline(other, other.status, req.user, `Truck swapped: unit ${t.unit} moved to ${load.ref}${other.truckId ? `, now unit ${prevTruck.unit}` : ''}`);
        publish('loads', other);
      }
      load.truckId = t.id;
      if (['accepted', 'en_route_pickup'].includes(load.status) && t.location) load.legs.toPickup = await route(t.location, load.pickup);
      addTimeline(load, load.status, req.user, `Truck changed to unit ${t.unit}`);
    }
    updateEta(load);
    load.updatedAt = Date.now();
    save();
    publish('loads', load);
    res.json(load);
  });

  chatRoutes(app, auth, role);

  /* ------------------------- ELD / hours of service ------------------------ */

  const eldErr = (res, e) => res.status(e.code === 'config' ? 400 : 502).json({ error: e.message || 'The ELD provider couldn’t be reached.' });

  app.get('/api/integrations', auth, role('dispatcher'), (req, res) => {
    res.json({ providers: PROVIDERS, eld: publicIntegration(eldFor(req.user.companyId)) });
  });

  app.post('/api/integrations/eld/test', auth, role('dispatcher'), async (req, res) => {
    const { provider, creds } = req.body || {};
    if (!providerMeta(provider)) return res.status(400).json({ error: 'Pick an ELD provider.' });
    const prev = eldFor(req.user.companyId);
    const merged = cleanCreds(provider, { ...(prev?.provider === provider ? prev.creds : {}), ...Object.fromEntries(Object.entries(creds || {}).filter(([, v]) => v !== '' && v != null)) });
    try { res.json({ ok: true, ...(await testConnection(provider, merged, req.user.companyId)) }); } catch (e) { eldErr(res, e); }
  });

  app.post('/api/integrations/eld', auth, role('dispatcher'), async (req, res) => {
    const { provider, creds } = req.body || {};
    if (!providerMeta(provider)) return res.status(400).json({ error: 'Pick an ELD provider.' });
    try { const { integration } = await connect(provider, creds, req.user.companyId); res.json(publicIntegration(integration)); } catch (e) { eldErr(res, e); }
  });

  app.post('/api/integrations/eld/sync', auth, role('dispatcher'), async (req, res) => {
    const i = eldFor(req.user.companyId);
    if (!i) return res.status(404).json({ error: 'No ELD connected.' });
    res.json(publicIntegration(await syncIntegration(i)));
  });

  app.patch('/api/integrations/eld', auth, role('dispatcher'), async (req, res) => {
    const i = eldFor(req.user.companyId);
    if (!i) return res.status(404).json({ error: 'No ELD connected.' });
    const b = req.body || {};
    if (b.enabled !== undefined) i.enabled = !!b.enabled;
    if (b.vehicleMap || b.driverMap) setMaps(i, b);
    save();
    res.json(publicIntegration(await syncIntegration(i)));
  });

  app.post('/api/integrations/eld/import', auth, role('dispatcher'), async (req, res) => {
    const i = eldFor(req.user.companyId);
    if (!i) return res.status(404).json({ error: 'No ELD connected.' });
    const created = importUnlinked(i, req.body || {}, makeTruck, makeDriver);
    await syncIntegration(i);
    res.json({ created, eld: publicIntegration(i) });
  });

  app.delete('/api/integrations/eld', auth, role('dispatcher'), (req, res) => {
    disconnect(req.user.companyId);
    res.json({ ok: true });
  });

  // Provider webhooks (Samsara / Motive): any event for this account triggers a quick re-sync.
  app.post('/api/webhooks/eld/:token', (req, res) => {
    const i = db.integrations.find((x) => x.kind === 'eld' && x.webhookToken && x.webhookToken === req.params.token);
    if (!i) return res.status(404).json({ error: 'Unknown webhook.' });
    if (i.enabled) syncSoon(i);
    res.json({ ok: true });
  });

  app.patch('/api/settings', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (['off', 'suggest', 'auto'].includes(b.dispatchMode)) db.settings.dispatchMode = b.dispatchMode;
    if (b.autoMinScore !== undefined) db.settings.autoMinScore = Math.max(0, Math.min(100, Number(b.autoMinScore) || 0));
    if (b.autoMinPerKm !== undefined) db.settings.autoMinPerKm = Math.max(0, Number(b.autoMinPerKm) || 0);
    if (b.fuelPricePerL !== undefined) db.settings.fuelPricePerL = Number(b.fuelPricePerL);
    if (b.simulation !== undefined) db.settings.simulation = !!b.simulation;
    save();
    res.json(settings());
  });

}

/** AI dispatch in auto mode: accept a board load for the carrier's best-matching free driver. */
export async function autoDispatch(load) {
  const s = settings();
  if (s.dispatchMode !== 'auto' || load.status !== 'requested') return null;
  if (load.quote.carrierPayout / Math.max(1, load.quote.distanceKm) < s.autoMinPerKm) return null;
  for (const carrier of db.companies.filter((c) => c.type === 'carrier')) {
    const own = (col, key) => db[col].filter((x) => x[key] === carrier.id);
    const ctx = { drivers: own('users', 'companyId').filter((u) => u.role === 'driver'), trucks: own('trucks', 'carrierId'), loads: own('loads', 'carrierId'), shifts: own('shifts', 'carrierId'), fuelLogs: own('fuelLogs', 'carrierId'), settings: s };
    const best = rankDrivers(load, ctx).find((r) => r.eligible && r.eqOk && r.score >= s.autoMinScore);
    const by = db.users.find((u) => u.companyId === carrier.id && u.role === 'dispatcher');
    if (!best || !by) continue;
    await accept(load, by, best.driver, best.truck);
    load.autoDispatch = { score: best.score, summary: matchSummary(best), at: Date.now() };
    const last = load.timeline[load.timeline.length - 1];
    last.note = `${last.note} · auto-dispatched by Rugo AI (match ${best.score}/100)`;
    publish('loads', load);
    notify((v) => v.role === 'dispatcher' && v.companyId === carrier.id, { title: `AI dispatch took ${load.ref}`, body: `${best.driver.name} · match ${best.score}/100 · ${load.pickup.city} → ${load.dropoff.city}`, loadId: load.id });
    return best;
  }
  return null;
}

// Keep ETAs fresh for accepted loads that haven't started moving; retry auto-dispatch on waiting board loads.
const t = setInterval(async () => {
  for (const l of db.loads.filter((x) => x.status === 'accepted')) updateEta(l);
  for (const l of db.loads.filter((x) => x.status === 'requested' && Date.now() - x.createdAt < 2 * 864e5)) {
    try { await autoDispatch(l); } catch (e) { console.error('auto-dispatch', e); }
  }
}, 30000);
t.unref?.();
