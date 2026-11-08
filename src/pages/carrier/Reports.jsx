// Owner reports: money, payroll, drivers, trucks, operations, fuel, customers & lanes.
// Every section prints as its own page so the team can sit down with a paper copy.
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Avatar, Segmented, Sheet, ActionButton } from '../../components/ui.jsx';
import { Tabs } from '../../components/LoadList.jsx';
import BarChart from '../../components/BarChart.jsx';
import { ScoreBadge } from '../../components/MatchList.jsx';
import { useStore } from '../../lib/store.jsx';
import { money, money2, num, date, dateTime } from '../../lib/format.js';
import { go } from '../../lib/router.js';
import { buildReport, periodRange, change, downloadCsv } from '../../lib/reports.js';

const SECTIONS = [
  ['summary', 'Summary'], ['money', 'Money'], ['payroll', 'Payroll'], ['drivers', 'Drivers'],
  ['trucks', 'Trucks'], ['ops', 'Operations'], ['fuel', 'Fuel'], ['customers', 'Customers & lanes'],
];
const PERIODS = [
  ['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_month', 'Last month'],
  ['last_30', 'Last 30 days'], ['last_90', 'Last 90 days'], ['this_quarter', 'This quarter'], ['ytd', 'Year to date'], ['custom', 'Custom…'],
];
const pctf = (x, d = 0) => (x == null ? '—' : `${(Math.round(x * 10 ** d) / 10 ** d).toLocaleString('en-CA')}%`);
const h1 = (x) => (x == null ? '—' : `${num(x, 1)} h`);
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

/* ------------------------------ small pieces ------------------------------ */

function Delta({ now, prev, invert, unit = '%' }) {
  if (prev == null || now == null) return null;
  const c = unit === 'pts' ? now - prev : change(now, prev);
  if (c == null || !Number.isFinite(c)) return null;
  if (Math.abs(c) < 0.5) return <span className="delta flat">±0{unit === 'pts' ? ' pts' : '%'}</span>;
  const good = invert ? c < 0 : c > 0;
  return <span className={`delta ${good ? 'up' : 'down'}`}>{c > 0 ? '▲' : '▼'} {Math.abs(Math.round(c * 10) / 10)}{unit === 'pts' ? ' pts' : '%'}</span>;
}

function Kpi({ k, v, d, now, prev, invert, unit }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v num">{v}</div>
      <div className="d">{d}{' '}<Delta now={now} prev={prev} invert={invert} unit={unit} /></div>
    </div>
  );
}

function Section({ title, sub, children, right }) {
  return (
    <section className="rep-section">
      <div className="rep-head"><div><h2>{title}</h2>{sub && <div className="footnote secondary">{sub}</div>}</div>{right && <div className="no-print">{right}</div>}</div>
      {children}
    </section>
  );
}

function T({ head, rows, foot, align }) {
  return (
    <div className="card table-wrap rep-table">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={i} className={align?.[i] === 'r' ? 'r' : ''}>{h}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={align?.[j] === 'r' ? 'r num' : ''}>{c}</td>)}</tr>) : <tr><td colSpan={head.length} className="secondary">Nothing in this period.</td></tr>}</tbody>
        {foot && <tfoot><tr>{foot.map((c, j) => <td key={j} className={align?.[j] === 'r' ? 'r num' : ''}><b>{c}</b></td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

function Trend({ r, metric }) {
  const fmt = metric === 'km' ? (v, axis) => (axis ? `${Math.round(v / 100) / 10}k` : `${num(v)} km`) : metric === 'loads' ? (v) => num(v) : (v, axis) => (axis ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : money(v));
  return <BarChart data={r.trend.map((b) => ({ label: b.label, full: `${b.label} · ${b.loads} loads`, value: Math.max(0, Math.round(b[metric])) }))} format={fmt} height={190} />;
}

/* ------------------------------ sections ------------------------------ */

function Summary({ r, notes, setNotes }) {
  const { m, p } = r;
  return (
    <Section title="Summary" sub="Headline numbers compared with the previous period of the same length.">
      <div className="kpis">
        <Kpi k="Revenue" v={money(m.revenue)} d={`${m.loads} loads`} now={m.revenue} prev={p.revenue} />
        <Kpi k="Profit" v={money(m.profit)} d={`${pctf(m.margin, 1)} margin`} now={m.profit} prev={p.profit} />
        <Kpi k="Operating cost" v={money(m.cost)} d={`${m.costPerKm ? money2(m.costPerKm) : '—'}/km`} now={m.cost} prev={p.cost} invert />
        <Kpi k="Payroll (gross)" v={money(r.pay.reduce((a, x) => a + x.gross, 0))} d={`${r.pay.filter((x) => x.loads || x.hours).length} drivers paid`} />
        <Kpi k="Kilometres" v={num(m.km)} d={`${pctf(m.emptyPct, 1)} empty`} now={m.km} prev={p.km} />
        <Kpi k="Revenue per km" v={m.revPerKm ? money2(m.revPerKm) : '—'} d="all km driven" now={m.revPerKm} prev={p.revPerKm} />
        <Kpi k="Profit per load" v={m.profitPerLoad != null ? money(m.profitPerLoad) : '—'} d="average" now={m.profitPerLoad} prev={p.profitPerLoad} />
        <Kpi k="On-time pickups" v={pctf(m.onTimePickup)} d={`deliveries ${pctf(m.onTimeDelivery)}`} now={m.onTimePickup} prev={p.onTimePickup} unit="pts" />
        <Kpi k="Fuel economy" v={m.lPer100 ? `${num(m.lPer100, 1)} L/100` : '—'} d={money(m.fuel) + ' fuel'} now={m.lPer100} prev={p.lPer100} invert />
        <Kpi k="Unpaid invoices" v={money(r.ar.open)} d={`${r.ar.openCount} open`} />
        <Kpi k="Damage claims" v={m.damage} d={m.loads ? `${pctf((m.damage / m.loads) * 100)} of loads` : '—'} now={m.damage} prev={p.damage} invert />
        <Kpi k="Detention billed" v={money(m.detention)} d={`${r.ops.detentionLoads} loads`} now={m.detention} prev={p.detention} />
      </div>
      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card pad-lg talk good">
          <div className="headline row" style={{ gap: 6 }}><Icon name="star" size={16} />Where we’re doing really well</div>
          <ul>{r.insights.good.length ? r.insights.good.map((x) => <li key={x}>{x}</li>) : <li className="secondary">Not enough data yet.</li>}</ul>
        </div>
        <div className="card pad-lg talk work">
          <div className="headline row" style={{ gap: 6 }}><Icon name="flag" size={16} />Where we can improve</div>
          <ul>{r.insights.work.length ? r.insights.work.map((x) => <li key={x}>{x}</li>) : <li className="secondary">Nothing flagged.</li>}</ul>
        </div>
      </div>
      <div className="card pad-lg" style={{ marginTop: 14 }}>
        <div className="headline">Profit over the period</div>
        <Trend r={r} metric="profit" />
      </div>
      <div className="card pad-lg notes-card" style={{ marginTop: 14 }}>
        <div className="headline">Meeting notes & action items</div>
        <textarea className="input no-print" rows={5} placeholder="Write what the team agreed — printed with the report." value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="print-only notes-print">{notes || '\n\n\n\n'}</div>
      </div>
    </Section>
  );
}

function MoneySection({ r }) {
  const { m, p } = r;
  const [metric, setMetric] = useState('revenue');
  const line = (label, now, prev, per) => [label, money(now), m.revenue ? pctf((now / m.revenue) * 100, 1) : '—', m.km ? money2(now / m.km) : '—', prev != null ? money(prev) : '—', <Delta key="d" now={now} prev={prev} invert={per === 'cost'} />];
  return (
    <Section title="Money" sub="Profit & loss on delivered loads, receivables, and where the money comes from.">
      <T head={['', 'This period', '% of revenue', 'Per km', 'Previous', 'Change']} align={[0, 'r', 'r', 'r', 'r', 'r']}
        rows={[
          line('Revenue (payout to us)', m.revenue, p.revenue),
          ['  incl. detention billed', money(m.detention), m.revenue ? pctf((m.detention / m.revenue) * 100, 1) : '—', '—', money(p.detention), <Delta key="d" now={m.detention} prev={p.detention} />],
          line('Driver pay', m.pay, p.pay, 'cost'),
          line('Fuel', m.fuel, p.fuel, 'cost'),
          line('Truck, insurance & upkeep', m.truck, p.truck, 'cost'),
          line('Total cost', m.cost, p.cost, 'cost'),
        ]}
        foot={['Profit', money(m.profit), pctf(m.margin, 1), m.km ? money2(m.profit / m.km) : '—', money(p.profit), <Delta key="d" now={m.profit} prev={p.profit} />]} />
      <div className="card pad-lg" style={{ marginTop: 14 }}>
        <div className="row between wrap"><div className="headline">Trend</div><div className="no-print"><Segmented value={metric} onChange={setMetric} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'profit', label: 'Profit' }, { value: 'cost', label: 'Cost' }, { value: 'loads', label: 'Loads' }]} /></div></div>
        <Trend r={r} metric={metric} />
        <T head={['Period', 'Loads', 'Revenue', 'Cost', 'Profit', 'km']} align={[0, 'r', 'r', 'r', 'r', 'r']}
          rows={r.trend.map((b) => [b.label, b.loads, money(b.revenue), money(b.cost), <span key="p" className={b.profit >= 0 ? 'green' : 'red'}>{money(b.profit)}</span>, num(b.km)])} />
      </div>
      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div>
          <h3 className="rep-sub">Receivables</h3>
          <T head={['', 'Amount']} align={[0, 'r']} rows={[
            ['Billed this period', money(r.ar.billed)], ['Paid (of this period)', money(r.ar.paid)], ['Unpaid — all time', money(r.ar.open)],
            ...r.ar.aging.map((a) => [`  ${a.label} old (${a.count})`, money(a.amount)]),
          ]} />
        </div>
        <div>
          <h3 className="rep-sub">Unpaid invoices</h3>
          <T head={['Invoice', 'Customer', 'Issued', 'Days open', 'Amount']} align={[0, 0, 0, 'r', 'r']}
            rows={r.ar.openList.slice(0, 12).map((l) => [l.invoice.number, l.customerName, date(l.invoice.issuedAt), l.daysOpen, money2(l.invoice.total)])} />
        </div>
      </div>
    </Section>
  );
}

function PayrollSection({ r }) {
  const rows = r.pay.filter((x) => x.loads || x.hours);
  const total = rows.reduce((a, x) => a + x.gross, 0);
  const weeks = [...new Set(rows.flatMap((x) => x.weeks.map((w) => w.week)))].sort();
  const exportCsv = () => downloadCsv(`payroll-${ymd(r.from)}-to-${ymd(r.to - 1)}.csv`, [
    ['Driver', 'Pay type', 'Rate', 'Loads', 'km', 'Paid hours', 'Regular h', 'Overtime h', 'Driving h', 'Not driving h', 'Gross pay'],
    ...rows.map((x) => [x.driver.name, x.hourly ? 'Hourly' : 'Per km', x.rate, x.loads, Math.round(x.km), x.hours.toFixed(2), x.regular.toFixed(2), x.overtime.toFixed(2), x.driveH.toFixed(2), x.idleH.toFixed(2), x.gross.toFixed(2)]),
  ]);
  return (
    <Section title="Payroll" sub="Gross pay before deductions. Hourly = paid on-duty hours (overtime ×1.5 after 60 h in a Mon–Sun week, federal highway rule). Per-km = km driven incl. empty km."
      right={<button className="btn small" onClick={exportCsv}><Icon name="doc" size={14} />Export CSV</button>}>
      <T head={['Driver', 'Pay', 'Loads', 'km', 'Paid hours', 'Overtime', 'Driving', 'Not driving', 'Pay / load', '% of revenue', 'Gross pay']}
        align={[0, 0, 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
        rows={rows.map((x) => [
          <span key="n" className="row" style={{ gap: 6 }}><Avatar user={x.driver} size="sm" />{x.driver.name}</span>,
          x.hourly ? `${money2(x.rate)}/h` : `${money2(x.rate)}/km`, x.loads, num(x.km), h1(x.hours), x.overtime ? h1(x.overtime) : '—', h1(x.driveH), h1(x.idleH),
          x.perLoad != null ? money(x.perLoad) : '—', pctf(x.pctOfRevenue), <b key="g">{money2(x.gross)}</b>,
        ])}
        foot={['Total', '', rows.reduce((a, x) => a + x.loads, 0), num(rows.reduce((a, x) => a + x.km, 0)), h1(rows.reduce((a, x) => a + x.hours, 0)), h1(rows.reduce((a, x) => a + x.overtime, 0)), h1(rows.reduce((a, x) => a + x.driveH, 0)), h1(rows.reduce((a, x) => a + x.idleH, 0)), '', pctf(r.m.revenue ? (total / r.m.revenue) * 100 : null), money2(total)]} />
      {weeks.length > 0 && (
        <>
          <h3 className="rep-sub">Pay register by week</h3>
          <T head={['Driver', ...weeks.map((w) => `Wk of ${date(w)}`), 'Total']} align={[0, ...weeks.map(() => 'r'), 'r']}
            rows={rows.map((x) => [x.driver.name, ...weeks.map((w) => { const row = x.weeks.find((y) => y.week === w); return row ? <span key={w}>{money(row.gross)}<span className="caption secondary"> · {x.hourly ? h1(row.hours) : `${num(row.km)} km`}</span></span> : '—'; }), money2(x.gross)])}
            foot={['Total', ...weeks.map((w) => money(rows.reduce((a, x) => a + (x.weeks.find((y) => y.week === w)?.gross || 0), 0))), money2(total)]} />
        </>
      )}
    </Section>
  );
}

function DriversSection({ r }) {
  const list = r.drivers.map((d) => ({ d, c: r.cards[d.id] })).sort((a, b) => a.c.rank - b.c.rank);
  const signed = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x))}%`);
  return (
    <Section title="Drivers" sub={`Scorecards for the period. Fleet average score ${Math.round(r.fleet.score || 0)}.`}
      right={<button className="btn small" onClick={() => go('/drivers')}>Open scorecards</button>}>
      <T head={['#', 'Driver', 'Score', 'Loads', 'On-time pickup', 'On-time delivery', 'Start after dispatch', 'Drive vs plan', 'Route changes', 'Damage', 'HOS', 'Made', 'Profit']}
        align={[0, 0, 0, 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
        rows={list.map(({ d, c }) => [c.rank, d.name, <span key="s" className="row" style={{ gap: 6 }}><ScoreBadge score={c.score.total} size={26} />{c.score.grade}</span>, c.loads,
          c.pickup.n ? pctf(c.pickup.onTimePct) : '—', c.delivery.n ? pctf(c.delivery.onTimePct) : '—', c.response.avgMin != null ? `${Math.round(c.response.avgMin)} min` : '—',
          signed(c.time.driveVsPlanPct), c.time.routeChanges, c.quality.damage, c.quality.hosViolations, money(c.money.revenue), <span key="p" className={c.money.profit >= 0 ? 'green' : 'red'}>{money(c.money.profit)}</span>])} />
      <h3 className="rep-sub">Talking points per driver</h3>
      <div className="grid grid-2 rep-cards">
        {list.filter(({ c }) => c.loads).map(({ d, c }) => (
          <div key={d.id} className="card pad">
            <div className="row" style={{ gap: 8 }}><Avatar user={d} size="sm" /><b>{d.name}</b><span className="spacer" /><span className="footnote secondary">Score {c.score.total} · #{c.rank}</span></div>
            <div className="footnote" style={{ marginTop: 6 }}>
              {c.pickup.late ? `Late to ${c.pickup.late}/${c.pickup.n} pickups. ` : c.pickup.n ? 'All pickups on time. ' : ''}
              {c.time.idlePct != null ? `${c.time.idlePct}% of paid time not driving. ` : ''}
              {c.fuel.lPer100 ? `${num(c.fuel.lPer100, 1)} L/100 km. ` : ''}
              {c.quality.damage ? `${c.quality.damage} damage report(s). ` : ''}
              {`Profit ${money(c.money.profit)} on ${c.loads} loads.`}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TrucksSection({ r }) {
  return (
    <Section title="Trucks" sub="What each unit earned and cost. Utilization = days with a load ÷ days in the period.">
      <T head={['Unit', 'Vehicle', 'Loads', 'km', 'Revenue', 'Rev / km', 'Profit', 'Utilization', 'Fuel', 'L/100 km', 'Service due']}
        align={[0, 0, 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
        rows={r.trucks.map((t) => [<b key="u">Unit {t.truck.unit}</b>, `${t.truck.year} ${t.truck.make} ${t.truck.model}`, t.loads, num(t.km), money(t.revenue), t.revPerKm ? money2(t.revPerKm) : '—',
          <span key="p" className={t.profit >= 0 ? 'green' : 'red'}>{money(t.profit)}</span>, pctf(t.utilization), money(t.fuelSpend), t.lPer100 ? num(t.lPer100, 1) : '—',
          <span key="s" className={t.serviceInKm <= 0 ? 'red' : t.serviceInKm < 2000 ? 'orange' : ''}>{t.serviceInKm <= 0 ? `Overdue ${num(-t.serviceInKm)} km` : `in ${num(t.serviceInKm)} km`}</span>])}
        foot={['Fleet', `${r.trucks.length} trucks`, r.trucks.reduce((a, t) => a + t.loads, 0), num(r.trucks.reduce((a, t) => a + t.km, 0)), money(r.trucks.reduce((a, t) => a + t.revenue, 0)), r.m.revPerKm ? money2(r.m.revPerKm) : '—', money(r.trucks.reduce((a, t) => a + t.profit, 0)), pctf(r.trucks.length ? r.trucks.reduce((a, t) => a + (t.utilization || 0), 0) / r.trucks.length : null), money(r.trucks.reduce((a, t) => a + t.fuelSpend, 0)), r.m.lPer100 ? num(r.m.lPer100, 1) : '—', '']} />
    </Section>
  );
}

function OpsSection({ r }) {
  const o = r.ops;
  return (
    <Section title="Operations" sub="Punctuality, dock time, trip time vs projection, route changes, claims.">
      <div className="kpis">
        <Kpi k="On-time pickups" v={pctf(r.m.onTimePickup)} d="within window + 15 min" now={r.m.onTimePickup} prev={r.p.onTimePickup} unit="pts" />
        <Kpi k="On-time deliveries" v={pctf(r.m.onTimeDelivery)} d="vs appointment" now={r.m.onTimeDelivery} prev={r.p.onTimeDelivery} unit="pts" />
        <Kpi k="Avg time at pickup" v={h1(o.dwellPickup)} d="loading" />
        <Kpi k="Avg time at delivery" v={h1(o.dwellDelivery)} d="unloading" />
        <Kpi k="Drive vs projected" v={o.driveVsPlan == null ? '—' : `${o.driveVsPlan >= 0 ? '+' : '−'}${Math.abs(Math.round(o.driveVsPlan))}%`} d={`${o.wayOff.length} trips way off`} />
        <Kpi k="Start after dispatch" v={o.response != null ? `${Math.round(o.response)} min` : '—'} d="fleet average" />
        <Kpi k="Empty km" v={pctf(r.m.emptyPct, 1)} d={`${num(r.m.empty)} km`} now={r.m.emptyPct} prev={r.p.emptyPct} invert unit="pts" />
        <Kpi k="Route changes" v={o.routeEvents.length} d={`${o.hosViolations} HOS violations`} />
      </div>
      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div>
          <h3 className="rep-sub">Late stops</h3>
          <T head={['Load', 'Stop', 'Driver', 'Late by']} align={[0, 0, 0, 'r']}
            rows={o.lateStops.slice(0, 12).map(({ l, s, p }) => [l.ref, `${s === 'pickup' ? 'Pickup' : 'Delivery'} · ${(s === 'pickup' ? l.pickup : l.dropoff).city}`, r.drivers.find((d) => d.id === l.driverId)?.name || '—', `${p.min} min`])} />
        </div>
        <div>
          <h3 className="rep-sub">Trips way over projected time</h3>
          <T head={['Load', 'Driver', 'Projected', 'Actual']} align={[0, 0, 'r', 'r']}
            rows={o.wayOff.map(({ l, r: x }) => [l.ref, r.drivers.find((d) => d.id === l.driverId)?.name || '—', h1(x.projH), h1(x.actH)])} />
        </div>
        <div>
          <h3 className="rep-sub">Route changes</h3>
          <T head={['When', 'Load', 'Driver', 'Off by']} align={[0, 0, 0, 'r']}
            rows={o.routeEvents.map((e) => [dateTime(e.t), e.load.ref, r.drivers.find((d) => d.id === e.load.driverId)?.name || '—', `${e.km} km`])} />
        </div>
        <div>
          <h3 className="rep-sub">Damage claims & cancellations</h3>
          <T head={['Load', 'What happened']} rows={[
            ...o.damage.map((l) => [l.ref, `Damage: ${l.damage.notes || 'reported'}`]),
            ...o.cancelled.map((l) => [l.ref, 'Cancelled']),
          ]} />
        </div>
      </div>
    </Section>
  );
}

function FuelSection({ r }) {
  const f = r.fuel;
  return (
    <Section title="Fuel" sub="Every fill-up logged by drivers (with receipt photos) or by the office.">
      <div className="kpis">
        <Kpi k="Fuel spend" v={money(f.spend)} d={`${f.fillUps} fill-ups`} />
        <Kpi k="Litres" v={num(f.litres)} d={f.avgPrice ? `${money2(f.avgPrice)}/L average` : '—'} />
        <Kpi k="Fleet economy" v={r.m.lPer100 ? `${num(r.m.lPer100, 1)} L/100` : '—'} d="delivered loads" now={r.m.lPer100} prev={r.p.lPer100} invert />
        <Kpi k="Receipts attached" v={pctf(f.receiptPct)} d={`${f.missingReceipts.length} missing · ${f.unlinked} not on a load`} />
      </div>
      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div>
          <h3 className="rep-sub">By truck</h3>
          <T head={['Unit', 'km', 'Litres', 'L/100 km', 'Spend']} align={[0, 'r', 'r', 'r', 'r']}
            rows={r.trucks.map((t) => [`Unit ${t.truck.unit}`, num(t.km), num(t.litres), t.lPer100 ? num(t.lPer100, 1) : '—', money(t.fuelSpend)])} />
        </div>
        <div>
          <h3 className="rep-sub">By station</h3>
          <T head={['Station', 'Fill-ups', 'Litres', '$/L', 'Spend']} align={[0, 'r', 'r', 'r', 'r']}
            rows={f.byStation.map((s) => [s.station, s.fillUps, num(s.litres), s.price ? money2(s.price) : '—', money(s.spend)])} />
        </div>
      </div>
    </Section>
  );
}

function CustomersSection({ r }) {
  return (
    <Section title="Customers & lanes" sub="Who pays the most, which lanes make money, and where service slips.">
      <h3 className="rep-sub">Customers</h3>
      <T head={['Customer', 'Loads', 'Revenue', 'Rate / km', 'Profit', 'Margin', 'On-time']} align={[0, 'r', 'r', 'r', 'r', 'r', 'r']}
        rows={r.customers.map((c) => [c.key, c.loads, money(c.revenue), c.perKm ? money2(c.perKm) : '—', <span key="p" className={c.profit >= 0 ? 'green' : 'red'}>{money(c.profit)}</span>, pctf(c.margin, 1), pctf(c.onTime)])} />
      <h3 className="rep-sub">Lanes (best to worst profit)</h3>
      <T head={['Lane', 'Loads', 'Revenue', 'Rate / km', 'Profit', 'Profit / km', 'On-time']} align={[0, 'r', 'r', 'r', 'r', 'r', 'r']}
        rows={r.lanes.map((c) => [c.key, c.loads, money(c.revenue), c.perKm ? money2(c.perKm) : '—', <span key="p" className={c.profit >= 0 ? 'green' : 'red'}>{money(c.profit)}</span>, c.profitPerKm != null ? money2(c.profitPerKm) : '—', pctf(c.onTime)])} />
    </Section>
  );
}

const RENDER = { summary: Summary, money: MoneySection, payroll: PayrollSection, drivers: DriversSection, trucks: TrucksSection, ops: OpsSection, fuel: FuelSection, customers: CustomersSection };

/* ------------------------------ page ------------------------------ */

export default function Reports() {
  const { data } = useStore();
  const [period, setPeriod] = useState('last_30');
  const [custom, setCustom] = useState({ from: ymd(Date.now() - 14 * 864e5), to: ymd(Date.now()) });
  const [tab, setTab] = useState('summary');
  const [printOpen, setPrintOpen] = useState(false);
  const [printSet, setPrintSet] = useState(null);
  const range = periodRange(period, { from: new Date(`${custom.from}T00:00`).getTime(), to: new Date(`${custom.to}T00:00`).getTime() });
  const r = useMemo(() => buildReport(data, range.from, range.to), [data, range.from, range.to]);
  const noteKey = `rugo.reportNotes.${ymd(range.from)}.${ymd(range.to)}`;
  const [notes, setNotesState] = useState('');
  useEffect(() => { try { setNotesState(localStorage.getItem(noteKey) || ''); } catch { setNotesState(''); } }, [noteKey]);
  const setNotes = (v) => { setNotesState(v); try { localStorage.setItem(noteKey, v); } catch { /* ignore */ } };

  useEffect(() => {
    if (!printSet) return undefined;
    const done = () => setPrintSet(null);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printSet]);

  const exportLoads = () => downloadCsv(`loads-${ymd(range.from)}-to-${ymd(range.to - 1)}.csv`, [
    ['Ref', 'Delivered', 'Customer', 'From', 'To', 'Driver', 'Truck', 'Loaded km', 'Empty km', 'Revenue', 'Driver pay', 'Fuel', 'Truck cost', 'Profit', 'Margin %'],
    ...r.jobs.map((l) => [l.ref, new Date(l.deliveredAt).toISOString(), l.customer || data.companies.find((c) => c.id === l.shipperId)?.name, l.pickup.city, l.dropoff.city, data.users.find((u) => u.id === l.driverId)?.name, data.trucks.find((t) => t.id === l.truckId)?.unit, l.metrics.loadedKm, l.metrics.deadheadKm, l.economics.revenue, l.economics.driverPay, l.economics.fuelCost, l.economics.overhead, l.economics.margin, l.economics.marginPct]),
  ]);

  const Current = RENDER[tab];
  const company = data.me.company?.name || 'Company';
  const periodText = `${new Date(range.from).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(range.to - 1).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="page wide reports" style={{ maxWidth: 1320 }}>
      <div className="screen-only">
        <div className="rep-toolbar">
          <div>
            <div className="title2">Reports</div>
            <div className="subhead secondary">{range.label} · {periodText} · {r.m.loads} delivered loads</div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="select" style={{ width: 'auto', height: 36 }} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {period === 'custom' && (
              <>
                <input className="input" type="date" style={{ width: 'auto', height: 36 }} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
                <input className="input" type="date" style={{ width: 'auto', height: 36 }} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
              </>
            )}
            <button className="btn" onClick={exportLoads}><Icon name="doc" size={15} />Loads CSV</button>
            <button className="btn primary" onClick={() => setPrintOpen(true)}><Icon name="print" size={15} />Print report</button>
          </div>
        </div>
        <Tabs value={tab} onChange={setTab} options={SECTIONS.map(([value, label]) => ({ value, label }))} />
        <div style={{ marginTop: 16 }}><Current r={r} notes={notes} setNotes={setNotes} /></div>
      </div>

      {/* Print version: chosen sections, one per page, with a cover header. */}
      {printSet && (
        <div className="print-only print-report">
          <div className="print-cover">
            <div className="print-brand">{company}</div>
            <h1>Business review — {range.label}</h1>
            <div>{periodText} · compared with the previous {r.days} days</div>
            <div className="footnote">Prepared by {data.me.name} · {dateTime(Date.now())} · Rugo</div>
          </div>
          {SECTIONS.filter(([k]) => printSet.has(k)).map(([k]) => { const C = RENDER[k]; return <div key={k} className="print-page"><C r={r} notes={notes} setNotes={setNotes} /></div>; })}
        </div>
      )}

      {printOpen && (
        <PrintSheet onClose={() => setPrintOpen(false)} onPrint={(set) => { setPrintOpen(false); setPrintSet(set); }} />
      )}
    </div>
  );
}

function PrintSheet({ onClose, onPrint }) {
  const [pick, setPick] = useState(() => new Set(SECTIONS.map(([k]) => k)));
  return (
    <Sheet title="Print report" onClose={onClose}>
      <div className="stack">
        <div className="footnote secondary">Each section prints on its own page. Use “Save as PDF” in the print window to email it.</div>
        <div className="list">
          {SECTIONS.map(([k, label]) => (
            <label key={k} className="list-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={pick.has(k)} onChange={(e) => setPick((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
              <span className="label">{label}</span>
            </label>
          ))}
        </div>
        <ActionButton className="btn primary" disabled={!pick.size} onClick={() => onPrint(pick)}><Icon name="print" size={16} />Print {pick.size === SECTIONS.length ? 'full report' : `${pick.size} section${pick.size > 1 ? 's' : ''}`}</ActionButton>
      </div>
    </Sheet>
  );
}
