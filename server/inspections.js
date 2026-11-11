// Daily vehicle inspections (pre-trip / post-trip) and the shop work orders that defects create.
// Checklist follows NSC Standard 13 Schedule 1 (Canada) and covers FMCSA 396.11/396.13 DVIR (US).
import { db, save, find, id, saveUpload } from './db.js';
import { publish, notify } from './fleet.js';

export const VALID_MS = 24 * 3600e3; // a trip inspection is valid for 24 hours

/** Inspection items. `on` = which unit it applies to. Defect lists are the common minor / major defects. */
export const INSPECTION_ITEMS = [
  { key: 'air_brakes', label: 'Air brake system', on: ['truck', 'trailer'], minor: ['Audible air leak', 'Slow air pressure build-up'], major: ['Push-rod stroke beyond adjustment limit', 'Air loss rate over limit', 'Low-air warning not working', 'Parking brake does not hold'] },
  { key: 'cab', label: 'Cab', on: ['truck'], minor: ['Door does not open or close properly'], major: ['Driver door will not open from inside'] },
  { key: 'cargo', label: 'Cargo securement', on: ['trailer'], minor: ['Damaged tie-down or strap'], major: ['Load insecure or shifting', 'Tie-downs missing or broken'] },
  { key: 'coupling', label: 'Coupling devices', on: ['truck', 'trailer'], minor: ['Safety chain or cable damaged'], major: ['Fifth wheel not locked', 'Kingpin or jaws cracked or worn', 'Coupler insecure'] },
  { key: 'controls', label: 'Driver controls', on: ['truck'], minor: ['Accelerator, clutch or gauge not working right'], major: ['Accelerator sticks'] },
  { key: 'seat', label: 'Driver seat & seat belt', on: ['truck'], minor: ['Seat damaged'], major: ['Seat belt missing or broken', 'Seat will not stay in position'] },
  { key: 'emergency', label: 'Emergency equipment', on: ['truck'], minor: ['Warning triangles missing', 'Fire extinguisher missing or empty', 'First-aid kit missing'], major: [] },
  { key: 'exhaust', label: 'Exhaust system', on: ['truck'], minor: ['Exhaust leak'], major: ['Exhaust leaking into the cab'] },
  { key: 'frame', label: 'Frame & cargo body', on: ['truck', 'trailer'], minor: ['Body or frame damaged'], major: ['Frame cracked, broken or shifted'] },
  { key: 'fuel', label: 'Fuel system', on: ['truck'], minor: ['Fuel cap missing'], major: ['Fuel leaking'] },
  { key: 'glass', label: 'Glass & mirrors', on: ['truck'], minor: ['Mirror or window damaged or loose'], major: ['Driver’s view blocked'] },
  { key: 'heater', label: 'Heater & defroster', on: ['truck'], minor: ['Heater not working'], major: ['Defroster can’t clear the windshield'] },
  { key: 'horn', label: 'Horn', on: ['truck'], minor: ['Horn not working'], major: [] },
  { key: 'lamps', label: 'Lamps & reflectors', on: ['truck', 'trailer'], minor: ['Marker or clearance lamp out', 'Reflector missing'], major: ['Brake lamps not working', 'Turn signals not working', 'Headlamps not working'] },
  { key: 'steering', label: 'Steering', on: ['truck'], minor: ['Steering wheel play more than normal'], major: ['Steering play beyond the limit'] },
  { key: 'suspension', label: 'Suspension', on: ['truck', 'trailer'], minor: ['Air leak in suspension', 'Broken spring leaf'], major: ['Air bag deflated', 'U-bolt, spring or axle part cracked or broken'] },
  { key: 'tires', label: 'Tires', on: ['truck', 'trailer'], minor: ['Tread or sidewall damaged', 'Tire slowly leaking'], major: ['Flat or audible leak', 'Tread below 1.6 mm (2/32")', 'Cord or belt showing'] },
  { key: 'wheels', label: 'Wheels, hubs & fasteners', on: ['truck', 'trailer'], minor: ['Hub oil below the line'], major: ['Wheel nut missing or loose', 'Wheel or rim cracked'] },
  { key: 'wipers', label: 'Wipers & washer', on: ['truck'], minor: ['Wiper or washer not working'], major: ['Wiper not working in rain or snow'] },
];

/** Walk-around photos taken on every pre-trip. */
export const WALKAROUND = [
  { key: 'front', label: 'Front' }, { key: 'left', label: 'Driver side' }, { key: 'right', label: 'Passenger side' }, { key: 'rear', label: 'Rear' },
];

export const INSPECTION_META = { items: INSPECTION_ITEMS, walkaround: WALKAROUND, validHours: VALID_MS / 3600e3 };

/** Latest pre-trip for a truck that is still valid, or null. */
export function validPreTrip(truckId, now = Date.now()) {
  return db.inspections.filter((x) => x.truckId === truckId && x.type === 'pre' && now - x.at < VALID_MS).sort((a, b) => b.at - a.at)[0] || null;
}

/** Why a truck (and trailer) can't start a trip, or null when it can. */
export function tripBlocker(truckId, trailerId) {
  const truck = find('trucks', truckId);
  if (truck?.outOfService) return `Unit ${truck.unit} is out of service: ${truck.outOfService.reason}. The shop has to fix it first.`;
  const trailer = trailerId && find('trailers', trailerId);
  if (trailer?.outOfService) return `Trailer ${trailer.unit} is out of service: ${trailer.outOfService.reason}.`;
  if (truck && !validPreTrip(truck.id)) return 'Do your pre-trip inspection first.';
  return null;
}

const itemOf = (key) => INSPECTION_ITEMS.find((i) => i.key === key);

/** Mark a unit out of service, or back in service when it has no open major work order left. */
function syncService(col, unitId) {
  const unit = find(col, unitId);
  if (!unit) return;
  const field = col === 'trucks' ? 'truckId' : 'trailerId';
  const major = db.workOrders.find((w) => w[field] === unitId && w.unit === (col === 'trucks' ? 'truck' : 'trailer') && w.severity === 'major' && w.status !== 'repaired');
  if (major) {
    unit.outOfService = { since: unit.outOfService?.since || major.reportedAt, workOrderId: major.id, reason: major.defects.find((d) => d.severity === 'major')?.defect || 'Major defect' };
    if (col === 'trailers') unit.status = 'shop';
  } else if (unit.outOfService) {
    delete unit.outOfService;
    if (col === 'trailers' && unit.status === 'shop') unit.status = 'available';
  }
  publish(col, unit);
}

/** Create the inspection record (and work orders for any defects). Shared by the API and the demo seed. */
export function recordInspection(user, b, { at = Date.now(), silent = false } = {}) {
  const truck = find('trucks', b.truckId);
  if (!truck || truck.carrierId !== user.companyId) return { error: 'Choose your truck.' };
  const trailer = b.trailerId ? find('trailers', b.trailerId) : null;
  if (b.trailerId && (!trailer || trailer.carrierId !== user.companyId)) return { error: 'Choose one of your trailers.' };
  const type = b.type === 'post' ? 'post' : 'pre';

  const defects = [];
  for (const d of b.defects || []) {
    const item = itemOf(d.item);
    if (!item) return { error: 'Unknown inspection item.' };
    const unit = d.unit === 'trailer' ? 'trailer' : 'truck';
    if (unit === 'trailer' && !trailer) return { error: 'Add the trailer to report a trailer defect.' };
    const severity = d.severity === 'major' ? 'major' : 'minor';
    const photo = d.photoUrl || (d.photo ? saveUpload(d.photo) : null);
    if (!photo) return { error: `Take a photo of the defect: ${item.label}.` };
    defects.push({ id: id('dfc'), item: item.key, label: item.label, unit, severity, defect: String(d.defect || '').slice(0, 140) || 'Defect', note: String(d.note || '').slice(0, 500), photo });
  }
  const photos = [];
  for (const p of b.photos || []) {
    const url = p.url || saveUpload(p.dataUrl);
    if (url) photos.push({ slot: p.slot, url });
  }
  if (type === 'pre' && WALKAROUND.some((w) => !photos.some((p) => p.slot === w.key))) return { error: 'Take all four walk-around photos.' };
  const sigUrl = b.signature?.url || saveUpload(b.signature?.dataUrl);
  const sigName = String(b.signature?.name || user.name).trim();
  if (!sigUrl) return { error: 'Sign the inspection report.' };

  const units = ['truck', ...(trailer ? ['trailer'] : [])];
  const checked = INSPECTION_ITEMS.reduce((n, i) => n + i.on.filter((u) => units.includes(u)).length, 0);
  const result = defects.some((d) => d.severity === 'major') ? 'major' : defects.length ? 'minor' : 'ok';
  const odo = Number(b.odometerKm) || truck.odometerKm;
  if (odo > truck.odometerKm) truck.odometerKm = odo;

  const insp = {
    id: id('ins'), carrierId: user.companyId, driverId: user.role === 'driver' ? user.id : (b.driverId || truck.driverId || null), driverName: user.role === 'driver' ? user.name : sigName,
    truckId: truck.id, trailerId: trailer?.id || null, type, at, odometerKm: Math.round(odo), checked, defects, photos, result,
    location: truck.location ? { lat: truck.location.lat, lng: truck.location.lng } : null,
    signature: { name: sigName, url: sigUrl, t: at }, workOrderIds: [], ackWorkOrderIds: [],
  };

  // The driver confirms repairs made since the last inspection (DVIR rule).
  for (const woId of b.ackWorkOrderIds || []) {
    const wo = find('workOrders', woId);
    if (wo && wo.carrierId === user.companyId && wo.status === 'repaired' && !wo.ackAt) {
      Object.assign(wo, { ackAt: at, ackBy: sigName, ackInspectionId: insp.id });
      insp.ackWorkOrderIds.push(wo.id);
      if (!silent) publish('workOrders', wo);
    }
  }

  // One work order per unit with defects.
  for (const unit of units) {
    const ds = defects.filter((d) => d.unit === unit);
    if (!ds.length) continue;
    const wo = {
      id: id('wko'), carrierId: user.companyId, number: nextWo(), unit, truckId: truck.id, trailerId: trailer?.id || null,
      unitLabel: unit === 'truck' ? `Unit ${truck.unit}` : `Trailer ${trailer.unit}`, inspectionId: insp.id,
      reportedBy: insp.driverName, reportedById: insp.driverId, reportedAt: at, defects: ds, severity: ds.some((d) => d.severity === 'major') ? 'major' : 'minor',
      status: 'open', history: [{ t: at, by: insp.driverName, text: `Reported on ${type === 'pre' ? 'pre-trip' : 'post-trip'} inspection` }],
    };
    db.workOrders.push(wo);
    insp.workOrderIds.push(wo.id);
    if (!silent) publish('workOrders', wo);
  }
  db.inspections.push(insp);
  truck.lastInspection = { id: insp.id, type, at, result };
  if (!silent) {
    syncService('trucks', truck.id);
    if (trailer) syncService('trailers', trailer.id);
  } else {
    syncServiceQuiet(truck, trailer);
  }
  save();
  if (!silent) {
    publish('inspections', insp);
    publish('trucks', truck);
    if (defects.length) {
      const top = defects.find((d) => d.severity === 'major') || defects[0];
      notify((v) => v.role === 'dispatcher' && v.companyId === user.companyId, {
        title: result === 'major' ? `⛔ Unit ${truck.unit} out of service` : `⚠︎ Defect on Unit ${truck.unit}`,
        body: `${insp.driverName}: ${top.label} — ${top.defect}${defects.length > 1 ? ` (+${defects.length - 1} more)` : ''}. Work order sent to the shop.`,
        tone: result === 'major' ? 'error' : 'warn',
      });
    }
  }
  return { inspection: insp };
}

function syncServiceQuiet(truck, trailer) {
  // Seed path: same rules without publishing.
  for (const [col, unit] of [['trucks', truck], ['trailers', trailer]]) {
    if (!unit) continue;
    const field = col === 'trucks' ? 'truckId' : 'trailerId';
    const kind = col === 'trucks' ? 'truck' : 'trailer';
    const major = db.workOrders.find((w) => w[field] === unit.id && w.unit === kind && w.severity === 'major' && w.status !== 'repaired');
    if (major) {
      unit.outOfService = { since: major.reportedAt, workOrderId: major.id, reason: major.defects.find((d) => d.severity === 'major')?.defect || 'Major defect' };
      if (col === 'trailers') unit.status = 'shop';
    } else delete unit.outOfService;
  }
}

function nextWo() {
  db.settings.nextWo = (db.settings.nextWo || 1040) + 1;
  return `WO-${db.settings.nextWo}`;
}

/** Shop actions on a work order: start, repaired, reopen. */
export function updateWorkOrder(wo, user, b, at = Date.now()) {
  const act = b.action;
  const by = String(b.mechanic || wo.mechanic || user.name).slice(0, 80);
  if (act === 'start') {
    if (wo.status === 'repaired') return 'This work order is already closed.';
    Object.assign(wo, { status: 'in_progress', mechanic: by, startedAt: at });
    wo.history.push({ t: at, by, text: 'Repair started' });
  } else if (act === 'repaired') {
    const note = String(b.note || '').trim();
    if (!note) return 'Describe the repair.';
    Object.assign(wo, { status: 'repaired', mechanic: by, repairedAt: at, repairNote: note.slice(0, 600), cost: Number(b.cost) > 0 ? Math.round(Number(b.cost) * 100) / 100 : null, certifiedBy: by });
    wo.history.push({ t: at, by, text: `Repaired — ${note}` });
  } else if (act === 'reopen') {
    Object.assign(wo, { status: 'open', repairedAt: null, ackAt: null, ackBy: null });
    wo.history.push({ t: at, by: user.name, text: 'Reopened' });
  } else if (act === 'note') {
    const note = String(b.note || '').trim();
    if (!note) return 'Write a note.';
    wo.history.push({ t: at, by: user.name, text: note.slice(0, 600) });
  } else return 'Unknown action.';
  return null;
}

export function inspectionRoutes(app, auth, role) {
  app.post('/api/inspections', auth, role('driver', 'dispatcher'), (req, res) => {
    const b = { ...(req.body || {}) };
    if (req.user.role === 'driver') b.truckId = req.user.truckId;
    const r = recordInspection(req.user, b);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json(r.inspection);
  });

  app.post('/api/work-orders/:id', auth, role('dispatcher'), (req, res) => {
    const wo = find('workOrders', req.params.id);
    if (!wo || wo.carrierId !== req.user.companyId) return res.status(404).json({ error: 'Work order not found.' });
    const err = updateWorkOrder(wo, req.user, req.body || {});
    if (err) return res.status(400).json({ error: err });
    syncService(wo.unit === 'truck' ? 'trucks' : 'trailers', wo.unit === 'truck' ? wo.truckId : wo.trailerId);
    save();
    publish('workOrders', wo);
    if (req.body?.action === 'repaired') {
      const truck = find('trucks', wo.truckId);
      notify((v) => v.role === 'driver' && v.companyId === wo.carrierId && (v.truckId === wo.truckId || v.id === wo.reportedById), {
        title: `🔧 ${wo.unitLabel} repaired`, body: `${wo.repairNote}. Confirm it on your next inspection.${truck?.outOfService ? '' : ' Back in service.'}`, tone: 'ok',
      });
    }
    res.json(wo);
  });
}
