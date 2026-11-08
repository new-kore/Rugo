// Driver home: what's happening today, what to do next, what's coming up, and anything missed.
import { useMemo } from 'react';
import Icon from '../../components/Icon.jsx';
import { ActionButton, StatusPill } from '../../components/ui.jsx';
import { Gauge, Progress, KpiTile } from '../../components/Charts.jsx';
import { useStore, useNow, isActive } from '../../lib/store.jsx';
import { post } from '../../lib/api.js';
import { go } from '../../lib/router.js';
import { time, money, km, ago } from '../../lib/format.js';
import { weekSchedule, hm, shiftHours, driverAlerts, DAYS } from '../../lib/drivers.js';
import { unread, openShift } from '../../lib/chat.js';
import { punctuality } from '../../../server/scorecard.js';
import { hm as fmtMin } from '../../lib/hos.js';

const H = 3.6e6; const DAY = 864e5;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const dayStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const weekStart = () => { const d = new Date(dayStart()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const NEXT = { accepted: 'Start driving to the pickup', en_route_pickup: 'Drive to the pickup', at_pickup: 'Take pickup photos and load', in_transit: 'Drive to the delivery', at_delivery: 'Unload, photos and signature' };
const fmtHm = (v) => { if (!v) return ''; const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`; };

export default function DriverToday() {
  const { data, toast } = useStore();
  const now = useNow(30000);
  const me = data.me;
  const mine = data.loads.filter((l) => l.driverId === me.id || (l.teamDriverIds || []).includes(me.id));
  const current = mine.filter((l) => isActive(l) && l.status !== 'accepted').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
  const upcoming = mine.filter((l) => l.status === 'accepted' && l.id !== current?.id).sort((a, b) => (a.pickupWindow?.from || 0) - (b.pickupWindow?.from || 0));
  const job = current || upcoming[0];
  const shift = openShift(data, me.id);
  const sched = weekSchedule(me.schedule);
  const today = sched[new Date(now).getDay()];
  const unreadN = unread(data);

  // Hours: official ELD clocks when connected, otherwise from today's shifts.
  const t0 = dayStart(now);
  const dutyToday = (data.shifts || []).filter((s) => s.driverId === me.id).reduce((a, s) => a + Math.max(0, (Math.min(s.end || now, now) - Math.max(s.start, t0)) / H), 0);
  const driveToday = mine.filter((l) => (l.deliveredAt || now) > t0 && l.startedAt).reduce((a, l) => a + (l.metrics?.driveHours || 0), 0);
  const driveLeft = me.hos?.driveLeftMin != null ? me.hos.driveLeftMin / 60 : Math.max(0, 13 - driveToday);
  const dutyLeft = me.hos?.shiftLeftMin != null ? me.hos.shiftLeftMin / 60 : Math.max(0, 14 - dutyToday);

  // This week.
  const ws = weekStart();
  const weekLoads = mine.filter((l) => l.status === 'delivered' && l.deliveredAt >= ws);
  const weekKm = weekLoads.reduce((a, l) => a + (l.economics?.totalKm || 0), 0);
  const weekHours = (data.shifts || []).filter((s) => s.driverId === me.id).reduce((a, s) => a + Math.max(0, (Math.min(s.end || now, now) - Math.max(s.start, ws)) / H), 0);
  const weekPay = me.payType === 'per_km' ? weekKm * (me.perKmRate || 0) : weekHours * (me.hourlyRate || 0);

  // To do now.
  const todo = useMemo(() => {
    const out = [];
    const slots = data.meta.photoSlots.filter((s) => s.required);
    if (!shift && today && !current) out.push({ icon: 'clock', tone: 'blue', text: `Clock in — your shift is ${fmtHm(today.start)}–${fmtHm(today.end)}`, action: 'clock' });
    if (job) {
      if (job.status === 'accepted') out.push({ icon: 'navigate', tone: 'blue', text: `Start ${job.ref} — pickup ${job.pickupWindow ? `${time(job.pickupWindow.from)}–${time(job.pickupWindow.to)}` : ''} in ${job.pickup.city}`, to: '/job' });
      if (job.status === 'at_pickup') { const miss = slots.filter((s) => !job.photos.pickup.some((p) => p.slot === s.key)).length; if (miss) out.push({ icon: 'camera', tone: 'orange', text: `Take ${miss} pickup photo${miss > 1 ? 's' : ''}`, to: '/job' }); }
      if (job.status === 'at_delivery') {
        const miss = slots.filter((s) => !job.photos.delivery.some((p) => p.slot === s.key)).length;
        if (miss) out.push({ icon: 'camera', tone: 'orange', text: `Take ${miss} delivery photo${miss > 1 ? 's' : ''}`, to: '/job' });
        if (!job.signature) out.push({ icon: 'signature', tone: 'orange', text: 'Get the receiver’s signature', to: '/job' });
      }
      if (job.status === 'in_transit') out.push({ icon: 'flag', tone: 'blue', text: `Deliver to ${job.dropoff.name || job.dropoff.city}${job.eta?.deliveryAt ? ` — ETA ${time(job.eta.deliveryAt)}` : ''}`, to: '/job' });
    }
    if (unreadN) out.push({ icon: 'message', tone: 'blue', text: `Read ${unreadN} new message${unreadN > 1 ? 's' : ''} from the office`, to: '/messages' });
    if (me.hos?.flag === 'low') out.push({ icon: 'clock', tone: 'orange', text: `Plan your stop — ${fmtMin(me.hos.driveLeftMin)} of driving left`, to: '/hours' });
    if (me.hos?.flag === 'break') out.push({ icon: 'clock', tone: 'orange', text: 'Take your 30-minute break soon', to: '/hours' });
    for (const a of driverAlerts(me).filter((x) => x.kind !== 'hos')) out.push({ icon: 'doc', tone: a.level === 'expired' ? 'red' : 'orange', text: `${a.label}: ${a.text.toLowerCase()} — tell the office`, to: '/messages' });
    return out;
  }, [data, job, shift, today, current, unreadN, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Missed in the last 7 days.
  const missed = useMemo(() => {
    const out = []; const since = now - 7 * DAY;
    for (const l of mine) {
      for (const s of ['pickup', 'delivery']) {
        const p = punctuality(l, s); const at = s === 'pickup' ? l.arrivedPickupAt : l.arrivedDeliveryAt;
        if (p?.kind === 'late' && at > since) out.push({ t: at, icon: 'clock', text: `Late to ${s} at ${(s === 'pickup' ? l.pickup : l.dropoff).city} by ${p.min} min`, sub: l.ref, to: `/loads/${l.id}` });
      }
      for (const e of l.routeEvents || []) if (e.kind === 'off' && e.t > since) out.push({ t: e.t, icon: 'route', text: `Left the planned route (${e.km} km off)`, sub: l.ref, to: `/loads/${l.id}` });
    }
    // Scheduled days with no shift logged (grouped into one line).
    const noShift = [];
    for (let d = 1; d <= 6; d++) {
      const s0 = dayStart(now - d * DAY); const v = sched[new Date(s0).getDay()];
      if (!v) continue;
      const off = (me.timeOff || []).some((o) => o.from <= s0 + 12 * H && o.to >= s0);
      const worked = (data.shifts || []).some((s) => s.driverId === me.id && s.start < s0 + DAY && (s.end || now) > s0);
      if (!off && !worked) noShift.push(s0);
    }
    if (noShift.length) out.push({ t: noShift[0], icon: 'calendar', text: `No shift logged on ${noShift.length === 1 ? new Date(noShift[0]).toLocaleDateString('en-CA', { weekday: 'long' }) : `${noShift.length} scheduled days (${noShift.slice().reverse().map((x) => DAYS[new Date(x).getDay()]).join(', ')})`}`, sub: 'Tell the office if this is wrong', to: '/messages' });
    const oldUnread = (data.chat || []).filter((m) => m.userId !== me.id && !m.receipts?.[me.id]?.r && now - m.t > 2 * H);
    if (oldUnread.length) out.push({ t: oldUnread[0].t, icon: 'message', text: `${oldUnread.length} message${oldUnread.length > 1 ? 's' : ''} from the office not read yet`, sub: 'Over 2 hours old', to: '/messages' });
    return out.sort((a, b) => b.t - a.t).slice(0, 8);
  }, [data, mine, now, sched, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Week strip.
  const days = Array.from({ length: 7 }, (_, i) => {
    const s0 = ws + i * DAY; const v = sched[new Date(s0).getDay()];
    const off = (me.timeOff || []).find((o) => o.from <= s0 + 12 * H && o.to >= s0);
    const loads = mine.filter((l) => l.status !== 'cancelled' && ((l.pickupWindow?.from >= s0 && l.pickupWindow.from < s0 + DAY) || (l.deliveredAt >= s0 && l.deliveredAt < s0 + DAY)));
    return { s0, v, off, loads, today: s0 === t0, past: s0 < t0 };
  });

  const clock = async () => { try { await post('/driver/clock', { action: shift ? 'out' : 'in' }); } catch (e) { toast({ title: 'Couldn’t update', body: e.message, tone: 'error' }); } };
  const progress = job ? { accepted: 4, en_route_pickup: 18, at_pickup: 38, in_transit: 40 + Math.min(45, ((job.metrics?.loadedKm || 0) / (job.quote?.distanceKm || 1)) * 45), at_delivery: 92 }[job.status] || 0 : 0;

  return (
    <div className="page dash" style={{ maxWidth: 980 }}>
      <div className="dash-head">
        <div>
          <div className="subhead secondary">{new Date(now).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="large-title">{greeting()}, {me.name.split(' ')[0]}</h1>
        </div>
      </div>

      <div className={`driver-hero ${shift ? 'green' : ''}`} style={{ marginBottom: 14 }}>
        <div className="row between">
          <div>
            <div className="subhead" style={{ opacity: 0.85 }}>{shift ? 'On shift' : today ? `Today’s shift ${fmtHm(today.start)}–${fmtHm(today.end)}` : 'Day off'}</div>
            <div className="title1">{shift ? `Since ${time(shift.start)}` : 'Not clocked in'}</div>
          </div>
          <Icon name="clock" size={40} stroke={1.6} />
        </div>
        <ActionButton className="btn large" style={{ marginTop: 14, width: '100%', background: 'rgba(255,255,255,.95)', color: shift ? '#1f9e45' : '#0055d4' }} onClick={clock}>{shift ? 'Clock out' : 'Clock in'}</ActionButton>
      </div>

      {job ? (
        <button className="card pad-lg job-card" onClick={() => go('/job')}>
          <div className="row between"><span className="footnote secondary">{current ? 'Current job' : 'Next job'} · {job.ref}</span><StatusPill status={job.status} /></div>
          <div className="title2" style={{ marginTop: 6 }}>{job.pickup.city} → {job.dropoff.city}</div>
          <div className="subhead secondary">{NEXT[job.status]}{job.eta?.remainingKm ? ` · ${km(job.eta.remainingKm)} to go` : ''}{job.eta?.deliveryAt && current ? ` · arrive ~${time(job.eta.deliveryAt)}` : !current && job.pickupWindow ? ` · pickup ${time(job.pickupWindow.from)}` : ''}</div>
          <div style={{ marginTop: 10 }}><Progress value={progress} color="var(--blue)" height={8} /></div>
          <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end', color: 'var(--blue)', fontWeight: 600 }}>Open job <Icon name="chevron" size={16} /></div>
        </button>
      ) : (
        <div className="card pad-lg empty-mini" style={{ alignItems: 'flex-start' }}><b>No job right now</b><span className="secondary">The office will send your next load here.</span></div>
      )}

      <div className="dkpis" style={{ marginTop: 14 }}>
        <KpiTile icon={<Icon name="route" size={20} />} tone="indigo" k="km this week" v={Math.round(weekKm).toLocaleString()} d={`${weekLoads.length} loads delivered`} />
        <KpiTile icon={<Icon name="dollar" size={20} />} tone="green" k="Earned this week" v={money(weekPay)} d={me.payType === 'per_km' ? `${money(me.perKmRate, 'CAD', 2)}/km` : `${Math.round(weekHours)} h × ${money(me.hourlyRate)}`} />
        <KpiTile icon={<Icon name="message" size={20} />} tone="blue" k="New messages" v={unreadN} d="from the office" alert={unreadN > 0} onClick={() => go('/messages')} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card pad-lg">
          <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="checkCircle" size={16} style={{ color: 'var(--blue)' }} /><span className="headline">To do</span></div>
          {todo.length === 0 ? <div className="empty-mini"><Icon name="checkCircle" size={26} style={{ color: 'var(--green)' }} />You’re all caught up.</div> : todo.map((x, i) => (
            <button key={i} className={`attn ${x.tone}`} onClick={() => (x.action === 'clock' ? clock() : go(x.to))}>
              <div className="attn-icon"><Icon name={x.icon} size={16} /></div><div className="subhead" style={{ fontWeight: 600, textAlign: 'left' }}>{x.text}</div>
            </button>
          ))}
        </div>
        <div className="card pad-lg">
          <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="clock" size={16} style={{ color: 'var(--green)' }} /><span className="headline">Hours left today</span>{me.hos && <span className="footnote secondary">from {me.hos.providerName}</span>}</div>
          <div className="row" style={{ justifyContent: 'space-around', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <Gauge value={driveLeft} max={13} display={`${driveLeft.toFixed(1)}h`} label="Driving" color={driveLeft < 1 ? 'var(--red)' : driveLeft < 3 ? 'var(--orange)' : 'var(--green)'} />
            <Gauge value={dutyLeft} max={14} display={`${dutyLeft.toFixed(1)}h`} label="On duty" color={dutyLeft < 1 ? 'var(--red)' : dutyLeft < 3 ? 'var(--orange)' : 'var(--blue)'} />
          </div>
        </div>
      </div>

      <div className="card pad-lg" style={{ marginTop: 14 }}>
        <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="calendar" size={16} style={{ color: 'var(--indigo)' }} /><span className="headline">This week</span></div>
        <div className="weekstrip">
          {days.map((d) => (
            <div key={d.s0} className={`wday ${d.today ? 'today' : ''} ${d.past ? 'past' : ''} ${d.off ? 'off' : ''}`}>
              <div className="wday-n">{DAYS[new Date(d.s0).getDay()]}</div>
              <div className="wday-d num">{new Date(d.s0).getDate()}</div>
              <div className="wday-s">{d.off ? 'Time off' : d.v ? `${fmtHm(d.v.start)}–${fmtHm(d.v.end)}` : 'Off'}</div>
              {d.v && !d.off && <div className="wday-h">{shiftHours(d.v)} h</div>}
              {d.loads.length > 0 && <div className="wday-l">{d.loads.length} load{d.loads.length > 1 ? 's' : ''}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card pad-lg">
          <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="navigate" size={16} style={{ color: 'var(--blue)' }} /><span className="headline">Coming up</span></div>
          {upcoming.length === 0 && <div className="empty-mini">Nothing else scheduled yet.</div>}
          {upcoming.map((l) => (
            <button key={l.id} className="feed" onClick={() => go(`/loads/${l.id}`)}>
              <span className="feed-icon"><Icon name="truck" size={15} style={{ color: 'var(--indigo)' }} /></span>
              <span style={{ minWidth: 0, flex: 1 }}><span className="subhead truncate" style={{ display: 'block', fontWeight: 600 }}>{l.pickup.city} → {l.dropoff.city}</span><span className="footnote secondary">{l.ref} · pickup {l.pickupWindow ? `${new Date(l.pickupWindow.from).toLocaleDateString('en-CA', { weekday: 'short' })} ${time(l.pickupWindow.from)}` : 'TBD'}</span></span>
              <Icon name="chevron" size={14} className="tertiary" />
            </button>
          ))}
        </div>
        <div className="card pad-lg">
          <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="flag" size={16} style={{ color: 'var(--orange)' }} /><span className="headline">Missed this week</span></div>
          {missed.length === 0 ? <div className="empty-mini"><Icon name="star" size={24} style={{ color: 'var(--green)' }} />Nothing missed — great week.</div> : missed.map((x, i) => (
            <button key={i} className="feed" onClick={() => go(x.to)}>
              <span className="feed-icon"><Icon name={x.icon} size={14} style={{ color: 'var(--orange)' }} /></span>
              <span style={{ minWidth: 0, flex: 1 }}><span className="subhead" style={{ display: 'block' }}>{x.text}</span><span className="footnote secondary">{x.sub} · {ago(x.t)}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
