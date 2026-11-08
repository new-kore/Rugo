// Business reports for the carrier: money, payroll, drivers, trucks, operations, fuel, customers.
// Everything is computed from the data already in the app for a [from, to) period, plus the same-length period before it.
import { scorecards, fleetAverages, punctuality } from '../../server/scorecard.js';
import { planVsActual } from '../../server/routecheck.js';

const H = 3.6e6;
const DAY = 864e5;
const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : null);
const pct = (n, d) => (d ? (n / d) * 100 : null);
export const change = (now, prev) => (prev ? ((now - prev) / Math.abs(prev)) * 100 : null);

/* ------------------------------ periods ------------------------------ */

const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const startOfWeek = (t) => { const d = new Date(startOfDay(t)); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.getTime(); }; // Monday

export function periodRange(key, custom, now = Date.now()) {
  const d = new Date(now);
  switch (key) {
    case 'this_week': return { from: startOfWeek(now), to: now, label: 'This week' };
    case 'last_week': { const s = startOfWeek(now) - 7 * DAY; return { from: s, to: s + 7 * DAY, label: 'Last week' }; }
    case 'this_month': return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now, label: d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) };
    case 'last_month': { const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); return { from: s.getTime(), to: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), label: s.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) }; }
    case 'last_90': return { from: now - 90 * DAY, to: now, label: 'Last 90 days' };
    case 'this_quarter': { const q = Math.floor(d.getMonth() / 3); return { from: new Date(d.getFullYear(), q * 3, 1).getTime(), to: now, label: `Q${q + 1} ${d.getFullYear()}` }; }
    case 'ytd': return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: now, label: `${d.getFullYear()} year to date` };
    case 'custom': if (custom?.from && custom?.to) return { from: startOfDay(custom.from), to: startOfDay(custom.to) + DAY, label: 'Custom range' };
    // falls through
    default: return { from: now - 30 * DAY, to: now, label: 'Last 30 days' };
  }
}

/* ------------------------------ helpers ------------------------------ */

const isOn = (l, id) => l.driverId === id || (l.teamDriverIds || []).includes(id);
const share = (l) => 1 / (1 + (l.teamDriverIds || []).length);
const customerOf = (l, companies) => l.customer || companies.find((c) => c.id === l.shipperId)?.name || 'Direct';
const clip = (s, from, to) => Math.max(0, (Math.min(s.end || Date.now(), to) - Math.max(s.start, from)) / H);

/** Buckets for trend charts: daily up to 2 weeks, weekly up to ~4 months, monthly beyond. */
export function buckets(from, to) {
  const days = (to - from) / DAY;
  const out = [];
  if (days <= 15) for (let t = startOfDay(from); t < to; t += DAY) out.push({ from: t, to: t + DAY, label: new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) });
  else if (days <= 125) for (let t = startOfWeek(from); t < to; t += 7 * DAY) out.push({ from: t, to: t + 7 * DAY, label: `wk ${new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` });
  else { const d = new Date(from); d.setDate(1); d.setHours(0, 0, 0, 0); while (d.getTime() < to) { const s = d.getTime(); d.setMonth(d.getMonth() + 1); out.push({ from: s, to: d.getTime(), label: new Date(s).toLocaleDateString('en-CA', { month: 'short' }) }); } }
  return out;
}

/* ------------------------------ payroll ------------------------------ */

/** Gross pay per driver: hourly = paid shift hours (overtime ×1.5 above `otAfter` h in a Mon–Sun week); per-km = km driven × rate. */
export function payroll(drivers, ctx, from, to, otAfter = 60) {
  const { loads, shifts } = ctx;
  return drivers.map((d) => {
    const done = loads.filter((l) => isOn(l, d.id) && l.status === 'delivered' && l.deliveredAt >= from && l.deliveredAt < to);
    const km = sum(done, (l) => ((l.metrics?.deadheadKm || 0) + (l.metrics?.loadedKm || 0)) * share(l));
    const myShifts = shifts.filter((s) => s.driverId === d.id && s.start < to && (s.end || Date.now()) > from);
    const weeks = {};
    for (const s of myShifts) {
      // Split each shift across days so a shift over midnight Sunday lands in the right week.
      for (let t = Math.max(s.start, from); t < Math.min(s.end || Date.now(), to);) {
        const dayEnd = Math.min(startOfDay(t) + DAY, s.end || Date.now(), to);
        const wk = startOfWeek(t);
        weeks[wk] = (weeks[wk] || 0) + (dayEnd - t) / H;
        t = dayEnd;
      }
    }
    const weekRows = Object.entries(weeks).map(([wk, h]) => ({ week: Number(wk), hours: h, regular: Math.min(h, otAfter), overtime: Math.max(0, h - otAfter) })).sort((a, b) => a.week - b.week);
    const hours = sum(weekRows, (w) => w.hours);
    const regular = sum(weekRows, (w) => w.regular); const overtime = sum(weekRows, (w) => w.overtime);
    const driveH = sum(done, (l) => (l.metrics?.driveHours || 0) * share(l));
    const hourly = d.payType !== 'per_km';
    const gross = hourly ? (regular + overtime * 1.5) * (d.hourlyRate || 0) : km * (d.perKmRate || 0);
    const revenue = sum(done, (l) => (l.economics?.revenue || 0) * share(l));
    for (const w of weekRows) {
      const wkLoads = done.filter((l) => startOfWeek(l.deliveredAt) === w.week);
      w.km = sum(wkLoads, (l) => ((l.metrics?.deadheadKm || 0) + (l.metrics?.loadedKm || 0)) * share(l));
      w.loads = wkLoads.length;
      w.gross = hourly ? (w.regular + w.overtime * 1.5) * (d.hourlyRate || 0) : w.km * (d.perKmRate || 0);
    }
    return {
      driver: d, hourly, rate: hourly ? d.hourlyRate : d.perKmRate, loads: done.length, km, hours, regular, overtime, driveH, idleH: Math.max(0, hours - driveH),
      gross, perLoad: done.length ? gross / done.length : null, pctOfRevenue: pct(gross, revenue), revenue, weeks: weekRows,
    };
  });
}

/* ------------------------------ main ------------------------------ */

export function buildReport(data, from, to) {
  const me = data.me;
  const drivers = data.users.filter((u) => u.role === 'driver');
  const own = data.loads.filter((l) => l.carrierId === me.companyId);
  const ctx = { drivers, trucks: data.trucks, loads: own, shifts: data.shifts || [], fuelLogs: data.fuelLogs || [], settings: data.settings };
  const inP = (l) => l.status === 'delivered' && l.deliveredAt >= from && l.deliveredAt < to;
  const jobs = own.filter(inP).filter((l) => l.economics);
  const len = to - from;
  const prevJobs = own.filter((l) => l.status === 'delivered' && l.deliveredAt >= from - len && l.deliveredAt < from && l.economics);

  const money = (js) => {
    const revenue = sum(js, (l) => l.economics.revenue); const cost = sum(js, (l) => l.economics.cost);
    const pay = sum(js, (l) => l.economics.driverPay); const fuel = sum(js, (l) => l.economics.fuelCost); const truck = sum(js, (l) => l.economics.overhead);
    const km = sum(js, (l) => l.economics.totalKm); const empty = sum(js, (l) => l.metrics?.deadheadKm || 0);
    const detention = sum(js, (l) => (l.invoice?.lines || []).filter((x) => x.key === 'detention').reduce((a, x) => a + x.amount, 0));
    const pu = js.map((l) => punctuality(l, 'pickup')).filter(Boolean); const de = js.map((l) => punctuality(l, 'delivery')).filter(Boolean);
    return {
      loads: js.length, revenue, cost, profit: revenue - cost, margin: pct(revenue - cost, revenue), pay, fuel, truck, km, empty, emptyPct: pct(empty, km),
      revPerKm: km ? revenue / km : null, costPerKm: km ? cost / km : null, profitPerLoad: js.length ? (revenue - cost) / js.length : null, detention,
      onTimePickup: pct(pu.filter((x) => x.kind !== 'late').length, pu.length), onTimeDelivery: pct(de.filter((x) => x.kind !== 'late').length, de.length),
      litres: sum(js, (l) => l.economics.litres), damage: js.filter((l) => l.damage?.hasDamage).length,
    };
  };
  const m = money(jobs); const p = money(prevJobs);
  m.lPer100 = m.km ? (m.litres / m.km) * 100 : null; p.lPer100 = p.km ? (p.litres / p.km) * 100 : null;

  // Trend.
  const trend = buckets(from, to).map((b) => {
    const js = jobs.filter((l) => l.deliveredAt >= b.from && l.deliveredAt < b.to);
    return { ...b, loads: js.length, revenue: sum(js, (l) => l.economics.revenue), profit: sum(js, (l) => l.economics.margin), km: sum(js, (l) => l.economics.totalKm), cost: sum(js, (l) => l.economics.cost) };
  });

  // Receivables.
  const invoiced = own.filter((l) => l.invoice && l.invoice.issuedAt >= from && l.invoice.issuedAt < to);
  const open = own.filter((l) => l.invoice && !l.invoice.paid);
  const ar = {
    billed: sum(invoiced, (l) => l.invoice.total), paid: sum(invoiced.filter((l) => l.invoice.paid), (l) => l.invoice.total),
    open: sum(open, (l) => l.invoice.total), openCount: open.length,
    aging: [[0, 30], [30, 60], [60, 9999]].map(([a, b]) => { const xs = open.filter((l) => { const d = (Date.now() - l.invoice.issuedAt) / DAY; return d >= a && d < b; }); return { label: b > 999 ? `${a}+ days` : `${a}–${b} days`, count: xs.length, amount: sum(xs, (l) => l.invoice.total) }; }),
    openList: open.sort((a, b) => a.invoice.issuedAt - b.invoice.issuedAt).map((l) => ({ ...l, customerName: customerOf(l, data.companies), daysOpen: Math.floor((Date.now() - l.invoice.issuedAt) / DAY) })),
  };

  // Customers and lanes.
  const group = (key) => Object.values(jobs.reduce((acc, l) => {
    const k = key(l);
    const a = acc[k] ||= { key: k, loads: 0, revenue: 0, profit: 0, km: 0, late: 0, stops: 0, sample: l };
    a.loads++; a.revenue += l.economics.revenue; a.profit += l.economics.margin; a.km += l.metrics?.loadedKm || 0;
    for (const s of ['pickup', 'delivery']) { const x = punctuality(l, s); if (x) { a.stops++; if (x.kind === 'late') a.late++; } }
    return acc;
  }, {})).map((a) => ({ ...a, margin: pct(a.profit, a.revenue), perKm: a.km ? a.revenue / a.km : null, profitPerKm: a.km ? a.profit / a.km : null, onTime: a.stops ? pct(a.stops - a.late, a.stops) : null }));
  const customers = group((l) => customerOf(l, data.companies)).sort((a, b) => b.revenue - a.revenue);
  const lanes = group((l) => `${l.pickup.city} → ${l.dropoff.city}`).sort((a, b) => b.profit - a.profit);

  // Drivers.
  const days = Math.max(1, Math.round(len / DAY));
  const cards = scorecards(drivers, ctx, days, to);
  const fleet = fleetAverages(cards);
  const pay = payroll(drivers, ctx, from, to);

  // Trucks.
  const trucks = data.trucks.map((t) => {
    const js = jobs.filter((l) => l.truckId === t.id);
    const fuelLogs = ctx.fuelLogs.filter((f) => f.truckId === t.id && f.t >= from && f.t < to);
    const km = sum(js, (l) => l.economics.totalKm); const litres = sum(fuelLogs, (f) => f.litres);
    const activeDays = new Set(own.filter((l) => l.truckId === t.id && l.startedAt && l.startedAt < to && (l.deliveredAt || Date.now()) >= from)
      .flatMap((l) => { const out = []; for (let x = startOfDay(Math.max(l.startedAt, from)); x < Math.min(l.deliveredAt || Date.now(), to); x += DAY) out.push(x); return out; })).size;
    const revenue = sum(js, (l) => l.economics.revenue); const profit = sum(js, (l) => l.economics.margin);
    return {
      truck: t, loads: js.length, km, revenue, profit, revPerKm: km ? revenue / km : null, revPerDay: revenue / days, utilization: pct(activeDays, days),
      litres, fuelSpend: sum(fuelLogs, (f) => f.total), lPer100: km > 50 && litres ? (litres / km) * 100 : null, serviceInKm: (t.nextServiceKm || 0) - (t.odometerKm || 0), damage: js.filter((l) => l.damage?.hasDamage).length,
    };
  }).sort((a, b) => b.profit - a.profit);

  // Operations.
  const plans = jobs.map((l) => ({ l, pv: planVsActual(l, data.settings) }));
  const driveRows = plans.map(({ l, pv }) => ({ l, r: pv.rows.find((x) => x.key === 'toDropoff') })).filter((x) => x.r?.done && x.r.projH > 0);
  const routeEvents = own.flatMap((l) => (l.routeEvents || []).filter((e) => e.kind === 'off' && e.t >= from && e.t < to).map((e) => ({ ...e, load: l })));
  const cancelled = own.filter((l) => l.status === 'cancelled' && (l.updatedAt || 0) >= from && (l.updatedAt || 0) < to);
  const ops = {
    dwellPickup: avg(jobs.map((l) => l.metrics?.dwellHours?.pickup || 0)), dwellDelivery: avg(jobs.map((l) => l.metrics?.dwellHours?.delivery || 0)),
    detentionLoads: jobs.filter((l) => (l.invoice?.lines || []).some((x) => x.key === 'detention')).length,
    driveVsPlan: avg(driveRows.map(({ r }) => ((r.actH - r.projH) / r.projH) * 100)), wayOff: driveRows.filter(({ r }) => r.verdict?.key === 'way_off'),
    routeEvents, cancelled, damage: jobs.filter((l) => l.damage?.hasDamage),
    lateStops: jobs.flatMap((l) => ['pickup', 'delivery'].map((s) => ({ l, s, p: punctuality(l, s) }))).filter((x) => x.p?.kind === 'late').sort((a, b) => b.p.min - a.p.min),
    response: avg(Object.values(cards).filter((c) => c.response.n).map((c) => c.response.avgMin)),
    hosViolations: sum(drivers, (d) => (d.hosEvents || []).filter((e) => e.kind === 'violation' && e.t >= from && e.t < to).length),
  };

  // Fuel.
  const logs = ctx.fuelLogs.filter((f) => f.t >= from && f.t < to);
  const fuel = {
    fillUps: logs.length, litres: sum(logs, (f) => f.litres), spend: sum(logs, (f) => f.total), avgPrice: sum(logs, (f) => f.litres) ? sum(logs, (f) => f.total) / sum(logs, (f) => f.litres) : null,
    receiptPct: pct(logs.filter((f) => f.receiptUrl).length, logs.length), missingReceipts: logs.filter((f) => !f.receiptUrl),
    byStation: Object.values(logs.reduce((a, f) => { const x = a[f.station] ||= { station: f.station, fillUps: 0, litres: 0, spend: 0 }; x.fillUps++; x.litres += f.litres; x.spend += f.total; return a; }, {})).map((x) => ({ ...x, price: x.litres ? x.spend / x.litres : null })).sort((a, b) => b.spend - a.spend),
    unlinked: logs.filter((f) => !f.loadId).length,
  };

  const report = { from, to, days, m, p, trend, ar, customers, lanes, cards, fleet, pay, trucks, ops, fuel, jobs, drivers };
  report.insights = insights(report);
  return report;
}

/* ------------------------------ talking points ------------------------------ */

function insights(r) {
  const { m, p } = r; const good = []; const work = [];
  const f0 = (x) => Math.round(x).toLocaleString('en-CA'); const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('en-CA');
  const $ = (x) => `$${f0(x)}`;
  const ch = (a, b) => change(a, b);
  if (p.loads) {
    const rv = ch(m.revenue, p.revenue); if (rv != null) (rv >= 0 ? good : work).push(`Revenue ${rv >= 0 ? 'up' : 'down'} ${f0(Math.abs(rv))}% vs the previous period (${$(m.revenue)} vs ${$(p.revenue)}).`);
    if (m.margin != null && p.margin != null) (m.margin >= p.margin ? good : work).push(`Margin ${f1(m.margin)}% (was ${f1(p.margin)}%).`);
    if (m.emptyPct != null && p.emptyPct != null && Math.abs(m.emptyPct - p.emptyPct) >= 1) (m.emptyPct < p.emptyPct ? good : work).push(`Empty kilometres ${f1(m.emptyPct)}% of driving (was ${f1(p.emptyPct)}%).`);
    if (m.lPer100 && p.lPer100 && Math.abs(m.lPer100 - p.lPer100) >= 0.3) (m.lPer100 < p.lPer100 ? good : work).push(`Fuel economy ${f1(m.lPer100)} L/100 km (was ${f1(p.lPer100)}).`);
  } else if (m.loads) good.push(`${m.loads} loads delivered for ${$(m.revenue)} revenue and ${$(m.profit)} profit.`);
  if (m.onTimePickup != null) (m.onTimePickup >= 90 ? good : work).push(`On-time pickups ${f0(m.onTimePickup)}%, deliveries ${f0(m.onTimeDelivery ?? 0)}%.`);
  const ranked = Object.values(r.cards).filter((c) => c.loads).sort((a, b) => b.score.total - a.score.total);
  const name = (c) => r.drivers.find((d) => d.id === c.driverId)?.name;
  if (ranked[0]) good.push(`Top driver: ${name(ranked[0])} — score ${ranked[0].score.total}, ${$(ranked[0].money.profit)} profit.`);
  if (ranked.length > 1 && ranked[ranked.length - 1].score.total < 70) work.push(`${name(ranked[ranked.length - 1])} scored ${ranked[ranked.length - 1].score.total} — review on-time and response with them.`);
  if (r.lanes[0]?.profit > 0) good.push(`Best lane: ${r.lanes[0].key} — ${$(r.lanes[0].profit)} profit over ${r.lanes[0].loads} load${r.lanes[0].loads > 1 ? 's' : ''}.`);
  const losing = r.lanes.filter((l) => l.profit < 0); if (losing.length) work.push(`${losing.length} lane${losing.length > 1 ? 's' : ''} lost money: ${losing.map((l) => l.key).slice(0, 3).join(', ')}.`);
  if (r.ar.open > 0) work.push(`${$(r.ar.open)} unpaid across ${r.ar.openCount} invoice${r.ar.openCount > 1 ? 's' : ''}${r.ar.aging[2].count ? ` (${r.ar.aging[2].count} over 60 days)` : ''}.`);
  const idleCost = r.pay.reduce((a, x) => a + (x.hourly ? x.idleH * (x.driver.hourlyRate || 0) : 0), 0);
  if (idleCost > 200) work.push(`About ${$(idleCost)} of hourly pay went to time not driving (docks, waiting).`);
  if (r.ops.detentionLoads) good.push(`Detention billed on ${r.ops.detentionLoads} load${r.ops.detentionLoads > 1 ? 's' : ''} (${$(m.detention)}).`);
  if (r.ops.routeEvents.length) work.push(`${r.ops.routeEvents.length} route change${r.ops.routeEvents.length > 1 ? 's' : ''} off the planned fastest route.`);
  if (r.ops.wayOff.length) work.push(`${r.ops.wayOff.length} trip${r.ops.wayOff.length > 1 ? 's' : ''} took far longer than projected.`);
  if (m.damage) work.push(`${m.damage} damage claim${m.damage > 1 ? 's' : ''}.`); else if (m.loads) good.push('No damage claims.');
  if (r.fuel.fillUps && r.fuel.receiptPct < 100) work.push(`${r.fuel.missingReceipts.length} fill-up${r.fuel.missingReceipts.length > 1 ? 's' : ''} without a receipt photo.`);
  const svc = r.trucks.filter((t) => t.serviceInKm <= 0); if (svc.length) work.push(`Service overdue on ${svc.map((t) => `Unit ${t.truck.unit}`).join(', ')}.`);
  if (r.ops.hosViolations) work.push(`${r.ops.hosViolations} hours-of-service violation${r.ops.hosViolations > 1 ? 's' : ''}.`);
  return { good, work };
}

/* ------------------------------ CSV ------------------------------ */

export function downloadCsv(name, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
