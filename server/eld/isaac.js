// Isaac Instruments. Isaac's API is issued to partners: Isaac provides the base URL and an API key.
// Isaac's partner docs aren't public, so the paths and field names below are a tolerant best guess.
// Check them against the docs Isaac sends and adjust PATHS and the pick() lists if they differ.
import { request, assertSafeUrl, baseUrl, EldError, num } from './http.js';

const PATHS = { vehicles: '/vehicles', drivers: '/drivers', hos: '/hos/availability' };
const STATUS = { off: 'off_duty', off_duty: 'off_duty', offduty: 'off_duty', sb: 'sleeper', sleeper: 'sleeper', d: 'driving', driving: 'driving', on: 'on_duty', on_duty: 'on_duty', onduty: 'on_duty', ym: 'yard_move', yard_move: 'yard_move', pc: 'personal_conveyance', personal_conveyance: 'personal_conveyance' };

const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const list = (r) => (Array.isArray(r) ? r : r?.data || r?.items || r?.results || []);
/** Minutes from a number of minutes, an ISO duration (PT2H30M) or "hh:mm(:ss)". */
function minutes(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Math.round(v);
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(v);
  if (iso) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  const hm = /^(-)?(\d+):(\d+)(?::\d+)?$/.exec(v);
  if (hm) return (hm[1] ? -1 : 1) * (Number(hm[2]) * 60 + Number(hm[3]));
  return num(v);
}

function api(creds) {
  if (!creds.baseUrl || !creds.apiKey) throw new EldError('The API URL and key from Isaac are both required.', 'config');
  const root = baseUrl('isaac', String(creds.baseUrl).trim());
  if (root === String(creds.baseUrl).trim().replace(/\/+$/, '')) assertSafeUrl(root);
  const headers = { Authorization: `Bearer ${String(creds.apiKey).trim()}` };
  return (path) => request(`${root}${path}`, { headers }).then(list);
}

export async function test(creds) {
  const get = api(creds);
  const [vehicles, drivers] = await Promise.all([get(PATHS.vehicles), get(PATHS.drivers)]);
  return { vehicles: vehicles.length, drivers: drivers.length };
}

export async function pull(creds) {
  const get = api(creds);
  const [vehicles, drivers, hos] = await Promise.all([get(PATHS.vehicles), get(PATHS.drivers), get(PATHS.hos)]);
  const hosByDriver = Object.fromEntries(hos.map((h) => [String(pick(h, 'driverId', 'driver_id', 'userId') ?? pick(h.driver || {}, 'id')), h]));
  return {
    vehicles: vehicles.map((v) => {
      const p = pick(v, 'position', 'location', 'lastPosition') || v;
      const lat = num(pick(p, 'lat', 'latitude'));
      return {
        extId: String(pick(v, 'id', 'vehicleId')), name: String(pick(v, 'name', 'number', 'unit', 'unitNumber') ?? ''), vin: pick(v, 'vin') || '', plate: pick(v, 'plate', 'licensePlate') || '',
        position: lat !== null ? { lat, lng: num(pick(p, 'lng', 'lon', 'longitude')), heading: num(pick(p, 'heading', 'bearing')), speedKph: num(pick(p, 'speedKph', 'speed')), at: Date.parse(pick(p, 'time', 'timestamp', 'dateTime')) || Date.now(), address: pick(p, 'address', 'description') || '' } : null,
        odometerKm: num(pick(v, 'odometerKm')),
      };
    }),
    drivers: drivers.map((d) => {
      const extId = String(pick(d, 'id', 'driverId'));
      const h = hosByDriver[extId];
      const name = pick(d, 'name', 'fullName') || [pick(d, 'firstName', 'first_name'), pick(d, 'lastName', 'last_name')].filter(Boolean).join(' ');
      return {
        extId, name: name || '', email: pick(d, 'email') || '', licenseNumber: pick(d, 'licenseNumber', 'license_number') || '', phone: pick(d, 'phone') || '',
        vehicleExtId: pick(d, 'vehicleId', 'currentVehicleId') ? String(pick(d, 'vehicleId', 'currentVehicleId')) : null,
        hos: h ? {
          status: STATUS[String(pick(h, 'status', 'dutyStatus') || '').toLowerCase()] || 'unknown',
          driveLeftMin: minutes(pick(h, 'driveRemaining', 'drivingRemaining', 'drive')),
          shiftLeftMin: minutes(pick(h, 'shiftRemaining', 'dutyRemaining', 'shift')),
          cycleLeftMin: minutes(pick(h, 'cycleRemaining', 'cycle')),
          breakLeftMin: minutes(pick(h, 'breakRemaining', 'break')),
        } : null,
      };
    }),
  };
}
