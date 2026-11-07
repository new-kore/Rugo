import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Segmented, Avatar, Sheet, Field, ActionButton } from '../../components/ui.jsx';
import { useStore, useIndex, isActive } from '../../lib/store.jsx';
import { money, money2, km, num } from '../../lib/format.js';
import { post, patch } from '../../lib/api.js';

const WEEK = 7 * 864e5;

export function driverStats(d, data, since = Date.now() - WEEK) {
  const shifts = data.shifts.filter((s) => s.driverId === d.id && (s.end || Date.now()) > since);
  const hours = shifts.reduce((a, s) => a + (Math.min(s.end || Date.now(), Date.now()) - Math.max(s.start, since)) / 3.6e6, 0);
  const jobs = data.loads.filter((l) => l.driverId === d.id && l.status === 'delivered' && l.deliveredAt > since);
  const kms = jobs.reduce((a, l) => a + (l.economics?.totalKm || 0), 0);
  const pay = d.payType === 'per_km' ? kms * d.perKmRate : hours * d.hourlyRate;
  return { hours, jobs: jobs.length, kms, pay };
}

export function truckEconomy(t, data) {
  const since = Date.now() - 30 * 864e5;
  const logs = data.fuelLogs.filter((f) => f.truckId === t.id && f.t > since);
  const litres = logs.reduce((a, f) => a + f.litres, 0);
  const spend = logs.reduce((a, f) => a + f.total, 0);
  const kms = data.loads.filter((l) => l.truckId === t.id && l.status === 'delivered' && l.deliveredAt > since).reduce((a, l) => a + (l.economics?.totalKm || 0), 0);
  return { litres, spend, kms, lPer100: kms > 50 ? (litres / kms) * 100 : null, costPerKm: kms ? spend / kms : null };
}

export default function Drivers() {
  const { data } = useStore();
  const idx = useIndex();
  const [tab, setTab] = useState('drivers');
  const [edit, setEdit] = useState(null);
  const [editTruck, setEditTruck] = useState(null);
  const drivers = data.users.filter((u) => u.role === 'driver');
  const onJob = new Set(data.loads.filter(isActive).map((l) => l.driverId));

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead title="Drivers & trucks" sub={`${drivers.length} drivers · ${data.trucks.length} trucks`}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'drivers', label: 'Drivers' }, { value: 'trucks', label: 'Trucks' }]} />
        <button className="btn primary" onClick={() => (tab === 'drivers' ? setEdit({}) : setEditTruck({}))}><Icon name="plus" size={18} stroke={2.4} />Add {tab === 'drivers' ? 'driver' : 'truck'}</button>
      </PageHead>

      {tab === 'drivers' ? (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Driver</th><th>Status</th><th>Truck</th><th>Pay</th><th className="r">Hours (7d)</th><th className="r">km (7d)</th><th className="r">Jobs (7d)</th><th className="r">Earned (7d)</th><th className="r">Rating</th><th /></tr></thead>
            <tbody>
              {drivers.map((d) => {
                const s = driverStats(d, data);
                const st = onJob.has(d.id) ? ['blue', 'On a job'] : d.status === 'off_duty' ? ['gray', 'Off duty'] : ['green', 'Available'];
                return (
                  <tr key={d.id} className="click" onClick={() => setEdit(d)}>
                    <td><div className="row"><Avatar user={d} size="sm" /><div><div className="headline">{d.name}</div><div className="caption secondary">{d.phone} · Class {d.licenseClass}</div></div></div></td>
                    <td><span className={`pill ${st[0]}`}>{st[1]}</span></td>
                    <td>{idx.trucks[d.truckId] ? `Unit ${idx.trucks[d.truckId].unit}` : '—'}</td>
                    <td>{d.payType === 'per_km' ? `${money2(d.perKmRate)}/km` : `${money2(d.hourlyRate)}/h`}</td>
                    <td className="r">{num(s.hours, 1)}</td>
                    <td className="r">{num(s.kms)}</td>
                    <td className="r">{s.jobs}</td>
                    <td className="r">{money(s.pay)}</td>
                    <td className="r">{d.rating ? `★ ${d.rating}` : '—'}</td>
                    <td><Icon name="chevron" size={16} className="chev" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Unit</th><th>Vehicle</th><th>Trailer</th><th>Driver</th><th className="r">Odometer</th><th className="r">L/100 km (30d)</th><th className="r">Fuel $/km</th><th className="r">Next service</th><th /></tr></thead>
            <tbody>
              {data.trucks.map((t) => {
                const e = truckEconomy(t, data);
                const service = t.nextServiceKm - t.odometerKm;
                return (
                  <tr key={t.id} className="click" onClick={() => setEditTruck(t)}>
                    <td className="headline">Unit {t.unit}</td>
                    <td>{t.year} {t.make} {t.model}<div className="caption secondary mono">{t.plate}</div></td>
                    <td>{data.meta.equipment[t.equipment]?.label}</td>
                    <td>{idx.users[t.driverId]?.name || '—'}</td>
                    <td className="r">{km(t.odometerKm)}</td>
                    <td className="r">{e.lPer100 ? `${e.lPer100.toFixed(1)}` : `${t.fuelLPer100} (spec)`}</td>
                    <td className="r">{e.costPerKm ? money2(e.costPerKm) : '—'}</td>
                    <td className={`r ${service < 0 ? 'red' : service < 2000 ? 'orange' : ''}`}>{service < 0 ? `Overdue ${km(-service)}` : `in ${km(service)}`}</td>
                    <td><Icon name="chevron" size={16} className="chev" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <DriverSheet driver={edit} onClose={() => setEdit(null)} />}
      {editTruck && <TruckSheet truck={editTruck} onClose={() => setEditTruck(null)} />}
    </div>
  );
}

function DriverSheet({ driver, onClose }) {
  const { data, upsert, toast } = useStore();
  const isNew = !driver.id;
  const [f, setF] = useState({ name: '', email: '', phone: '', licenseClass: 'AZ', payType: 'hourly', hourlyRate: 32, perKmRate: 0.62, truckId: '', ...driver });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const r = isNew ? await post('/drivers', f) : await patch(`/drivers/${driver.id}`, f);
    upsert('users', r);
    toast({ title: isNew ? 'Driver added' : 'Saved', body: isNew ? `${f.name} can sign in with ${f.email} / demo` : undefined });
    onClose();
  };
  return (
    <Sheet title={isNew ? 'New driver' : f.name} onClose={onClose}>
      <div className="stack">
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        {isNew && <Field label="Email (sign-in)"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>}
        <div className="grid grid-2">
          <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Licence class"><input className="input" value={f.licenseClass} onChange={set('licenseClass')} /></Field>
        </div>
        <Field label="How is this driver paid?">
          <Segmented block value={f.payType} onChange={(v) => setF((x) => ({ ...x, payType: v }))} options={[{ value: 'hourly', label: 'By the hour' }, { value: 'per_km', label: 'By the kilometre' }]} />
        </Field>
        {f.payType === 'hourly'
          ? <Field label="Hourly rate ($)"><input className="input" type="number" step="0.5" value={f.hourlyRate} onChange={set('hourlyRate')} /></Field>
          : <Field label="Rate per km ($)"><input className="input" type="number" step="0.01" value={f.perKmRate} onChange={set('perKmRate')} /></Field>}
        <Field label="Assigned truck">
          <select className="select" value={f.truckId || ''} onChange={set('truckId')}>
            <option value="">No truck</option>
            {data.trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit} — {t.make} {t.model}</option>)}
          </select>
        </Field>
        <ActionButton className="btn primary large" disabled={!f.name || (isNew && !f.email)} onClick={save}>{isNew ? 'Add driver' : 'Save changes'}</ActionButton>
      </div>
    </Sheet>
  );
}

function TruckSheet({ truck, onClose }) {
  const { data, upsert, toast } = useStore();
  const isNew = !truck.id;
  const [f, setF] = useState({ unit: '', make: '', model: '', year: 2024, plate: '', vin: '', equipment: 'dry_van', odometerKm: 0, fuelLPer100: 36, tankL: 900, ...truck });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const r = isNew ? await post('/trucks', f) : await patch(`/trucks/${truck.id}`, f);
    upsert('trucks', r);
    toast({ title: isNew ? 'Truck added' : 'Saved' });
    onClose();
  };
  return (
    <Sheet title={isNew ? 'New truck' : `Unit ${f.unit}`} onClose={onClose}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Unit number"><input className="input" value={f.unit} onChange={set('unit')} /></Field>
          <Field label="Plate"><input className="input" value={f.plate} onChange={set('plate')} /></Field>
          <Field label="Make"><input className="input" value={f.make} onChange={set('make')} /></Field>
          <Field label="Model"><input className="input" value={f.model} onChange={set('model')} /></Field>
          <Field label="Year"><input className="input" type="number" value={f.year} onChange={set('year')} /></Field>
          <Field label="Trailer type">
            <select className="select" value={f.equipment} onChange={set('equipment')}>
              {Object.entries(data.meta.equipment).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="Odometer (km)"><input className="input" type="number" value={f.odometerKm} onChange={set('odometerKm')} /></Field>
          <Field label="Fuel use (L/100 km)"><input className="input" type="number" step="0.1" value={f.fuelLPer100} onChange={set('fuelLPer100')} /></Field>
          {!isNew && <Field label="Next service at (km)"><input className="input" type="number" value={f.nextServiceKm} onChange={set('nextServiceKm')} /></Field>}
          <Field label="Tank size (L)"><input className="input" type="number" value={f.tankL} onChange={set('tankL')} /></Field>
        </div>
        <Field label="VIN"><input className="input mono" value={f.vin} onChange={set('vin')} /></Field>
        <ActionButton className="btn primary large" disabled={!f.unit} onClick={save}>{isNew ? 'Add truck' : 'Save changes'}</ActionButton>
      </div>
    </Sheet>
  );
}
