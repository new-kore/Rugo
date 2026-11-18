// Carrier invoicing: when a load is delivered, a draft invoice (with its work order number) is created for the
// carrier that did the job. The office reviews it, can edit anything, then sends it to the customer.
import { db, save, find, id } from './db.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DAY = 864e5;

/* ------------------------------ sales tax ------------------------------ */

const CA = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const HST = { ON: 0.13, NB: 0.15, NL: 0.15, PE: 0.15, NS: 0.14 };

/**
 * GST/HST/QST on a freight move. Place of supply is where the freight starts.
 * - Continuous international moves (either end outside Canada): zero-rated.
 * - HST provinces: HST at that province's rate.
 * - Québec origin and destination: GST 5% + QST 9.975%. Québec origin to another province: GST only.
 * - Other provinces/territories: GST 5%.
 */
export function taxesFor(pickupRegion, dropoffRegion) {
  const a = String(pickupRegion || '').toUpperCase(); const b = String(dropoffRegion || '').toUpperCase();
  if (!CA.includes(a) || !CA.includes(b)) return { rule: 'Zero-rated — continuous international freight movement', lines: [] };
  if (HST[a]) return { rule: `HST — freight picked up in ${a}`, lines: [{ code: 'HST', label: `HST ${(HST[a] * 100).toFixed(0)}% (${a})`, rate: HST[a] }] };
  if (a === 'QC' && b === 'QC') return { rule: 'GST + QST — move within Québec', lines: [{ code: 'GST', label: 'GST 5%', rate: 0.05 }, { code: 'QST', label: 'QST 9.975%', rate: 0.09975 }] };
  return { rule: `GST — freight picked up in ${a}`, lines: [{ code: 'GST', label: 'GST 5%', rate: 0.05 }] };
}

/** Totals from the lines and the tax rule (taxExempt for customers with an exemption). */
export function recompute(inv) {
  inv.lines = inv.lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, rate: r2(l.rate), amount: r2((Number(l.qty) || 0) * (Number(l.rate) || 0)) }));
  inv.subtotal = r2(inv.lines.reduce((a, l) => a + l.amount, 0));
  const t = inv.taxExempt ? { rule: 'Tax exempt (customer exemption on file)', lines: [] } : taxesFor(inv.taxRegion?.from, inv.taxRegion?.to);
  inv.taxRule = t.rule;
  inv.taxes = t.lines.map((x) => ({ ...x, amount: r2(inv.subtotal * x.rate) }));
  inv.total = r2(inv.subtotal + inv.taxes.reduce((a, x) => a + x.amount, 0));
  inv.balance = r2(inv.total - (inv.paidAmount || 0));
  return inv;
}

/* ------------------------------ numbering ------------------------------ */

function billingOf(company) {
  company.billing = company.billing || {};
  const b = company.billing;
  if (!b.prefix) b.prefix = (company.name || 'INV').split(/\s+/).map((w) => w[0]).join('').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3) || 'INV';
  if (!b.terms && b.terms !== 0) b.terms = 30;
  return b;
}
function nextNumbers(company, at = Date.now()) {
  const b = billingOf(company);
  const yr = new Date(at).getFullYear();
  if (b.year !== yr) { b.year = yr; b.nextInv = 1; b.nextWo = 1; }
  const inv = `${b.prefix}-${yr}-${String(b.nextInv++).padStart(4, '0')}`;
  const wo = `WO-${String(yr).slice(2)}${String(b.nextWo++).padStart(4, '0')}`;
  return { inv, wo };
}

/* ------------------------------ draft from a load ------------------------------ */

const clock = (t) => (t ? new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '—');

/** Build the invoice lines for a delivered load. */
function linesFor(load, s) {
  const lines = [];
  const add = (kind, description, qty, unit, rate, extra = {}) => lines.push({ id: id('ln'), kind, description, qty, unit, rate: r2(rate), ...extra });
  const km = Math.round(load.metrics?.loadedKm > 1 ? load.metrics.loadedKm : load.quote.distanceKm);
  const route = `${load.pickup.city}, ${load.pickup.region} → ${load.dropoff.city}, ${load.dropoff.region}`;
  if (load.quote.customRate) {
    add('linehaul', `Line haul · ${route} · ${km} km`, 1, 'load', load.quote.carrierPayout);
  } else {
    // The carrier bills its share of the booked rate, itemised the same way as the quote.
    const keep = 1 - (s.platformFeePct || 0);
    const src = (load.invoice?.lines || load.quote.lines).filter((l) => l.key !== 'detention');
    const pick = (k) => src.find((l) => l.key === k)?.amount || 0;
    add('linehaul', `Line haul · ${route} · ${km} km`, 1, 'load', (pick('base') + pick('linehaul')) * keep);
    if (pick('fsc')) add('fuel', `Fuel surcharge · ${Math.round((s.fuelSurchargePct || 0) * 100)}%`, 1, 'load', pick('fsc') * keep);
    if (pick('hazmat')) add('accessorial', 'Hazmat handling', 1, 'each', pick('hazmat') * keep);
    if (pick('liftgate')) add('accessorial', 'Liftgate', 1, 'each', pick('liftgate') * keep);
    if (pick('expedite')) add('accessorial', 'Expedited / team drivers', 1, 'load', pick('expedite') * keep);
  }
  // Detention: billed automatically from the GPS/app timestamps, with the times on the invoice as proof.
  const free = s.detentionFreeHours ?? 2; const rate = s.detentionPerHour ?? 75;
  const stops = [
    ['pickup', load.pickup, load.arrivedPickupAt, load.departedPickupAt],
    ['delivery', load.dropoff, load.arrivedDeliveryAt, load.deliveredAt],
  ];
  for (const [k, place, inAt, outAt] of stops) {
    const dwell = load.metrics?.dwellHours?.[k] || (inAt && outAt ? (outAt - inAt) / 3.6e6 : 0);
    const bill = Math.max(0, dwell - free);
    if (bill >= 0.25) {
      const qty = Math.round(bill * 4) / 4; // quarter hours
      add('detention', `Detention at ${k} · ${place.city} · in ${clock(inAt)}, out ${clock(outAt)} · ${dwell.toFixed(1)} h on site, ${free} h free`, qty, 'h', rate, { evidence: { stop: k, in: inAt || null, out: outAt || null, dwellHours: r2(dwell), freeHours: free } });
    }
  }
  return lines;
}

/** Create the draft invoice for a delivered load (once). Returns it, or null if one exists. */
export function draftInvoiceForLoad(load, s) {
  if (!load.carrierId || db.invoices.some((x) => x.loadId === load.id && x.status !== 'void')) return null;
  const carrier = find('companies', load.carrierId);
  if (!carrier) return null;
  const b = billingOf(carrier);
  const shipper = find('companies', load.shipperId);
  const at = load.deliveredAt || Date.now();
  const { inv: number, wo } = nextNumbers(carrier, at);
  const billTo = load.customer && load.shipperId === load.carrierId
    ? { name: load.customer, address: '', email: '' }
    : { name: shipper?.name || load.customer || 'Customer', address: [shipper?.address, shipper?.city].filter(Boolean).join(', '), email: shipper?.billingEmail || '', companyId: shipper?.id || null };
  const driver = find('users', load.driverId);
  const invoice = recompute({
    id: id('inv'), carrierId: carrier.id, shipperId: load.shipperId || null, loadId: load.id, loadRef: load.ref,
    number, workOrder: wo, status: 'draft', issueDate: at, terms: b.terms, dueDate: at + b.terms * DAY,
    poNumber: load.poNumber || '', billTo,
    from: { name: carrier.name, address: [carrier.address, carrier.city].filter(Boolean).join(', '), phone: carrier.phone || '', email: b.email || '', gst: b.gstNumber || '', qst: b.qstNumber || '', nsc: carrier.nsc || '', usdot: carrier.usdot || '' },
    service: {
      pickup: { name: load.pickup.name, city: load.pickup.city, region: load.pickup.region, at: load.departedPickupAt || load.arrivedPickupAt || null },
      dropoff: { name: load.dropoff.name, city: load.dropoff.city, region: load.dropoff.region, at: load.deliveredAt || null },
      cargo: load.cargo?.description || '', equipment: load.cargo?.equipment || '', km: Math.round(load.metrics?.loadedKm || load.quote.distanceKm),
      driver: driver?.name || '', truckId: load.truckId || null, trailerId: load.trailerId || null,
    },
    pod: load.signature ? { name: load.signature.name, at: load.signature.t, url: load.signature.url || null, photos: (load.photos?.delivery || []).length, damage: !!load.damage?.hasDamage } : null,
    taxRegion: { from: load.pickup.region, to: load.dropoff.region }, taxExempt: false,
    lines: linesFor(load, s), notes: b.notes || 'Thank you for your business.',
    paidAmount: 0, history: [{ t: Date.now(), by: 'Rugo', text: `Draft created automatically when ${load.ref} was delivered` }],
  });
  db.invoices.push(invoice);
  load.carrierInvoiceId = invoice.id;
  return invoice;
}

/* ------------------------------ API ------------------------------ */

const EDITABLE = ['billTo', 'poNumber', 'terms', 'notes', 'lines', 'taxExempt', 'issueDate'];

export function billingRoutes(app, auth, role, { publish, notify }) {
  const mine = (req, res) => {
    const inv = find('invoices', req.params.id);
    if (!inv || inv.carrierId !== req.user.companyId) { res.status(404).json({ error: 'Invoice not found.' }); return null; }
    return inv;
  };
  const done = (res, inv) => { save(); publish('invoices', inv); res.json(inv); };

  // Edit a draft.
  app.patch('/api/invoices/:id', auth, role('dispatcher'), (req, res) => {
    const inv = mine(req, res); if (!inv) return;
    if (inv.status !== 'draft') return res.status(409).json({ error: 'Only drafts can be edited. Void it and make a new one to change a sent invoice.' });
    const b = req.body || {};
    for (const k of EDITABLE) if (k in b) inv[k] = b[k];
    if (Array.isArray(inv.lines)) inv.lines = inv.lines.slice(0, 60).map((l) => ({ id: l.id || id('ln'), kind: l.kind || 'other', description: String(l.description || '').slice(0, 300), qty: Number(l.qty) || 0, unit: String(l.unit || '').slice(0, 12), rate: Number(l.rate) || 0, evidence: l.evidence }));
    inv.terms = Math.max(0, Math.min(120, Number(inv.terms) || 0));
    inv.dueDate = inv.issueDate + inv.terms * DAY;
    if (inv.billTo) inv.billTo = { ...inv.billTo, name: String(inv.billTo.name || '').slice(0, 120), email: String(inv.billTo.email || '').slice(0, 160), address: String(inv.billTo.address || '').slice(0, 240) };
    recompute(inv);
    inv.history.push({ t: Date.now(), by: req.user.name, text: 'Edited' });
    done(res, inv);
  });

  // Send to the customer.
  app.post('/api/invoices/:id/send', auth, role('dispatcher'), (req, res) => {
    const inv = mine(req, res); if (!inv) return;
    if (inv.status !== 'draft') return res.status(409).json({ error: 'This invoice was already sent.' });
    const to = String(req.body?.to || inv.billTo?.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Add the customer’s billing email.' });
    if (!inv.lines.length || inv.total <= 0) return res.status(400).json({ error: 'The invoice has no amount.' });
    inv.billTo = { ...inv.billTo, email: to };
    inv.status = 'sent'; inv.sentAt = Date.now(); inv.sentTo = to; inv.sentBy = req.user.name;
    inv.message = String(req.body?.message || '').slice(0, 1000);
    inv.history.push({ t: inv.sentAt, by: req.user.name, text: `Sent to ${to}` });
    // Remember the email for this customer's next invoice.
    const shipper = inv.billTo.companyId && find('companies', inv.billTo.companyId);
    if (shipper && !shipper.billingEmail) shipper.billingEmail = to;
    if (inv.shipperId) notify((v) => v.role === 'shipper' && v.companyId === inv.shipperId, { title: `🧾 Invoice ${inv.number}`, body: `${inv.from.name} sent an invoice for ${inv.loadRef}: $${inv.total.toFixed(2)}, due ${new Date(inv.dueDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.` });
    done(res, inv);
  });

  // Payment, void, back to draft.
  app.post('/api/invoices/:id/status', auth, role('dispatcher'), (req, res) => {
    const inv = mine(req, res); if (!inv) return;
    const { action } = req.body || {};
    if (action === 'paid') {
      if (!['sent', 'partial'].includes(inv.status)) return res.status(409).json({ error: 'Send the invoice before recording a payment.' });
      const amt = r2(req.body.amount ?? inv.balance);
      if (!(amt > 0)) return res.status(400).json({ error: 'Enter the amount received.' });
      inv.paidAmount = r2((inv.paidAmount || 0) + amt);
      inv.payments = [...(inv.payments || []), { t: Date.now(), amount: amt, method: String(req.body.method || 'EFT').slice(0, 40), by: req.user.name }];
      recompute(inv);
      inv.status = inv.balance <= 0.009 ? 'paid' : 'partial';
      if (inv.status === 'paid') inv.paidAt = Date.now();
      inv.history.push({ t: Date.now(), by: req.user.name, text: `Payment received $${amt.toFixed(2)} (${inv.payments.at(-1).method})` });
    } else if (action === 'void') {
      if (inv.status === 'paid') return res.status(409).json({ error: 'A paid invoice can’t be voided.' });
      inv.status = 'void'; inv.voidedAt = Date.now();
      inv.history.push({ t: Date.now(), by: req.user.name, text: `Voided${req.body.reason ? ` — ${String(req.body.reason).slice(0, 200)}` : ''}` });
    } else if (action === 'redraft') {
      // Make a fresh draft from a voided invoice (new invoice number, same work order).
      if (inv.status !== 'void') return res.status(409).json({ error: 'Only a voided invoice can be redrafted.' });
      const carrier = find('companies', inv.carrierId);
      const copy = recompute({ ...structuredClone(inv), id: id('inv'), number: nextNumbers(carrier).inv, status: 'draft', issueDate: Date.now(), sentAt: null, sentTo: null, paidAmount: 0, payments: [], voidedAt: null, history: [{ t: Date.now(), by: req.user.name, text: `New draft replacing ${inv.number}` }] });
      copy.dueDate = copy.issueDate + copy.terms * DAY;
      db.invoices.push(copy);
      inv.replacedBy = copy.id;
      save(); publish('invoices', inv); publish('invoices', copy);
      return res.json(copy);
    } else return res.status(400).json({ error: 'Unknown action.' });
    done(res, inv);
  });

  // Billing details for the carrier (tax numbers, terms, prefix, remit-to email).
  app.patch('/api/company/billing', auth, role('dispatcher'), (req, res) => {
    const c = find('companies', req.user.companyId);
    const b = billingOf(c);
    const x = req.body || {};
    for (const k of ['gstNumber', 'qstNumber', 'email', 'notes']) if (k in x) b[k] = String(x[k] || '').slice(0, 300);
    if ('prefix' in x) b.prefix = String(x.prefix || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || b.prefix;
    if ('terms' in x) b.terms = Math.max(0, Math.min(120, Number(x.terms) || 0));
    save();
    publish('companies', c);
    res.json(c);
  });
}
