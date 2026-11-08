// AI dispatch: ranks drivers for a load by distance, availability, hours left, cost, lane history and performance.
// Pure functions over plain data, shared by the server (auto-dispatch) and the browser (Accept / Add route sheets).
import { haversine } from './geo.js';
import { scorecard } from './scorecard.js';

const H = 3.6e6;
const ROAD = 1.25; // straight line → road km
const SPEED = 75; // km/h for deadhead estimates
const ACTIVE = ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'];
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const hm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) + (m || 0) / 60; };
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });

export const WEIGHTS = { distance: 25, timing: 20, cost: 20, lane: 15, hours: 10, performance: 10 };

/** Is the driver scheduled to work at time t? null = no schedule on file. */
function onSchedule(driver, t) {
  const s = driver.schedule;
  if (!s) return null;
  const d = new Date(t);
  const day = s[d.getDay()] ?? s[String(d.getDay())];
  if (!day) return false;
  const h = d.getHours() + d.getMinutes() / 60;
  const a = hm(day.start); const b = hm(day.end);
  return b > a ? h >= a - 1 && h <= b : h >= a - 1 || h <= b; // an hour of slack before the shift
}

/** Where and when the driver can start this load. */
function startPoint(driver, truck, loads, now) {
  const cur = loads.find((l) => ACTIVE.includes(l.status) && (l.driverId === driver.id || (l.teamDriverIds || []).includes(driver.id)));
  if (!cur) return { pos: truck?.location, freeAt: now, busyWith: null };
  const freeAt = Math.max(now, cur.eta?.deliveryAt || now + 4 * H) + 0.75 * H; // unload + paperwork
  return { pos: cur.dropoff, freeAt, busyWith: cur };
}

function laneHistory(driver, load, loads) {
  let same = 0; let near = 0;
  for (const l of loads) {
    if (l.status !== 'delivered' || !(l.driverId === driver.id || (l.teamDriverIds || []).includes(driver.id))) continue;
    const a = haversine(l.pickup, load.pickup) < 40; const b = haversine(l.dropoff, load.dropoff) < 60;
    if (a && b) same++; else if (a || b) near++;
  }
  return { same, near };
}

/** Rank every driver for `load`. ctx: { drivers, trucks, loads, shifts, fuelLogs, settings, now, cards? } */
export function rankDrivers(load, ctx) {
  const now = ctx.now || Date.now();
  const s = ctx.settings || {};
  const fuelPerKm = ((s.fuelPricePerL || 1.62) * 36) / 100;
  const overhead = s.overheadPerKm ?? 0.92;
  const tripKm = load.quote?.distanceKm || haversine(load.pickup, load.dropoff) * ROAD;
  const tripH = load.quote?.driveHours || tripKm / 82;
  const pickupBy = load.pickupWindow?.to ?? load.pickupWindow?.from ?? now + 6 * H;
  const pickupFrom = load.pickupWindow?.from ?? now;
  const payout = load.quote?.carrierPayout || 0;
  const excluded = new Set([load.driverId, ...(load.teamDriverIds || [])].filter(Boolean));

  const rows = ctx.drivers.filter((d) => d.role === 'driver' && !excluded.has(d.id)).map((d) => {
    const truck = ctx.trucks.find((t) => t.id === d.truckId);
    const reasons = []; const blockers = [];
    if (!truck) blockers.push('No truck assigned');
    if (d.licenseExpiry && d.licenseExpiry < pickupBy) blockers.push('Licence expired');
    const off = (d.timeOff || []).find((o) => o.from <= pickupBy && o.to >= pickupFrom);
    if (off) blockers.push(`Time off${off.reason ? ` (${off.reason.toLowerCase()})` : ''}`);
    if (d.status === 'off_duty' && !off) blockers.push('Off duty');

    const sp = startPoint(d, truck, ctx.loads, now);
    const deadKm = sp.pos ? haversine(sp.pos, load.pickup) * ROAD : 300;
    const deadH = deadKm / SPEED;
    const arriveAt = Math.max(sp.freeAt + deadH * H, pickupFrom);
    const lateMin = Math.round((sp.freeAt + deadH * H - pickupBy) / 60000);
    if (sp.busyWith && (!ctx.allowBusy || lateMin > 60)) blockers.push(`On ${sp.busyWith.ref} until ${fmtTime(sp.freeAt)}`);

    // Distance (deadhead): 0 km → 100, 250 km+ → 0.
    const distance = clamp(100 - (deadKm / 250) * 100);
    reasons.push({ k: 'distance', tone: deadKm < 40 ? 'green' : deadKm < 120 ? 'gray' : 'orange', text: `${Math.round(deadKm)} km ${sp.busyWith ? 'from next drop' : 'away'}` });

    // Timing: can they make the pickup window, and are they on shift then?
    let timing = lateMin <= 0 ? 100 : clamp(100 - lateMin);
    if (sp.busyWith) { timing -= 15; reasons.push({ k: 'timing', tone: lateMin <= 0 ? 'gray' : 'orange', text: `Free at ${fmtTime(sp.freeAt)} after ${sp.busyWith.ref}` }); }
    else reasons.push({ k: 'timing', tone: lateMin <= 0 ? 'green' : 'orange', text: lateMin <= 0 ? 'Available now' : `${lateMin} min late to pickup` });
    const sched = onSchedule(d, arriveAt);
    if (sched === false) { timing -= 25; reasons.push({ k: 'timing', tone: 'orange', text: 'Outside their schedule' }); }

    // Hours of service: official ELD clocks if connected.
    const needMin = (deadH + tripH) * 60;
    const h = d.hos;
    const leftMin = h ? Math.min(...[h.driveLeftMin, h.shiftLeftMin, h.cycleLeftMin].filter((x) => x !== null && x !== undefined)) : null;
    let hours = 75;
    if (Number.isFinite(leftMin)) {
      if (h.flag === 'violation' || leftMin <= 0) { hours = 0; blockers.push('Out of hours (ELD)'); }
      else if (leftMin >= needMin) { hours = 100; reasons.push({ k: 'hours', tone: 'green', text: `${Math.floor(leftMin / 60)} h ${leftMin % 60} min of hours left` }); }
      else { hours = clamp((leftMin / needMin) * 60); reasons.push({ k: 'hours', tone: 'orange', text: `Needs a reset en route (${Math.floor(leftMin / 60)} h left)` }); }
    }

    // Cost for this job: pay + fuel + overhead on deadhead and loaded km.
    const totalKm = deadKm + tripKm;
    const pay = d.payType === 'per_km' ? totalKm * (d.perKmRate || 0) : (deadH + tripH + 2) * (d.hourlyRate || 0);
    const cost = pay + totalKm * (fuelPerKm + overhead);
    const margin = payout - cost;

    // Lane familiarity.
    const lane = laneHistory(d, load, ctx.loads);
    const laneScore = clamp(lane.same * 35 + lane.near * 10);
    if (lane.same) reasons.push({ k: 'lane', tone: 'green', text: `Ran this lane ${lane.same}×` });
    else if (lane.near) reasons.push({ k: 'lane', tone: 'gray', text: `Knows the area (${lane.near} nearby runs)` });

    // Equipment.
    const eqOk = truck && (!load.cargo?.equipment || truck.equipment === load.cargo.equipment);
    if (truck && !eqOk) reasons.push({ k: 'equipment', tone: 'orange', text: 'Different trailer type' });

    // Performance from the scorecard (last 90 days).
    const card = ctx.cards?.[d.id] || scorecard(d, ctx, now - 90 * 24 * H, now);
    const performance = card.score.total;
    if (card.pickup.n && card.pickup.onTimePct >= 95) reasons.push({ k: 'performance', tone: 'green', text: `${card.pickup.onTimePct}% on-time pickups` });
    if (card.pickup.n && card.pickup.onTimePct < 75) reasons.push({ k: 'performance', tone: 'orange', text: `Only ${card.pickup.onTimePct}% on-time pickups` });

    return { driver: d, truck, sp, deadKm, lateMin, arriveAt, leftMin, needMin, pay, cost, margin, lane, eqOk, card, blockers, reasons, parts: { distance, timing: clamp(timing), hours, lane: laneScore, performance } };
  });

  // Cost is scored relative to the cheapest eligible option.
  const eligible = rows.filter((r) => !r.blockers.length);
  const costs = eligible.map((r) => r.cost);
  const lo = Math.min(...costs); const hi = Math.max(...costs);
  for (const r of rows) {
    r.parts.cost = hi > lo ? clamp(100 - ((r.cost - lo) / (hi - lo)) * 100) : 100;
    r.reasons.push({ k: 'cost', tone: r.margin > 0 ? 'green' : 'red', text: `${r.margin >= 0 ? '+' : '−'}$${Math.abs(Math.round(r.margin)).toLocaleString('en-CA')} margin` });
    let score = Object.entries(WEIGHTS).reduce((a, [k, w]) => a + (w * r.parts[k]) / 100, 0);
    if (!r.eqOk) score -= 20;
    r.score = Math.round(clamp(score));
    r.eligible = !r.blockers.length;
  }
  rows.sort((a, b) => (b.eligible - a.eligible) || b.score - a.score);
  if (rows[0]?.eligible) rows[0].best = true;
  return rows;
}

/** One-line explanation for timelines and notifications. */
export function matchSummary(r) {
  return `${r.driver.name} · match ${r.score}/100 · ${r.reasons.filter((x) => x.tone === 'green').map((x) => x.text.toLowerCase()).slice(0, 3).join(', ')}`;
}
