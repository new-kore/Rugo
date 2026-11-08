// Ranked driver list for a load, with the reasons behind each match score.
import Icon from './Icon.jsx';
import { Avatar } from './ui.jsx';

export function ScoreBadge({ score, size = 36 }) {
  const tone = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--blue)' : score >= 40 ? 'var(--orange)' : 'var(--label-3)';
  const r = (size - 4) / 2; const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} title={`Match ${score}/100`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-fill-2)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="3" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="num" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.34, fontWeight: 600 }}>{score}</div>
    </div>
  );
}

export function Reasons({ r, max = 5 }) {
  return (
    <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
      {r.blockers.map((b) => <span key={b} className="pill red" style={{ height: 20, fontSize: '0.72rem' }}>{b}</span>)}
      {r.reasons.slice(0, max).map((x, i) => <span key={i} className={`pill ${x.tone}`} style={{ height: 20, fontSize: '0.72rem' }}>{x.text}</span>)}
    </div>
  );
}

/** rows: output of rankDrivers. pick / onPick: selected driver id. */
export default function MatchList({ rows, pick, onPick, equipmentLabel }) {
  return (
    <div className="list">
      {rows.map((r) => (
        <button key={r.driver.id} className="list-row" disabled={!r.eligible} style={{ opacity: r.eligible ? 1 : 0.5, alignItems: 'flex-start', padding: '10px 12px' }} onClick={() => onPick(r.driver.id)}>
          <ScoreBadge score={r.eligible ? r.score : 0} />
          <Avatar user={r.driver} />
          <div className="label" style={{ minWidth: 0 }}>
            <div className="headline row" style={{ gap: 6 }}>
              {r.driver.name}
              {r.best && <span className="pill green"><Icon name="sparkles" size={11} />Best match</span>}
            </div>
            <div className="footnote secondary truncate">{r.truck ? `Unit ${r.truck.unit}${equipmentLabel ? ` · ${equipmentLabel(r.truck.equipment)}` : ''}` : 'No truck'} · costs ${Math.round(r.cost).toLocaleString('en-CA')}</div>
            <Reasons r={r} />
          </div>
          <div style={{ width: 24, height: 24, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center', background: pick === r.driver.id ? 'var(--blue)' : 'transparent', boxShadow: pick === r.driver.id ? 'none' : 'inset 0 0 0 2px var(--label-3)', color: '#fff' }}>
            {pick === r.driver.id && <Icon name="check" size={14} stroke={3} />}
          </div>
        </button>
      ))}
    </div>
  );
}
