// Driver mode: one clear next step, one big button. Designed for gloves, sunlight and any age.
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import Chat from '../../components/Chat.jsx';
import { PhotoChecklist, SignaturePad } from '../../components/Inspection.jsx';
import { RouteLine, ActionButton, Empty, Tracker, StatusPill } from '../../components/ui.jsx';
import { CargoFacts, TaskDetails } from '../../components/LoadBits.jsx';
import { useStore, useIndex, isActive, useNow } from '../../lib/store.jsx';
import { post } from '../../lib/api.js';
import { navUrl } from '../../lib/geo.js';
import { km, time, dayLabel, money, duration, placeShort } from '../../lib/format.js';
import { go } from '../../lib/router.js';

/** Streams the phone's GPS to dispatch while a job is active and the driver opted in. */
export function DriverGps() {
  const { data } = useStore();
  const want = data.me.locationSource === 'gps' && data.loads.some(isActive);
  const last = useRef(0);
  useEffect(() => {
    if (!want || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition((p) => {
      if (Date.now() - last.current < 4000) return;
      last.current = Date.now();
      post('/driver/location', { lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed, heading: p.coords.heading }).catch(() => {});
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [want]);
  return null;
}

const HERO = {
  accepted: { tone: '', title: 'You have a new job', button: 'Start driving to pickup', icon: 'navigate', next: 'en_route_pickup' },
  en_route_pickup: { tone: '', title: 'Drive to the pickup', button: 'I’m at the pickup', icon: 'pin', next: 'at_pickup' },
  at_pickup: { tone: 'orange', title: 'Inspect & load', button: 'Load is on — start delivery', icon: 'truck', next: 'in_transit' },
  in_transit: { tone: '', title: 'Drive to the destination', button: 'I’ve arrived', icon: 'flag', next: 'at_delivery' },
  at_delivery: { tone: 'orange', title: 'Unload & get signature', button: 'Complete delivery', icon: 'checkCircle', next: 'delivered' },
  delivered: { tone: 'green', title: 'Delivered — great job!', icon: 'checkCircle' },
};

export default function DriverJob({ loadId }) {
  const { data, upsert, toast } = useStore();
  const idx = useIndex();
  useNow(10000);
  const load = loadId ? idx.loads[loadId] : data.loads.filter(isActive).sort((a, b) => a.acceptedAt - b.acceptedAt)[0];
  const truck = idx.trucks[data.me.truckId];
  const [odo, setOdo] = useState('');
  const [chat, setChat] = useState(false);

  const mapTrucks = useMemo(() => (truck ? [{ ...truck, color: data.me.color, moving: load && isActive(load), label: 'You' }] : []), [truck, data.me.color, load]);
  const leg = load && (['accepted', 'en_route_pickup'].includes(load.status) ? 'toPickup' : 'toDropoff');
  const target = load && (leg === 'toPickup' ? load.pickup : load.dropoff);
  const places = useMemo(() => (target ? [{ ...target, kind: leg === 'toPickup' ? 'pickup' : 'dropoff', label: target.name }] : []), [target, leg]);

  if (!load) return <NoJob />;
  const h = HERO[load.status];
  if (!h) return <div className="page"><Empty title="This job was cancelled" /></div>;

  const pickupDone = data.meta.photoSlots.filter((s) => s.required).every((s) => load.photos.pickup.some((p) => p.slot === s.key));
  const deliveryDone = data.meta.photoSlots.filter((s) => s.required).every((s) => load.photos.delivery.some((p) => p.slot === s.key));
  const ready = load.status === 'at_pickup' ? pickupDone : load.status === 'at_delivery' ? deliveryDone && !!load.signature && !!load.damage : true;
  const blocker = load.status === 'at_pickup' && !pickupDone ? 'Take all the photos first'
    : load.status === 'at_delivery' && !deliveryDone ? 'Take all the photos first'
      : load.status === 'at_delivery' && !load.damage ? 'Answer the damage question'
        : load.status === 'at_delivery' && !load.signature ? 'Get the receiver’s signature' : null;

  const advance = async () => {
    const r = await post(`/loads/${load.id}/status`, { status: h.next, odometer: odo || undefined });
    upsert('loads', r);
    setOdo('');
    if (h.next === 'delivered') {
      toast({ title: 'Delivery complete', body: `${load.ref} closed. Proof of delivery sent to the shipper.`, tone: 'ok' });
      go(`/loads/${load.id}`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const moving = ['en_route_pickup', 'in_transit'].includes(load.status);
  const etaAt = leg === 'toPickup' ? load.eta?.pickupAt : load.eta?.deliveryAt;
  const remaining = leg === 'toPickup' ? load.eta?.toPickupKm : load.eta?.remainingKm;

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <div className={`driver-hero ${h.tone}`} style={{ marginBottom: 16 }}>
        <div className="row between">
          <span className="subhead mono" style={{ opacity: 0.85 }}>{load.ref} · Unit {truck?.unit}</span>
          <span className="pill" style={{ background: 'rgba(255,255,255,.22)', color: '#fff' }}>{data.meta.statuses.find((s) => s.key === load.status)?.short}</span>
        </div>
        <div className="title1" style={{ marginTop: 8 }}>{h.title}</div>
        {moving && <div className="title3" style={{ fontWeight: 500, marginTop: 4 }}>{km(remaining)} · arrive ~{time(etaAt)}</div>}
        {load.status === 'accepted' && <div className="subhead secondary" style={{ marginTop: 4 }}>Pickup {dayLabel(load.pickupWindow.from)} · {placeShort(load.pickup)}</div>}
        {load.status === 'delivered' && <div className="subhead secondary" style={{ marginTop: 4 }}>{km(load.metrics.loadedKm, 1)} driven · signed by {load.signature?.name}</div>}
        <div style={{ marginTop: 14 }}><Tracker status={load.status} /></div>
      </div>

      {load.status !== 'delivered' && (
        <div className="map-card" style={{ marginBottom: 16 }}>
          <MapView height={moving ? 340 : 220} trucks={mapTrucks} places={places} route={load.legs[leg]?.points} fitKey={`${load.id}-${leg}`} padding={40} />
          <div className="map-overlay" style={{ right: 12, bottom: 12 }}>
            <a className="btn primary" href={navUrl(target)} target="_blank" rel="noreferrer" style={{ boxShadow: 'var(--shadow-lg)' }}><Icon name="navigate" size={18} />Directions</a>
          </div>
          {moving && truck?.location && (
            <div className="map-overlay glass" style={{ left: 12, bottom: 12, padding: '8px 14px', textAlign: 'center' }}>
              <div className="title2 num">{Math.round(truck.location.speed || 0)}</div><div className="caption secondary">km/h</div>
            </div>
          )}
        </div>
      )}

      <div className="card pad-lg stack" style={{ marginBottom: 16 }}>
        <RouteLine pickup={load.pickup} dropoff={load.dropoff} pickupNote={load.pickup.phone} dropoffNote={load.dropoff.phone} />
        <div className="row" style={{ gap: 8 }}>
          <a className="btn small" href={`tel:${target?.phone || ''}`}><Icon name="phone" size={16} />Call {leg === 'toPickup' ? 'pickup' : 'receiver'}</a>
          <button className="btn small" onClick={() => setChat(!chat)}><Icon name="message" size={16} />Messages{load.messages.length ? ` (${load.messages.length})` : ''}</button>
        </div>
        {chat && <Chat load={load} />}
      </div>

      {load.status === 'accepted' && (
        <div className="card pad-lg stack" style={{ marginBottom: 16 }}>
          <div className="title3">What you’re hauling</div>
          <div className="subhead">{load.cargo.description}</div>
          <CargoFacts load={load} />
          <TaskDetails load={load} />
        </div>
      )}

      {load.status !== 'accepted' && (load.instructions?.length > 0) && (
        <div className="card pad-lg stack-sm" style={{ marginBottom: 16 }}>
          <div className="title3">Task steps</div>
          <ol className="task-steps">{load.instructions.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      )}

      {load.status === 'at_pickup' && (
        <>
          <StepHead n={1} done={pickupDone} title="Take photos of the trailer and load" sub="These protect you if anything is damaged later." />
          <div style={{ marginBottom: 20 }}><PhotoChecklist load={load} phase="pickup" /></div>
          <StepHead n={2} done={!!odo} title="Odometer reading (optional)" sub={`Truck shows about ${km(truck?.odometerKm)}`} />
          <input className="input" style={{ marginBottom: 20, fontSize: '1.3rem', height: 58 }} type="number" inputMode="numeric" placeholder={Math.round(truck?.odometerKm || 0).toString()} value={odo} onChange={(e) => setOdo(e.target.value)} />
        </>
      )}

      {load.status === 'at_delivery' && (
        <>
          <StepHead n={1} done={deliveryDone && !!load.damage} title="Take the same photos again" sub="We compare them with the pickup photos." />
          <div style={{ marginBottom: 20 }}><PhotoChecklist load={load} phase="delivery" /></div>
          <StepHead n={2} done={!!load.signature} title="Receiver signs here" />
          <div style={{ marginBottom: 20 }}><SignaturePad load={load} /></div>
          <StepHead n={3} done={!!odo} title="Odometer reading (optional)" />
          <input className="input" style={{ marginBottom: 20, fontSize: '1.3rem', height: 58 }} type="number" inputMode="numeric" placeholder={Math.round(truck?.odometerKm || 0).toString()} value={odo} onChange={(e) => setOdo(e.target.value)} />
        </>
      )}

      {moving && (
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card stat"><div className="k">Kilometres this job</div><div className="v">{km(load.metrics.deadheadKm + load.metrics.loadedKm, 1)}</div><div className="d">Tracked by GPS</div></div>
          <button className="card stat clickable" style={{ border: 0, textAlign: 'left' }} onClick={() => go('/fuel')}><div className="k"><Icon name="fuel" size={16} style={{ color: 'var(--orange)' }} />Fuel stop?</div><div className="v blue" style={{ fontSize: '1.2rem' }}>Log fuel</div><div className="d">Adds to this job</div></button>
        </div>
      )}

      {load.status === 'delivered' ? (
        <div className="stack">
          <div className="card pad-lg kv">
            <div><div className="k">Loaded km</div><div className="v">{km(load.metrics.loadedKm, 1)}</div></div>
            <div><div className="k">Empty km</div><div className="v">{km(load.metrics.deadheadKm, 1)}</div></div>
            <div><div className="k">Job time</div><div className="v">{duration(load.economics?.hours)}</div></div>
            <div><div className="k">You earned</div><div className="v green">{money(load.economics?.driverPay)}</div></div>
          </div>
          <button className="btn xl" onClick={() => go('/')}>Back to my jobs</button>
        </div>
      ) : (
        <div style={{ position: 'sticky', bottom: 'calc(var(--tabbar) + env(safe-area-inset-bottom) + 10px)', zIndex: 20 }}>
          <ActionButton className={`btn xl ${load.status === 'at_delivery' ? 'green' : 'primary'}`} disabled={!ready} onClick={advance} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <Icon name={h.icon} size={24} stroke={2.2} />{blocker || h.button}
          </ActionButton>
        </div>
      )}
      {moving && <div className="footnote tertiary" style={{ textAlign: 'center', marginTop: 10 }}>Arrival is detected automatically when you reach the gate.</div>}
    </div>
  );
}

function StepHead({ n, title, sub, done }) {
  return (
    <div className="row" style={{ margin: '4px 0 12px', alignItems: 'flex-start' }}>
      <div className={`step-num ${done ? 'done' : ''}`}>{done ? <Icon name="check" size={16} stroke={3} /> : n}</div>
      <div><div className="title3">{title}</div>{sub && <div className="subhead secondary">{sub}</div>}</div>
    </div>
  );
}

function NoJob() {
  const { data } = useStore();
  const shift = data.shifts.find((s) => s.driverId === data.me.id && !s.end);
  const past = data.loads.filter((l) => l.status === 'delivered').sort((a, b) => b.deliveredAt - a.deliveredAt).slice(0, 8);
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <div className="driver-hero green" style={{ marginBottom: 16 }}>
        <div className="subhead secondary">Hi {data.me.name.split(' ')[0]}</div>
        <div className="title1" style={{ marginTop: 6 }}>No job right now</div>
        <div className="subhead secondary" style={{ marginTop: 4 }}>Dispatch will send your next load here. Your phone will show an alert.</div>
        <div style={{ marginTop: 16 }}>
          <ActionButton className="btn large" style={{ background: 'rgba(255,255,255,.95)', color: '#1f9e45', width: '100%' }} onClick={() => post('/driver/clock', { action: shift ? 'out' : 'in' })}>
            <Icon name="clock" size={20} />{shift ? `On duty since ${time(shift.start)} — Clock out` : 'Clock in — I’m available'}
          </ActionButton>
        </div>
      </div>
      <div className="section-header">Recent deliveries</div>
      <div className="list">
        {past.length === 0 && <div className="list-row secondary">Your completed jobs will show here.</div>}
        {past.map((l) => (
          <button key={l.id} className="list-row" onClick={() => go(`/loads/${l.id}`)}>
            <div className="label">
              <div className="headline">{placeShort(l.pickup)} → {placeShort(l.dropoff)}</div>
              <div className="footnote secondary">{l.ref} · {dayLabel(l.deliveredAt)} · {km(l.metrics.loadedKm)}</div>
            </div>
            <StatusPill status={l.status} />
            <Icon name="chevron" size={16} className="chev" />
          </button>
        ))}
      </div>
    </div>
  );
}

