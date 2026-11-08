import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import { PageHead, Segmented, Empty, RouteLine } from '../../components/ui.jsx';
import { AcceptSheet } from '../../components/LoadBits.jsx';
import { useStore, useIndex, isActive } from '../../lib/store.jsx';
import { money, money2, km, ago, dayLabel } from '../../lib/format.js';
import { haversine } from '../../lib/geo.js';
import { go } from '../../lib/router.js';
import { post } from '../../lib/api.js';
import { useMatches, aiOn } from '../../lib/ai.js';
import { ScoreBadge } from '../../components/MatchList.jsx';

export default function Board() {
  const { data } = useStore();
  const idx = useIndex();
  const ai = aiOn(data.settings);
  const [sort, setSort] = useState('pay');
  const [accept, setAccept] = useState(null);
  const [hover, setHover] = useState(null);

  const busy = new Set(data.loads.filter(isActive).map((l) => l.driverId));
  const freeTrucks = data.trucks.filter((t) => t.driverId && !busy.has(t.driverId) && idx.users[t.driverId]?.status !== 'off_duty');

  const rows = useMemo(() => data.loads.filter((l) => l.status === 'requested').map((l) => {
    const near = freeTrucks.map((t) => ({ t, d: t.location ? haversine(t.location, l.pickup) * 1.2 : 1e9 })).sort((a, b) => a.d - b.d)[0];
    const match = freeTrucks.some((t) => t.equipment === l.cargo.equipment);
    return { l, near, match, perKm: l.quote.carrierPayout / l.quote.distanceKm };
  }).sort((a, b) => (sort === 'pay' ? b.perKm - a.perKm : sort === 'near' ? (a.near?.d ?? 1e9) - (b.near?.d ?? 1e9) : b.l.createdAt - a.l.createdAt)), [data.loads, freeTrucks, sort]);

  const trucks = useMemo(() => freeTrucks.map((t) => ({ ...t, color: idx.users[t.driverId]?.color, label: `Unit ${t.unit} · ${idx.users[t.driverId]?.name} · available` })), [freeTrucks, idx]);
  const places = useMemo(() => rows.flatMap(({ l }) => [
    { ...l.pickup, kind: 'pickup', label: `${l.ref} pickup · ${money(l.quote.carrierPayout)}` },
    ...(hover === l.id ? [{ ...l.dropoff, kind: 'dropoff', label: `${l.ref} delivery` }] : []),
  ]), [rows, hover]);
  const hoverLoad = rows.find((r) => r.l.id === hover)?.l;

  return (
    <div className="page wide" style={{ maxWidth: 1400 }}>
      <PageHead title="Load board" sub={`${rows.length} loads waiting · ${freeTrucks.length} trucks available`}>
        <Segmented value={sort} onChange={setSort} options={[{ value: 'pay', label: 'Best $/km' }, { value: 'near', label: 'Closest' }, { value: 'new', label: 'Newest' }]} />
      </PageHead>
      {ai && (
        <div className="card pad row" style={{ marginBottom: 12, gap: 10 }}>
          <Icon name="sparkles" size={18} style={{ color: 'var(--blue)' }} />
          <div className="spacer subhead">
            <b>AI dispatch is {data.settings.dispatchMode === 'auto' ? 'on autopilot' : 'suggesting'}.</b>{' '}
            <span className="secondary">{data.settings.dispatchMode === 'auto'
              ? `Loads paying ${money2(data.settings.autoMinPerKm)}/km+ with a driver match of ${data.settings.autoMinScore}+ are accepted automatically.`
              : 'Each load shows the best driver. One tap accepts and dispatches.'}</span>
          </div>
          <button className="btn small" onClick={() => go('/settings')}>Settings</button>
        </div>
      )}
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div className="stack">
          {rows.length === 0 && <div className="card"><Empty icon="list" title="The board is clear">New pickup requests appear here instantly.</Empty></div>}
          {rows.map(({ l, near, match, perKm }) => (
            <div key={l.id} className="card pad stack" onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)} style={{ gap: 12, boxShadow: hover === l.id ? 'var(--shadow-lg)' : undefined }}>
              <div className="row between">
                <div className="row" style={{ gap: 8 }}>
                  <span className="headline mono">{l.ref}</span>
                  <span className="pill gray">{data.meta.equipment[l.cargo.equipment].label}</span>
                  {l.options.expedite && <span className="pill orange"><Icon name="bolt" size={12} />Expedite</span>}
                  {l.cargo.hazmat && <span className="pill red">Hazmat</span>}
                </div>
                <span className="caption tertiary">{ago(l.createdAt)}</span>
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="spacer" style={{ minWidth: 0 }}><RouteLine pickup={l.pickup} dropoff={l.dropoff} compact /></div>
                <div style={{ textAlign: 'right' }}>
                  <div className="title2 num green">{money(l.quote.carrierPayout)}</div>
                  <div className="footnote secondary num">{money2(perKm)}/km</div>
                </div>
              </div>
              <div className="kv" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                <div><div className="k">Loaded</div><div className="v">{km(l.quote.distanceKm)}</div></div>
                <div><div className="k">Empty to pickup</div><div className="v">{near && near.d < 1e8 ? km(near.d) : '—'}</div></div>
                <div><div className="k">Weight</div><div className="v">{l.cargo.weightKg ? `${(l.cargo.weightKg / 1000).toFixed(1)} t` : '—'}</div></div>
                <div><div className="k">Pickup</div><div className="v">{dayLabel(l.pickupWindow.from).replace('Today, ', '')}</div></div>
              </div>
              <div className="row">
                <div className="footnote secondary spacer truncate">{idx.companies[l.shipperId]?.name} · {l.cargo.description}{!match ? ' · no matching trailer free' : ''}</div>
                <button className="btn small" onClick={() => go(`/loads/${l.id}`)}>Details</button>
                {ai ? <BoardMatch load={l} onMore={() => setAccept(l)} /> : <button className="btn primary small" onClick={() => setAccept(l)} disabled={!freeTrucks.length}><Icon name="check" size={16} stroke={2.6} />Accept</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="map-card sticky-top hide-mobile" style={{ height: 'calc(100vh - 140px)', minHeight: 480 }}>
          <MapView height="100%" trucks={trucks} places={places} route={hoverLoad?.legs.toDropoff?.points} fitKey={`board-${rows.length}`} padding={50} />
          <div className="map-overlay glass row" style={{ left: 14, bottom: 14, padding: '8px 12px', gap: 14 }}>
            <span className="row footnote" style={{ gap: 6 }}><span className="place-pin pickup" style={{ width: 14, height: 14, borderWidth: 2 }} />Pickup</span>
            <span className="row footnote" style={{ gap: 6 }}><Icon name="truck" size={14} style={{ color: 'var(--blue)' }} />Available truck</span>
          </div>
        </div>
      </div>
      {accept && <AcceptSheet load={accept} onClose={() => setAccept(null)} />}
    </div>
  );
}

/** Best driver for a board load, with one-tap accept. */
function BoardMatch({ load, onMore }) {
  const { toast, upsert } = useStore();
  const best = useMatches(load).find((r) => r.eligible);
  if (!best) return <button className="btn small" onClick={onMore}>No free driver — review</button>;
  const take = async () => {
    try {
      const r = await post(`/loads/${load.id}/accept`, { driverId: best.driver.id, truckId: best.truck.id });
      upsert('loads', r);
      toast({ title: `${load.ref} accepted`, body: `${best.driver.name} (match ${best.score}/100) has been notified.` });
    } catch (e) { toast({ title: 'Couldn’t accept', body: e.message, tone: 'error' }); }
  };
  return (
    <div className="row" style={{ gap: 6 }}>
      <ScoreBadge score={best.score} size={30} />
      <button className="btn small" onClick={onMore} title="See all ranked drivers">Compare</button>
      <button className="btn primary small" onClick={take}><Icon name="sparkles" size={14} />Send {best.driver.name.split(' ')[0]}</button>
    </div>
  );
}
