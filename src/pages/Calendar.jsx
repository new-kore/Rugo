// Calendar in a Google-Calendar-style layout: left rail (create, mini month, calendars),
// Day / Week time grid with timed blocks, Month grid, plus the route Map view.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Segmented, Avatar } from '../components/ui.jsx';
import { StatusIcon, EQ_COLOR } from '../components/LoadList.jsx';
import CalendarMap from './CalendarMap.jsx';
import MapView from '../components/MapView.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import { DriverSheet, scheduleText } from './carrier/Drivers.jsx';
import { daySchedule, shiftHours, driverAlerts } from '../lib/drivers.js';
import { Sheet, Field, ActionButton, Switch } from '../components/ui.jsx';
import { post } from '../lib/api.js';
import { haversine } from '../lib/geo.js';
import { useStore, useIndex, useNow } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { time, placeShort, km, duration, money2 } from '../lib/format.js';

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

// Canadian statutory holidays (federal + Ontario) — handy for dock closures.
const HOLIDAYS = [
  ['2026-01-01', "New Year's Day"], ['2026-02-16', 'Family Day'], ['2026-04-03', 'Good Friday'], ['2026-05-18', 'Victoria Day'],
  ['2026-07-01', 'Canada Day'], ['2026-08-03', 'Civic Holiday'], ['2026-09-07', 'Labour Day'], ['2026-09-30', 'Truth and Reconciliation Day'],
  ['2026-10-12', 'Thanksgiving'], ['2026-11-11', 'Remembrance Day'], ['2026-12-25', 'Christmas Day'], ['2026-12-26', 'Boxing Day'],
  ['2027-01-01', "New Year's Day"], ['2027-02-15', 'Family Day'], ['2027-03-26', 'Good Friday'], ['2027-05-24', 'Victoria Day'],
  ['2027-07-01', 'Canada Day'], ['2027-08-02', 'Civic Holiday'], ['2027-09-06', 'Labour Day'], ['2027-09-30', 'Truth and Reconciliation Day'],
  ['2027-10-11', 'Thanksgiving'], ['2027-11-11', 'Remembrance Day'], ['2027-12-25', 'Christmas Day'], ['2027-12-26', 'Boxing Day'],
].map(([d, name]) => { const [y, m, dd] = d.split('-').map(Number); return { day: new Date(y, m - 1, dd).getTime(), name }; });
const HOLIDAY_COLOR = '#0b8043';
const holidaysOn = (d) => HOLIDAYS.filter((h) => h.day === d);
const weekNumber = (t) => {
  const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
};

/** Google-style coloured checkbox. */
function CalCheck({ color, checked, onChange, children }) {
  return (
    <label className="gcal-cal">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="gcheck" style={{ '--c': color }} data-on={checked || undefined}>
        {checked && <svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span className="truncate">{children}</span>
    </label>
  );
}

function RailSection({ title, open, onToggle, action, children }) {
  return (
    <div className="rail-sec">
      <div className="rail-sec-head">
        <span>{title}</span>
        <span className="row" style={{ gap: 2 }}>
          {action}
          <button className="icon-btn" aria-label={open ? `Collapse ${title}` : `Expand ${title}`} onClick={onToggle}>
            <Icon name="chevron" size={15} style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
          </button>
        </span>
      </div>
      {open && children}
    </div>
  );
}

/** A load as a calendar event: pickup to delivery (actual, ETA or planned). */
function tripOf(l) {
  if (l.status === 'cancelled') return null;
  const eta = ['accepted', 'en_route_pickup'].includes(l.status) && l.eta?.pickupAt;
  const start = l.departedPickupAt || l.arrivedPickupAt || (l.status === 'accepted' && l.pickupWindow?.from > (eta || 0) ? l.pickupWindow.from : eta) || l.pickupWindow?.from;
  if (!start) return null;
  let end = l.deliveredAt || (l.status !== 'requested' && l.eta?.deliveryAt) || start + ((l.quote?.driveHours || 3) + 1) * H;
  // A scheduled trip lasts at least its drive time plus loading.
  const minDur = l.deliveredAt ? 0.5 * H : ((l.quote?.driveHours || 1) + 0.75) * H;
  if (end < start + minDur) end = start + minDur;
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
  const [who, setWho] = useState('');
  const [adding, setAdding] = useState(false);
  const [secOpen, setSecOpen] = useState({ mine: true, other: true });
  const toggle = (id) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const showHolidays = !hidden.has('holidays');
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
          <button className="gcal-create" onClick={() => (role === 'shipper' ? go('/new') : setAdding(true))}>
            <Icon name="plus" size={20} stroke={2.2} />{role === 'shipper' ? 'Request pickup' : 'Add route'}
          </button>
        )}
        <MiniMonth cursor={cursor} view={view} days={days} trips={trips} onPick={(d) => { setCursor(d); if (view === 'month') setView('day'); }} />
        {isDispatch && (
          <label className="rail-search">
            <Icon name="people" size={18} />
            <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Search for drivers" />
          </label>
        )}
        <RailSection title={isDispatch ? 'Drivers' : 'My calendars'} open={secOpen.mine} onToggle={() => setSecOpen((o) => ({ ...o, mine: !o.mine }))}
          action={isDispatch ? <button className="icon-btn" aria-label="Add driver" title="Add driver" onClick={() => go('/drivers')}><Icon name="plus" size={16} /></button> : null}>
          {calendars.filter((cal) => !who || cal.name.toLowerCase().includes(who.toLowerCase())).map((cal) => (
            <CalCheck key={cal.id} color={cal.color} checked={!hidden.has(cal.id)} onChange={() => toggle(cal.id)}>{cal.name}</CalCheck>
          ))}
        </RailSection>
        <RailSection title="Other calendars" open={secOpen.other} onToggle={() => setSecOpen((o) => ({ ...o, other: !o.other }))}>
          <CalCheck color={HOLIDAY_COLOR} checked={!hidden.has('holidays')} onChange={() => toggle('holidays')}>Holidays in Canada</CalCheck>
        </RailSection>
      </aside>

      <section className="gcal-main">
        <header className="gcal-bar">
          <button className="btn" onClick={() => setCursor(startOfDay(Date.now()))}>Today</button>
          <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}><Icon name="chevronLeft" size={18} /></button>
          <button className="icon-btn" aria-label="Next" onClick={() => step(1)}><Icon name="chevron" size={18} /></button>
          <h2 className="gcal-title">{title}</h2>
          <div className="spacer" />
          <Segmented value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, ...(isDispatch ? [{ value: 'schedule', label: 'Schedule' }] : []), { value: 'map', label: 'Map' }]} />
        </header>
        {(view === 'week' || view === 'day') && <TimeGrid days={days} trips={trips} now={now} onEvent={showEvent} onDay={openDay} holidays={showHolidays} />}
        {view === 'month' && <MonthGrid days={days} month={c.getMonth()} trips={trips} onEvent={showEvent} onDay={openDay} holidays={showHolidays} />}
        {view === 'map' && <div style={{ padding: 16 }}><CalendarMap days={weekDays} byDay={byDay} /></div>}
        {view === 'schedule' && <ScheduleView days={weekDays} trips={trips} now={now} onEvent={showEvent} />}
      </section>

      {pop && <EventCard pop={pop} idx={idx} data={data} onClose={() => setPop(null)} />}
      {adding && <AddRouteSheet day={cursor} onClose={() => setAdding(false)} onDone={(l) => { setAdding(false); setCursor(startOfDay(l.pickupWindow.from)); if (view === 'map' || view === 'month') setView('day'); }} />}
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
        <span className="mini-wd" />
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i} className="mini-wd">{w}</span>)}
        {cells.map((d, i) => (
          <span key={d} style={{ display: 'contents' }}>
            {i % 7 === 0 && <span className={`mini-wk ${i === 0 ? 'first' : ''} ${i === 35 ? 'last' : ''}`}>{weekNumber(addDays(d, 1))}</span>}
            <button onClick={() => onPick(d)} title={holidaysOn(d)[0]?.name}
              className={`mini-day ${new Date(d).getMonth() !== m.getMonth() ? 'out' : ''} ${sameDay(d, Date.now()) ? 'today' : ''} ${d === cursor ? 'sel' : ''} ${inRange(d) ? 'range' : ''}`}>
              {new Date(d).getDate()}{busy.has(d) && <i />}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function TimeGrid({ days, trips, now, onEvent, onDay, holidays }) {
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
      {holidays && days.some((d) => holidaysOn(d).length) && (
        <div className="tg-allday" style={{ gridTemplateColumns: template }}>
          <div />
          {days.map((d) => (
            <div key={d} className="tg-allday-cell">
              {holidaysOn(d).map((h) => <span key={h.name} className="hol-chip">{h.name}</span>)}
            </div>
          ))}
        </div>
      )}
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

function MonthGrid({ days, month, trips, onEvent, onDay, holidays }) {
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
              {holidays && holidaysOn(d).map((h) => <span key={h.name} className="hol-chip">{h.name}</span>)}
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
  const live = tr && ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status);
  const places = useMemo(() => [
    { ...l.pickup, kind: 'pickup', label: `Pickup · ${l.pickup.city}` },
    { ...l.dropoff, kind: 'dropoff', label: `Delivery · ${l.dropoff.city}` },
  ], [l.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const trucks = useMemo(() => (live ? [{ ...tr, color: d?.color, moving: true, label: `Unit ${tr.unit}` }] : []), [live, tr, d]);
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
      <div className="ev-map">
        <MapView height={180} places={places} route={l.legs?.toDropoff?.points} track={l.track} trucks={trucks} fitKey={`ev-${l.id}`} padding={28} />
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

/** Dispatch adds its own route. Left: numbered sections. Right: live summary with the route on a map. */
function AddRouteSheet({ day, onClose, onDone }) {
  const { data, toast, upsert } = useStore();
  const idx = useIndex();
  const pad = (n) => String(n).padStart(2, '0');
  const dayStr = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const firstHour = sameDay(day, Date.now()) ? Math.min(22, new Date().getHours() + 1) : 8;

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [pc, setPc] = useState({ contact: '', phone: '', note: '' });
  const [dc, setDc] = useState({ contact: '', phone: '', note: '' });
  const [showPc, setShowPc] = useState(false);
  const [showDc, setShowDc] = useState(false);
  const [pDate, setPDate] = useState(dayStr(day));
  const [pFrom, setPFrom] = useState(`${pad(firstHour)}:00`);
  const [pTo, setPTo] = useState(`${pad(Math.min(23, firstHour + 2))}:00`);
  const [appt, setAppt] = useState('');
  const [f, setF] = useState({ equipment: 'dry_van', description: '', weightKg: '', pallets: '', tempC: 3, hazmat: false, valueCad: '', poNumber: '', customer: '', rate: '' });
  const [opts, setOpts] = useState({ liftgate: false, expedite: false });
  const [moreFreight, setMoreFreight] = useState(false);
  const [steps, setSteps] = useState(['']);
  const [notes, setNotes] = useState('');
  const [driverId, setDriverId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [showTeam, setShowTeam] = useState(false);
  const [truckId, setTruckId] = useState('');
  const [trailerId, setTrailerId] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const from = new Date(`${pDate}T${pFrom || '08:00'}`).getTime();
  const to = new Date(`${pDate}T${pTo || pFrom || '10:00'}`).getTime();
  const dist = pickup && dropoff ? haversine(pickup, dropoff) * 1.2 : null;
  const driveH = dist ? dist / data.settings.avgSpeedKmh : 0;
  const arrival = dist ? from + (driveH + 0.75) * H : null;
  const eq = data.meta.equipment[f.equipment];
  const rateSuggest = dist ? Math.round((eq.base + dist * eq.perKm * (1 + data.settings.fuelSurchargePct)) * (1 - data.settings.platformFeePct)) : null;

  const busy = new Set(data.loads.filter((l) => ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status)).flatMap((l) => [l.driverId, ...(l.teamDriverIds || [])]));
  const drivers = data.users.filter((u) => u.role === 'driver').map((d) => {
    const t = idx.trucks[d.truckId];
    const km0 = pickup && t?.location ? haversine(t.location, pickup) * 1.2 : null;
    const shift = daySchedule(d.schedule, new Date(from).getDay());
    const off = (d.timeOff || []).some((o) => o.from <= from && o.to >= from);
    return { d, t, km0, free: !busy.has(d.id), shift, off };
  }).sort((a, b) => (b.free - a.free) || (a.off - b.off) || ((b.t?.equipment === f.equipment) - (a.t?.equipment === f.equipment)) || ((a.km0 ?? 1e9) - (b.km0 ?? 1e9)));
  const chosen = driverId || drivers.find((x) => x.free && x.t && !x.off)?.d.id || drivers.find((x) => x.t)?.d.id || '';
  const chosenRow = drivers.find((x) => x.d.id === chosen);
  const chosenTruck = truckId || idx.users[chosen]?.truckId || '';
  const inUseTrailers = new Set(data.loads.filter((l) => ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status) && l.trailerId).map((l) => l.trailerId));
  const autoTrailer = (data.trailers || []).find((t) => t.equipment === f.equipment && t.status !== 'shop' && !inUseTrailers.has(t.id));
  const chosenTrailer = trailerId || autoTrailer?.id || '';

  const places = useMemo(() => [pickup && { ...pickup, kind: 'pickup', label: 'Pickup' }, dropoff && { ...dropoff, kind: 'dropoff', label: 'Delivery' }].filter(Boolean), [pickup, dropoff]);
  const line = useMemo(() => (pickup && dropoff ? [pickup, dropoff] : null), [pickup, dropoff]);

  const save = async () => {
    const load = await post('/loads', {
      pickup: { ...pickup, contact: pc.contact || pickup.contact || '', phone: pc.phone || pickup.phone || '', dockNote: pc.note },
      dropoff: { ...dropoff, contact: dc.contact || dropoff.contact || '', phone: dc.phone || dropoff.phone || '', dockNote: dc.note },
      pickupWindow: { from, to: Math.max(from, to) },
      deliveryWindow: appt ? { from: new Date(appt).getTime(), to: new Date(appt).getTime() + H } : null,
      cargo: { equipment: f.equipment, description: f.description || 'General freight', weightKg: f.weightKg, pallets: f.pallets, tempC: f.equipment === 'reefer' ? Number(f.tempC) : null, hazmat: f.hazmat, valueCad: f.valueCad },
      options: opts, poNumber: f.poNumber, customer: f.customer, rate: f.rate || rateSuggest,
      driverId: chosen, teamDriverId: teamId || undefined, truckId: chosenTruck, trailerId: chosenTrailer || undefined,
      instructions: steps, notes,
    });
    upsert('loads', load);
    toast({ title: 'Route added', body: `${load.ref} · ${idx.users[chosen]?.name} · ${new Date(from).toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` });
    onDone(load);
  };

  const Contact = ({ c, setC, open, setOpen }) => (open
    ? (
      <div className="ar-contact">
        <input className="input" placeholder="Contact name" value={c.contact} onChange={(e) => setC({ ...c, contact: e.target.value })} />
        <input className="input" placeholder="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
        <input className="input" placeholder="Dock, door or gate code" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} />
      </div>
    )
    : <button type="button" className="ar-link" onClick={() => setOpen(true)}><Icon name="plus" size={13} stroke={2.4} />Contact, phone & dock</button>);
  const Section = ({ n, title, sub, children }) => (
    <section className="ar-sec">
      <header><span className="ar-n">{n}</span><div><div className="headline">{title}</div>{sub && <div className="footnote secondary">{sub}</div>}</div></header>
      <div className="ar-body">{children}</div>
    </section>
  );

  return (
    <Sheet title="Add route" onClose={onClose} wide>
      <div className="ar">
        <div className="ar-main">
          {Section({ n: 1, title: 'Route', sub: 'Search a saved place or type any address', children: (
            <div className="ar-stops">
              <div className="ar-stop">
                <PlacePicker kind="pickup" value={pickup} onChange={setPickup} placeholder="Pickup address" autoFocus />
                {Contact({ c: pc, setC: setPc, open: showPc, setOpen: setShowPc })}
              </div>
              <div className="ar-stop">
                <PlacePicker kind="dropoff" value={dropoff} onChange={setDropoff} placeholder="Delivery address" />
                {Contact({ c: dc, setC: setDc, open: showDc, setOpen: setShowDc })}
              </div>
            </div>
          ) })}

          {Section({ n: 2, title: 'Schedule', sub: 'When the truck should be at the pickup', children: (
            <>
              <div className="ar-row3">
                <Field label="Pickup date"><input className="input" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} /></Field>
                <Field label="Window opens"><input className="input" type="time" value={pFrom} onChange={(e) => setPFrom(e.target.value)} /></Field>
                <Field label="Window closes"><input className="input" type="time" value={pTo} onChange={(e) => setPTo(e.target.value)} /></Field>
              </div>
              <Field label="Delivery appointment (optional)"><input className="input" type="datetime-local" value={appt} onChange={(e) => setAppt(e.target.value)} /></Field>
            </>
          ) })}

          {Section({ n: 3, title: 'Assignment', sub: 'Best match is picked for you', children: (
            <>
              <Field label="Driver">
                <select className="select" value={chosen} onChange={(e) => { setDriverId(e.target.value); setTruckId(''); }}>
                  {drivers.map(({ d, t, km0, free, off, shift }) => (
                    <option key={d.id} value={d.id} disabled={!t}>
                      {d.name}{t ? ` · Unit ${t.unit}` : ' · no truck'}{km0 != null ? ` · ${Math.round(km0)} km away` : ''}{off ? ' · time off' : !shift ? ' · day off' : ''}{!free ? ' · on a job' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              {chosenRow && (chosenRow.off || !chosenRow.shift) && <div className="footnote orange">{chosenRow.d.name} is {chosenRow.off ? 'on time off' : 'not scheduled to work'} that day.</div>}
              <div className="ar-row2">
                <Field label="Truck">
                  <select className="select" value={chosenTruck} onChange={(e) => setTruckId(e.target.value)}>
                    {data.trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit} · {t.make}</option>)}
                  </select>
                </Field>
                <Field label="Trailer">
                  <select className="select" value={chosenTrailer} onChange={(e) => setTrailerId(e.target.value)}>
                    <option value="">No trailer</option>
                    {(data.trailers || []).map((t) => <option key={t.id} value={t.id} disabled={t.status === 'shop' || inUseTrailers.has(t.id)}>{t.unit} · {data.meta.equipment[t.equipment]?.label}{t.status === 'shop' ? ' · in shop' : inUseTrailers.has(t.id) ? ' · in use' : ''}</option>)}
                  </select>
                </Field>
              </div>
              {showTeam ? (
                <Field label="Team driver">
                  <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">None</option>
                    {drivers.filter(({ d }) => d.id !== chosen).map(({ d, free }) => <option key={d.id} value={d.id} disabled={!free}>{d.name}{!free ? ' · on a job' : ''}</option>)}
                  </select>
                </Field>
              ) : <button type="button" className="ar-link" onClick={() => setShowTeam(true)}><Icon name="plus" size={13} stroke={2.4} />Add a team driver</button>}
            </>
          ) })}

          {Section({ n: 4, title: 'Freight', children: (
            <>
              <div className="ar-eq">
                {Object.entries(data.meta.equipment).map(([k, e]) => (
                  <button key={k} type="button" className={`ar-eq-btn ${f.equipment === k ? 'on' : ''}`} onClick={() => setF((x) => ({ ...x, equipment: k }))}>
                    <i style={{ background: EQ_COLOR[k] }} />{e.label}
                  </button>
                ))}
              </div>
              <div className="ar-row2">
                <Field label="What is it?"><input className="input" value={f.description} onChange={set('description')} placeholder="e.g. 22 pallets of paper" /></Field>
                <Field label="Customer"><input className="input" value={f.customer} onChange={set('customer')} placeholder="Who it's for" /></Field>
              </div>
              <div className="ar-row3">
                <Field label="Weight (kg)"><input className="input" type="number" value={f.weightKg} onChange={set('weightKg')} /></Field>
                <Field label="Pallets"><input className="input" type="number" value={f.pallets} onChange={set('pallets')} /></Field>
                <Field label="PO / reference"><input className="input" value={f.poNumber} onChange={set('poNumber')} /></Field>
              </div>
              {moreFreight ? (
                <>
                  <div className="ar-row3">
                    {f.equipment === 'reefer' && <Field label="Keep at (°C)"><input className="input" type="number" value={f.tempC} onChange={set('tempC')} /></Field>}
                    <Field label="Declared value ($)"><input className="input" type="number" value={f.valueCad} onChange={set('valueCad')} /></Field>
                  </div>
                  <div className="row wrap" style={{ gap: 18 }}>
                    <label className="row" style={{ gap: 8 }}><Switch checked={f.hazmat} onChange={(v) => setF((x) => ({ ...x, hazmat: v }))} label="Hazmat" />Hazmat</label>
                    <label className="row" style={{ gap: 8 }}><Switch checked={opts.liftgate} onChange={(v) => setOpts((o) => ({ ...o, liftgate: v }))} label="Liftgate" />Liftgate</label>
                    <label className="row" style={{ gap: 8 }}><Switch checked={opts.expedite} onChange={(v) => setOpts((o) => ({ ...o, expedite: v }))} label="Expedited" />Expedited</label>
                  </div>
                </>
              ) : <button type="button" className="ar-link" onClick={() => setMoreFreight(true)}><Icon name="plus" size={13} stroke={2.4} />Temperature, value, hazmat, liftgate…</button>}
            </>
          ) })}

          {Section({ n: 5, title: 'Instructions for the driver', sub: 'Shown step by step on their phone', children: (
            <>
              {steps.map((st, i) => (
                <div key={i} className="ar-step">
                  <span>{i + 1}</span>
                  <input className="input" value={st} placeholder={['Check in at the gate and show the PO', 'Count pallets with the shipper', 'Strap and tarp the load'][i] || 'Next step'}
                    onChange={(e) => setSteps((x) => x.map((y, k) => (k === i ? e.target.value : y)))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && st.trim()) { e.preventDefault(); setSteps((x) => [...x, '']); } }} />
                  {steps.length > 1 && <button type="button" className="icon-btn" aria-label="Remove step" onClick={() => setSteps((x) => x.filter((_, k) => k !== i))}><Icon name="close" size={14} /></button>}
                </div>
              ))}
              <button type="button" className="ar-link" onClick={() => setSteps((x) => [...x, ''])}><Icon name="plus" size={13} stroke={2.4} />Add step</button>
              <textarea className="textarea" style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Other notes (optional)" />
            </>
          ) })}
        </div>

        <aside className="ar-side">
          <div className="ar-map">
            <MapView height={200} places={places} route={line} fitKey={`ar-${pickup?.lat}-${dropoff?.lat}`} padding={30} />
          </div>
          <div className="ar-sum">
            <div className="ar-sum-route">
              <RouteMini a={pickup} b={dropoff} />
            </div>
            <dl>
              <div><dt>Distance</dt><dd>{dist ? km(dist) : '—'}</dd></div>
              <div><dt>Driving</dt><dd>{dist ? duration(driveH) : '—'}</dd></div>
              <div><dt>Pickup</dt><dd>{new Date(from).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</dd></div>
              <div><dt>Arrives about</dt><dd>{arrival ? new Date(arrival).toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</dd></div>
              <div><dt>Driver</dt><dd>{idx.users[chosen]?.name || '—'}{teamId ? ` + ${idx.users[teamId]?.name.split(' ')[0]}` : ''}</dd></div>
              <div><dt>Equipment</dt><dd>{idx.trucks[chosenTruck] ? `Unit ${idx.trucks[chosenTruck].unit}` : '—'}{idx.trailers?.[chosenTrailer] ? ` · ${idx.trailers[chosenTrailer].unit}` : ''}</dd></div>
            </dl>
            <Field label={`Your rate ($)${rateSuggest ? ` · suggested ${rateSuggest.toLocaleString()}` : ''}`}>
              <input className="input" type="number" value={f.rate} onChange={set('rate')} placeholder={rateSuggest ? String(rateSuggest) : 'Add stops to get a rate'} />
            </Field>
            {dist && <div className="footnote secondary">{money2(Number(f.rate || rateSuggest) / dist)} per km</div>}
          </div>
          <div className="ar-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <ActionButton className="btn primary large" disabled={!pickup || !dropoff || !chosen || !pDate} onClick={save}>
              <Icon name="plus" size={16} stroke={2.4} />Add route
            </ActionButton>
          </div>
          {(!pickup || !dropoff) && <div className="footnote tertiary" style={{ textAlign: 'center' }}>Add a pickup and delivery to continue.</div>}
        </aside>
      </div>
    </Sheet>
  );
}

function RouteMini({ a, b }) {
  return (
    <div className="route-line">
      <div className="dots"><i /><b /><i className="end" /></div>
      <div className="stack" style={{ gap: 10 }}>
        <div><div className="headline truncate">{a ? a.name : 'Pickup'}</div><div className="footnote secondary truncate">{a ? `${a.address}${a.city ? `, ${a.city}` : ''}` : 'Not set'}</div></div>
        <div><div className="headline truncate">{b ? b.name : 'Delivery'}</div><div className="footnote secondary truncate">{b ? `${b.address}${b.city ? `, ${b.city}` : ''}` : 'Not set'}</div></div>
      </div>
    </div>
  );
}

const parseHM = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) + (m || 0) / 60; };

/** Everyone's week at a glance (or one person): shift hours, time off and routes. Edit anyone's schedule from here. */
function ScheduleView({ days, trips, now, onEvent }) {
  const { data } = useStore();
  const idx = useIndex();
  const drivers = data.users.filter((u) => u.role === 'driver');
  const [who, setWho] = useState('all');
  const [edit, setEdit] = useState(null);
  const list = who === 'all' ? drivers : drivers.filter((d) => d.id === who);
  const tripsOf = (id) => trips.filter((t) => t.load.driverId === id || (t.load.teamDriverIds || []).includes(id));
  const offOn = (d, day) => (d.timeOff || []).find((o) => o.from < day + 864e5 && o.to >= day);
  const pct = (t, day) => Math.max(0, Math.min(100, ((t - day) / 864e5) * 100));
  const hoursPlanned = (d) => days.reduce((a, day) => a + (!offOn(d, day) ? shiftHours(daySchedule(d.schedule, new Date(day).getDay())) : 0), 0);

  return (
    <div className="sched">
      <div className="sched-people">
        <button className={`sched-person ${who === 'all' ? 'on' : ''}`} onClick={() => setWho('all')}><Icon name="people" size={16} />Everyone</button>
        {drivers.map((d) => (
          <button key={d.id} className={`sched-person ${who === d.id ? 'on' : ''}`} onClick={() => setWho(d.id)}>
            <Avatar user={d} size="sm" />{d.name.split(' ')[0]}
          </button>
        ))}
      </div>
      <div className="sched-grid" style={{ gridTemplateColumns: `230px repeat(7, minmax(0, 1fr))` }}>
        <div className="sched-corner" />
        {days.map((d) => (
          <div key={d} className={`sched-dayhead ${sameDay(d, now) ? 'today' : ''}`}>
            <span>{WEEKDAYS[new Date(d).getDay()].toUpperCase()}</span><b>{new Date(d).getDate()}</b>
          </div>
        ))}
        {list.map((drv) => {
          const mine = tripsOf(drv.id);
          return (
            <div key={drv.id} style={{ display: 'contents' }}>
              <div className="sched-who">
                <Avatar user={drv} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="headline truncate">{drv.name}</div>
                  <div className="caption secondary truncate">{scheduleText(drv.schedule)}</div>
                  <div className="caption tertiary">{idx.trucks[drv.truckId] ? `Unit ${idx.trucks[drv.truckId].unit} · ` : ''}{hoursPlanned(drv).toFixed(0)} h planned · {mine.filter((t) => t.start < days[6] + 864e5 && t.end > days[0]).length} routes</div>
                </div>
                <button className="icon-btn" aria-label={`Edit ${drv.name}'s schedule`} title="Edit schedule" onClick={() => setEdit(drv)}><Icon name="gear" size={15} /></button>
              </div>
              {days.map((day) => {
                const shift = daySchedule(drv.schedule, new Date(day).getDay());
                const works = !!shift;
                const off = offOn(drv, day);
                const s0 = shift ? parseHM(shift.start) : 0; const s1raw = shift ? parseHM(shift.end) : 0; const s1 = s1raw <= s0 ? 24 : s1raw;
                const segs = mine.filter((t) => t.start < day + 864e5 && t.end > day);
                return (
                  <div key={day} className={`sched-cell ${!works ? 'rest' : ''} ${sameDay(day, now) ? 'today' : ''}`} style={{ minHeight: who === 'all' ? 64 : 160 }}>
                    {works && !off && <div className="sched-shift" style={{ left: `${(s0 / 24) * 100}%`, width: `${((s1 - s0) / 24) * 100}%` }} title={`Shift ${shift.start}–${shift.end}`} />}
                    {off && <div className="sched-off">{off.reason || 'Time off'}</div>}
                    {!works && !off && <div className="sched-restlabel">Off</div>}
                    {segs.map((t, i) => (
                      <button key={t.id} className="sched-trip" style={{ left: `${pct(t.start, day)}%`, width: `max(10px, ${pct(t.end, day) - pct(t.start, day)}%)`, top: 6 + (i % 3) * 18, '--ev': t.color }}
                        title={`${t.load.ref} · ${t.load.pickup.city} → ${t.load.dropoff.city} · ${shortTime(t.start)}–${shortTime(t.end)}`} onClick={(e) => onEvent(t, e)}>
                        <span className="truncate">{t.load.ref.replace('RG-', '')} {t.load.dropoff.city}</span>
                      </button>
                    ))}
                    {sameDay(day, now) && <div className="sched-now" style={{ left: `${pct(now, day)}%` }} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="footnote tertiary" style={{ padding: '8px 16px' }}>Shaded band = shift hours · coloured bars = routes · ⚙ edits the schedule, time off and records.</div>
      {edit && <DriverSheet driver={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
