// Geotab MyGeotab JSON-RPC API (https://developers.geotab.com). Auth: database + user + password → session.
// Use a dedicated MyGeotab "service account" user with read access to devices, drivers and HOS.
import { request, baseUrl, assertSafeUrl, EldError, num } from './http.js';

const STATUS = { D: 'driving', ON: 'on_duty', OFF: 'off_duty', SB: 'sleeper', PC: 'personal_conveyance', YM: 'yard_move', WT: 'on_duty' };
const sessions = new Map(); // in memory only: creds → { credentials, root }

/** TimeSpan "d.hh:mm:ss(.fff)" or "hh:mm:ss" → minutes. */
export function spanMin(s) {
  if (s === null || s === undefined) return null;
  const m = /^(-)?(?:(\d+)\.)?(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(String(s));
  if (!m) return null;
  const mins = (Number(m[2] || 0) * 24 + Number(m[3])) * 60 + Number(m[4]) + Number(m[5]) / 60;
  return Math.round(m[1] ? -mins : mins);
}

function rootFor(server) {
  const host = String(server || 'my.geotab.com').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const fallback = `https://${host}`;
  const root = baseUrl('geotab', fallback);
  if (root === fallback) assertSafeUrl(fallback, { hostSuffix: 'geotab.com' });
  return root;
}

async function rpc(root, method, params) {
  const r = await request(`${root}/apiv1`, { method: 'POST', body: { method, params } });
  if (r.error) {
    const name = r.error.errors?.[0]?.name || r.error.name || '';
    if (/InvalidUser|Credentials|DbUnavailable/i.test(name)) throw new EldError('Geotab rejected the sign-in. Check the database, user and password.', 'auth');
    throw new EldError(`Geotab error: ${r.error.message || name || 'unknown'}`, 'http');
  }
  return r.result;
}

async function session(creds, fresh = false) {
  const key = `${creds.server}|${creds.database}|${creds.userName}|${creds.password}`; // password in the key: changed creds never reuse an old session
  if (!fresh && sessions.has(key)) return sessions.get(key);
  const root = rootFor(creds.server);
  const r = await rpc(root, 'Authenticate', { database: creds.database, userName: creds.userName, password: creds.password });
  // Geotab may tell us which server actually hosts the database.
  const path = r?.path && r.path !== 'ThisServer' ? rootFor(r.path) : root;
  const s = { credentials: r.credentials, root: path };
  sessions.set(key, s);
  return s;
}

/** Call with a cached session; re-authenticate once if it expired. */
async function call(creds, method, params) {
  try {
    const s = await session(creds);
    return await rpc(s.root, method, { ...params, credentials: s.credentials });
  } catch (e) {
    if (e.code !== 'auth') throw e;
    const s = await session(creds, true);
    return rpc(s.root, method, { ...params, credentials: s.credentials });
  }
}

export async function test(creds) {
  if (!creds.database || !creds.userName || !creds.password) throw new EldError('Database, user and password are required.', 'config');
  const [devices, users] = await Promise.all([
    call(creds, 'Get', { typeName: 'Device' }),
    call(creds, 'Get', { typeName: 'User', search: { isDriver: true } }),
  ]);
  return { vehicles: devices.length, drivers: users.length };
}

export async function pull(creds) {
  const [devices, users, statuses] = await Promise.all([
    call(creds, 'Get', { typeName: 'Device' }),
    call(creds, 'Get', { typeName: 'User', search: { isDriver: true } }),
    call(creds, 'Get', { typeName: 'DeviceStatusInfo' }),
  ]);
  const statusByDevice = Object.fromEntries(statuses.map((s) => [s.device?.id, s]));
  const deviceOfDriver = {};
  for (const s of statuses) if (s.driver?.id && s.driver.id !== 'UnknownDriverId') deviceOfDriver[s.driver.id] = s.device?.id;

  // Remaining time and latest duty status, per driver, in batched multi-calls.
  const since = new Date(Date.now() - 8 * 864e5).toISOString();
  const avail = {}; const lastLog = {};
  for (let i = 0; i < users.length; i += 50) {
    const batch = users.slice(i, i + 50);
    const calls = batch.flatMap((u) => [
      { method: 'Get', params: { typeName: 'DutyStatusAvailability', search: { userSearch: { id: u.id } } } },
      { method: 'Get', params: { typeName: 'DutyStatusLog', search: { userSearch: { id: u.id }, fromDate: since, statuses: Object.keys(STATUS) } } },
    ]);
    const res = await call(creds, 'ExecuteMultiCall', { calls });
    batch.forEach((u, j) => {
      avail[u.id] = (res[j * 2] || [])[0] || null;
      const logs = (res[j * 2 + 1] || []).filter((l) => STATUS[l.status]).sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
      lastLog[u.id] = logs[logs.length - 1] || null;
    });
  }

  return {
    vehicles: devices.map((d) => {
      const s = statusByDevice[d.id];
      return {
        extId: String(d.id), name: d.name || '', vin: d.vehicleIdentificationNumber || '', plate: d.licensePlate || '',
        position: s && num(s.latitude) !== null ? { lat: num(s.latitude), lng: num(s.longitude), heading: num(s.bearing), speedKph: num(s.speed), at: Date.parse(s.dateTime) || Date.now(), address: '' } : null,
        odometerKm: null,
      };
    }),
    drivers: users.map((u) => {
      const a = avail[u.id];
      const log = lastLog[u.id];
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name || '';
      return {
        extId: String(u.id), name, email: /@/.test(u.name || '') ? u.name : '', licenseNumber: u.licenseNumber || '', phone: u.phoneNumber || '',
        vehicleExtId: deviceOfDriver[u.id] ? String(deviceOfDriver[u.id]) : null,
        hos: a || log ? {
          status: STATUS[log?.status] || 'unknown',
          driveLeftMin: spanMin(a?.driving), shiftLeftMin: spanMin(a?.duty), cycleLeftMin: spanMin(a?.cycle), breakLeftMin: spanMin(a?.drivingBreakDuration),
        } : null,
      };
    }),
  };
}
