// Planned vs actual trip time, and "is the truck still on the planned route?".
// Pure functions shared by the server (live checks) and the browser (load detail, scorecards).
import { haversine } from './geo.js';

const H = 3.6e6;
const MIN = 60000;
export const DOCK_ALLOWANCE_H = 1; // planned time to load or unload

/** Shortest distance (km) from a point to a polyline, using a local flat projection. */
export function distanceToPath(p, points) {
  if (!points?.length) return null;
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180); const ky = 110.57;
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const ax = (points[i - 1].lng - p.lng) * kx; const ay = (points[i - 1].lat - p.lat) * ky;
    const bx = (points[i].lng - p.lng) * kx; const by = (points[i].lat - p.lat) * ky;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return points.length === 1 ? haversine(p, points[0]) : best;
}

/** How far off the planned line counts as "a different route". Estimated lines aren't real roads, so they get a wide margin. */
export const offRouteKm = (leg) => (leg?.source === 'estimate' ? 12 : 1.2);

const legHours = (leg, km, s) => (leg?.durationH || (km || leg?.distanceKm || 0) / (s?.avgSpeedKmh || 82));

/** Verdict for actual vs projected hours. */
export function verdict(projH, actH) {
  if (projH == null || actH == null) return null;
  const diffMin = (actH - projH) * 60;
  const pct = projH > 0 ? (diffMin / (projH * 60)) * 100 : 0;
  const near = Math.max(15, projH * 60 * 0.1); const off = Math.max(45, projH * 60 * 0.3);
  if (diffMin < -near) return { key: 'faster', label: 'Faster', tone: 'blue', diffMin, pct };
  if (diffMin <= near) return { key: 'on_pace', label: 'About the same', tone: 'green', diffMin, pct };
  if (diffMin <= off) return { key: 'slow', label: 'A bit slower', tone: 'orange', diffMin, pct };
  return { key: 'way_off', label: 'Way off', tone: 'red', diffMin, pct };
}

/** Rows for each part of the trip: projected vs actual time (and km for driving legs). Live loads get an elapsed / ETA row. */
export function planVsActual(load, s, now = Date.now()) {
  const L = load.legs || {}; const m = load.metrics || {};
  const toPickupKm = L.toPickup?.distanceKm ?? null;
  const loadedKm = L.toDropoff?.distanceKm ?? load.quote?.distanceKm ?? null;
  const span = (a, b) => (a ? ((b || now) - a) / H : null);
  const rows = [
    { key: 'toPickup', label: 'Drive to pickup', projH: L.toPickup ? legHours(L.toPickup, toPickupKm, s) : null, actH: span(load.startedAt, load.arrivedPickupAt), done: !!load.arrivedPickupAt, projKm: toPickupKm, actKm: m.deadheadKm },
    { key: 'loading', label: 'Loading', projH: DOCK_ALLOWANCE_H, actH: span(load.arrivedPickupAt, load.departedPickupAt), done: !!load.departedPickupAt },
    { key: 'toDropoff', label: 'Drive to delivery', projH: load.quote?.driveHours || legHours(L.toDropoff, loadedKm, s), actH: span(load.departedPickupAt, load.arrivedDeliveryAt), done: !!load.arrivedDeliveryAt, projKm: loadedKm, actKm: m.loadedKm },
    { key: 'unloading', label: 'Unloading', projH: DOCK_ALLOWANCE_H, actH: span(load.arrivedDeliveryAt, load.deliveredAt), done: !!load.deliveredAt },
  ].filter((r) => r.projH != null);
  for (const r of rows) {
    r.started = r.actH != null;
    r.verdict = r.done ? verdict(r.projH, r.actH) : null;
    // While a part is still running, flag it once it's already past the projection.
    if (r.started && !r.done && r.actH > r.projH) r.verdict = { ...verdict(r.projH, r.actH), live: true };
  }
  const projTotal = rows.reduce((a, r) => a + r.projH, 0);
  const actTotal = load.startedAt ? span(load.startedAt, load.deliveredAt) : null;
  const total = { projH: projTotal, actH: actTotal, done: !!load.deliveredAt, verdict: load.deliveredAt ? verdict(projTotal, actTotal) : null };
  // Live: projected finish if the rest goes to plan, compared with the original plan.
  if (load.startedAt && !load.deliveredAt && load.eta?.deliveryAt) {
    const plannedFinish = load.startedAt + projTotal * H;
    total.etaAt = load.eta.deliveryAt + DOCK_ALLOWANCE_H * H;
    total.plannedFinish = plannedFinish;
    total.behindMin = Math.round((total.etaAt - plannedFinish) / MIN);
  }
  return { rows, total, routeEvents: load.routeEvents || [] };
}
