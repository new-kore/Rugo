// Load list card, accept/dispatch sheet and invoice view shared across roles.
import { hm, hosLeft } from '../lib/hos.js';
import { useMatches, aiOn } from '../lib/ai.js';
import MatchList, { ScoreBadge } from './MatchList.jsx';
import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { StatusPill, Tracker, RouteLine, Sheet, Avatar, ActionButton } from './ui.jsx';
import { useStore, useIndex, isActive } from '../lib/store.jsx';
import { money, money2, km, kg, dayLabel, time, duration, placeShort } from '../lib/format.js';
import { haversine } from '../lib/geo.js';
import { post, standalone } from '../lib/api.js';
import { go } from '../lib/router.js';

export function etaText(load) {
  if (!load.eta) return null;
  if (['accepted', 'en_route_pickup'].includes(load.status) && load.eta.pickupAt) return `Pickup ~${time(load.eta.pickupAt)}`;
  if (load.eta.deliveryAt) return `Arrives ~${time(load.eta.deliveryAt)}`;
  return null;
}

export function LoadCard({ load, showPay }) {
  const { data } = useStore();
  const idx = useIndex();
  const driver = idx.users[load.driverId];
  const eq = data.meta.equipment[load.cargo.equipment]?.label;
  const price = showPay ? load.quote.carrierPayout : load.invoice?.total ?? load.quote.total;
  return (
    <div className="card pad clickable stack" style={{ gap: 12 }} onClick={() => go(`/loads/${load.id}`)}>
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <span className="headline mono">{load.ref}</span>
          <StatusPill status={load.status} />
        </div>
        <div className="headline num">{money(price)}</div>
      </div>
      <RouteLine pickup={load.pickup} dropoff={load.dropoff} compact />
      {load.status !== 'requested' && load.status !== 'cancelled' && <Tracker status={load.status} />}
      <div className="row between footnote secondary wrap" style={{ gap: 6 }}>
        <span className="row" style={{ gap: 6 }}><Icon name="truck" size={15} />{eq} · {km(load.quote.distanceKm)}</span>
        <span>
          {load.status === 'delivered' ? `Delivered ${dayLabel(load.deliveredAt)}`
            : load.status === 'requested' ? `Pickup ${dayLabel(load.pickupWindow.from)}`
              : etaText(load) || (driver ? driver.name : '')}
        </span>
      </div>
    </div>
  );
}

/** Choose a driver + truck. Suggests the closest available match for the trailer type. */
export function AcceptSheet({ load, onClose }) {
  const { data, toast, upsert } = useStore();
  const idx = useIndex();
  const busy = new Set(data.loads.filter(isActive).flatMap((l) => [l.driverId, ...(l.teamDriverIds || [])]));
  const options = useMemo(() => data.users
    .filter((u) => u.role === 'driver')
    .map((d) => {
      const t = idx.trucks[d.truckId];
      const dist = t?.location ? haversine(t.location, load.pickup) * 1.2 : null;
      return { d, t, dist, free: !busy.has(d.id) && d.status !== 'off_duty', match: t?.equipment === load.cargo.equipment };
    })
    .sort((a, b) => (b.free - a.free) || (b.match - a.match) || ((a.dist ?? 1e9) - (b.dist ?? 1e9))), [data.users, idx.trucks, load]);
  const ai = aiOn(data.settings);
  const matches = useMatches(ai ? load : null);
  const [pick, setPick] = useState(ai ? matches.find((r) => r.eligible)?.driver.id : options.find((o) => o.free && o.t)?.d.id);
  const chosen = options.find((o) => o.d.id === pick);

  const accept = async () => {
    const r = await post(`/loads/${load.id}/accept`, { driverId: chosen.d.id, truckId: chosen.t.id });
    upsert('loads', r);
    toast({ title: `${load.ref} accepted`, body: `${chosen.d.name} has been notified.` });
    onClose();
    go(`/loads/${load.id}`);
  };

  return (
    <Sheet title="Accept load" onClose={onClose}>
      <div className="stack">
        <div className="card pad stack">
          <div className="row between"><span className="headline mono">{load.ref}</span><span className="title3 num green">{money(load.quote.carrierPayout)}</span></div>
          <RouteLine pickup={load.pickup} dropoff={load.dropoff} compact />
          <div className="footnote secondary">{km(load.quote.distanceKm)} · {money2(load.quote.carrierPayout / load.quote.distanceKm)}/km · {data.meta.equipment[load.cargo.equipment].label}</div>
        </div>
        <div className="section-header" style={{ margin: '8px 4px 0' }}>{ai ? 'AI dispatch — best drivers for this load' : 'Who will drive?'}</div>
        {ai && <div className="footnote secondary" style={{ margin: '-4px 4px 0' }}>Ranked by distance, availability, hours left, cost, lane history and on-time record.</div>}
        {ai ? <MatchList rows={matches} pick={pick} onPick={setPick} equipmentLabel={(e) => data.meta.equipment[e]?.label} /> : (
        <div className="list">
          {options.map((o, i) => (
            <button key={o.d.id} className="list-row indent" disabled={!o.free || !o.t} style={{ opacity: o.free && o.t ? 1 : 0.45 }} onClick={() => setPick(o.d.id)}>
              <Avatar user={o.d} />
              <div className="label">
                <div className="headline row" style={{ gap: 6 }}>
                  {o.d.name}
                  {i === 0 && o.free && <span className="pill green">Best match</span>}
                </div>
                <div className="footnote secondary truncate">
                  {o.t ? `Unit ${o.t.unit} · ${data.meta.equipment[o.t.equipment]?.label}` : 'No truck'}
                  {o.dist != null ? ` · ${km(o.dist)} away` : ''}
                  {!o.free ? ' · On a job' : ''}
                  {o.t && !o.match ? ' · different trailer' : ''}
                </div>
              </div>
              <div style={{ width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center', background: pick === o.d.id ? 'var(--blue)' : 'transparent', boxShadow: pick === o.d.id ? 'none' : 'inset 0 0 0 2px var(--label-3)', color: '#fff' }}>
                {pick === o.d.id && <Icon name="check" size={14} stroke={3} />}
              </div>
            </button>
          ))}
        </div>
        )}
        <ActionButton className="btn primary xl" disabled={!chosen?.t} onClick={accept}>
          <Icon name="check" size={22} stroke={2.4} />Accept & dispatch {chosen ? chosen.d.name.split(' ')[0] : ''}
        </ActionButton>
      </div>
    </Sheet>
  );
}

/** Pick a driver to replace the main driver or to join as a team driver. */
export function DriverPicker({ load, mode, onPick, onClose }) {
  const { data, toast } = useStore();
  const idx = useIndex();
  const [busyId, setBusyId] = useState(null);
  const onLoad = new Set([load.driverId, ...(load.teamDriverIds || [])]);
  const busy = new Set(data.loads.filter((l) => isActive(l) && l.id !== load.id).flatMap((l) => [l.driverId, ...(l.teamDriverIds || [])]));
  const loaded = ['at_pickup', 'in_transit', 'at_delivery'].includes(load.status);
  const target = loaded ? idx.trucks[load.truckId]?.location : load.pickup;
  const rows = data.users.filter((u) => u.role === 'driver' && !onLoad.has(u.id)).map((d) => {
    const t = idx.trucks[d.truckId];
    const dist = t?.location && target ? haversine(t.location, target) * 1.2 : null;
    return { d, t, dist, free: !busy.has(d.id) && d.status !== 'off_duty' };
  }).sort((a, b) => (b.free - a.free) || ((a.dist ?? 1e9) - (b.dist ?? 1e9)));
  const ai = aiOn(data.settings);
  const matches = useMatches(ai && mode !== 'add' ? load : null, { allowBusy: !loaded });
  const scoreOf = Object.fromEntries(matches.map((m) => [m.driver.id, m]));
  if (ai && matches.length) rows.sort((a, b) => (b.free - a.free) || ((scoreOf[b.d.id]?.score ?? 0) - (scoreOf[a.d.id]?.score ?? 0)));
  const title = mode === 'add' ? 'Add a team driver' : 'Replace driver';
  const hint = mode === 'add'
    ? 'The team driver shares the same truck. Both are paid for the job.'
    : loaded ? `The new driver takes over unit ${idx.trucks[load.truckId]?.unit} where it is now.` : 'The new driver goes to the pickup in their own truck.';
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <div className="subhead secondary">{load.ref} · {placeShort(load.pickup)} → {placeShort(load.dropoff)}. {hint}</div>
        <div className="list">
          {rows.map(({ d, t, dist, free }) => (
            <button key={d.id} className="list-row" disabled={!free || busyId} style={{ opacity: free ? 1 : 0.45 }}
              onClick={async () => { setBusyId(d.id); try { await onPick(d); } catch (e) { toast({ title: 'Couldn’t change driver', body: e.message, tone: 'error' }); } finally { setBusyId(null); } }}>
              {scoreOf[d.id] && <ScoreBadge score={scoreOf[d.id].eligible ? scoreOf[d.id].score : 0} size={32} />}
              <Avatar user={d} />
              <div className="label">
                <div className="headline">{d.name}{scoreOf[d.id]?.best && free && <span className="pill green" style={{ marginLeft: 6 }}>Best match</span>}</div>
                <div className="footnote secondary truncate">
                  {t ? `Unit ${t.unit}` : 'No truck'}{dist != null ? ` · ${km(dist)} ${loaded ? 'from the truck' : 'from pickup'}` : ''}{!free ? ' · busy' : ''}{d.hos ? ` · ${hm(hosLeft(d.hos))} driving left (${d.hos.providerName})` : ''}
                </div>
              </div>
              {busyId === d.id ? <span className="spinner" /> : <Icon name="chevron" size={15} className="chev" />}
            </button>
          ))}
          {rows.length === 0 && <div className="list-row secondary">No other drivers.</div>}
        </div>
      </div>
    </Sheet>
  );
}

/** Route details added by dispatch: customer, stop contacts and notes, appointment, step list. */
export function TaskDetails({ load }) {
  const steps = load.instructions || [];
  const stop = (label, p) => (p.contact || p.phone || p.dockNote) && (
    <div><div className="footnote secondary">{label}</div><div className="subhead">{[p.contact, p.phone].filter(Boolean).join(' · ')}{p.dockNote ? <span className="secondary"> — {p.dockNote}</span> : null}</div></div>
  );
  const has = load.customer || steps.length || load.deliveryWindow || load.pickup.dockNote || load.dropoff.dockNote || load.notes;
  if (!has) return null;
  return (
    <div className="stack-sm">
      {load.customer && <div><div className="footnote secondary">Customer</div><div className="subhead">{load.customer}</div></div>}
      {stop('Pickup contact', load.pickup)}
      {stop('Delivery contact', load.dropoff)}
      {load.deliveryWindow && <div><div className="footnote secondary">Delivery appointment</div><div className="subhead">{dayLabel(load.deliveryWindow.from)}</div></div>}
      {steps.length > 0 && (
        <div>
          <div className="footnote secondary" style={{ marginBottom: 4 }}>Steps</div>
          <ol className="task-steps">{steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      )}
      {load.notes && <div><div className="footnote secondary">Notes</div><div className="subhead">{load.notes}</div></div>}
    </div>
  );
}

export function CargoFacts({ load }) {
  const { data } = useStore();
  const c = load.cargo;
  return (
    <div className="kv">
      <div><div className="k">Trailer</div><div className="v">{data.meta.equipment[c.equipment]?.label}</div></div>
      <div><div className="k">Weight</div><div className="v">{kg(c.weightKg)}</div></div>
      <div><div className="k">Pallets</div><div className="v">{c.pallets || '—'}</div></div>
      {c.tempC != null && <div><div className="k">Temperature</div><div className="v">{c.tempC}°C</div></div>}
      <div><div className="k">Hazmat</div><div className="v">{c.hazmat ? 'Yes' : 'No'}</div></div>
      {load.poNumber && <div><div className="k">PO number</div><div className="v mono">{load.poNumber}</div></div>}
      <div><div className="k">Pickup window</div><div className="v">{dayLabel(load.pickupWindow.from)}</div></div>
      {load.options.expedite && <div><div className="k">Service</div><div className="v">Expedited</div></div>}
    </div>
  );
}

export function PriceBreakdown({ q, title = 'Price', payoutOnly }) {
  if (payoutOnly) {
    return (
      <div className="list-row" style={{ padding: 0 }}>
        <div className="label headline">Your payout</div><div className="title3 num green">{money2(q.carrierPayout)}</div>
      </div>
    );
  }
  return (
    <div className="stack-sm">
      {title && <div className="headline">{title}</div>}
      {q.lines?.map((l) => (
        <div key={l.key} className="row between subhead"><span className="secondary">{l.label}</span><span className="num">{money2(l.amount)}</span></div>
      ))}
      <div className="divider" style={{ margin: '4px 0' }} />
      <div className="row between subhead"><span className="secondary">Subtotal</span><span className="num">{money2(q.subtotal)}</span></div>
      <div className="row between subhead"><span className="secondary">HST</span><span className="num">{money2(q.tax)}</span></div>
      <div className="row between"><span className="headline">Total</span><span className="title3 num">{money2(q.total)}</span></div>
    </div>
  );
}

export function Economics({ e }) {
  if (!e) return null;
  const tone = e.margin >= 0 ? 'green' : 'red';
  return (
    <div className="stack">
      <div className="row between">
        <div className="headline">Job profit</div>
        <div className={`title3 num ${tone}`}>{money2(e.margin)} <span className="footnote">({e.marginPct.toFixed(0)}%)</span></div>
      </div>
      <div className="kv">
        <div><div className="k">Payout</div><div className="v">{money2(e.revenue)}</div></div>
        <div><div className="k">Driver pay</div><div className="v">{money2(e.driverPay)}</div></div>
        <div><div className="k">Fuel ({e.fuelSource})</div><div className="v">{money2(e.fuelCost)}</div></div>
        {e.overhead != null && <div><div className="k">Truck & insurance</div><div className="v">{money2(e.overhead)}</div></div>}
        <div><div className="k">Total km</div><div className="v">{km(e.totalKm, 1)}</div></div>
        <div><div className="k">Hours</div><div className="v">{duration(e.hours)}</div></div>
        <div><div className="k">Litres</div><div className="v">{e.litres.toFixed(0)} L</div></div>
        <div><div className="k">Cost / km</div><div className="v">{money2(e.costPerKm)}</div></div>
        <div><div className="k">Revenue / km</div><div className="v">{money2(e.revenuePerKm)}</div></div>
      </div>
    </div>
  );
}

export function InvoiceDoc({ load, company, shipper, onClose }) {
  const inv = load.invoice;
  return (
    <Sheet title={inv.number} onClose={onClose} wide action={standalone ? null : <button className="btn small" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>}>
      <div className="card pad-lg stack" id="invoice">
        <div className="row between wrap">
          <div className="row"><div className="brand-mark"><Icon name="truck" size={20} stroke={2.2} /></div><div><div className="title3">Invoice</div><div className="mono secondary">{inv.number}</div></div></div>
          <div className="subhead" style={{ textAlign: 'right' }}>Issued {dayLabel(inv.issuedAt)}<br /><span className={inv.paid ? 'green' : 'orange'}>{inv.paid ? 'Paid' : 'Due in 30 days'}</span></div>
        </div>
        <div className="grid grid-2">
          <div><div className="footnote secondary">Bill to</div><div className="headline">{shipper?.name}</div><div className="subhead secondary">{shipper?.city}</div></div>
          <div><div className="footnote secondary">Carrier</div><div className="headline">{company?.name}</div><div className="subhead secondary">{company?.city}{company?.nsc ? ` · NSC ${company.nsc}` : ''}</div></div>
        </div>
        <div className="divider" />
        <div className="kv">
          <div><div className="k">Load</div><div className="v mono">{load.ref}</div></div>
          <div><div className="k">PO</div><div className="v mono">{load.poNumber || '—'}</div></div>
          <div><div className="k">From</div><div className="v">{placeShort(load.pickup)}</div></div>
          <div><div className="k">To</div><div className="v">{placeShort(load.dropoff)}</div></div>
          <div><div className="k">Picked up</div><div className="v">{dayLabel(load.departedPickupAt)}</div></div>
          <div><div className="k">Delivered</div><div className="v">{dayLabel(load.deliveredAt)}</div></div>
          <div><div className="k">GPS kilometres</div><div className="v">{km(load.metrics.loadedKm, 1)}</div></div>
          <div><div className="k">Quoted</div><div className="v">{money2(inv.quotedTotal)}</div></div>
        </div>
        <div className="divider" />
        <PriceBreakdown q={inv} title="Charges" />
        <div className="footnote secondary">Billed on GPS-tracked loaded kilometres. Proof of delivery signed by {load.signature?.name || '—'}{load.damage?.hasDamage ? ' — damage noted at delivery.' : ', no damage noted.'}</div>
      </div>
    </Sheet>
  );
}
