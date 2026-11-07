// Rate card, quotes, final invoices and carrier-side job economics.
export const EQUIPMENT = {
  dry_van: { label: 'Dry Van 53 ft', base: 150, perKm: 2.35 },
  reefer: { label: 'Reefer 53 ft', base: 210, perKm: 2.75 },
  flatbed: { label: 'Flatbed 48 ft', base: 180, perKm: 2.6 },
  step_deck: { label: 'Step Deck', base: 220, perKm: 2.85 },
  tanker: { label: 'Tanker', base: 260, perKm: 3.1 },
  power_only: { label: 'Power Only', base: 110, perKm: 1.95 },
};

export const DEFAULT_SETTINGS = {
  currency: 'CAD',
  taxRate: 0.13, // HST
  fuelSurchargePct: 0.18,
  hazmatFee: 150,
  expediteMultiplier: 1.25,
  liftgateFee: 85,
  detentionFreeHours: 2,
  detentionPerHour: 75,
  platformFeePct: 0.08,
  fuelPricePerL: 1.62, // diesel, used when no receipt is linked to a job
  avgSpeedKmh: 82,
  overheadPerKm: 0.92, // truck payment, insurance, maintenance, tires, permits
  simulation: true,
};

const r2 = (n) => Math.round(n * 100) / 100;

export function quote({ distanceKm, cargo = {}, options = {} }, s) {
  const eq = EQUIPMENT[cargo.equipment] || EQUIPMENT.dry_van;
  const linehaul = distanceKm * eq.perKm;
  const lines = [
    { key: 'base', label: 'Booking & dispatch', amount: eq.base },
    { key: 'linehaul', label: `Line haul · ${distanceKm.toFixed(0)} km × $${eq.perKm.toFixed(2)}`, amount: linehaul },
    { key: 'fsc', label: `Fuel surcharge · ${(s.fuelSurchargePct * 100).toFixed(0)}%`, amount: linehaul * s.fuelSurchargePct },
  ];
  if (cargo.hazmat) lines.push({ key: 'hazmat', label: 'Hazmat handling', amount: s.hazmatFee });
  if (options.liftgate) lines.push({ key: 'liftgate', label: 'Liftgate', amount: s.liftgateFee });
  let subtotal = lines.reduce((a, l) => a + l.amount, 0);
  if (options.expedite) {
    const extra = subtotal * (s.expediteMultiplier - 1);
    lines.push({ key: 'expedite', label: 'Expedited / team drivers', amount: extra });
    subtotal += extra;
  }
  const tax = subtotal * s.taxRate;
  return {
    distanceKm: r2(distanceKm),
    ratePerKm: eq.perKm,
    lines: lines.map((l) => ({ ...l, amount: r2(l.amount) })),
    subtotal: r2(subtotal),
    tax: r2(tax),
    total: r2(subtotal + tax),
    carrierPayout: r2(subtotal * (1 - s.platformFeePct)),
    currency: s.currency,
    driveHours: r2(distanceKm / s.avgSpeedKmh),
  };
}

/** Final invoice: GPS-tracked loaded kilometres plus detention beyond the free dwell time. */
export function invoice(load, s) {
  const km = load.metrics.loadedKm > 1 ? load.metrics.loadedKm : load.quote.distanceKm;
  const q = quote({ distanceKm: km, cargo: load.cargo, options: load.options }, s);
  const detentionHours = ['pickup', 'delivery']
    .map((k) => Math.max(0, (load.metrics.dwellHours?.[k] || 0) - s.detentionFreeHours))
    .reduce((a, b) => a + b, 0);
  if (detentionHours > 0.01) {
    const amt = r2(detentionHours * s.detentionPerHour);
    q.lines.push({ key: 'detention', label: `Detention · ${detentionHours.toFixed(1)} h × $${s.detentionPerHour}`, amount: amt });
    q.subtotal = r2(q.subtotal + amt);
    q.tax = r2(q.subtotal * s.taxRate);
    q.total = r2(q.subtotal + q.tax);
    q.carrierPayout = r2(q.subtotal * (1 - s.platformFeePct));
  }
  return { ...q, issuedAt: Date.now(), number: `INV-${load.ref.replace('RG-', '')}`, quotedTotal: load.quote.total };
}

/** What the job cost the carrier: driver pay + fuel, versus payout. */
export function economics(load, driver, truck, fuelLogs, s) {
  const m = load.metrics;
  const totalKm = (m.deadheadKm || 0) + (m.loadedKm || 0);
  const hours = (m.driveHours || 0) + (m.dwellHours?.pickup || 0) + (m.dwellHours?.delivery || 0);
  const pay = driver?.payType === 'per_km' ? totalKm * (driver.perKmRate || 0) : hours * (driver?.hourlyRate || 0);
  const linked = fuelLogs.filter((f) => f.loadId === load.id);
  const litresEst = (totalKm * (truck?.fuelLPer100 || 36)) / 100;
  const fuel = linked.length ? linked.reduce((a, f) => a + f.total, 0) : litresEst * s.fuelPricePerL;
  const revenue = load.invoice?.carrierPayout ?? load.quote.carrierPayout;
  const overhead = totalKm * (s.overheadPerKm ?? 0.92);
  const cost = pay + fuel + overhead;
  return {
    totalKm: r2(totalKm), hours: r2(hours), driverPay: r2(pay), fuelCost: r2(fuel), overhead: r2(overhead),
    fuelSource: linked.length ? 'receipts' : 'estimate',
    litres: r2(linked.length ? linked.reduce((a, f) => a + f.litres, 0) : litresEst),
    revenue: r2(revenue), cost: r2(cost), margin: r2(revenue - cost),
    marginPct: revenue ? r2(((revenue - cost) / revenue) * 100) : 0,
    costPerKm: totalKm ? r2(cost / totalKm) : 0, revenuePerKm: totalKm ? r2(revenue / totalKm) : 0,
  };
}
