// Projected vs actual time for each part of a trip, plus route-change history.
import Icon from './Icon.jsx';
import { useStore } from '../lib/store.jsx';
import { planVsActual } from '../../server/routecheck.js';
import { duration, time, dayLabel, km } from '../lib/format.js';

const diffText = (min) => {
  const m = Math.round(Math.abs(min));
  const t = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  return min >= 0 ? `+${t}` : `−${t}`;
};

export function OffRouteBanner({ load }) {
  if (!load.routeWatch?.off) return null;
  return (
    <div className="row" style={{ gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--red)', color: '#fff', marginTop: 10 }}>
      <Icon name="warning" size={16} />
      <span className="subhead"><b>Off the planned route</b> since {time(load.routeWatch.since)} — up to {(load.routeWatch.maxKm || 0).toFixed(1)} km away</span>
    </div>
  );
}

export default function PlanVsActual({ load }) {
  const { data } = useStore();
  if (!load.startedAt) return null;
  const { rows, total, routeEvents } = planVsActual(load, data.settings);
  return (
    <div className="card pad-lg stack">
      <div className="row between">
        <div className="title3">Projected vs actual</div>
        {total.verdict && <span className={`pill ${total.verdict.tone}`}>{total.verdict.label}</span>}
        {!total.done && total.behindMin != null && (
          <span className={`pill ${total.behindMin > 30 ? 'red' : total.behindMin > 10 ? 'orange' : 'green'}`}>{total.behindMin > 10 ? `${diffText(total.behindMin)} behind plan` : total.behindMin < -10 ? `${diffText(-total.behindMin).slice(1)} ahead` : 'On plan'}</span>
        )}
      </div>
      <table className="table compact">
        <thead><tr><th>Part</th><th className="r">Projected</th><th className="r">Actual</th><th className="r">Difference</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <div>{r.label}</div>
                {r.projKm != null && <div className="caption secondary">{km(r.projKm)} planned{r.actKm ? ` · ${km(r.actKm, 1)} driven` : ''}</div>}
              </td>
              <td className="r num">{duration(r.projH)}</td>
              <td className="r num">{r.actH == null ? '—' : `${duration(r.actH)}${r.done ? '' : ' so far'}`}</td>
              <td className="r">{r.verdict ? <span className={`pill ${r.verdict.tone}`} title={r.verdict.label}>{r.verdict.key === 'on_pace' ? 'Same' : diffText(r.verdict.diffMin)}</span> : <span className="secondary">—</span>}</td>
            </tr>
          ))}
          <tr>
            <td className="headline">Total</td>
            <td className="r num headline">{duration(total.projH)}</td>
            <td className="r num headline">{total.actH == null ? '—' : `${duration(total.actH)}${total.done ? '' : ' so far'}`}</td>
            <td className="r">{total.verdict ? <span className={`pill ${total.verdict.tone}`}>{total.verdict.key === 'on_pace' ? 'Same' : diffText(total.verdict.diffMin)}</span> : null}</td>
          </tr>
        </tbody>
      </table>
      <div className="footnote secondary">Projected = fastest route time from {load.legs?.toDropoff?.source === 'google' ? 'Google Maps' : 'the route planner'}, plus 1 h each to load and unload. “Same” = within 15 min or 10%.</div>
      <div className="divider" style={{ margin: 0 }} />
      <div className="headline row" style={{ gap: 6 }}><Icon name="route" size={15} />Route changes</div>
      {routeEvents.length === 0 ? (
        <div className="subhead green">Stayed on the planned fastest route.</div>
      ) : (
        <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {routeEvents.map((e) => (
            <li key={e.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name={e.kind === 'off' ? 'warning' : 'checkCircle'} size={15} style={{ color: e.kind === 'off' ? 'var(--red)' : 'var(--green)', marginTop: 2 }} />
              <div>
                <div className="subhead">{e.kind === 'off' ? `Left the planned route ${e.leg === 'toPickup' ? 'to the pickup' : 'to the delivery'} — ${e.km} km off` : `Back on the planned route after ${e.minutes} min (up to ${e.km} km off)`}</div>
                <div className="caption secondary">{dayLabel(e.t)} · <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer">see location</a></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
