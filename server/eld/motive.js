// Motive (formerly KeepTruckin) REST API (https://developer.gomotive.com). Auth: X-Api-Key header.
import { request, baseUrl, secToMin, num } from './http.js';

const STATUS = { off_duty: 'off_duty', sleeper: 'sleeper', driving: 'driving', on_duty: 'on_duty', yard_move: 'yard_move', personal_conveyance: 'personal_conveyance', waiting: 'on_duty' };

function api(creds) {
  const root = baseUrl('motive', 'https://api.gomotive.com');
  const headers = { 'X-Api-Key': String(creds.apiKey || '').trim() };
  /** Follows Motive's page_no / per_page pagination. `key` is the list field, `item` the wrapper inside each entry. */
  return async function all(path, key, item, params = {}) {
    const out = [];
    for (let page = 1; page <= 25; page++) {
      const q = new URLSearchParams({ ...params, per_page: '100', page_no: String(page) });
      const r = await request(`${root}${path}?${q}`, { headers });
      const rows = (r[key] || []).map((x) => x[item] || x);
      out.push(...rows);
      const total = num(r.pagination?.total);
      if (rows.length < 100 || (total !== null && page * 100 >= total)) break;
    }
    return out;
  };
}

const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim();

export async function test(creds) {
  const all = api(creds);
  const [vehicles, drivers] = await Promise.all([
    all('/v1/vehicles', 'vehicles', 'vehicle'),
    all('/v1/users', 'users', 'user', { role: 'driver', status: 'active' }),
  ]);
  return { vehicles: vehicles.length, drivers: drivers.length };
}

export async function pull(creds) {
  const all = api(creds);
  const [vehicles, locations, drivers, avail] = await Promise.all([
    all('/v1/vehicles', 'vehicles', 'vehicle'),
    all('/v1/vehicle_locations', 'vehicles', 'vehicle'),
    all('/v1/users', 'users', 'user', { role: 'driver', status: 'active' }),
    all('/v1/available_time', 'users', 'user'),
  ]);
  const locById = Object.fromEntries(locations.map((v) => [v.id, v.current_location]));
  const availById = Object.fromEntries(avail.map((u) => [u.id, u]));
  const vehicleOfDriver = {};
  for (const v of vehicles) if (v.current_driver?.id) vehicleOfDriver[v.current_driver.id] = String(v.id);
  return {
    vehicles: vehicles.map((v) => {
      const l = locById[v.id];
      return {
        extId: String(v.id), name: String(v.number ?? ''), vin: v.vin || '', plate: v.license_plate_number || '',
        position: l && num(l.lat) !== null ? {
          lat: num(l.lat), lng: num(l.lon), heading: num(l.bearing), speedKph: num(l.kph),
          at: Date.parse(l.located_at) || Date.now(), address: l.description || '',
        } : null,
        odometerKm: null, // Motive's odometer needs a separate endpoint; Rugo keeps counting GPS km.
      };
    }),
    drivers: drivers.map((d) => {
      const a = availById[d.id];
      const t = a?.available_time;
      const status = a?.duty_status || d.duty_status;
      return {
        extId: String(d.id), name: fullName(d), email: d.email || '', licenseNumber: d.drivers_license_number || '', phone: d.phone || '',
        vehicleExtId: vehicleOfDriver[d.id] || null,
        hos: t || status ? {
          status: STATUS[status] || 'unknown',
          driveLeftMin: secToMin(t?.drive), shiftLeftMin: secToMin(t?.shift), cycleLeftMin: secToMin(t?.cycle), breakLeftMin: secToMin(t?.break),
        } : null,
      };
    }),
  };
}
