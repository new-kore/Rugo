// Driver scorecards: one per driver (in the driver sheet) and a ranked leaderboard (on the Drivers page).
import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Avatar, Segmented, Empty } from '../../components/ui.jsx';
import { ScoreBadge } from '../../components/MatchList.jsx';
import { useStore } from '../../lib/store.jsx';
import { useScorecards } from '../../lib/ai.js';
import { insights } from '../../../server/scorecard.js';
import { money, num } from '../../lib/format.js';

const PERIODS = [{ value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: '12 months' }];
const fmtMin = (m) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
const fmtH = (h) => (h == null ? '—' : `${num(h, 1)} h`);
const fmtPct = (p) => (p == null ? '—' : `${Math.round(p)}%`);
const tone = (v, good, ok) => (v == null ? '' : v >= good ? 'green' : v >= ok ? 'orange' : 'red');

function Trend({ now, prev }) {
  if (prev == null) return null;
  const d = now - prev;
  if (Math.abs(d) < 1) return <span className="caption secondary">±0</span>;
  return <span className={`caption ${d > 0 ? 'green' : 'red'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}</span>;
}

function Tile({ k, v, d, cls = '' }) {
  return (
    <div className="card stat" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
      <div className="k">{k}</div>
      <div className={`v num ${cls}`} style={{ fontSize: '1.25rem' }}>{v}</div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

/** Early / on time / late stacked bar. */
function Punctual({ label, p }) {
  const w = (n) => (p.n ? `${(n / p.n) * 100}%` : '0%');
  return (
    <div className="stack-sm">
      <div className="row between"><span className="subhead">{label}</span><span className={`headline num ${tone(p.onTimePct, 95, 80)}`}>{p.n ? `${p.onTimePct}% on time` : 'No stops yet'}</span></div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-fill-2)' }}>
        <div style={{ width: w(p.early), background: 'var(--teal)' }} title={`${p.early} early`} />
        <div style={{ width: w(p.exact), background: 'var(--green)' }} title={`${p.exact} in window`} />
        <div style={{ width: w(p.late), background: 'var(--red)' }} title={`${p.late} late`} />
      </div>
      <div className="row wrap footnote secondary" style={{ gap: 12 }}>
        <span><i className="sw" style={{ background: 'var(--teal)' }} />{p.early} early{p.avgEarlyMin != null ? ` (avg ${fmtMin(p.avgEarlyMin)})` : ''}</span>
        <span><i className="sw" style={{ background: 'var(--green)' }} />{p.exact} in window</span>
        <span><i className="sw" style={{ background: 'var(--red)' }} />{p.late} late{p.avgLateMin != null ? ` (avg ${fmtMin(p.avgLateMin)})` : ''}</span>
      </div>
    </div>
  );
}

function Row({ k, v, cls = '' }) {
  return <div className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><span className="subhead secondary">{k}</span><span className={`subhead num ${cls}`} style={{ fontWeight: 500 }}>{v}</span></div>;
}

export function ScorecardView({ driver }) {
  const [days, setDays] = useState(30);
  const { cards, fleet } = useScorecards(days);
  const c = cards[driver.id];
  if (!c) return <Empty icon="chart" title="No scorecard yet" />;
  const tips = insights(c, fleet);
  const m = c.money;
  return (
    <div className="stack">
      <div className="row" style={{ gap: 16, alignItems: 'center' }}>
        <ScoreBadge score={c.score.total} size={72} />
        <div className="spacer">
          <div className="title2">Grade {c.score.grade} <Trend now={c.score.total} prev={c.prev} /></div>
          <div className="subhead secondary">Rank #{c.rank} of {c.of} drivers · fleet average {Math.round(fleet.score || 0)}</div>
        </div>
        <Segmented value={days} onChange={setDays} options={PERIODS} />
      </div>

      {(tips.good.length > 0 || tips.work.length > 0) && (
        <div className="grid grid-2" style={{ gap: 10 }}>
          <div className="card pad" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
            <div className="headline green row" style={{ gap: 6 }}><Icon name="star" size={15} />Doing well</div>
            {tips.good.length ? tips.good.map((t) => <div key={t} className="subhead" style={{ marginTop: 6 }}>{t}</div>) : <div className="subhead secondary" style={{ marginTop: 6 }}>Not enough history yet.</div>}
          </div>
          <div className="card pad" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
            <div className="headline orange row" style={{ gap: 6 }}><Icon name="flag" size={15} />Work on</div>
            {tips.work.length ? tips.work.map((t) => <div key={t} className="subhead" style={{ marginTop: 6 }}>{t}</div>) : <div className="subhead secondary" style={{ marginTop: 6 }}>Nothing flagged.</div>}
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Tile k="Loads delivered" v={c.loads} d={`${num(c.loadsPerWeek, 1)} per week${c.activeLoads ? ` · ${c.activeLoads} active` : ''}`} />
        <Tile k="Made the company" v={money(m.revenue)} d={m.revenuePerKm ? `${money(m.revenuePerKm, 'CAD', 2)}/km` : '—'} />
        <Tile k="Cost the company" v={money(m.cost)} d={`Pay ${money(m.driverPay)} · fuel ${money(m.fuelCost)}`} />
        <Tile k="Profit" v={money(m.profit)} cls={m.profit >= 0 ? 'green' : 'red'} d={m.marginPct != null ? `${num(m.marginPct, 1)}% margin` : '—'} />
        <Tile k="Kilometres" v={num(c.km.total)} d={`${fmtPct(c.km.deadheadPct)} empty`} />
      </div>

      <div className="section-header" style={{ margin: '4px 0 0' }}>Punctuality</div>
      <div className="card pad stack" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
        <Punctual label="Pickups" p={c.pickup} />
        <Punctual label="Deliveries" p={c.delivery} />
      </div>

      <div className="grid grid-2" style={{ gap: 10 }}>
        <div>
          <div className="section-header" style={{ margin: '4px 0 6px' }}>Time & response</div>
          <Row k="Time to start after dispatch" v={fmtMin(c.response.avgMin)} cls={c.response.avgMin == null ? '' : c.response.avgMin <= 15 ? 'green' : c.response.avgMin <= 30 ? 'orange' : 'red'} />
          <Row k="Started within 15 min" v={fmtPct(c.response.within15Pct)} />
          <Row k="Paid on-duty time" v={fmtH(c.time.dutyH)} />
          <Row k="Driving" v={`${fmtH(c.time.driveH)} (${fmtPct(c.time.utilizationPct)})`} />
          <Row k="Paid but not moving" v={`${fmtH(c.time.idleH)} (${fmtPct(c.time.idlePct)})`} cls={tone(100 - (c.time.idlePct ?? 0), 60, 45)} />
          <Row k="Cost of idle time" v={driver.payType === 'hourly' ? money(c.time.idleCost) : 'Paid per km — $0'} />
          <Row k="Avg time at pickup docks" v={fmtH(c.time.avgDwellPickupH)} />
          <Row k="Avg time at delivery docks" v={fmtH(c.time.avgDwellDeliveryH)} />
        </div>
        <div>
          <div className="section-header" style={{ margin: '4px 0 6px' }}>Quality & safety</div>
          <Row k="Damage reports" v={c.quality.damage} cls={c.quality.damage ? 'red' : 'green'} />
          <Row k="HOS violations (ELD)" v={c.quality.hosViolations} cls={c.quality.hosViolations ? 'red' : 'green'} />
          <Row k="Inspection photos complete" v={fmtPct(c.quality.photoPct)} />
          <Row k="Delivery signatures" v={fmtPct(c.quality.signaturePct)} />
          <Row k="Fuel receipts attached" v={c.fuel.fillUps ? fmtPct(c.fuel.receiptPct) : '—'} />
          <Row k="Fuel economy" v={c.fuel.lPer100 ? `${num(c.fuel.lPer100, 1)} L/100 km` : '—'} cls={fleet.lPer100 && c.fuel.lPer100 ? (c.fuel.lPer100 <= fleet.lPer100 ? 'green' : 'orange') : ''} />
          <Row k="Cancelled / pulled loads" v={c.cancelled} />
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 10 }}>
        <div>
          <div className="section-header" style={{ margin: '4px 0 6px' }}>How the score is made</div>
          {c.score.parts.map((p) => (
            <div key={p.label} className="row" style={{ gap: 8, padding: '4px 0' }}>
              <span className="footnote" style={{ width: 130 }}>{p.label}</span>
              <div className="spacer" style={{ height: 6, borderRadius: 3, background: 'var(--bg-fill-2)', overflow: 'hidden' }}><div style={{ width: `${p.value}%`, height: '100%', background: p.value >= 80 ? 'var(--green)' : p.value >= 60 ? 'var(--blue)' : 'var(--orange)' }} /></div>
              <span className="footnote num secondary" style={{ width: 54, textAlign: 'right' }}>{p.value} · {p.weight}%</span>
            </div>
          ))}
        </div>
        <div>
          <div className="section-header" style={{ margin: '4px 0 6px' }}>Most-run lanes</div>
          {c.lanes.length ? c.lanes.map((l) => <Row key={l.lane} k={`${l.lane} · ${l.runs}×`} v={money(l.profit)} cls={l.profit >= 0 ? 'green' : 'red'} />) : <div className="subhead secondary">No deliveries in this period.</div>}
        </div>
      </div>
    </div>
  );
}

export function ScorecardTable({ onOpen }) {
  const { data } = useStore();
  const [days, setDays] = useState(30);
  const { cards, fleet } = useScorecards(days);
  const rows = data.users.filter((u) => u.role === 'driver').map((d) => ({ d, c: cards[d.id] })).sort((a, b) => a.c.rank - b.c.rank);
  return (
    <>
      <div className="row between" style={{ margin: '4px 0 10px' }}>
        <div className="subhead secondary">Fleet average {Math.round(fleet.score || 0)} · margin {fleet.marginPct != null ? `${num(fleet.marginPct, 1)}%` : '—'} · {fleet.lPer100 ? `${num(fleet.lPer100, 1)} L/100 km` : ''}</div>
        <Segmented value={days} onChange={setDays} options={PERIODS} />
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Driver</th><th>Score</th><th className="r">Loads</th><th className="r">On-time pickup</th><th className="r">On-time delivery</th><th className="r">Start after dispatch</th><th className="r">Paid not moving</th><th className="r">Made</th><th className="r">Cost</th><th className="r">Profit</th></tr></thead>
          <tbody>
            {rows.map(({ d, c }) => (
              <tr key={d.id} className="click" onClick={() => onOpen(d)}>
                <td className="secondary num">{c.rank}</td>
                <td><div className="row" style={{ gap: 8 }}><Avatar user={d} size="sm" /><span className="headline">{d.name}</span></div></td>
                <td><div className="row" style={{ gap: 8 }}><ScoreBadge score={c.score.total} size={30} /><span className="footnote">{c.score.grade}</span><Trend now={c.score.total} prev={c.prev} /></div></td>
                <td className="r num">{c.loads}</td>
                <td className={`r num ${tone(c.pickup.onTimePct, 95, 80)}`}>{c.pickup.n ? `${c.pickup.onTimePct}%` : '—'}{c.pickup.late ? <span className="caption secondary"> · {c.pickup.late} late</span> : ''}</td>
                <td className={`r num ${tone(c.delivery.onTimePct, 95, 80)}`}>{c.delivery.n ? `${c.delivery.onTimePct}%` : '—'}</td>
                <td className="r num">{fmtMin(c.response.avgMin)}</td>
                <td className="r num">{fmtH(c.time.idleH)}{d.payType === 'hourly' && c.time.idleCost ? <span className="caption secondary"> · {money(c.time.idleCost)}</span> : ''}</td>
                <td className="r num">{money(c.money.revenue)}</td>
                <td className="r num">{money(c.money.cost)}</td>
                <td className={`r num ${c.money.profit >= 0 ? 'green' : 'red'}`}>{money(c.money.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-footer">Late = arrived more than 15 min after the appointment window closed. Early = arrived before it opened. “Paid not moving” is on-duty time not spent driving, including dock time. Profit = what the load paid minus driver pay, fuel and truck cost.</div>
    </>
  );
}
