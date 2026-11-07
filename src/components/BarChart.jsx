// Single-series bar chart with hover tooltips. Rounded data-ends, recessive grid, one axis.
import { useRef, useState } from 'react';

export default function BarChart({ data, format = (v) => v, height = 180, highlightLast }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 600;
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t, true)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * bw + bw * 0.18;
          const w = Math.max(2, bw * 0.64);
          const h = Math.max(0, height - pad.b - y(d.value));
          const r = Math.min(4, w / 2, h);
          const yy = height - pad.b - h;
          const path = h > 0 ? `M${x},${height - pad.b} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${height - pad.b} Z` : '';
          const dim = hover != null ? hover !== i : highlightLast && i !== data.length - 1;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />
              {path && <path className={`bar ${dim ? 'dim' : ''}`} d={path} />}
              {(data.length <= 12 || i % Math.ceil(data.length / 10) === 0) && (
                <text className="axis-label" x={pad.l + i * bw + bw / 2} y={height - 6} textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip glass" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, top: (y(data[hover].value) / height) * height }}>
          <div className="caption secondary">{data[hover].full || data[hover].label}</div>
          <div className="headline num">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
