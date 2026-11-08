import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Stat, Sheet, Empty, Segmented, ConfirmButton } from '../../components/ui.jsx';
import FuelForm from '../../components/FuelForm.jsx';
import BarChart from '../../components/BarChart.jsx';
import { useStore, useIndex } from '../../lib/store.jsx';
import { money, money2, km, num, dateTime, date } from '../../lib/format.js';
import { del } from '../../lib/api.js';

export default function Fuel() {
  const { data } = useStore();
  const idx = useIndex();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [days, setDays] = useState(30);
  const since = Date.now() - days * 864e5;
  const logs = data.fuelLogs.filter((f) => f.t > since).sort((a, b) => b.t - a.t);
  const litres = logs.reduce((a, f) => a + f.litres, 0);
  const spend = logs.reduce((a, f) => a + f.total, 0);
  const kms = data.loads.filter((l) => l.status === 'delivered' && l.deliveredAt > since).reduce((a, l) => a + (l.economics?.totalKm || 0), 0);

  const series = useMemo(() => {
    const buckets = days <= 30 ? days : Math.ceil(days / 7);
    const size = days <= 30 ? 864e5 : 7 * 864e5;
    return Array.from({ length: buckets }, (_, i) => {
      const start = Date.now() - (buckets - i) * size;
      const v = data.fuelLogs.filter((f) => f.t > start && f.t <= start + size).reduce((a, f) => a + f.total, 0);
      return { label: new Date(start + size).getDate().toString(), full: days <= 30 ? date(start + size) : `Week of ${date(start)}`, value: Math.round(v) };
    });
  }, [data.fuelLogs, days]);

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead title="Fuel" sub="Every fill-up from the road, linked to the job it was for.">
        <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} stroke={2.4} />Add fill-up</button>
      </PageHead>
      <div className="grid grid-4">
        <Stat icon="dollar" tone="orange" k="Fuel spend" v={money(spend)} d={`${logs.length} fill-ups`} />
        <Stat icon="fuel" k="Litres" v={num(litres)} d={`${money2(litres ? spend / litres : 0)} average per L`} />
        <Stat icon="speedo" tone="indigo" k="Fleet economy" v={kms ? `${((litres / kms) * 100).toFixed(1)}` : '—'} d="L/100 km (delivered jobs)" />
        <Stat icon="route" tone="green" k="Fuel cost per km" v={kms ? money2(spend / kms) : '—'} d={`${km(kms)} driven`} />
      </div>
      <div className="card pad-lg" style={{ marginTop: 20 }}>
        <div className="headline">Fuel spend</div>
        <div className="footnote secondary" style={{ marginBottom: 10 }}>{days <= 30 ? 'Per day' : 'Per week'}, all trucks</div>
        <BarChart data={series} format={(v, axis) => (axis ? `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}` : money(v))} />
      </div>
      <div className="section-header">Fill-ups</div>
      <div className="card table-wrap">
        {logs.length === 0 ? <Empty icon="fuel" title="No fill-ups in this period" /> : (
          <table className="table">
            <thead><tr><th>When</th><th>Truck</th><th>Driver</th><th>Station</th><th className="r">Litres</th><th className="r">$/L</th><th className="r">Total</th><th className="r">Odometer</th><th>Job</th><th>Receipt</th><th /></tr></thead>
            <tbody>
              {logs.map((f) => (
                <tr key={f.id}>
                  <td>{dateTime(f.t)}</td>
                  <td>Unit {idx.trucks[f.truckId]?.unit}</td>
                  <td>{idx.users[f.driverId]?.name || f.by}</td>
                  <td>{f.station}</td>
                  <td className="r">{num(f.litres, 1)}</td>
                  <td className="r">{f.pricePerL.toFixed(3)}</td>
                  <td className="r">{money2(f.total)}</td>
                  <td className="r">{km(f.odometerKm)}</td>
                  <td className="mono">{idx.loads[f.loadId]?.ref || '—'}</td>
                  <td>{f.receiptUrl ? <button className="pill green" style={{ cursor: 'pointer' }} onClick={() => setViewing(f)}><Icon name="receipt" size={12} />View</button> : <span className="pill orange">Missing</span>}</td>
                  <td><ConfirmButton className="btn small danger" confirmLabel="Delete?" aria-label="Delete fill-up" onConfirm={() => del(`/fuel/${f.id}`)}><Icon name="trash" size={14} /></ConfirmButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {viewing && (
        <Sheet title={`Receipt · ${viewing.station}`} onClose={() => setViewing(null)}>
          <div className="footnote secondary" style={{ marginBottom: 10 }}>{dateTime(viewing.t)} · Unit {idx.trucks[viewing.truckId]?.unit} · {idx.users[viewing.driverId]?.name || viewing.by} · {num(viewing.litres, 1)} L · {money2(viewing.total)}</div>
          <img src={viewing.receiptUrl} alt="Fuel receipt" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
        </Sheet>
      )}
      {adding && <Sheet title="Add fill-up" onClose={() => setAdding(false)}><FuelForm onDone={() => setAdding(false)} /></Sheet>}
    </div>
  );
}
