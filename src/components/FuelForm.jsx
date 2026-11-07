import { useState } from 'react';
import Icon from './Icon.jsx';
import { Field, ActionButton } from './ui.jsx';
import { useStore, isActive } from '../lib/store.jsx';
import { post } from '../lib/api.js';
import { compressImage } from '../lib/image.js';
import { money2 } from '../lib/format.js';

const STATIONS = ['Petro-Canada', 'Esso', 'Shell', 'Pilot Flying J', 'Husky', 'Ultramar', 'Other'];

export default function FuelForm({ onDone, truckId: fixedTruck }) {
  const { data, upsert, toast } = useStore();
  const isDriver = data.me.role === 'driver';
  const truckId0 = fixedTruck || (isDriver ? data.me.truckId : data.trucks[0]?.id);
  const truck = data.trucks.find((t) => t.id === truckId0);
  const [f, setF] = useState({ truckId: truckId0, litres: '', pricePerL: data.settings.fuelPricePerL, odometerKm: truck ? Math.round(truck.odometerKm) : '', station: 'Petro-Canada', defLitres: '' });
  const [receipt, setReceipt] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const total = Number(f.litres) * Number(f.pricePerL) || 0;
  const job = data.loads.find((l) => l.truckId === f.truckId && isActive(l));

  const save = async () => {
    const r = await post('/fuel', { ...f, receipt });
    upsert('fuelLogs', r);
    toast({ title: 'Fuel saved', body: `${r.litres} L · ${money2(r.total)}${job ? ` · added to ${job.ref}` : ''}` });
    onDone?.(r);
  };

  return (
    <div className="stack">
      {!isDriver && (
        <Field label="Truck">
          <select className="select" value={f.truckId} onChange={(e) => { const t = data.trucks.find((x) => x.id === e.target.value); setF((x) => ({ ...x, truckId: e.target.value, odometerKm: Math.round(t?.odometerKm || 0) })); }}>
            {data.trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit} — {t.make} {t.model}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-2">
        <Field label="Litres"><input className="input" style={{ fontSize: '1.4rem', height: 60 }} type="number" inputMode="decimal" placeholder="0" value={f.litres} onChange={set('litres')} autoFocus /></Field>
        <Field label="Price per litre ($)"><input className="input" style={{ fontSize: '1.4rem', height: 60 }} type="number" inputMode="decimal" step="0.001" value={f.pricePerL} onChange={set('pricePerL')} /></Field>
      </div>
      <div className="row between card pad" style={{ background: 'var(--bg-fill-2)', boxShadow: 'none' }}>
        <span className="headline">Total</span><span className="title2 num">{money2(total)}</span>
      </div>
      <div className="grid grid-2">
        <Field label="Odometer (km)"><input className="input" type="number" inputMode="numeric" value={f.odometerKm} onChange={set('odometerKm')} /></Field>
        <Field label="Station">
          <select className="select" value={f.station} onChange={set('station')}>{STATIONS.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>
      <Field label="DEF litres (optional)"><input className="input" type="number" inputMode="decimal" value={f.defLitres} onChange={set('defLitres')} placeholder="0" /></Field>
      <label className="photo-slot empty" style={{ aspectRatio: 'auto', height: receipt ? 160 : 90 }}>
        {receipt ? <><img src={receipt} alt="Receipt" /><div className="cap">Receipt · tap to retake</div></> : <><Icon name="camera" size={26} /><div className="slot-label">Photo of receipt (optional)</div></>}
        <input type="file" accept="image/*" capture="environment" onChange={async (e) => { const file = e.target.files[0]; if (file) setReceipt(await compressImage(file, 1400, 0.75)); }} />
      </label>
      {job && <div className="footnote secondary">This fill-up will be counted against job {job.ref}.</div>}
      <ActionButton className="btn primary xl" disabled={!(Number(f.litres) > 0) || !(Number(f.pricePerL) > 0)} onClick={save}>
        <Icon name="check" size={22} stroke={2.4} />Save fuel
      </ActionButton>
    </div>
  );
}
