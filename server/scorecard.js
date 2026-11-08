// Driver scorecards: punctuality, responsiveness, idle paid time, money in/out, quality and safety.
// Pure functions over plain data so the server (auto-dispatch) and the browser (Drivers page) share them.

const H = 3.6e6;
const MIN = 60000;
const PICKUP_GRACE_MIN = 15;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));

/** Appointment for a stop: arriving after `due` (+ grace) is late, before `opens` is early. */
export function stopWindow(load, stop) {
  if (stop === 'pickup') {
    const w = load.pickupWindow;
    return w ? { opens: w.from, due: w.to ?? w.from } : null;
  }
  const w = load.deliveryWindow;
  if (w?.from) return { opens: w.from, due: w.to ?? w.from };
  // No delivery appointment: promised = pickup window close + quoted drive time + dwell allowance + 1 h buffer.
  if (!load.pickupWindow) return null;
  const due = (load.pickupWindow.to ?? load.pickupWindow.from) + ((load.quote?.driveHours || (load.quote?.distanceKm || 0) / 80) + 2) * H;
  return { opens: null, due };
}

/** Minutes late (+) or early (−) for a stop; null when not reached. */
export function punctuality(load, stop) {
  const at = stop === 'pickup' ? load.arrivedPickupAt : load.arrivedDeliveryAt;
  const w = stopWindow(load, stop);
  if (!at || !w) return null;
  if (at > w.due + PICKUP_GRACE_MIN * MIN) return { kind: 'late', min: Math.round((at - w.due) / MIN) };
  if (w.opens && at < w.opens) return { kind: 'early', min: Math.round((w.opens - at) / MIN) };
  return { kind: 'on_time', min: 0 };
}

/** Minutes from "it was time to go" to the driver tapping Start. Future-dated loads start counting at the planned departure. */
export function responseMinutes(load) {
  if (!load.acceptedAt || !load.startedAt) return null;
  const travelH = (load.metrics?.deadheadKm || 0) / 75;
  const plannedStart = load.pickupWindow?.from ? load.pickupWindow.from - travelH * H - 30 * MIN : load.acceptedAt;
  const base = Math.max(load.acceptedAt, plannedStart);
  return Math.max(0, Math.round((load.startedAt - base) / MIN));
}

const isOn = (l, id) => l.driverId === id || (l.teamDriverIds || []).includes(id);

/** One driver's scorecard for loads delivered in [from, to). */
export function scorecard(driver, ctx, from, to = Date.now()) {
  const { loads, shifts = [], fuelLogs = [] } = ctx;
  const mine = loads.filter((l) => isOn(l, driver.id));
  const done = mine.filter((l) => l.status === 'delivered' && l.deliveredAt >= from && l.deliveredAt < to);
  const active = mine.filter((l) => ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status));
  const cancelled = mine.filter((l) => l.status === 'cancelled' && (l.updatedAt || 0) >= from && (l.updatedAt || 0) < to);

  const pu = done.map((l) => punctuality(l, 'pickup')).filter(Boolean);
  const de = done.map((l) => punctuality(l, 'delivery')).filter(Boolean);
  const dist = (xs) => ({
    n: xs.length,
    onTime: xs.filter((x) => x.kind !== 'late').length, // early counts as on time
    early: xs.filter((x) => x.kind === 'early').length,
    late: xs.filter((x) => x.kind === 'late').length,
    exact: xs.filter((x) => x.kind === 'on_time').length,
    avgLateMin: avg(xs.filter((x) => x.kind === 'late').map((x) => x.min)),
    avgEarlyMin: avg(xs.filter((x) => x.kind === 'early').map((x) => x.min)),
    onTimePct: pct(xs.filter((x) => x.kind !== 'late').length, xs.length),
  });

  const resp = done.concat(active).filter((l) => l.startedAt >= from && l.startedAt < to).map(responseMinutes).filter((x) => x !== null);

  // Money: a team driver gets an even share of the job.
  const share = (l) => 1 / (1 + (l.teamDriverIds || []).length);
  const eco = done.filter((l) => l.economics);
  const revenue = sum(eco.map((l) => l.economics.revenue * share(l)));
  const cost = sum(eco.map((l) => l.economics.cost * share(l)));
  const driverPay = sum(eco.map((l) => l.economics.driverPay * share(l)));
  const fuelCost = sum(eco.map((l) => l.economics.fuelCost * share(l)));
  const totalKm = sum(done.map((l) => (l.metrics?.deadheadKm || 0) + (l.metrics?.loadedKm || 0)));
  const loadedKm = sum(done.map((l) => l.metrics?.loadedKm || 0));
  const deadheadKm = totalKm - loadedKm;
  const litres = sum(eco.map((l) => l.economics.litres));

  // Time: paid on-duty hours vs moving hours.
  const inRange = (s) => Math.max(0, (Math.min(s.end || to, to) - Math.max(s.start, from)) / H);
  const dutyH = sum(shifts.filter((s) => s.driverId === driver.id).map(inRange));
  const driveH = sum(done.map((l) => l.metrics?.driveHours || 0));
  const dwellP = done.map((l) => l.metrics?.dwellHours?.pickup || 0);
  const dwellD = done.map((l) => l.metrics?.dwellHours?.delivery || 0);
  const idleH = Math.max(0, dutyH - driveH);
  const idleCost = driver.payType === 'hourly' ? idleH * (driver.hourlyRate || 0) : 0;

  // Quality & safety.
  const damage = done.filter((l) => l.damage?.hasDamage).length;
  const photosOk = done.filter((l) => (l.photos?.pickup?.length || 0) >= 4 && (l.photos?.delivery?.length || 0) >= 4).length;
  const signed = done.filter((l) => l.signature).length;
  const myFuel = fuelLogs.filter((f) => f.driverId === driver.id && f.t >= from && f.t < to);
  const receipts = myFuel.filter((f) => f.receiptUrl).length;
  const hosViolations = (driver.hosEvents || []).filter((e) => e.kind === 'violation' && e.t >= from && e.t < to).length;
  const days = Math.max(1, (to - from) / (24 * H));

  const card = {
    driverId: driver.id, from, to,
    loads: done.length, activeLoads: active.length, cancelled: cancelled.length,
    loadsPerWeek: done.length / (days / 7),
    km: { total: totalKm, loaded: loadedKm, deadhead: deadheadKm, deadheadPct: pct(deadheadKm, totalKm) },
    pickup: dist(pu), delivery: dist(de),
    response: { avgMin: avg(resp), n: resp.length, within15Pct: pct(resp.filter((x) => x <= 15).length, resp.length) },
    time: {
      dutyH, driveH, idleH, idlePct: pct(idleH, dutyH), idleCost,
      avgDwellPickupH: avg(dwellP), avgDwellDeliveryH: avg(dwellD), utilizationPct: pct(driveH, dutyH),
    },
    money: {
      revenue, cost, driverPay, fuelCost, profit: revenue - cost, marginPct: revenue ? ((revenue - cost) / revenue) * 100 : null,
      revenuePerKm: totalKm ? revenue / totalKm : null, costPerKm: totalKm ? cost / totalKm : null,
      profitPerLoad: done.length ? (revenue - cost) / done.length : null, revenuePerDay: revenue / days,
    },
    fuel: { litres, lPer100: totalKm ? (litres / totalKm) * 100 : null, fillUps: myFuel.length, receiptPct: pct(receipts, myFuel.length) },
    quality: {
      damage, damagePct: pct(damage, done.length),
      photoPct: pct(photosOk, done.length), signaturePct: pct(signed, done.length), hosViolations,
    },
    lanes: topLanes(done),
  };
  card.score = overall(card);
  return card;
}

function topLanes(done) {
  const m = {};
  for (const l of done) {
    const k = `${l.pickup.city} → ${l.dropoff.city}`;
    m[k] = m[k] || { lane: k, runs: 0, profit: 0 };
    m[k].runs++;
    m[k].profit += l.economics ? l.economics.margin : 0;
  }
  return Object.values(m).sort((a, b) => b.runs - a.runs || b.profit - a.profit).slice(0, 5);
}

/** 0–100 overall score. Missing data is scored neutral (70) so new drivers aren't punished. */
function overall(c) {
  const N = 70;
  const parts = [
    ['On-time pickups', 20, c.pickup.n ? c.pickup.onTimePct : N],
    ['On-time deliveries', 20, c.delivery.n ? c.delivery.onTimePct : N],
    ['Profit per km', 20, c.money.revenuePerKm ? clamp(50 + ((c.money.marginPct ?? 0) * 2.5)) : N],
    ['Response time', 10, c.response.n ? clamp(100 - Math.max(0, c.response.avgMin - 10) * 2) : N],
    ['Idle paid time', 10, c.time.dutyH > 1 ? clamp(100 - Math.max(0, (c.time.idlePct ?? 0) - 25) * 2) : N],
    ['Safety & damage', 10, clamp(100 - (c.quality.damagePct ?? 0) * 2 - c.quality.hosViolations * 20)],
    ['Paperwork', 10, c.loads ? clamp(((c.quality.photoPct ?? 100) + (c.quality.signaturePct ?? 100) + (c.fuel.receiptPct ?? 100)) / 3) : N],
  ];
  const total = Math.round(sum(parts.map(([, w, v]) => (w * v) / 100)));
  return { total, grade: total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F', parts: parts.map(([label, weight, value]) => ({ label, weight, value: Math.round(value) })) };
}

/** Scorecards for every driver, ranked, with the previous period for trend arrows. */
export function scorecards(drivers, ctx, days = 30, now = Date.now()) {
  const from = now - days * 24 * H;
  const cards = drivers.map((d) => {
    const c = scorecard(d, ctx, from, now);
    const p = scorecard(d, ctx, from - days * 24 * H, from);
    c.prev = p.loads ? p.score.total : null; // no trend without history
    return c;
  });
  const ranked = [...cards].sort((a, b) => b.score.total - a.score.total);
  ranked.forEach((c, i) => { c.rank = i + 1; c.of = ranked.length; });
  return Object.fromEntries(cards.map((c) => [c.driverId, c]));
}

/** Plain-language strengths and things to work on. */
export function insights(c, fleet) {
  const good = []; const work = [];
  const f = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
  if (c.pickup.n && c.pickup.onTimePct >= 95) good.push(`On time to ${c.pickup.onTime} of ${c.pickup.n} pickups`);
  if (c.pickup.late) work.push(`Late to ${c.pickup.late} of ${c.pickup.n} pickups (avg ${f(c.pickup.avgLateMin)} min)`);
  if (c.delivery.late) work.push(`Late to ${c.delivery.late} of ${c.delivery.n} deliveries (avg ${f(c.delivery.avgLateMin)} min)`);
  if (c.response.n && c.response.avgMin <= 10) good.push(`Rolls fast — ${f(c.response.avgMin)} min to start after dispatch`);
  if (c.response.n && c.response.avgMin > 30) work.push(`Slow to start — ${f(c.response.avgMin)} min on average after dispatch`);
  if (c.time.idlePct !== null && c.time.idlePct > 50 && c.time.dutyH > 4) work.push(`${c.time.idlePct}% of paid time not driving, incl. dock time (${f(c.time.idleH, 1)} h)`);
  if (fleet?.marginPct != null && c.money.marginPct != null && c.money.marginPct > fleet.marginPct + 3) good.push(`Margin ${f(c.money.marginPct)}% vs fleet ${f(fleet.marginPct)}%`);
  if (fleet?.marginPct != null && c.money.marginPct != null && c.money.marginPct < fleet.marginPct - 5) work.push(`Margin ${f(c.money.marginPct)}% vs fleet ${f(fleet.marginPct)}%`);
  if (fleet?.lPer100 && c.fuel.lPer100 && c.fuel.lPer100 < fleet.lPer100 * 0.96) good.push(`Fuel-efficient: ${f(c.fuel.lPer100, 1)} L/100 km vs fleet ${f(fleet.lPer100, 1)}`);
  if (fleet?.lPer100 && c.fuel.lPer100 && c.fuel.lPer100 > fleet.lPer100 * 1.05) work.push(`Uses more fuel: ${f(c.fuel.lPer100, 1)} L/100 km vs fleet ${f(fleet.lPer100, 1)}`);
  if (c.quality.damage) work.push(`${c.quality.damage} damage report${c.quality.damage > 1 ? 's' : ''}`);
  if (c.quality.hosViolations) work.push(`${c.quality.hosViolations} HOS violation${c.quality.hosViolations > 1 ? 's' : ''}`);
  if (c.fuel.fillUps && c.fuel.receiptPct < 100) work.push(`${100 - c.fuel.receiptPct}% of fill-ups missing receipts`);
  if (c.lanes[0]?.runs >= 2) good.push(`Knows ${c.lanes[0].lane} (${c.lanes[0].runs} runs)`);
  return { good, work };
}

/** Fleet averages for comparison. */
export function fleetAverages(cards) {
  const cs = Object.values(cards).filter((c) => c.loads);
  const rev = sum(cs.map((c) => c.money.revenue)); const cost = sum(cs.map((c) => c.money.cost));
  const litres = sum(cs.map((c) => c.fuel.litres)); const km = sum(cs.map((c) => c.km.total));
  return { marginPct: rev ? ((rev - cost) / rev) * 100 : null, lPer100: km ? (litres / km) * 100 : null, score: avg(Object.values(cards).map((c) => c.score.total)) };
}
