// Calendar "Map" view: one week of loads drawn as routes, coloured by pickup day.
import { useMemo, useState } from 'react';
import { Empty } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';
import { useStore, useIndex } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { time, placeShort, km, duration } from '../lib/format.js';

// One colour per weekday (Sun to Sat).
const DAY_COLORS = ['#8e6ad8', '#5e6ad2', '#26b5ce', '#3fae72', '#d9a514', '#f2994a', '#e5484d'];

export default function CalendarMap({ days, byDay }) {
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
