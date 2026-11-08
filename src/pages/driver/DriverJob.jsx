// Driver mode: one clear next step, one big button. Designed for gloves, sunlight and any age.
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import LoadNotes from '../../components/LoadNotes.jsx';
import { PhotoChecklist, SignaturePad } from '../../components/Inspection.jsx';
import { RouteLine, ActionButton, Empty, Tracker, StatusPill } from '../../components/ui.jsx';
import { CargoFacts, TaskDetails } from '../../components/LoadBits.jsx';
import FuelForm from '../../components/FuelForm.jsx';
import { useStore, useIndex, isActive, useNow } from '../../lib/store.jsx';
import { post } from '../../lib/api.js';
import { navUrl } from '../../lib/geo.js';
import { km, time, dayLabel, money, duration, placeShort } from '../../lib/format.js';
import { go } from '../../lib/router.js';

// The driver's steps, in order. Some are load statuses, some are steps inside a status.
const STEPS = [
  { key: 'pickup', label: 'At pickup' }, { key: 'loading', label: 'Loading' }, { key: 'road', label: 'On the road' },
  { key: 'delivered', label: 'Delivered' }, { key: 'offloaded', label: 'Off-loaded' }, { key: 'ended', label: 'Ended' },
];
function stepOf(l) {
  if (l.status === 'delivered') return 'ended';
  if (l.status === 'at_delivery') return l.offloadedAt ? 'offloaded' : 'delivered';
  if (l.status === 'in_transit') return 'road';
  if (l.status === 'at_pickup') return l.loadingStartedAt ? 'loading' : 'pickup';
  return null;
}

function DriverSteps({ load }) {
  const cur = stepOf(load);
  const i = STEPS.findIndex((x) => x.key === cur);
  return (
    <div className="dsteps">
      {STEPS.map((x, k) => (
        <div key={x.key} className={`dstep ${k < i ? 'done' : ''} ${k === i ? 'on' : ''}`}>
          <span className="dstep-dot">{k < i ? <Icon name="check" size={11} stroke={3} /> : null}</span>
          <span className="dstep-l">{x.label}</span>
        </div>
      ))}
    </div>
  );
}

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
  if (load.status === 'cancelled' || load.status === 'requested') return <div className="page"><Empty title="This job was cancelled" /></div>;

  const pickupDone = data.meta.photoSlots.filter((s) => s.required).every((s) => load.photos.pickup.some((p) => p.slot === s.key));
  const deliveryDone = data.meta.photoSlots.filter((s) => s.required).every((s) => load.photos.delivery.some((p) => p.slot === s.key));
  const status = (to) => async () => {
    const r = await post(`/loads/${load.id}/status`, { status: to, odometer: odo || undefined });
    upsert('loads', r); setOdo('');
    if (to === 'delivered') { toast({ title: 'Job ended', body: `${load.ref} closed. Proof of delivery sent to the customer.`, tone: 'ok' }); go(`/loads/${load.id}`); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const event = (type, extra) => async () => {
    try { upsert('loads', await post(`/loads/${load.id}/event`, { type, ...extra })); } catch (e) { toast({ title: 'Couldn’t save', body: e.message, tone: 'error' }); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const at = (t) => (t ? time(t) : '');
  const h = (() => {
    switch (load.status) {
      case 'accepted': return { title: 'You have a new job', button: 'Start driving to pickup', icon: 'navigate', run: status('en_route_pickup') };
      case 'en_route_pickup': return load.activeStop
        ? { tone: 'orange', title: 'Gas stop', sub: `Stopped at ${at(load.activeStop.start)}`, button: 'Back on the road', icon: 'navigate', run: event('fuel_end') }
        : { title: 'Drive to the pickup', button: 'I’m at the pickup', icon: 'pin', run: status('at_pickup') };
      case 'at_pickup': return load.loadingStartedAt
        ? { tone: 'orange', title: 'Loading', sub: `Started ${at(load.loadingStartedAt)} · take the photos while you load`, button: 'Loaded — start trip', icon: 'truck', run: status('in_transit'), blocker: !pickupDone && 'Take all the photos first' }
        : { tone: 'orange', title: 'You’re at the pickup', sub: `Arrived ${at(load.arrivedPickupAt)} · press Loading when they start loading you`, button: 'Loading', icon: 'box', run: event('loading_start') };
      case 'in_transit': return load.activeStop
        ? { tone: 'orange', title: 'Gas stop', sub: `Stopped at ${at(load.activeStop.start)} · log your fill-up below`, button: 'Back on the road', icon: 'navigate', run: event('fuel_end') }
        : { title: 'Drive to the customer', button: 'Delivered — I’m at the customer', icon: 'flag', run: status('at_delivery') };
      case 'at_delivery': return load.offloadedAt
        ? { tone: 'orange', title: 'Off-loaded — get the signature', sub: `Unloaded at ${at(load.offloadedAt)}`, button: 'End job', icon: 'checkCircle', run: status('delivered'), green: true, blocker: !load.signature && 'Get the receiver’s signature' }
        : { tone: 'orange', title: 'Delivered — off-load the trailer', sub: `Arrived ${at(load.arrivedDeliveryAt)} · take the photos as you unload`, button: 'Off-loaded', icon: 'box', run: event('offloaded'), blocker: !deliveryDone ? 'Take all the photos first' : !load.damage ? 'Answer the damage question' : null };
      default: return { tone: 'green', title: 'Job ended — great work!' };
    }
  })();
  const ready = !h.blocker;

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
        {moving && !load.activeStop && <div className="title3" style={{ fontWeight: 500, marginTop: 4 }}>{km(remaining)} · arrive ~{time(etaAt)}</div>}
        {load.status === 'accepted' && <div className="subhead secondary" style={{ marginTop: 4 }}>Pickup {dayLabel(load.pickupWindow.from)} · {placeShort(load.pickup)}</div>}
        {load.status === 'delivered' && <div className="subhead secondary" style={{ marginTop: 4 }}>{km(load.metrics.loadedKm, 1)} driven · signed by {load.signature?.name}</div>}
        {h.sub && <div className="subhead" style={{ marginTop: 4, opacity: 0.9 }}>{h.sub}</div>}
        <div style={{ marginTop: 14 }}>{stepOf(load) ? <DriverSteps load={load} /> : <Tracker status={load.status} />}</div>
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
          <button className="btn small" onClick={() => setChat(!chat)}><Icon name="doc" size={16} />Notes{(load.messages.length + (load.notes ? 1 : 0)) ? ` (${load.messages.length + (load.notes ? 1 : 0)})` : ''}</button>
        </div>
        {chat && <LoadNotes load={load} compact />}
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

      {load.status === 'at_pickup' && load.loadingStartedAt && (
        <>
          <StepHead n={1} done={pickupDone} title="Take photos of the trailer and load" sub="These protect you if anything is damaged later." />
          <div style={{ marginBottom: 20 }}><PhotoChecklist load={load} phase="pickup" /></div>
          <StepHead n={2} done={!!odo} title="Odometer reading (optional)" sub={`Truck shows about ${km(truck?.odometerKm)}`} />
          <input className="input" style={{ marginBottom: 20, fontSize: '1.3rem', height: 58 }} type="number" inputMode="numeric" placeholder={Math.round(truck?.odometerKm || 0).toString()} value={odo} onChange={(e) => setOdo(e.target.value)} />
        </>
      )}

      {load.status === 'at_delivery' && !load.offloadedAt && (
        <>
          <StepHead n={1} done={deliveryDone && !!load.damage} title="Take the same photos again" sub="We compare them with the pickup photos." />
          <div style={{ marginBottom: 20 }}><PhotoChecklist load={load} phase="delivery" /></div>
        </>
      )}

      {load.status === 'at_delivery' && load.offloadedAt && (
        <>
          <StepHead n={1} done={!!load.signature} title="Receiver signs here" />
          <div style={{ marginBottom: 20 }}><SignaturePad load={load} /></div>
          <StepHead n={2} done={!!odo} title="Odometer reading (optional)" />
          <input className="input" style={{ marginBottom: 20, fontSize: '1.3rem', height: 58 }} type="number" inputMode="numeric" placeholder={Math.round(truck?.odometerKm || 0).toString()} value={odo} onChange={(e) => setOdo(e.target.value)} />
        </>
      )}

      {moving && load.activeStop && (
        <div className="card pad-lg stack" style={{ marginBottom: 16 }}>
          <div className="title3">Log your fill-up</div>
          <div className="footnote secondary">Take a photo of the receipt. Saving it puts you back on the road.</div>
          <FuelForm truckId={load.truckId} onDone={(f) => event('fuel_end', { fuelLogId: f.id })()} />
        </div>
      )}

      {moving && (
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card stat"><div className="k">Kilometres this job</div><div className="v">{km(load.metrics.deadheadKm + load.metrics.loadedKm, 1)}</div><div className="d">Tracked by GPS</div></div>
          {!load.activeStop
            ? <ActionButton className="card stat clickable gas-btn" onClick={event('fuel_start')}><div className="k"><Icon name="fuel" size={16} style={{ color: 'var(--orange)' }} />Need fuel?</div><div className="v" style={{ fontSize: '1.2rem', color: 'var(--orange)' }}>Gas stop</div><div className="d">Pauses the trip and logs your fill-up</div></ActionButton>
            : <div className="card stat"><div className="k"><Icon name="fuel" size={16} style={{ color: 'var(--orange)' }} />On a gas stop</div><div className="v" style={{ fontSize: '1.2rem' }}>Since {time(load.activeStop.start)}</div><div className="d">{(load.stops || []).length} earlier stop{(load.stops || []).length === 1 ? '' : 's'} this job</div></div>}
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
          <button className="btn xl" onClick={() => go('/')}>Back to today</button>
        </div>
      ) : (
        <div style={{ position: 'sticky', bottom: 'calc(var(--tabbar) + env(safe-area-inset-bottom) + 10px)', zIndex: 20 }}>
          <ActionButton className={`btn xl ${h.green ? 'green' : 'primary'}`} disabled={!ready} onClick={h.run} style={{ boxShadow: 'var(--shadow-lg)' }}>
            <Icon name={h.icon} size={24} stroke={2.2} />{h.blocker || h.button}
          </ActionButton>
        </div>
      )}
      {moving && !load.activeStop && <div className="footnote tertiary" style={{ textAlign: 'center', marginTop: 10 }}>Arrival is detected automatically when you reach the gate.</div>}
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

