// ELD sync: pulls vehicles, drivers, HOS clocks and positions from the connected provider,
// links them to Rugo trucks and drivers, and keeps them fresh on a timer (and on provider webhooks).
import { db, save, find, id, randomToken } from '../db.js';
import { publish, notify, eldPosition } from '../fleet.js';
import { ADAPTERS, providerMeta } from './providers.js';
import { EldError } from './http.js';

const env = () => globalThis.process?.env || {};
export const SYNC_MS = Number(env().RUGO_ELD_SYNC_MS) || 60000;
const busy = new Set();

/* ------------------------------ matching ------------------------------ */

const digits = (s) => (String(s || '').match(/\d+/g) || []).join('');
const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function matchVehicle(v, trucks) {
  return trucks.find((t) => v.vin && t.vin && alnum(t.vin) === alnum(v.vin))
    || trucks.find((t) => v.plate && t.plate && alnum(t.plate) === alnum(v.plate))
    || trucks.find((t) => digits(v.name) && digits(t.unit) === digits(v.name));
}
function matchDriver(d, drivers) {
  return drivers.find((u) => d.email && u.email && u.email.toLowerCase() === d.email.toLowerCase())
    || drivers.find((u) => d.licenseNumber && u.licenseNumber && alnum(u.licenseNumber) === alnum(d.licenseNumber))
    || drivers.find((u) => d.name && nameKey(u.name) === nameKey(d.name));
}

/** Link anything not yet decided. A value of null in a map means "deliberately not linked". */
export function autoMatch(i) {
  const trucks = db.trucks.filter((t) => t.carrierId === i.carrierId);
  const drivers = db.users.filter((u) => u.companyId === i.carrierId && u.role === 'driver');
  const usedT = new Set(Object.values(i.vehicleMap).filter(Boolean));
  const usedD = new Set(Object.values(i.driverMap).filter(Boolean));
  for (const v of i.vehicles) {
    if (v.extId in i.vehicleMap) continue;
    const t = matchVehicle(v, trucks.filter((x) => !usedT.has(x.id)));
    if (t) { i.vehicleMap[v.extId] = t.id; usedT.add(t.id); }
  }
  for (const d of i.drivers) {
    if (d.extId in i.driverMap) continue;
    const u = matchDriver(d, drivers.filter((x) => !usedD.has(x.id)));
    if (u) { i.driverMap[d.extId] = u.id; usedD.add(u.id); }
  }
}

/* ------------------------------ public view ----------------------------- */

const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '');

export function publicIntegration(i) {
  if (!i) return null;
  const meta = providerMeta(i.provider);
  const credsHint = {};
  for (const f of meta?.fields || []) credsHint[f.key] = f.secret ? mask(i.creds?.[f.key]) : (i.creds?.[f.key] || '');
  return {
    id: i.id, provider: i.provider, providerName: meta?.name || i.provider, status: i.status, enabled: i.enabled,
    connectedAt: i.connectedAt, lastSyncAt: i.lastSyncAt, lastError: i.lastError, syncEveryMs: SYNC_MS, stats: i.stats,
    vehicles: i.vehicles, drivers: i.drivers, vehicleMap: i.vehicleMap, driverMap: i.driverMap, credsHint,
    webhookPath: meta?.webhook ? `/api/webhooks/eld/${i.webhookToken}` : null,
  };
}

export const eldFor = (carrierId) => db.integrations.find((x) => x.kind === 'eld' && x.carrierId === carrierId);

/* -------------------------------- actions ------------------------------- */

function adapter(provider) {
  const a = ADAPTERS[provider];
  if (!a) throw new EldError('That ELD provider isn’t supported.', 'config');
  return a;
}

export function cleanCreds(provider, raw = {}) {
  const out = {};
  for (const f of providerMeta(provider)?.fields || []) {
    const v = raw[f.key] ?? f.default;
    if (v !== undefined && v !== null && String(v).trim() !== '') out[f.key] = String(v).trim().slice(0, 600);
  }
  return out;
}

export async function testConnection(provider, creds, carrierId) {
  return adapter(provider).test(creds, { db, carrierId });
}

export async function connect(provider, rawCreds, carrierId) {
  const prev = eldFor(carrierId);
  // Keep saved secrets when the form is re-submitted without them.
  const creds = cleanCreds(provider, { ...(prev?.provider === provider ? prev.creds : {}), ...Object.fromEntries(Object.entries(rawCreds || {}).filter(([, v]) => v !== '' && v != null)) });
  const counts = await testConnection(provider, creds, carrierId);
  if (prev && prev.provider !== provider) disconnect(carrierId);
  const i = eldFor(carrierId) || {
    id: id('int'), kind: 'eld', carrierId, vehicleMap: {}, driverMap: {}, vehicles: [], drivers: [], webhookToken: randomToken(16), connectedAt: Date.now(),
  };
  Object.assign(i, { provider, creds, enabled: true, status: 'connected', lastError: null });
  if (!db.integrations.includes(i)) db.integrations.push(i);
  save();
  await syncIntegration(i);
  return { integration: i, counts };
}

export function disconnect(carrierId) {
  const i = eldFor(carrierId);
  if (!i) return;
  for (const u of db.users.filter((x) => x.companyId === carrierId && x.hos)) { delete u.hos; publish('users', u); }
  for (const t of db.trucks.filter((x) => x.carrierId === carrierId && x.eld)) { delete t.eld; publish('trucks', t); }
  db.integrations = db.integrations.filter((x) => x !== i);
  save();
}

export function setMaps(i, { vehicleMap, driverMap } = {}) {
  const ownT = new Set(db.trucks.filter((t) => t.carrierId === i.carrierId).map((t) => t.id));
  const ownD = new Set(db.users.filter((u) => u.companyId === i.carrierId && u.role === 'driver').map((u) => u.id));
  const apply = (target, patch, own, ext) => {
    for (const [extId, rid] of Object.entries(patch || {})) {
      if (!ext.has(extId)) continue;
      const v = rid && own.has(rid) ? rid : null;
      if (v) for (const k of Object.keys(target)) if (target[k] === v) target[k] = null; // one-to-one
      target[extId] = v;
    }
  };
  apply(i.vehicleMap, vehicleMap, ownT, new Set(i.vehicles.map((v) => v.extId)));
  apply(i.driverMap, driverMap, ownD, new Set(i.drivers.map((d) => d.extId)));
  save();
}

/* --------------------------------- sync --------------------------------- */

function hosFlag(h) {
  if (!h || h.status !== 'driving') return null;
  if ([h.driveLeftMin, h.shiftLeftMin, h.cycleLeftMin].some((x) => x !== null && x !== undefined && x <= 0)) return 'violation';
  if (h.driveLeftMin !== null && h.driveLeftMin <= 60) return 'low';
  if (h.breakLeftMin !== null && h.breakLeftMin <= 15) return 'break';
  return null;
}

export async function syncIntegration(i) {
  if (busy.has(i.id)) return i;
  busy.add(i.id);
  const now = Date.now();
  try {
    const data = await adapter(i.provider).pull(i.creds, { db, carrierId: i.carrierId });
    i.vehicles = data.vehicles.map((v) => ({ extId: v.extId, name: v.name, vin: v.vin, plate: v.plate, address: v.position?.address || '', positionAt: v.position?.at || null }));
    i.drivers = data.drivers.map((d) => ({ extId: d.extId, name: d.name, email: d.email, licenseNumber: d.licenseNumber, phone: d.phone, status: d.hos?.status || null, vehicleExtId: d.vehicleExtId }));
    autoMatch(i);

    const vehicleName = Object.fromEntries(data.vehicles.map((v) => [v.extId, v.name]));
    const linkedDrivers = new Set();
    for (const d of data.drivers) {
      const u = i.driverMap[d.extId] && find('users', i.driverMap[d.extId]);
      if (!u || u.companyId !== i.carrierId) continue;
      linkedDrivers.add(u.id);
      if (!d.hos) { if (u.hos) { delete u.hos; publish('users', u); } continue; }
      const truckId = d.vehicleExtId ? i.vehicleMap[d.vehicleExtId] : null;
      const prevFlag = u.hos?.flag || null;
      u.hos = { ...d.hos, provider: i.provider, providerName: providerMeta(i.provider)?.name, extId: d.extId, at: now, vehicleName: d.vehicleExtId ? vehicleName[d.vehicleExtId] || null : null, truckId: truckId || null };
      u.hos.flag = hosFlag(u.hos);
      if (u.hos.flag === 'violation' && prevFlag !== 'violation') u.hosEvents = [...(u.hosEvents || []), { t: now, kind: 'violation' }].slice(-50);
      if (u.hos.flag && u.hos.flag !== prevFlag) {
        const body = u.hos.flag === 'violation' ? 'is driving past an hours-of-service limit.' : u.hos.flag === 'low' ? `has ${u.hos.driveLeftMin} min of driving left.` : 'needs a 30-minute break soon.';
        notify((v) => v.role === 'dispatcher' && v.companyId === i.carrierId, { title: u.hos.flag === 'violation' ? 'HOS violation' : 'Hours running low', body: `${u.name} ${body}`, tone: u.hos.flag === 'violation' ? 'error' : undefined });
      }
      publish('users', u);
    }
    for (const u of db.users.filter((x) => x.companyId === i.carrierId && x.hos?.provider === i.provider && !linkedDrivers.has(x.id))) { delete u.hos; publish('users', u); }

    let positions = 0;
    const linkedTrucks = new Set();
    for (const v of data.vehicles) {
      const t = i.vehicleMap[v.extId] && find('trucks', i.vehicleMap[v.extId]);
      if (!t || t.carrierId !== i.carrierId) continue;
      linkedTrucks.add(t.id);
      const fresh = v.position && v.position.lat !== null && v.position.lng !== null && v.position.at > (t.eld?.positionAt || 0);
      t.eld = { provider: i.provider, providerName: providerMeta(i.provider)?.name, extId: v.extId, name: v.name, at: now, positionAt: fresh ? v.position.at : t.eld?.positionAt || null, address: v.position?.address || t.eld?.address || '' };
      if (v.odometerKm && v.odometerKm > 0) t.odometerKm = v.odometerKm;
      if (fresh && now - v.position.at < 30 * 60000) { await eldPosition(t, v.position); positions++; } else publish('trucks', t);
    }
    for (const t of db.trucks.filter((x) => x.carrierId === i.carrierId && x.eld?.provider === i.provider && !linkedTrucks.has(x.id))) { delete t.eld; publish('trucks', t); }

    i.stats = {
      vehicles: data.vehicles.length, vehiclesLinked: linkedTrucks.size, drivers: data.drivers.length, driversLinked: linkedDrivers.size,
      withClocks: data.drivers.filter((d) => d.hos).length, positions,
    };
    i.status = 'connected'; i.lastError = null; i.failures = 0;
  } catch (e) {
    i.failures = (i.failures || 0) + 1;
    i.status = e.code === 'auth' ? 'auth_error' : 'error';
    i.lastError = e instanceof EldError ? e.message : `Sync failed: ${e.message}`;
    if (!(e instanceof EldError)) console.error('eld sync', e);
  } finally {
    i.lastSyncAt = now;
    busy.delete(i.id);
    save();
  }
  return i;
}

/** Create Rugo trucks/drivers for provider records that aren't linked yet. */
export function importUnlinked(i, { vehicles = [], drivers = [] }, makeTruck, makeDriver) {
  const created = { trucks: 0, drivers: 0 };
  for (const extId of vehicles) {
    const v = i.vehicles.find((x) => x.extId === extId);
    if (!v || i.vehicleMap[extId]) continue;
    const t = makeTruck({ unit: digits(v.name) || v.name || extId, vin: v.vin, plate: v.plate }, i.carrierId);
    i.vehicleMap[extId] = t.id; created.trucks++;
  }
  for (const extId of drivers) {
    const d = i.drivers.find((x) => x.extId === extId);
    if (!d || i.driverMap[extId]) continue;
    const slug = alnum(d.name) || 'driver';
    let email = d.email && !db.users.some((u) => u.email.toLowerCase() === d.email.toLowerCase()) ? d.email : `${slug}.${alnum(extId).slice(-6)}@add-email.rugo`;
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) email = `${slug}.${randomToken(3)}@add-email.rugo`;
    const u = makeDriver({ name: d.name || 'New driver', email, phone: d.phone, licenseNumber: d.licenseNumber }, i.carrierId);
    i.driverMap[extId] = u.id; created.drivers++;
  }
  save();
  return created;
}

/* ------------------------------- schedule ------------------------------- */

const pending = new Map();
/** Webhook pings can arrive in bursts; collapse them into one sync a few seconds later. */
export function syncSoon(i, delayMs = 3000) {
  if (pending.has(i.id)) return;
  pending.set(i.id, setTimeout(() => { pending.delete(i.id); syncIntegration(i); }, delayMs));
}

const timer = setInterval(() => {
  const now = Date.now();
  for (const i of db.integrations.filter((x) => x.kind === 'eld' && x.enabled)) {
    if (now - (i.lastSyncAt || 0) >= SYNC_MS - 500) syncIntegration(i);
  }
}, Math.min(SYNC_MS, 15000));
timer.unref?.();
