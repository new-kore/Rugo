// Live fleet: map + every truck with kilometres left and arrival time; click a truck for its full file.
import { messageDriver } from '../../lib/chat.js';
import { OffRouteBanner } from '../../components/PlanVsActual.jsx';
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import { PageHead, Avatar, StatusPill, Tracker, RouteLine, Lightbox, ActionButton, ConfirmButton } from '../../components/ui.jsx';
import { progressOf } from '../../components/LoadList.jsx';
import { useStore, useIndex, isActive, useNow } from '../../lib/store.jsx';
import { km, ago, time, dayLabel, money2, placeShort, duration } from '../../lib/format.js';
import { post, del } from '../../lib/api.js';
import { go } from '../../lib/router.js';
import { truckEconomy, driverStats } from './Drivers.jsx';

const etaText = (t) => (t ? (new Date(t).toDateString() === new Date().toDateString() ? time(t) : dayLabel(t)) : '—');

export default function Fleet() {
  const { data } = useStore();
  const idx = useIndex();
  useNow(5000);
  const [sel, setSel] = useState(() => sessionStorage.getItem('rugo.fleetSel') || null);
  useEffect(() => {
    // Opened from global search or a notification.
    const pick = () => { const v = sessionStorage.getItem('rugo.fleetSel'); if (v) { setSel(v); sessionStorage.removeItem('rugo.fleetSel'); } };
    pick();
    window.addEventListener('rugo:fleet-select', pick);
    return () => window.removeEventListener('rugo:fleet-select', pick);
  }, []);
  const jobByTruck = Object.fromEntries(data.loads.filter(isActive).map((l) => [l.truckId, l]));
  const avg = data.settings.avgSpeedKmh;

  const trucks = useMemo(() => data.trucks.map((t) => {
    const d = idx.users[t.driverId];
    const job = jobByTruck[t.id];
    const p = progressOf(job, avg);
    const label = `Unit ${t.unit}${d ? ` · ${d.name}` : ''}${p?.kmLeft ? ` · ${km(p.kmLeft)} left · ETA ${etaText(p.etaAt)}` : ''}`;
    return { ...t, color: d?.color || '#8b8f97', moving: !!job, selected: sel === t.id, label };
  }), [data.trucks, idx, sel, data.loads]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = trucks.find((t) => t.id === sel);
  const selJob = selected && jobByTruck[selected.id];
  const moving = trucks.filter((t) => (t.location?.speed || 0) > 1).length;
  const leg = selJob && (['accepted', 'en_route_pickup'].includes(selJob.status) ? 'toPickup' : 'toDropoff');

  return (
    <div className="page wide" style={{ maxWidth: 1480 }}>
      <PageHead sub={`${data.trucks.length} trucks · ${moving} moving · ${Object.keys(jobByTruck).length} on a job`} />
      <div className="split" style={{ '--split': 'minmax(0, 1.35fr) minmax(360px, 1fr)' }}>
        <div className="map-card sticky-top" style={{ height: 'calc(100vh - 150px)', minHeight: 460 }}>
          <MapView height="100%" trucks={trucks}
            places={selJob ? [{ ...selJob.pickup, kind: 'pickup', label: `Pickup · ${selJob.pickup.name}` }, { ...selJob.dropoff, kind: 'dropoff', label: `Delivery · ${selJob.dropoff.name}` }] : []}
            route={selJob?.legs[leg]?.points} track={selJob?.track}
            fitKey={`fleet-${sel || 'all'}`} onTruckClick={setSel} padding={60} />
        </div>
        {selected
          ? <TruckFile truck={selected} job={selJob} onClose={() => setSel(null)} />
          : (
            <div className="list">
              {trucks.map((t) => <TruckRow key={t.id} truck={t} job={jobByTruck[t.id]} onClick={() => setSel(t.id)} />)}
            </div>
          )}
      </div>
    </div>
  );
}

function TruckRow({ truck: t, job, onClick }) {
  const { data } = useStore();
  const idx = useIndex();
  const d = idx.users[t.driverId];
  const p = progressOf(job, data.settings.avgSpeedKmh);
  const service = t.nextServiceKm - t.odometerKm;
  return (
    <button className="list-row" onClick={onClick} style={{ alignItems: 'flex-start', padding: '12px 14px' }}>
      <Avatar user={d} />
      <div className="label">
        <div className="row" style={{ gap: 6 }}>
          <span className="headline">Unit {t.unit}</span>
          {job ? <StatusPill status={job.status} /> : <span className="pill gray">{d?.status === 'off_duty' ? 'Off duty' : 'Available'}</span>}
          {(t.notes?.length || 0) > 0 && <span className="pill gray" title="Notes"><Icon name="doc" size={11} />{t.notes.length}</span>}
        </div>
        <div className="footnote secondary truncate">{d?.name || 'No driver'} · {data.meta.equipment[t.equipment]?.label}</div>
        {p && (
          <div className="row" style={{ gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="subhead"><span className="secondary">{p.stage === 'To pickup' ? 'To pickup' : 'To'} {p.place.city}</span></span>
            <span className="subhead num" style={{ fontWeight: 600 }}>{p.kmLeft ? `${km(p.kmLeft)} left` : p.stage}</span>
            <span className="subhead num">{p.etaAt ? <>ETA <b>{etaText(p.etaAt)}</b></> : p.deliveryAt ? <>Delivery <b>{etaText(p.deliveryAt)}</b></> : 'At the dock'}</span>
          </div>
        )}
        <div className="caption tertiary" style={{ marginTop: 3 }}>
          {Math.round(t.location?.speed || 0)} km/h · GPS {ago(t.location?.updatedAt)}
          {service < 2000 && <span className="orange"> · service {service < 0 ? 'overdue' : `in ${km(service)}`}</span>}
        </div>
      </div>
      <Icon name="chevron" size={15} className="chev" style={{ marginTop: 4 }} />
    </button>
  );
}

function TruckFile({ truck: t, job, onClose }) {
  const { data, toast } = useStore();
  const idx = useIndex();
  const d = idx.users[t.driverId];
  const p = progressOf(job, data.settings.avgSpeedKmh);
  const econ = truckEconomy(t, data);
  const week = d ? driverStats(d, data) : null;
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const last = data.loads.filter((l) => l.truckId === t.id && l.status === 'delivered').sort((a, b) => b.deliveredAt - a.deliveredAt)[0];
  const photoLoad = job && (job.photos.pickup.length || job.photos.delivery.length) ? job : last;
  const photos = photoLoad ? [
    ...photoLoad.photos.pickup.map((x) => ({ ...x, phase: 'Pickup' })),
    ...photoLoad.photos.delivery.map((x) => ({ ...x, phase: 'Delivery' })),
  ] : [];
  const slotLabel = (k) => (k === 'damage' ? 'Damage' : data.meta.photoSlots.find((s) => s.key === k)?.label || k);
  const service = t.nextServiceKm - t.odometerKm;

  const addNote = async () => {
    await post(`/trucks/${t.id}/notes`, { text: note });
    setNote('');
    toast({ title: 'Note added', body: `Unit ${t.unit}` });
  };

  return (
    <div className="stack fade-in" style={{ gap: 12 }}>
      <div className="row">
        <button className="btn plain" onClick={onClose}><Icon name="chevronLeft" size={16} />All trucks</button>
        <div className="spacer" />
        {job && <button className="btn small" onClick={() => go(`/loads/${job.id}`)}>Open {job.ref}</button>}
        {t.driverId && <button className="btn small" onClick={() => messageDriver(t.driverId)}><Icon name="send" size={14} />Chat</button>}
      </div>

      <div className="card pad-lg stack">
        <div className="row between">
          <div>
            <div className="title2">Unit {t.unit}</div>
            <div className="subhead secondary">{t.year} {t.make} {t.model} · <span className="mono">{t.plate}</span></div>
          </div>
          {job ? <StatusPill status={job.status} long /> : <span className="pill gray">{d?.status === 'off_duty' ? 'Off duty' : 'Available'}</span>}
        </div>
        {p ? (
          <>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <Metric k={p.stage === 'To pickup' ? 'Km to pickup' : 'Km left'} v={p.kmLeft ? km(p.kmLeft) : '0 km'} />
              <Metric k={p.stage === 'To pickup' ? 'Pickup ETA' : 'Arrival ETA'} v={p.etaAt ? etaText(p.etaAt) : 'At the dock'} strong />
              <Metric k="Speed" v={`${Math.round(t.location?.speed || 0)} km/h`} />
            </div>
            {p.stage === 'To pickup' && (
              <div className="footnote secondary">Then {km(job.quote.distanceKm)} loaded to {job.dropoff.city} · delivery around <b>{etaText(p.deliveryAt)}</b> · {km(p.totalKmLeft)} in total</div>
            )}
            {p.stage === 'Loading' && <div className="footnote secondary">{km(p.totalKmLeft)} to {job.dropoff.city} after loading · delivery around <b>{etaText(p.deliveryAt)}</b></div>}
            <Tracker status={job.status} />
            <OffRouteBanner load={job} />
            <RouteLine pickup={job.pickup} dropoff={job.dropoff} compact />
            <div className="footnote secondary">
              <span className="mono">{job.ref}</span> · {job.cargo.description} · {idx.companies[job.shipperId]?.name}
              {' '}· driven {km(job.metrics.deadheadKm + job.metrics.loadedKm, 1)} · GPS {ago(t.location?.updatedAt)}
            </div>
            {job.notes && <div className="card pad" style={{ background: 'var(--bg-fill-2)', boxShadow: 'none' }}><span className="footnote secondary">Shipper’s note</span><div className="subhead">{job.notes}</div></div>}
          </>
        ) : (
          <div className="subhead secondary">No job right now. Parked {t.location ? `near ${nearest(t.location)}` : ''} · GPS {ago(t.location?.updatedAt)}</div>
        )}
      </div>

      <div className="card pad-lg stack">
        <div className="row between"><div className="title3">Driver</div>{d?.rating && <span className="footnote secondary">★ {d.rating}</span>}</div>
        {d ? (
          <>
            <div className="row">
              <Avatar user={d} size="lg" />
              <div className="spacer">
                <div className="headline">{d.name}</div>
                <div className="subhead secondary">Licence {d.licenseClass} · <span style={{ userSelect: 'all' }}>{d.phone}</span></div>
              </div>
              {d.phone && <a className="btn small" href={`tel:${d.phone}`}><Icon name="phone" size={14} />Call</a>}
            </div>
            <div className="kv">
              <div><div className="k">Pay</div><div className="v">{d.payType === 'per_km' ? `${money2(d.perKmRate)}/km` : `${money2(d.hourlyRate)}/h`}</div></div>
              <div><div className="k">Hours (7d)</div><div className="v">{week.hours.toFixed(1)}</div></div>
              <div><div className="k">Km (7d)</div><div className="v">{Math.round(week.kms).toLocaleString()}</div></div>
              <div><div className="k">Jobs (7d)</div><div className="v">{week.jobs}</div></div>
            </div>
          </>
        ) : <div className="subhead secondary">No driver assigned. Assign one in Drivers & trucks.</div>}
      </div>

      <div className="card pad-lg stack">
        <div className="row between">
          <div className="title3">Photos</div>
          <span className="footnote secondary">{photoLoad ? `${photoLoad === job ? 'Current job' : 'Last job'} · ${photoLoad.ref}` : ''}</span>
        </div>
        {photos.length ? (
          <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {photos.map((x) => (
              <button key={x.id} className="photo-slot" onClick={() => setOpen({ ...x, label: `${slotLabel(x.slot)} — ${x.phase}` })} style={{ padding: 0 }}>
                <img src={x.url} alt={`${slotLabel(x.slot)} at ${x.phase}`} />
                <div className="cap" style={{ fontSize: '0.7rem', padding: '14px 6px 5px' }}>{x.phase} · {slotLabel(x.slot).replace('Trailer — ', '')}</div>
              </button>
            ))}
          </div>
        ) : <div className="subhead secondary">Inspection photos from the driver show up here.</div>}
      </div>

      <div className="card pad-lg stack">
        <div className="title3">Truck</div>
        <div className="kv">
          <div><div className="k">Trailer</div><div className="v">{data.meta.equipment[t.equipment]?.label}</div></div>
          <div><div className="k">Odometer</div><div className="v">{km(t.odometerKm)}</div></div>
          <div><div className="k">Fuel use (30d)</div><div className="v">{econ.lPer100 ? `${econ.lPer100.toFixed(1)} L/100` : `${t.fuelLPer100} L/100 (spec)`}</div></div>
          <div><div className="k">Fuel spend (30d)</div><div className="v">{money2(econ.spend)}</div></div>
          <div><div className="k">Next service</div><div className={`v ${service < 0 ? 'red' : service < 2000 ? 'orange' : ''}`}>{service < 0 ? `Overdue ${km(-service)}` : `in ${km(service)}`}</div></div>
          <div><div className="k">VIN</div><div className="v mono truncate" style={{ fontSize: '0.8rem' }}>{t.vin || '—'}</div></div>
        </div>
      </div>

      <div className="card pad-lg stack">
        <div className="row between"><div className="title3">Notes</div><span className="footnote secondary">{t.notes?.length || 0}</span></div>
        {(t.notes || []).slice().reverse().map((n) => (
          <div key={n.id} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <Icon name="doc" size={15} style={{ color: 'var(--label-3)', marginTop: 3 }} />
            <div className="spacer" style={{ minWidth: 0 }}>
              <div className="subhead" style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
              <div className="caption tertiary">{n.by} · {dayLabel(n.t)}{n.loadRef ? ` · ${n.loadRef}` : ''}</div>
            </div>
            <ConfirmButton className="btn plain small" confirmLabel="Delete?" aria-label="Delete note" onConfirm={() => del(`/trucks/${t.id}/notes/${n.id}`)}><Icon name="trash" size={13} /></ConfirmButton>
          </div>
        ))}
        <textarea id={`note-${t.id}`} className="textarea" style={{ minHeight: 70 }} placeholder="Add a note about this truck, driver or job…" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row"><div className="spacer" /><ActionButton className="btn primary small" disabled={!note.trim()} onClick={addNote}>Add note</ActionButton></div>
      </div>
      <Lightbox photo={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Metric({ k, v, strong }) {
  return (
    <div style={{ background: 'var(--bg-fill-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div className="caption secondary">{k}</div>
      <div className={strong ? 'title3 num blue' : 'title3 num'}>{v}</div>
    </div>
  );
}

const PLACES = [['Brampton yard', 43.73, -79.76], ['Toronto', 43.65, -79.38], ['Hamilton', 43.26, -79.87], ['Mississauga', 43.59, -79.64], ['Ottawa', 45.42, -75.7], ['Montréal', 45.5, -73.57], ['Kingston', 44.23, -76.49], ['London', 42.98, -81.25], ['Windsor', 42.31, -83.04], ['Barrie', 44.39, -79.69], ['Sudbury', 46.49, -80.99], ['Québec', 46.81, -71.21], ['Buffalo', 42.89, -78.88], ['Detroit', 42.33, -83.05]];
function nearest(loc) {
  let best = PLACES[0]; let bd = Infinity;
  for (const p of PLACES) { const dd = (p[1] - loc.lat) ** 2 + (p[2] - loc.lng) ** 2; if (dd < bd) { bd = dd; best = p; } }
  return best[0];
}
void duration; void placeShort;
