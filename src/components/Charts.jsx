// Small, calm SVG charts for dashboards: donut, ring gauge, mini bars, sparkline, progress.

export function Donut({ segments, size = 132, thickness = 16, center, sub }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2; const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut">
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-fill-2)" strokeWidth={thickness} />
          {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * c;
            const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="donut-center"><div className="num">{center ?? total}</div>{sub && <div>{sub}</div>}</div>
      </div>
      <div className="donut-legend">
        {segments.map((s) => (
          <div key={s.label} className="row" style={{ gap: 8 }}>
            <span className="sw" style={{ background: s.color }} /><span className="spacer">{s.label}</span><b className="num">{s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Circular gauge, value 0..max. */
export function Gauge({ value, max, label, display, color = 'var(--blue)', size = 108 }) {
  const t = 10; const r = (size - t) / 2; const c = 2 * Math.PI * r;
  const f = max ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="gauge" style={{ width: size }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-fill-2)" strokeWidth={t} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={t} strokeLinecap="round" strokeDasharray={`${f * c} ${c}`} />
        </svg>
        <div className="donut-center"><div className="num" style={{ fontSize: size * 0.2 }}>{display ?? value}</div></div>
      </div>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

/** Compact vertical bars with labels underneath. */
export function MiniBars({ data, color = 'var(--blue)', height = 120, format = (v) => v, highlightLast = true }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="minibars" style={{ height: height + 34 }}>
      {data.map((d, i) => (
        <div key={i} className="mb-col" title={`${d.label}: ${format(d.value)}`}>
          <div className="mb-val">{d.value ? format(d.value) : ''}</div>
          <div className="mb-track" style={{ height }}>
            <div className="mb-bar" style={{ height: `${(d.value / max) * 100}%`, background: highlightLast && i === data.length - 1 ? color : `color-mix(in srgb, ${color} 55%, transparent)` }} />
          </div>
          <div className="mb-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, color = 'var(--blue)', height = 6 }) {
  return <div className="dprog" style={{ height }}><div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>;
}

/** Big icon tile + number + label. */
export function KpiTile({ icon, tone = 'blue', k, v, d, onClick, alert }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`dkpi ${alert ? 'alert' : ''} ${onClick ? 'click' : ''}`} onClick={onClick}>
      <div className="dkpi-icon" style={{ background: `color-mix(in srgb, var(--${tone}) 14%, transparent)`, color: `var(--${tone})` }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="dkpi-v num">{v}</div>
        <div className="dkpi-k">{k}</div>
        {d && <div className="dkpi-d">{d}</div>}
      </div>
    </Tag>
  );
}
