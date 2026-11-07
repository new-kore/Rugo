// All API routes. Shared by the Node server (Express) and the in-browser demo build.
import { db, save, find, id, checkPassword, hashPassword, randomToken, saveUpload } from './db.js';
import { route } from './geo.js';
import { quote, EQUIPMENT } from './pricing.js';
import { STATUSES, PHOTO_SLOTS, DAMAGE_SLOT, ACTIVE } from './constants.js';
import {
  settings, snapshot, subscribe, publish, publishRemove, notify, accept, advance, addTimeline,
  gpsUpdate, clockIn, clockOut, nextRef, newLoadShell, publicUser, updateEta,
} from './fleet.js';

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

  app.post('/api/loads', auth, role('shipper'), async (req, res) => {
    const { pickup, dropoff, cargo = {}, options = {}, pickupWindow, deliveryWindow, notes, poNumber } = req.body || {};
    if (!validPlace(pickup) || !validPlace(dropoff)) return res.status(400).json({ error: 'Choose a pickup and a destination.' });
    if (!EQUIPMENT[cargo.equipment]) return res.status(400).json({ error: 'Choose a trailer type.' });
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
    addTimeline(load, 'requested', req.user, 'Pickup requested');
    db.loads.push(load);
    save();
    publish('loads', load);
    notify((v) => v.role === 'dispatcher', { title: 'New load on the board', body: `${load.ref}: ${pickup.city} → ${dropoff.city} · $${load.quote.carrierPayout.toFixed(0)}`, loadId: load.id });
    res.json(load);
  });

  function getLoad(req, res) {
    const load = find('loads', req.params.id);
    if (!load) { res.status(404).json({ error: 'Load not found.' }); return null; }
    const u = req.user;
    const ok = (u.role === 'shipper' && load.shipperId === u.companyId) ||
      (u.role === 'dispatcher' && (load.carrierId === u.companyId || load.status === 'requested')) ||
      (u.role === 'driver' && load.driverId === u.id);
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
    if (db.loads.some((l) => l.driverId === driver.id && ACTIVE.includes(l.status))) return res.status(409).json({ error: `${driver.name} is already on a job.` });
    await accept(load, req.user, driver, truck);
    res.json(load);
  });

  app.post('/api/loads/:id/status', auth, role('driver', 'dispatcher'), async (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    const err = await advance(load, req.body.status, req.user, { odometer: req.body.odometer, note: req.body.note });
    if (err) return res.status(400).json({ error: err });
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

  app.post('/api/loads/:id/messages', auth, (req, res) => {
    const load = getLoad(req, res); if (!load) return;
    const text = String(req.body.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Message is empty.' });
    const msg = { id: id('msg'), userId: req.user.id, name: req.user.name, role: req.user.role, text, t: Date.now() };
    load.messages.push(msg);
    save();
    publish('loads', load);
    notify((v) => v.id !== req.user.id && (v.companyId === load.shipperId || v.companyId === load.carrierId || v.id === load.driverId),
      { title: `Message · ${load.ref}`, body: `${req.user.name}: ${text}`, loadId: load.id });
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
    if (!(litres > 0) || !(pricePerL > 0)) return res.status(400).json({ error: 'Enter litres and price per litre.' });
    const active = db.loads.find((l) => l.truckId === truck.id && ACTIVE.includes(l.status));
    const odo = Number(b.odometerKm) || truck.odometerKm;
    const log = {
      id: id('ful'), carrierId: req.user.companyId, truckId: truck.id,
      driverId: req.user.role === 'driver' ? req.user.id : (b.driverId || truck.driverId || null),
      loadId: b.loadId === undefined ? active?.id || null : b.loadId || null,
      t: b.t ? Number(b.t) : Date.now(), litres, pricePerL, total: Math.round(litres * pricePerL * 100) / 100,
      odometerKm: odo, station: b.station || '', fuelType: b.fuelType || 'diesel', def: Number(b.defLitres) || 0,
      receiptUrl: b.receipt ? saveUpload(b.receipt) : null, location: truck.location ? { lat: truck.location.lat, lng: truck.location.lng } : null,
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

  app.post('/api/drivers', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.email) return res.status(400).json({ error: 'Name and email are required.' });
    if (db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) return res.status(409).json({ error: 'That email is already used.' });
    const u = {
      id: id('usr'), companyId: req.user.companyId, role: 'driver', name: b.name, email: b.email, phone: b.phone || '',
      password: hashPassword(b.password || 'demo'), color: COLORS[db.users.length % COLORS.length], status: 'available',
      payType: b.payType === 'per_km' ? 'per_km' : 'hourly', hourlyRate: Number(b.hourlyRate) || 32, perKmRate: Number(b.perKmRate) || 0.62,
      truckId: b.truckId || null, licenseClass: b.licenseClass || 'AZ', hireDate: Date.now(), rating: null, locationSource: 'sim',
    };
    db.users.push(u);
    save();
    publish('users', u);
    res.json(publicUser(u, req.user));
  });

  app.patch('/api/drivers/:id', auth, role('dispatcher'), (req, res) => {
    const u = find('users', req.params.id);
    if (!u || u.companyId !== req.user.companyId || u.role !== 'driver') return res.status(404).json({ error: 'Driver not found.' });
    const b = req.body || {};
    for (const k of ['name', 'phone', 'licenseClass']) if (b[k] !== undefined) u[k] = String(b[k]);
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

  app.post('/api/trucks', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (!b.unit) return res.status(400).json({ error: 'Unit number is required.' });
    const home = db.companies.find((c) => c.id === req.user.companyId)?.yard;
    const t = {
      id: id('trk'), carrierId: req.user.companyId, unit: b.unit, make: b.make || '', model: b.model || '', year: Number(b.year) || 2024,
      plate: b.plate || '', vin: b.vin || '', equipment: EQUIPMENT[b.equipment] ? b.equipment : 'dry_van',
      odometerKm: Number(b.odometerKm) || 0, fuelLPer100: Number(b.fuelLPer100) || 36, tankL: Number(b.tankL) || 900,
      driverId: null, location: home ? { ...home, heading: 0, speed: 0, updatedAt: Date.now() } : null,
      nextServiceKm: (Number(b.odometerKm) || 0) + 25000,
    };
    db.trucks.push(t);
    save();
    publish('trucks', t);
    res.json(t);
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

  app.patch('/api/settings', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    if (b.fuelPricePerL !== undefined) db.settings.fuelPricePerL = Number(b.fuelPricePerL);
    if (b.simulation !== undefined) db.settings.simulation = !!b.simulation;
    save();
    res.json(settings());
  });

}

// Keep ETAs fresh for accepted loads that haven't started moving.
const t = setInterval(() => { for (const l of db.loads.filter((x) => x.status === 'accepted')) updateEta(l); }, 30000);
t.unref?.();
