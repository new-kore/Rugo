// Sandbox ELD: fake but realistic HOS clocks built from Rugo's own drivers and trucks.
// Lets you try the whole integration (mapping, clocks, alerts) without a provider account.
import { MOVING } from '../constants.js';

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function test(_creds, { db, carrierId }) {
  return { vehicles: db.trucks.filter((t) => t.carrierId === carrierId).length, drivers: db.users.filter((u) => u.companyId === carrierId && u.role === 'driver').length };
}

export async function pull(_creds, { db, carrierId }) {
  const trucks = db.trucks.filter((t) => t.carrierId === carrierId);
  const drivers = db.users.filter((u) => u.companyId === carrierId && u.role === 'driver');
  const hourSeed = Math.floor(Date.now() / 3.6e6);
  return {
    vehicles: trucks.map((t) => ({ extId: `sbx-veh-${t.unit}`, name: `Unit ${t.unit}`, vin: t.vin || '', plate: t.plate || '', position: null, odometerKm: null })),
    drivers: drivers.map((u) => {
      const load = db.loads.find((l) => l.driverId === u.id && MOVING.includes(l.status));
      const onShift = db.shifts.some((s) => s.driverId === u.id && !s.end);
      const h = hash(u.id + hourSeed);
      const driven = load ? 120 + (h % 540) : onShift ? h % 240 : 0;
      const status = load ? 'driving' : onShift ? 'on_duty' : u.status === 'off_duty' ? 'sleeper' : 'off_duty';
      return {
        extId: `sbx-drv-${u.id}`, name: u.name, email: u.email, licenseNumber: u.licenseNumber || '', phone: u.phone || '',
        vehicleExtId: trucks.find((t) => t.id === u.truckId) ? `sbx-veh-${trucks.find((t) => t.id === u.truckId).unit}` : null,
        hos: {
          status,
          driveLeftMin: Math.max(0, 13 * 60 - driven),
          shiftLeftMin: Math.max(0, 14 * 60 - driven - 45),
          cycleLeftMin: Math.max(0, 70 * 60 - 1500 - (h % 1800)),
          breakLeftMin: status === 'driving' ? Math.max(0, 480 - (driven % 480)) : 480,
        },
      };
    }),
  };
}
