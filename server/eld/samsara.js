// Samsara REST API (https://developers.samsara.com). Auth: Bearer API token.
// Token scopes needed (read): Vehicles, Drivers, ELD Hours of Service, Vehicle Statistics.
import { request, baseUrl, msToMin, num } from './http.js';

const STATUS = { offDuty: 'off_duty', sleeperBed: 'sleeper', sleeperBerth: 'sleeper', driving: 'driving', onDuty: 'on_duty', yardMove: 'yard_move', personalConveyance: 'personal_conveyance' };

function api(creds) {
  const root = baseUrl('samsara', creds.region === 'eu' ? 'https://api.eu.samsara.com' : 'https://api.samsara.com');
  const headers = { Authorization: `Bearer ${String(creds.apiToken || '').trim()}` };
  /** Follows Samsara's cursor pagination. */
  return async function all(path, params = {}) {
    const out = [];
    let after = '';
    for (let page = 0; page < 25; page++) {
      const q = new URLSearchParams({ ...params, ...(after ? { after } : {}) });
      const r = await request(`${root}${path}?${q}`, { headers });
      out.push(...(r.data || []));
      if (!r.pagination?.hasNextPage || !r.pagination.endCursor) break;
      after = r.pagination.endCursor;
    }
    return out;
  };
}

export async function test(creds) {
  const all = api(creds);
  const [vehicles, drivers] = await Promise.all([all('/fleet/vehicles', { limit: 512 }), all('/fleet/drivers', { driverActivationStatus: 'active', limit: 512 })]);
  return { vehicles: vehicles.length, drivers: drivers.length };
}

export async function pull(creds) {
  const all = api(creds);
  const [vehicles, stats, drivers, clocks] = await Promise.all([
    all('/fleet/vehicles', { limit: 512 }),
    all('/fleet/vehicles/stats', { types: 'gps,obdOdometerMeters' }),
    all('/fleet/drivers', { driverActivationStatus: 'active', limit: 512 }),
    all('/fleet/hos/clocks', { limit: 512 }),
  ]);
  const statById = Object.fromEntries(stats.map((s) => [s.id, s]));
  const clockById = Object.fromEntries(clocks.map((c) => [c.driver?.id, c]));
  return {
    vehicles: vehicles.map((v) => {
      const s = statById[v.id] || {};
      const g = s.gps;
      return {
        extId: String(v.id), name: v.name || '', vin: v.vin || '', plate: v.licensePlate || '',
        position: g && num(g.latitude) !== null ? {
          lat: num(g.latitude), lng: num(g.longitude), heading: num(g.headingDegrees),
          speedKph: num(g.speedMilesPerHour) !== null ? g.speedMilesPerHour * 1.609344 : null,
          at: Date.parse(g.time) || Date.now(), address: g.reverseGeo?.formattedLocation || '',
        } : null,
        odometerKm: num(s.obdOdometerMeters?.value) !== null ? Math.round(s.obdOdometerMeters.value / 1000) : null,
      };
    }),
    drivers: drivers.map((d) => {
      const c = clockById[d.id];
      return {
        extId: String(d.id), name: d.name || d.username || '', email: d.email || '', licenseNumber: d.licenseNumber || '', phone: d.phone || '',
        vehicleExtId: c?.currentVehicle?.id ? String(c.currentVehicle.id) : d.staticAssignedVehicle?.id ? String(d.staticAssignedVehicle.id) : null,
        hos: c ? {
          status: STATUS[c.currentDutyStatus?.hosStatusType] || 'unknown',
          driveLeftMin: msToMin(c.clocks?.drive?.driveRemainingDurationMs),
          shiftLeftMin: msToMin(c.clocks?.shift?.shiftRemainingDurationMs),
          cycleLeftMin: msToMin(c.clocks?.cycle?.cycleRemainingDurationMs),
          breakLeftMin: msToMin(c.clocks?.break?.timeUntilBreakDurationMs),
          cycleTomorrowMin: msToMin(c.clocks?.cycle?.cycleTomorrowDurationMs),
        } : null,
      };
    }),
  };
}
