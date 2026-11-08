// Calendar in a Google-Calendar-style layout: left rail (create, mini month, calendars),
// Day / Week time grid with timed blocks, Month grid, plus the route Map view.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Segmented, Avatar } from '../components/ui.jsx';
import { StatusIcon, EQ_COLOR } from '../components/LoadList.jsx';
import CalendarMap from './CalendarMap.jsx';
import { useStore, useIndex, useNow } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { time, placeShort, km, duration } from '../lib/format.js';

const H = 3.6e6;
const HOUR_PX = 48;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return startOfDay(d.getTime()); };
const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_CAL = [
  { id: 'waiting', name: 'Waiting for carrier', color: '#8b8f97', match: ['requested'] },
  { id: 'scheduled', name: 'Scheduled & moving', color: '#5e6ad2', match: ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'] },
  { id: 'delivered', name: 'Delivered', color: '#3fae72', match: ['delivered'] },
];
const shortTime = (t) => {
  const d = new Date(t); const h = d.getHours(); const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};
const hourLabel = (h) => (h === 0 ? '' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`);

/** A load as a calendar event: pickup to delivery (actual, ETA or planned). */
function tripOf(l) {
  if (l.status === 'cancelled') return null;
  const start = l.departedPickupAt || l.arrivedPickupAt || (['accepted', 'en_route_pickup'].includes(l.status) && l.eta?.pickupAt) || l.pickupWindow?.from;
  if (!start) return null;
  let end = l.deliveredAt || (l.status !== 'requested' && l.eta?.deliveryAt) || start + ((l.quote?.driveHours || 3) + 1) * H;
  if (end < start + 0.5 * H) end = start + 0.5 * H;
  return { id: l.id, load: l, start, end, planned: !l.deliveredAt };
}

/** Overlapping blocks are stacked with a small indent (each later one sits on top). */
const stackPos = (sg) => {
  const indent = sg.cols > 1 ? Math.min(100 / sg.cols, 14) : 0;
  const left = sg.col * indent;
  return { left: `calc(${left}% + 1px)`, width: `calc(${100 - left}% - 6px)`, zIndex: 1 + sg.col };
};

/** Work out overlap columns within one day column. */
function layoutDay(segs) {
  const sorted = [...segs].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = []; let cluster = []; let clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((x) => x.col)) + 1; cluster.forEach((x) => out.push({ ...x, cols: n })); cluster = []; };
  for (const seg of sorted) {
    if (cluster.length && seg.s >= clusterEnd) flush();
    const used = new Set(cluster.filter((x) => x.e > seg.s).map((x) => x.col));
    let col = 0; while (used.has(col)) col++;
    cluster.push({ ...seg, col });
    clusterEnd = Math.max(clusterEnd, seg.e);
  }
  if (cluster.length) flush();
  return out;
}

export default function Calendar() {
  const { data } = useStore();
  const idx = useIndex();
  const now = useNow(60000);
  const role = data.me.role;
  const isDispatch = role === 'dispatcher';
  const [view, setView] = useState(() => { try { return localStorage.getItem('rugo.calView') || 'week'; } catch { return 'week'; } });
  const [cursor, setCursor] = useState(() => startOfDay(Date.now()));
  const [hidden, setHidden] = useState(() => new Set());
  const [pop, setPop] = useState(null);
  useEffect(() => { try { localStorage.setItem('rugo.calView', view); } catch { /* ignore */ } }, [view]);

  // Calendars: one per driver for dispatch, by stage for everyone else.
  const calendars = useMemo(() => (isDispatch
    ? [...data.users.filter((u) => u.role === 'driver').map((u) => ({ id: u.id, name: u.name, color: u.color })), { id: 'none', name: 'No driver yet', color: '#8b8f97' }]
    : STATUS_CAL), [data.users, isDispatch]);

  const trips = useMemo(() => {
    const calOf = (l) => (isDispatch ? (l.driverId || 'none') : STATUS_CAL.find((x) => x.match.includes(l.status))?.id);
    return data.loads
      .filter((l) => (isDispatch ? l.carrierId === data.me.companyId || l.status === 'requested' : true))
      .map(tripOf).filter(Boolean)
      .map((t) => { const cal = calendars.find((x) => x.id === calOf(t.load)); return { ...t, cal: cal?.id, color: cal?.color || '#5e6ad2' }; })
      .filter((t) => !hidden.has(t.cal));
  }, [data.loads, data.me.companyId, calendars, hidden, isDispatch]);

  // Visible range
  const c = new Date(cursor);
  let days;
  if (view === 'day') days = [cursor];
  else if (view === 'month') {
    const first = new Date(c.getFullYear(), c.getMonth(), 1).getTime();
    const start = addDays(first, -new Date(first).getDay());
    const weeks = Math.ceil((new Date(first).getDay() + new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()) / 7);
    days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  } else {
    const start = addDays(cursor, -c.getDay());
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const step = (dir) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'month') { const d = new Date(cursor); d.setMonth(d.getMonth() + dir, 1); setCursor(startOfDay(d.getTime())); } else setCursor(addDays(cursor, 7 * dir));
  };
  let title;
  if (view === 'day') title = c.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  else if (view === 'month') title = c.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  else {
    const a = new Date(days[0]); const b = new Date(days[6]);
    title = a.getMonth() === b.getMonth()
      ? a.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
      : `${a.toLocaleDateString('en-CA', { month: 'short' })} – ${b.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}`;
  }

  const openDay = (d) => { setCursor(d); setView('day'); };
  const showEvent = (trip, e) => { e.stopPropagation(); setPop({ trip, rect: e.currentTarget.getBoundingClientRect() }); };

  // Map view groups pickups by day.
  const byDay = useMemo(() => {
    const m = new Map();
    for (const t of trips) { const k = startOfDay(t.start); if (!m.has(k)) m.set(k, []); m.get(k).push({ id: `${t.id}:p`, kind: 'pickup', t: t.start, load: t.load }); }
    return m;
  }, [trips]);
  const weekStart = addDays(cursor, -c.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="gcal">
      <aside className="gcal-rail">
        {role !== 'driver' && (
          <button className="gcal-create" onClick={() => go(role === 'shipper' ? '/new' : '/')}>
            <Icon name="plus" size={20} stroke={2.2} />{role === 'shipper' ? 'Request pickup' : 'Find loads'}
          </button>
        )}
        <MiniMonth cursor={cursor} view={view} days={days} trips={trips} onPick={(d) => { setCursor(d); if (view === 'month') setView('day'); }} />
        <div className="gcal-cals">
          <div className="gcal-cals-head">{isDispatch ? 'Drivers' : 'My calendars'}</div>
          {calendars.map((cal) => (
            <label key={cal.id} className="gcal-cal">
              <input type="checkbox" checked={!hidden.has(cal.id)} style={{ accentColor: cal.color }}
                onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(cal.id)) n.delete(cal.id); else n.add(cal.id); return n; })} />
              <span className="truncate">{cal.name}</span>
            </label>
          ))}
        </div>
      </aside>

      <section className="gcal-main">
        <header className="gcal-bar">
          <button className="btn" onClick={() => setCursor(startOfDay(Date.now()))}>Today</button>
          <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}><Icon name="chevronLeft" size={18} /></button>
          <button className="icon-btn" aria-label="Next" onClick={() => step(1)}><Icon name="chevron" size={18} /></button>
          <h2 className="gcal-title">{title}</h2>
          <div className="spacer" />
          <Segmented value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'map', label: 'Map' }]} />
        </header>
        {(view === 'week' || view === 'day') && <TimeGrid days={days} trips={trips} now={now} onEvent={showEvent} onDay={openDay} />}
        {view === 'month' && <MonthGrid days={days} month={c.getMonth()} trips={trips} onEvent={showEvent} onDay={openDay} />}
        {view === 'map' && <div style={{ padding: 16 }}><CalendarMap days={weekDays} byDay={byDay} /></div>}
      </section>

      {pop && <EventCard pop={pop} idx={idx} data={data} onClose={() => setPop(null)} />}
    </div>
  );
}

function MiniMonth({ cursor, view, days, trips, onPick }) {
  const firstOf = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const [month, setMonth] = useState(() => firstOf(cursor));
  useEffect(() => setMonth(firstOf(cursor)), [cursor]);
  const m = new Date(month);
  const start = addDays(month, -m.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const busy = new Set(trips.map((t) => startOfDay(t.start)));
  const inRange = (d) => (view === 'week' || view === 'day') && d >= days[0] && d <= days[days.length - 1];
  const shift = (n) => { const d = new Date(month); d.setMonth(d.getMonth() + n, 1); setMonth(d.getTime()); };
  return (
    <div className="mini">
      <div className="mini-head">
        <span>{m.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</span>
        <span>
          <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Previous month" onClick={() => shift(-1)}><Icon name="chevronLeft" size={14} /></button>
          <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Next month" onClick={() => shift(1)}><Icon name="chevron" size={14} /></button>
        </span>
      </div>
      <div className="mini-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i} className="mini-wd">{w}</span>)}
        {cells.map((d) => (
          <button key={d} onClick={() => onPick(d)}
            className={`mini-day ${new Date(d).getMonth() !== m.getMonth() ? 'out' : ''} ${sameDay(d, Date.now()) ? 'today' : ''} ${d === cursor ? 'sel' : ''} ${inRange(d) ? 'range' : ''}`}>
            {new Date(d).getDate()}{busy.has(d) && <i />}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeGrid({ days, trips, now, onEvent, onDay }) {
  const scroller = useRef(null);
  useLayoutEffect(() => {
    // Open around the current time.
    if (scroller.current) scroller.current.scrollTop = Math.max(0, new Date().getHours() - 2) * HOUR_PX;
  }, [days.length]);
  const cols = days.map((d) => {
    const end = addDays(d, 1);
    const segs = trips.filter((t) => t.start < end && t.end > d).map((t) => ({
      trip: t, s: Math.max(t.start, d), e: Math.min(t.end, end), contStart: t.start < d, contEnd: t.end > end,
    }));
    return { d, segs: layoutDay(segs) };
  });
  const nowTop = ((now - startOfDay(now)) / H) * HOUR_PX;
  const template = `56px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="tg">
      <div className="tg-head" style={{ gridTemplateColumns: template }}>
        <div className="tg-tz">{new Date().toLocaleTimeString('en-CA', { timeZoneName: 'short' }).split(' ').pop()}</div>
        {days.map((d) => (
          <button key={d} className={`tg-dayhead ${sameDay(d, now) ? 'today' : ''}`} onClick={() => onDay(d)}>
            <span className="tg-wd">{WEEKDAYS[new Date(d).getDay()].toUpperCase()}</span>
            <span className="tg-num">{new Date(d).getDate()}</span>
          </button>
        ))}
      </div>
      <div className="tg-body" ref={scroller}>
        <div className="tg-inner" style={{ gridTemplateColumns: template, height: 24 * HOUR_PX }}>
          <div className="tg-hours">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-hour" style={{ top: h * HOUR_PX }}>{hourLabel(h)}</div>)}
          </div>
          {cols.map(({ d, segs }) => (
            <div key={d} className="tg-col">
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-line" style={{ top: h * HOUR_PX }} />)}
              {segs.map((sg) => {
                const top = ((sg.s - d) / H) * HOUR_PX;
                const height = Math.max(20, ((sg.e - sg.s) / H) * HOUR_PX - 2);
                const l = sg.trip.load;
                return (
                  <button key={sg.trip.id} className={`tg-ev ${l.status === 'requested' ? 'tentative' : ''} ${l.status === 'delivered' ? 'past' : ''}`}
                    style={{ top, height, ...stackPos(sg), '--ev': sg.trip.color }}
                    onClick={(e) => onEvent(sg.trip, e)}>
                    <span className="tg-ev-title">{l.ref} · {l.pickup.city} → {l.dropoff.city}</span>
                    {height > 34 && <span className="tg-ev-time">{sg.contStart ? '…' : shortTime(sg.trip.start)} – {sg.contEnd ? '…' : shortTime(sg.trip.end)}</span>}
                    {height > 56 && <span className="tg-ev-time">{l.cargo.description}</span>}
                  </button>
                );
              })}
              {sameDay(d, now) && <div className="tg-now" style={{ top: nowTop }}><i /></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ days, month, trips, onEvent, onDay }) {
  const max = 3;
  return (
    <div className="mg">
      <div className="mg-wds">{WEEKDAYS.map((w) => <div key={w}>{w.toUpperCase()}</div>)}</div>
      <div className="mg-grid" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const evs = trips.filter((t) => sameDay(t.start, d)).sort((a, b) => a.start - b.start);
          return (
            <div key={d} className={`mg-cell ${new Date(d).getMonth() !== month ? 'out' : ''}`} onClick={() => onDay(d)}>
              <button className={`mg-num ${sameDay(d, Date.now()) ? 'today' : ''}`} onClick={(e) => { e.stopPropagation(); onDay(d); }}>
                {new Date(d).getDate() === 1 ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : new Date(d).getDate()}
              </button>
              {evs.slice(0, max).map((t) => {
                const multi = !sameDay(t.start, t.end);
                return (
                  <button key={t.id} className={`mg-ev ${multi ? 'bar' : ''} ${t.load.status === 'delivered' ? 'past' : ''}`} style={{ '--ev': t.color }} onClick={(e) => onEvent(t, e)}>
                    {!multi && <i />}<span className="num">{shortTime(t.start)}</span><span className="truncate">{t.load.pickup.city} → {t.load.dropoff.city}</span>
                  </button>
                );
              })}
              {evs.length > max && <button className="mg-more" onClick={(e) => { e.stopPropagation(); onDay(d); }}>{evs.length - max} more</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ pop, idx, data, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    const w = ref.current.offsetWidth; const h = ref.current.offsetHeight; const r = pop.rect;
    let left = r.right + 8; if (left + w > window.innerWidth - 12) left = Math.max(12, r.left - w - 8);
    let top = r.top; if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
    setPos({ left, top });
  }, [pop]);
  useEffect(() => {
    const out = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', out), 0);
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', out); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const t = pop.trip; const l = t.load;
  const d = idx.users[l.driverId]; const tr = idx.trucks[l.truckId];
  const fmt = (x) => new Date(x).toLocaleString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const status = data.meta.statuses.find((s) => s.key === l.status)?.label;
  return (
    <div ref={ref} className="ev-card" style={pos} role="dialog" aria-label={l.ref}>
      <div className="ev-card-tools">
        <button className="icon-btn" aria-label="Open load" title="Open load" onClick={() => go(`/loads/${l.id}`)}><Icon name="doc" size={16} /></button>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="ev-row">
        <span className="ev-swatch" style={{ background: t.color }} />
        <div>
          <div className="title3">{l.ref} · {placeShort(l.pickup)} → {placeShort(l.dropoff)}</div>
          <div className="subhead secondary">{fmt(t.start)} – {sameDay(t.start, t.end) ? time(t.end) : fmt(t.end)}</div>
        </div>
      </div>
      <div className="ev-row"><StatusIcon status={l.status} size={16} /><span>{status}{t.planned && l.status !== 'requested' ? ' · arrival is an estimate' : ''}</span></div>
      <div className="ev-row"><Icon name="pin" size={16} /><span>{l.pickup.name}<br /><span className="secondary">to {l.dropoff.name}</span></span></div>
      <div className="ev-row"><Icon name="route" size={16} /><span>{km(l.status === 'delivered' && l.metrics.loadedKm > 1 ? l.metrics.loadedKm : l.quote.distanceKm)} · {duration(l.legs?.toDropoff?.durationH || l.quote.driveHours)} driving</span></div>
      <div className="ev-row"><Icon name="box" size={16} /><span>{l.cargo.description} <span className="tag" style={{ height: 22, marginLeft: 4 }}><i style={{ background: EQ_COLOR[l.cargo.equipment] }} />{data.meta.equipment[l.cargo.equipment]?.label}</span></span></div>
      <div className="ev-row">{d ? <><Avatar user={d} size="sm" /><span>{d.name}{tr ? ` · Unit ${tr.unit}` : ''}</span></> : <><Icon name="person" size={16} /><span className="orange">No driver yet</span></>}</div>
      <div className="ev-actions"><button className="btn primary" onClick={() => go(`/loads/${l.id}`)}>Open load</button></div>
    </div>
  );
}
