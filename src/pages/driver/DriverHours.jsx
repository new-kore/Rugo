// Hours of service and pay, in plain language. Limits follow Canadian federal HOS (13 h driving / 14 h on duty per day).
import Icon from '../../components/Icon.jsx';
import { PageHead, Stat, ActionButton } from '../../components/ui.jsx';
import { useStore, useNow } from '../../lib/store.jsx';
import { post } from '../../lib/api.js';
import { money, money2, duration, time, date, km, ago } from '../../lib/format.js';
import { hosStatus, hm, clockTone, hosStale } from '../../lib/hos.js';

const DRIVE_LIMIT = 13;
const DUTY_LIMIT = 14;

export default function DriverHours() {
  const { data } = useStore();
  useNow(30000);
  const me = data.me;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const shifts = data.shifts.filter((s) => s.driverId === me.id);
  const open = shifts.find((s) => !s.end);
  const hoursIn = (s, from) => Math.max(0, (Math.min(s.end || Date.now(), Date.now()) - Math.max(s.start, from)) / 3.6e6);
  const dutyToday = shifts.reduce((a, s) => a + hoursIn(s, t0), 0);
  const loadsToday = data.loads.filter((l) => l.driverId === me.id && (l.deliveredAt || Date.now()) > t0 && l.startedAt);
  const driveToday = loadsToday.reduce((a, l) => a + (l.metrics.driveHours || 0), 0);
  const weekFrom = Date.now() - 7 * 864e5;
  const dutyWeek = shifts.reduce((a, s) => a + hoursIn(s, weekFrom), 0);
  const kmWeek = data.loads.filter((l) => l.driverId === me.id && l.deliveredAt > weekFrom).reduce((a, l) => a + (l.economics?.totalKm || 0), 0);
  const payWeek = me.payType === 'per_km' ? kmWeek * me.perKmRate : dutyWeek * me.hourlyRate;

  const Meter = ({ label, used, limit }) => {
    const left = Math.max(0, limit - used);
    const pct = Math.min(100, (used / limit) * 100);
    return (
      <div className="card pad-lg stack-sm">
        <div className="row between"><span className="headline">{label}</span><span className="subhead secondary">{limit} h limit</span></div>
        <div className="title1 num">{duration(left)} <span className="subhead secondary">left today</span></div>
        <div className={`progress ${pct > 90 ? 'red' : pct > 70 ? 'orange' : 'green'}`} style={{ height: 10 }}><div style={{ width: `${pct}%` }} /></div>
        <div className="footnote secondary">{duration(used)} used</div>
      </div>
    );
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead title="Hours & pay" sub={me.payType === 'per_km' ? `You’re paid ${money2(me.perKmRate)} per km` : `You’re paid ${money2(me.hourlyRate)} per hour`} />
      <div className={`driver-hero ${open ? 'green' : ''}`} style={{ marginBottom: 16 }}>
        <div className="row between">
          <div>
            <div className="subhead secondary">{open ? 'On duty' : 'Off duty'}</div>
            <div className="title1">{open ? `Since ${time(open.start)}` : 'Not clocked in'}</div>
          </div>
          <Icon name="clock" size={44} stroke={1.6} />
        </div>
        <ActionButton className="btn large" style={{ marginTop: 16, width: '100%', background: 'rgba(255,255,255,.95)', color: open ? '#1f9e45' : '#0055d4' }}
          onClick={() => post('/driver/clock', { action: open ? 'out' : 'in' })}>
          {open ? 'Clock out' : 'Clock in'}
        </ActionButton>
      </div>
      {me.hos ? <EldClocks h={me.hos} /> : (
        <div className="grid grid-2">
          <Meter label="Driving" used={driveToday} limit={DRIVE_LIMIT} />
          <Meter label="On duty" used={dutyToday} limit={DUTY_LIMIT} />
        </div>
      )}
      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <Stat icon="clock" k="Hours (7 days)" v={duration(dutyWeek).replace(' min', 'm')} />
        <Stat icon="route" tone="indigo" k="km (7 days)" v={Math.round(kmWeek).toLocaleString()} />
        <Stat icon="dollar" tone="green" k="Earned (7 days)" v={money(payWeek)} />
      </div>
      <div className="section-header">Shifts</div>
      <div className="list">
        {shifts.sort((a, b) => b.start - a.start).slice(0, 12).map((s) => {
          const l = data.loads.find((x) => x.id === s.loadId);
          return (
            <div key={s.id} className="list-row">
              <div className="label">
                <div className="headline">{date(s.start)} · {time(s.start)} – {s.end ? time(s.end) : 'now'}</div>
                <div className="footnote secondary">{l ? `${l.ref} · ${l.pickup.city} → ${l.dropoff.city} · ${km(l.metrics.loadedKm)}` : 'Clocked in'}</div>
              </div>
              <div className="headline num">{duration(hoursIn(s, 0))}</div>
            </div>
          );
        })}
      </div>
      <div className="section-footer">{me.hos ? `Hours of service come from ${me.hos.providerName}, your official electronic logbook. Change your duty status in the ${me.hos.providerName} app.` : 'Estimated from your shifts — not an official log.'} Canada’s federal rules: up to 13 hours of driving and 14 hours on duty per day.</div>
    </div>
  );
}

/** Official clocks from the truck's ELD. */
function EldClocks({ h }) {
  const st = hosStatus(h);
  const box = (label, min, limit, warn) => {
    const tone = clockTone(min, warn);
    const pct = limit && min !== null && min !== undefined ? Math.min(100, Math.max(0, 100 - (min / limit) * 100)) : 0;
    return (
      <div className="card pad-lg stack-sm">
        <span className="headline">{label}</span>
        <div className={`title1 num ${tone === 'gray' ? '' : tone}`}>{hm(min)}</div>
        <div className={`progress ${tone === 'red' ? 'red' : tone === 'orange' ? 'orange' : 'green'}`} style={{ height: 10 }}><div style={{ width: `${pct}%` }} /></div>
      </div>
    );
  };
  return (
    <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className={`pill ${st.tone}`}><span className="dot" />{st.label}</span>
        <span className={`footnote ${hosStale(h) ? 'orange' : 'secondary'}`}><Icon name="shield" size={13} /> Official log · {h.providerName} · {ago(h.at)}</span>
      </div>
      {h.flag === 'violation' && <div className="card pad" style={{ marginBottom: 12, background: 'var(--red)', color: '#fff' }}><b>Stop driving.</b> You’re past an hours-of-service limit.</div>}
      {h.flag === 'low' && <div className="card pad" style={{ marginBottom: 12, background: 'var(--orange)', color: '#fff' }}><b>Under an hour of driving left.</b> Plan where you’ll stop.</div>}
      <div className="grid grid-2">
        {box('Driving left', h.driveLeftMin, 13 * 60, 60)}
        {box('On-duty left', h.shiftLeftMin, 14 * 60, 60)}
        {box('Cycle left', h.cycleLeftMin, 70 * 60, 300)}
        {box('Break due in', h.breakLeftMin, 8 * 60, 30)}
      </div>
    </>
  );
}
