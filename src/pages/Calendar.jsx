// Calendar: every pickup and delivery by day (month or week), with the selected day's agenda.
import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Segmented, Avatar, Empty } from '../components/ui.jsx';
import { StatusIcon, FilterChip, EQ_COLOR } from '../components/LoadList.jsx';
import { useStore, useIndex, useNow } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { time, placeShort, km, duration } from '../lib/format.js';
import MapView from '../components/MapView.jsx';

const DAY = 864e5;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// One colour per weekday (Sun → Sat).
const DAY_COLORS = ['#8e6ad8', '#5e6ad2', '#26b5ce', '#3fae72', '#d9a514', '#f2994a', '#e5484d'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pickup and delivery events for a load, using actual times when known, otherwise ETA or the requested window. */
function eventsFor(l) {
  if (l.status === 'cancelled') return [];
  const out = [];
  const pickupAt = l.departedPickupAt || l.arrivedPickupAt || (['accepted', 'en_route_pickup'].includes(l.status) && l.eta?.pickupAt) || l.pickupWindow?.from;
  if (pickupAt) out.push({ id: `${l.id}:p`, kind: 'pickup', t: pickupAt, load: l, planned: !l.arrivedPickupAt });
  const deliveryAt = l.deliveredAt || (l.status !== 'requested' && l.eta?.deliveryAt) || (l.status === 'requested' && l.pickupWindow?.from + (l.quote.driveHours + 1) * 3.6e6);
  if (deliveryAt) out.push({ id: `${l.id}:d`, kind: 'delivery', t: deliveryAt, load: l, planned: !l.deliveredAt });
  return out;
}

export default function Calendar() {
  const { data } = useStore();
  const idx = useIndex();
  useNow(60000);
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => startOfDay(Date.now()));
  const [selected, setSelected] = useState(() => startOfDay(Date.now()));
  const [driver, setDriver] = useState('');
  const [kind, setKind] = useState('');
  const isDispatch = data.me.role === 'dispatcher';

  const events = useMemo(() => data.loads
    .filter((l) => (isDispatch ? l.carrierId === data.me.companyId || l.status === 'requested' : true))
    .filter((l) => !driver || l.driverId === driver)
    .flatMap(eventsFor)
    .filter((e) => !kind || e.kind === kind)
    .sort((a, b) => a.t - b.t), [data.loads, driver, kind, isDispatch, data.me.companyId]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of events) { const k = startOfDay(e.t); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return m;
  }, [events]);

  // Visible days
  const c = new Date(cursor);
  let days = [];
  if (view === 'month') {
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = startOfDay(first.getTime() - first.getDay() * DAY);
    const weeks = Math.ceil((first.getDay() + new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()) / 7);
    days = Array.from({ length: weeks * 7 }, (_, i) => startOfDay(start + i * DAY + 3 * 3.6e6));
  } else {
    // week and map views both cover one week
    const start = startOfDay(cursor - c.getDay() * DAY);
    days = Array.from({ length: 7 }, (_, i) => startOfDay(start + i * DAY + 3 * 3.6e6));
  }
  const title = view === 'month'
    ? c.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
    : `${new Date(days[0]).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${new Date(days[6]).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const move = (dir) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir, 1); else d.setDate(d.getDate() + 7 * dir);
    setCursor(startOfDay(d.getTime()));
  };
  const today = () => { setCursor(startOfDay(Date.now())); setSelected(startOfDay(Date.now())); };
  const dayEvents = byDay.get(selected) || [];
  const drivers = data.users.filter((u) => u.role === 'driver');

  return (
    <div className="page wide" style={{ maxWidth: 1480 }}>
      <div className="cal-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" aria-label="Previous" onClick={() => move(-1)}><Icon name="chevronLeft" size={16} /></button>
          <button className="icon-btn" aria-label="Next" onClick={() => move(1)}><Icon name="chevron" size={16} /></button>
          <h2 className="title2" style={{ marginLeft: 4 }}>{title}</h2>
          <button className="btn small" style={{ marginLeft: 8 }} onClick={today}>Today</button>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <FilterChip icon="route" label="Type" value={kind} onChange={setKind} options={[{ value: 'pickup', label: 'Pickups' }, { value: 'delivery', label: 'Deliveries' }]} />
          {isDispatch && <FilterChip icon="person" label="Driver" value={driver} onChange={setDriver} options={drivers.map((d) => ({ value: d.id, label: d.name }))} />}
          <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'map', label: 'Map' }]} />
        </div>
      </div>

      {view === 'map' ? <CalendarMap days={days} byDay={byDay} /> : (
      <div className="cal-layout">
        <div className={`cal-grid ${view}`}>
          {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
          {days.map((d) => {
            const evs = byDay.get(d) || [];
            const max = view === 'month' ? 3 : 12;
            const outside = view === 'month' && new Date(d).getMonth() !== c.getMonth();
            return (
              <div key={d} role="button" tabIndex={0}
                className={`cal-day ${outside ? 'out' : ''} ${sameDay(d, Date.now()) ? 'today' : ''} ${d === selected ? 'sel' : ''}`}
                onClick={() => setSelected(d)} onKeyDown={(e) => e.key === 'Enter' && setSelected(d)}>
                <div className="cal-num"><span>{new Date(d).getDate()}</span>{evs.length > 0 && view === 'month' && <span className="cal-count">{evs.length}</span>}</div>
                {evs.slice(0, max).map((e) => (
                  <button key={e.id} className={`cal-ev ${e.kind} ${e.load.status === 'delivered' ? 'done' : ''}`}
                    onClick={(ev) => { ev.stopPropagation(); go(`/loads/${e.load.id}`); }} title={`${e.kind === 'pickup' ? 'Pickup' : 'Delivery'} · ${e.load.ref} · ${placeShort(e.load.pickup)} → ${placeShort(e.load.dropoff)}`}>
                    <i style={{ background: e.kind === 'pickup' ? 'var(--green)' : 'var(--label)' }} />
                    <span className="num">{time(e.t)}</span>
                    <span className="truncate">
                      {view === 'week' ? `${e.kind === 'pickup' ? 'Pickup' : 'Delivery'} · ${e.load.ref} · ${e.load.pickup.city} → ${e.load.dropoff.city}` : (e.kind === 'pickup' ? e.load.pickup.city : e.load.dropoff.city)}
                    </span>
                  </button>
                ))}
                {evs.length > max && <div className="cal-more">+{evs.length - max} more</div>}
              </div>
            );
          })}
        </div>

        <aside className="card cal-agenda">
          <div className="row between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="headline">{new Date(selected).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="footnote secondary">
                {plural(dayEvents.filter((e) => e.kind === 'pickup').length, 'pickup')} · {plural(dayEvents.filter((e) => e.kind === 'delivery').length, 'delivery', 'deliveries')}
              </div>
            </div>
            {sameDay(selected, Date.now()) && <span className="pill blue">Today</span>}
          </div>
          {dayEvents.length === 0 ? <Empty icon="calendar" title="Nothing scheduled">Pick another day, or check the load board.</Empty> : (
            <div>
              {dayEvents.map((e) => {
                const l = e.load;
                const d = idx.users[l.driverId];
                const t = idx.trucks[l.truckId];
                return (
                  <button key={e.id} className="list-row" style={{ alignItems: 'flex-start', padding: '12px 16px' }} onClick={() => go(`/loads/${l.id}`)}>
                    <div style={{ width: 58, flex: 'none' }}>
                      <div className="headline num">{time(e.t)}</div>
                      <div className={`caption ${e.planned ? 'tertiary' : 'green'}`}>{e.planned ? (l.status === 'requested' ? 'Requested' : 'ETA') : 'Done'}</div>
                    </div>
                    <div className="label">
                      <div className="row" style={{ gap: 6 }}>
                        <span className={`pill ${e.kind === 'pickup' ? 'green' : 'gray'}`}>{e.kind === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                        <span className="mono footnote secondary">{l.ref}</span>
                        <StatusIcon status={l.status} size={13} />
                      </div>
                      <div className="subhead" style={{ marginTop: 4 }}>{e.kind === 'pickup' ? l.pickup.name : l.dropoff.name}</div>
                      <div className="footnote secondary">{placeShort(l.pickup)} → {placeShort(l.dropoff)} · {km(l.quote.distanceKm)}</div>
                      <div className="row" style={{ gap: 6, marginTop: 6 }}>
                        <span className="tag" style={{ height: 22 }}><i style={{ background: EQ_COLOR[l.cargo.equipment] }} />{data.meta.equipment[l.cargo.equipment]?.label}</span>
                        {d ? <span className="row footnote secondary" style={{ gap: 5 }}><Avatar user={d} size="sm" />{d.name}{t ? ` · Unit ${t.unit}` : ''}</span> : <span className="footnote orange">No driver yet</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

/** One week of loads drawn as routes, coloured by pickup day. Hover a route or a row for distance and drive time. */
function CalendarMap({ days, byDay }) {
  const { data } = useStore();
  const idx = useIndex();
  const [hover, setHover] = useState(null);
  const [onlyDay, setOnlyDay] = useState(null);
  const groups = days.map((d) => ({
    day: d, color: DAY_COLORS[new Date(d).getDay()],
    loads: (byDay.get(d) || []).filter((e) => e.kind === 'pickup').map((e) => ({ ...e, l: e.load })),
  }));
  const shown = groups.filter((g) => !onlyDay || g.day === onlyDay);
  const lines = useMemo(() => shown.flatMap((g) => g.loads.map(({ l, t }) => {
    const kmv = l.status === 'delivered' && l.metrics.loadedKm > 1 ? l.metrics.loadedKm : l.quote.distanceKm;
    const hrs = l.legs.toDropoff?.durationH || l.quote.driveHours;
    const d = idx.users[l.driverId];
    return {
      id: l.id, color: g.color, points: l.legs.toDropoff?.points?.length ? l.legs.toDropoff.points : [l.pickup, l.dropoff],
      tooltip: `<b>${l.ref}</b> · ${new Date(g.day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time(t)}<br>${placeShort(l.pickup)} → ${placeShort(l.dropoff)}<br><b>${km(kmv)}</b> · ${duration(hrs)} driving${d ? `<br>${d.name}` : ''}`,
    };
  })), [shown, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (g) => g.loads.reduce((a, { l }) => a + l.quote.distanceKm, 0);

  return (
    <div className="cal-layout">
      <div className="map-card" style={{ height: 'calc(100vh - 170px)', minHeight: 520 }}>
        <MapView height="100%" lines={lines} highlight={hover} onLineHover={setHover} onLineClick={(id) => go(`/loads/${id}`)} fitKey={`calmap-${days[0]}-${onlyDay}`} padding={50} />
      </div>
      <aside className="card cal-agenda">
        {groups.map((g) => (
          <div key={g.day} style={{ opacity: onlyDay && onlyDay !== g.day ? 0.4 : 1 }}>
            <button className="cal-mapday" onClick={() => setOnlyDay(onlyDay === g.day ? null : g.day)} title="Show only this day">
              <i style={{ background: g.color }} />
              <span className="headline">{new Date(g.day).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              <span className="footnote secondary" style={{ marginLeft: 'auto' }}>{g.loads.length ? `${g.loads.length} · ${km(total(g))}` : '—'}</span>
            </button>
            {g.loads.map(({ l, t }) => (
              <button key={l.id} className={`cal-maprow ${hover === l.id ? 'on' : ''}`}
                onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)} onClick={() => go(`/loads/${l.id}`)}>
                <span className="num footnote secondary" style={{ width: 66, flex: "none", whiteSpace: "nowrap" }}>{time(t)}</span>
                <span className="spacer" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block' }}><span className="mono footnote secondary">{l.ref}</span> {placeShort(l.pickup)} → {placeShort(l.dropoff)}</span>
                </span>
                <span className="footnote num">{km(l.quote.distanceKm)}</span>
                <span className="footnote secondary num" style={{ width: 70, textAlign: 'right' }}>{duration(l.legs.toDropoff?.durationH || l.quote.driveHours)}</span>
              </button>
            ))}
          </div>
        ))}
        {groups.every((g) => !g.loads.length) && <Empty icon="map" title="No loads this week">Use ‹ › to change week.</Empty>}
        <div className="footnote tertiary" style={{ padding: '10px 16px' }}>{data.meta ? 'Click a day to show only that day.' : ''}</div>
      </aside>
    </div>
  );
}
