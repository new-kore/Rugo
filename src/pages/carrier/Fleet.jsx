import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import { PageHead, Avatar, StatusPill } from '../../components/ui.jsx';
import { useStore, useIndex, isActive, useNow } from '../../lib/store.jsx';
import { km, ago } from '../../lib/format.js';
import { go } from '../../lib/router.js';

export default function Fleet() {
  const { data } = useStore();
  const idx = useIndex();
  useNow(5000);
  const [sel, setSel] = useState(null);
  const jobByTruck = Object.fromEntries(data.loads.filter(isActive).map((l) => [l.truckId, l]));

  const trucks = useMemo(() => data.trucks.map((t) => {
    const d = idx.users[t.driverId];
    const job = jobByTruck[t.id];
    return { ...t, color: d?.color || '#8e8e93', moving: !!job, selected: sel === t.id, label: `Unit ${t.unit}${d ? ` · ${d.name}` : ''}${job ? ` · ${job.ref}` : ''}` };
  }), [data.trucks, idx, sel, data.loads]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = trucks.find((t) => t.id === sel);
  const selJob = selected && jobByTruck[selected.id];
  const moving = trucks.filter((t) => (t.location?.speed || 0) > 1).length;

  return (
    <div className="page wide" style={{ maxWidth: 1400 }}>
      <PageHead title="Live fleet" sub={`${data.trucks.length} trucks · ${moving} moving · ${Object.keys(jobByTruck).length} on a job`} />
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 1fr)' }}>
        <div className="map-card" style={{ height: 'calc(100vh - 150px)', minHeight: 460 }}>
          <MapView height="100%" trucks={trucks} places={selJob ? [{ ...selJob.pickup, kind: 'pickup' }, { ...selJob.dropoff, kind: 'dropoff' }] : []}
            route={selJob?.legs[selJob.status === 'in_transit' || selJob.status === 'at_delivery' ? 'toDropoff' : 'toPickup']?.points}
            fitKey={`fleet-${sel || 'all'}`} onTruckClick={setSel} padding={60} />
          {selected && (
            <div className="map-overlay glass" style={{ left: 14, top: 14, padding: 14, width: 300 }}>
              <div className="row between">
                <div className="headline">Unit {selected.unit}</div>
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSel(null)} aria-label="Close"><Icon name="close" size={14} /></button>
              </div>
              <div className="footnote secondary">{selected.year} {selected.make} {selected.model} · {selected.plate}</div>
              <div className="kv" style={{ marginTop: 10, gridTemplateColumns: '1fr 1fr' }}>
                <div><div className="k">Speed</div><div className="v">{Math.round(selected.location?.speed || 0)} km/h</div></div>
                <div><div className="k">Odometer</div><div className="v">{km(selected.odometerKm)}</div></div>
              </div>
              {selJob && <button className="btn primary small block" style={{ marginTop: 12 }} onClick={() => go(`/loads/${selJob.id}`)}>Open {selJob.ref}</button>}
            </div>
          )}
        </div>
        <div className="list" style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
          {trucks.map((t) => {
            const d = idx.users[t.driverId];
            const job = jobByTruck[t.id];
            const service = t.nextServiceKm - t.odometerKm;
            return (
              <button key={t.id} className="list-row indent" onClick={() => setSel(t.id)} style={{ background: sel === t.id ? 'var(--bg-fill-2)' : undefined }}>
                <Avatar user={d} />
                <div className="label">
                  <div className="row" style={{ gap: 6 }}><span className="headline">Unit {t.unit}</span>{job ? <StatusPill status={job.status} /> : <span className="pill gray">{d?.status === 'off_duty' ? 'Off duty' : 'Available'}</span>}</div>
                  <div className="footnote secondary truncate">{d?.name || 'No driver'} · {data.meta.equipment[t.equipment]?.label}{job ? ` · ${job.dropoff.city}` : ''}</div>
                  <div className="caption tertiary">{Math.round(t.location?.speed || 0)} km/h · updated {ago(t.location?.updatedAt)}{service < 2000 ? ' · ' : ''}{service < 2000 && <span className="orange">service {service < 0 ? 'overdue' : `in ${km(service)}`}</span>}</div>
                </div>
                <Icon name="chevron" size={16} className="chev" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
