import { useMemo, useState } from 'react';
import { PageHead, Stat, Segmented, Avatar } from '../../components/ui.jsx';
import BarChart from '../../components/BarChart.jsx';
import { useStore, useIndex } from '../../lib/store.jsx';
import { money, money2, km, num, date, placeShort } from '../../lib/format.js';
import { truckEconomy } from './Drivers.jsx';

export default function Reports() {
  const { data } = useStore();
  const idx = useIndex();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState('margin');
  const since = Date.now() - days * 864e5;
  const jobs = data.loads.filter((l) => l.carrierId === data.me.companyId && l.status === 'delivered' && l.deliveredAt > since && l.economics);

  const sum = (f) => jobs.reduce((a, l) => a + f(l), 0);
  const revenue = sum((l) => l.economics.revenue);
  const cost = sum((l) => l.economics.cost);
  const totalKm = sum((l) => l.economics.totalKm);
  const deadhead = sum((l) => l.metrics.deadheadKm);
  const fuel = sum((l) => l.economics.fuelCost);
  const pay = sum((l) => l.economics.driverPay);
  const damage = jobs.filter((l) => l.damage?.hasDamage).length;

  const series = useMemo(() => {
    const n = days <= 7 ? 7 : days <= 30 ? 10 : 13;
    const size = (days * 864e5) / n;
    return Array.from({ length: n }, (_, i) => {
      const start = since + i * size;
      const inB = jobs.filter((l) => l.deliveredAt > start && l.deliveredAt <= start + size);
      const v = inB.reduce((a, l) => a + (metric === 'margin' ? l.economics.margin : metric === 'revenue' ? l.economics.revenue : l.economics.totalKm), 0);
      return { label: date(start + size).replace(/^\w+ /, ''), full: `${date(start)} – ${date(start + size)} · ${inB.length} jobs`, value: Math.max(0, Math.round(v)) };
    });
  }, [jobs, days, metric, since]);

  const byDriver = Object.values(jobs.reduce((acc, l) => {
    const a = acc[l.driverId] ||= { id: l.driverId, jobs: 0, km: 0, rev: 0, margin: 0, pay: 0, hours: 0 };
    a.jobs++; a.km += l.economics.totalKm; a.rev += l.economics.revenue; a.margin += l.economics.margin; a.pay += l.economics.driverPay; a.hours += l.economics.hours;
    return acc;
  }, {})).sort((a, b) => b.margin - a.margin);

  const byLane = Object.values(jobs.reduce((acc, l) => {
    const k = `${l.pickup.city}→${l.dropoff.city}`;
    const a = acc[k] ||= { k, from: l.pickup, to: l.dropoff, jobs: 0, rev: 0, margin: 0, km: 0 };
    a.jobs++; a.rev += l.economics.revenue; a.margin += l.economics.margin; a.km += l.metrics.loadedKm;
    return acc;
  }, {})).sort((a, b) => b.margin / b.km - a.margin / a.km);

  const fmt = metric === 'km' ? (v, axis) => (axis ? `${Math.round(v / 100) / 10}k` : km(v)) : (v, axis) => (axis ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : money(v));

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead title="Reports" sub={`${jobs.length} delivered jobs`}>
        <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      </PageHead>
      <div className="grid grid-4">
        <Stat icon="dollar" tone="green" k="Revenue" v={money(revenue)} d={`${money2(totalKm ? revenue / totalKm : 0)} per km`} />
        <Stat icon="chart" k="Profit" v={money(revenue - cost)} d={`${revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0}% margin`} />
        <Stat icon="fuel" tone="orange" k="Operating cost" v={money(cost)} d={`Fuel ${money(fuel)} · Pay ${money(pay)} · Truck ${money(cost - fuel - pay)}`} />
        <Stat icon="route" tone="indigo" k="Kilometres" v={num(totalKm)} d={`${totalKm ? Math.round((deadhead / totalKm) * 100) : 0}% empty · ${damage} damage claim${damage === 1 ? '' : 's'}`} />
      </div>

      <div className="card pad-lg" style={{ marginTop: 20 }}>
        <div className="row between wrap">
          <div><div className="headline">{metric === 'margin' ? 'Profit' : metric === 'revenue' ? 'Revenue' : 'Kilometres'} over time</div><div className="footnote secondary">Delivered jobs, by delivery date</div></div>
          <Segmented value={metric} onChange={setMetric} options={[{ value: 'margin', label: 'Profit' }, { value: 'revenue', label: 'Revenue' }, { value: 'km', label: 'km' }]} />
        </div>
        <div style={{ marginTop: 12 }}><BarChart data={series} format={fmt} height={200} /></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 4 }}>
        <div>
          <div className="section-header">Drivers</div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Driver</th><th className="r">Jobs</th><th className="r">km</th><th className="r">Pay</th><th className="r">Profit</th></tr></thead>
              <tbody>
                {byDriver.map((d) => (
                  <tr key={d.id}>
                    <td><div className="row"><Avatar user={idx.users[d.id]} size="sm" />{idx.users[d.id]?.name}</div></td>
                    <td className="r">{d.jobs}</td><td className="r">{num(d.km)}</td><td className="r">{money(d.pay)}</td>
                    <td className={`r ${d.margin >= 0 ? 'green' : 'red'}`}>{money(d.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-header">Best lanes (profit per km)</div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Lane</th><th className="r">Jobs</th><th className="r">Revenue</th><th className="r">Profit/km</th></tr></thead>
              <tbody>
                {byLane.slice(0, 8).map((l) => (
                  <tr key={l.k}><td>{placeShort(l.from)} → {placeShort(l.to)}</td><td className="r">{l.jobs}</td><td className="r">{money(l.rev)}</td><td className="r">{money2(l.margin / l.km)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="section-header">Trucks (last 30 days)</div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Unit</th><th>Vehicle</th><th className="r">km</th><th className="r">Litres</th><th className="r">L/100 km</th><th className="r">Fuel spend</th><th className="r">Fuel $/km</th></tr></thead>
          <tbody>
            {data.trucks.map((t) => {
              const e = truckEconomy(t, data);
              return (
                <tr key={t.id}>
                  <td className="headline">Unit {t.unit}</td><td>{t.year} {t.make} {t.model}</td>
                  <td className="r">{num(e.kms)}</td><td className="r">{num(e.litres)}</td>
                  <td className={`r ${e.lPer100 > 38 ? 'orange' : ''}`}>{e.lPer100 ? e.lPer100.toFixed(1) : '—'}</td>
                  <td className="r">{money(e.spend)}</td><td className="r">{e.costPerKm ? money2(e.costPerKm) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
