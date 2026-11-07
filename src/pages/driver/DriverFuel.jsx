import { PageHead } from '../../components/ui.jsx';
import FuelForm from '../../components/FuelForm.jsx';
import { useStore } from '../../lib/store.jsx';
import { money2, num, dateTime } from '../../lib/format.js';

export default function DriverFuel() {
  const { data } = useStore();
  const mine = data.fuelLogs.filter((f) => f.driverId === data.me.id).sort((a, b) => b.t - a.t).slice(0, 10);
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageHead title="Log fuel" sub="Fill in the two big boxes and tap Save." />
      <div className="card pad-lg"><FuelForm /></div>
      <div className="section-header">My recent fill-ups</div>
      <div className="list">
        {mine.length === 0 && <div className="list-row secondary">No fill-ups yet.</div>}
        {mine.map((f) => (
          <div key={f.id} className="list-row">
            <div className="label"><div className="headline">{num(f.litres, 1)} L · {f.station}</div><div className="footnote secondary">{dateTime(f.t)} · {f.pricePerL.toFixed(3)} $/L</div></div>
            <div className="headline num">{money2(f.total)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
