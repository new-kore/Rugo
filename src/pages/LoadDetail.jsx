import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import MapView from '../components/MapView.jsx';
import Chat from '../components/Chat.jsx';
import { PhotoCompare } from '../components/Inspection.jsx';
import { StatusPill, Tracker, RouteLine, Avatar, ActionButton, ConfirmButton, Empty, STATUS_STYLE } from '../components/ui.jsx';
import { AcceptSheet, CargoFacts, PriceBreakdown, Economics, InvoiceDoc } from '../components/LoadBits.jsx';
import { useStore, useIndex, useNow, isActive } from '../lib/store.jsx';
import { money, money2, km, time, dayLabel, duration, ago, placeShort } from '../lib/format.js';
import { post } from '../lib/api.js';
import { back } from '../lib/router.js';

export default function LoadDetail({ id }) {
  const { data, upsert, toast } = useStore();
  const idx = useIndex();
  useNow(10000);
  const load = idx.loads[id];
  const [accepting, setAccepting] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const role = data.me.role;

  const truck = load && idx.trucks[load.truckId];
  const driver = load && idx.users[load.driverId];
  const mapTrucks = useMemo(() => (truck && isActive(load) ? [{ ...truck, color: driver?.color || '#007aff', moving: true, label: `Unit ${truck.unit}` }] : []), [truck, driver, load]);
  const places = useMemo(() => load ? [
    { ...load.pickup, kind: 'pickup', label: `Pickup · ${load.pickup.city}` },
    { ...load.dropoff, kind: 'dropoff', label: `Delivery · ${load.dropoff.city}` },
  ] : [], [load?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!load) return <div className="page"><Empty title="Load not found">It may have been taken by another carrier.</Empty></div>;

  const routePts = load.status === 'en_route_pickup' || load.status === 'accepted'
    ? [...(load.legs.toPickup?.points || []), ...(load.legs.toDropoff?.points || [])]
    : load.legs.toDropoff?.points;
  const shipper = idx.companies[load.shipperId];
  const carrier = idx.companies[load.carrierId];
  const st = STATUS_STYLE[load.status];
  const statusText = data.meta.statuses.find((s) => s.key === load.status)?.label;

  const headline = (() => {
    if (load.status === 'requested') return { big: 'Finding a carrier', small: 'Carriers nearby are being notified now.' };
    if (load.status === 'delivered') return { big: `Delivered ${time(load.deliveredAt)}`, small: dayLabel(load.deliveredAt) };
    if (load.status === 'cancelled') return { big: 'Cancelled', small: '' };
    if (['accepted', 'en_route_pickup'].includes(load.status) && load.eta?.pickupAt) return { big: `Pickup at ${time(load.eta.pickupAt)}`, small: `${km(load.eta.toPickupKm)} away · ${statusText}` };
    if (load.eta?.deliveryAt) return { big: `Arrives ${time(load.eta.deliveryAt)}`, small: `${km(load.eta.remainingKm)} to go · ${statusText}` };
    return { big: statusText, small: '' };
  })();

  return (
    <div className="page wide fade-in" style={{ maxWidth: 1320 }}>
      <button className="btn plain" style={{ paddingLeft: 0, marginBottom: 6 }} onClick={() => back(role === 'shipper' ? '/shipments' : '/dispatch')}>
        <Icon name="chevronLeft" size={15} />Back
      </button>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="large-title mono" style={{ letterSpacing: '-0.03em' }}>{load.ref}</h1>
            <StatusPill status={load.status} long />
          </div>
          <div className="sub subhead">{placeShort(load.pickup)} → {placeShort(load.dropoff)} · {load.cargo.description}</div>
        </div>
        <div className="row wrap">
          {role === 'dispatcher' && load.status === 'requested' && <button className="btn primary large" onClick={() => setAccepting(true)}><Icon name="check" size={20} stroke={2.4} />Accept for {money(load.quote.carrierPayout)}</button>}
          {role === 'dispatcher' && load.status === 'accepted' && <ActionButton className="btn danger" onClick={async () => upsert('loads', await post(`/loads/${load.id}/cancel`))}>Release load</ActionButton>}
          {role === 'shipper' && ['requested', 'accepted'].includes(load.status) && <ConfirmButton confirmLabel="Tap again to cancel" onConfirm={async () => upsert('loads', await post(`/loads/${load.id}/cancel`))}>Cancel request</ConfirmButton>}
          {load.invoice && <button className="btn" onClick={() => setInvoice(true)}><Icon name="receipt" size={18} />Invoice</button>}
        </div>
      </div>

      <div className="split">
        <div className="stack" style={{ gap: 20 }}>
          <div className="map-card">
            <MapView height={460} trucks={mapTrucks} places={places} route={routePts} track={load.track} fitKey={`${load.id}:${load.status === 'delivered'}`} />
            <div className="map-overlay glass" style={{ left: 14, right: 14, bottom: 14, padding: 16, maxWidth: 520 }}>
              <div className="row between">
                <div>
                  <div className="title2">{headline.big}</div>
                  <div className="subhead secondary">{headline.small}</div>
                </div>
                {st?.live && truck?.location && <div style={{ textAlign: 'right' }}><div className="title3 num">{Math.round(truck.location.speed || 0)}</div><div className="caption secondary">km/h</div></div>}
              </div>
              {load.status !== 'requested' && load.status !== 'cancelled' && <div style={{ marginTop: 12 }}><Tracker status={load.status} /></div>}
              {truck?.location?.updatedAt && isActive(load) && <div className="caption tertiary" style={{ marginTop: 8 }}>Live GPS · updated {ago(truck.location.updatedAt)}</div>}
            </div>
          </div>

          <div className="card pad-lg stack">
            <div className="row between"><div className="title3">Inspection photos</div><span className="footnote secondary">Pickup vs. delivery</span></div>
            <PhotoCompare load={load} />
          </div>

          <div className="card pad-lg">
            <div className="title3" style={{ marginBottom: 14 }}>Timeline</div>
            <ul className="timeline">
              {[...load.timeline].reverse().map((t, i) => (
                <li key={i}>
                  <div className="node"><Icon name={STATUS_STYLE[t.status]?.icon || 'checkCircle'} size={13} stroke={2.4} /></div>
                  <div>
                    <div className="headline">{data.meta.statuses.find((s) => s.key === t.status)?.label}</div>
                    <div className="footnote secondary">{dayLabel(t.t)} · {t.by}{t.note ? ` — ${t.note}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stack sticky-top" style={{ gap: 16 }}>
          <div className="card pad-lg stack">
            <RouteLine pickup={load.pickup} dropoff={load.dropoff}
              pickupNote={load.departedPickupAt ? `Left ${time(load.departedPickupAt)}` : load.pickup.contact}
              dropoffNote={load.deliveredAt ? `Signed by ${load.signature?.name}` : load.dropoff.contact} />
            <div className="divider" style={{ margin: 0 }} />
            <div className="kv">
              <div><div className="k">Planned</div><div className="v">{km(load.quote.distanceKm)}</div></div>
              <div><div className="k">Driven (GPS)</div><div className="v">{km(load.metrics.loadedKm, 1)}</div></div>
              {role !== 'shipper' && <div><div className="k">Empty km</div><div className="v">{km(load.metrics.deadheadKm, 1)}</div></div>}
              <div><div className="k">Drive time</div><div className="v">{duration(load.quote.driveHours)}</div></div>
              {load.odometer?.start ? <div><div className="k">Odometer start</div><div className="v">{km(load.odometer.start)}</div></div> : null}
              {load.odometer?.end ? <div><div className="k">Odometer end</div><div className="v">{km(load.odometer.end)}</div></div> : null}
            </div>
          </div>

          {driver && (
            <div className="card pad-lg stack">
              <div className="row">
                <Avatar user={driver} size="lg" />
                <div className="spacer">
                  <div className="title3">{driver.name}</div>
                  <div className="subhead secondary">{carrier?.name}{driver.rating ? ` · ★ ${driver.rating}` : ''}</div>
                </div>
                {driver.phone && <a className="icon-btn" style={{ width: 44, height: 44 }} href={`tel:${driver.phone}`} aria-label="Call driver"><Icon name="phone" size={20} /></a>}
              </div>
              {truck && (
                <div className="kv">
                  <div><div className="k">Truck</div><div className="v">Unit {truck.unit}</div></div>
                  <div><div className="k">Vehicle</div><div className="v">{truck.year} {truck.make}</div></div>
                  <div><div className="k">Plate</div><div className="v mono">{truck.plate}</div></div>
                </div>
              )}
            </div>
          )}

          <div className="card pad-lg stack">
            <div className="title3">Freight</div>
            <CargoFacts load={load} />
            {load.notes && <div className="subhead secondary">“{load.notes}”</div>}
            <div className="footnote tertiary">Shipper: {shipper?.name}</div>
          </div>

          <div className="card pad-lg">
            {role === 'shipper'
              ? <PriceBreakdown q={load.invoice || load.quote} title={load.invoice ? 'Final price' : 'Quoted price'} />
              : load.economics ? <Economics e={load.economics} /> : <PriceBreakdown q={load.quote} payoutOnly />}
            {role === 'shipper' && load.invoice && load.invoice.total !== load.invoice.quotedTotal && (
              <div className="footnote secondary" style={{ marginTop: 8 }}>Quoted {money2(load.invoice.quotedTotal)} — final is based on the GPS kilometres actually driven{load.invoice.lines.some((l) => l.key === 'detention') ? ' plus detention time' : ''}.</div>
            )}
          </div>

          {role === 'shipper' && load.status === 'delivered' && <Rating load={load} />}

          {load.status !== 'requested' && (
            <div className="card pad-lg stack">
              <div className="title3">Messages</div>
              <Chat load={load} />
            </div>
          )}
        </div>
      </div>
      {accepting && <AcceptSheet load={load} onClose={() => setAccepting(false)} />}
      {invoice && <InvoiceDoc load={load} company={carrier} shipper={shipper} onClose={() => setInvoice(false)} />}
    </div>
  );
}

function Rating({ load }) {
  const { upsert } = useStore();
  const [stars, setStars] = useState(load.rating?.stars || 0);
  return (
    <div className="card pad-lg stack">
      <div className="title3">{load.rating ? 'Your rating' : 'How did it go?'}</div>
      <div className="row" style={{ gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="btn plain" style={{ padding: 2, height: 44, color: n <= stars ? 'var(--orange)' : 'var(--label-3)' }} aria-label={`${n} stars`}
            onClick={async () => { setStars(n); upsert('loads', await post(`/loads/${load.id}/rate`, { stars: n })); }}>
            <Icon name="star" size={34} fill={n <= stars ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      {load.rating?.comment && <div className="subhead secondary">“{load.rating.comment}”</div>}
    </div>
  );
}
