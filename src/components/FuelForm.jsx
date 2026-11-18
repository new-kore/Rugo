// Log a fill-up: photo of the receipt + photo of the pump display. The receipt is read automatically
// (litres, price, tax, total); the driver checks it and can change anything. Changes and pump/receipt
// mismatches are flagged to the office as soon as it's saved.
import { useState } from 'react';
import Icon from './Icon.jsx';
import { Field, ActionButton } from './ui.jsx';
import { useStore, isActive } from '../lib/store.jsx';
import { post } from '../lib/api.js';
import { compressImage } from '../lib/image.js';
import { money2 } from '../lib/format.js';
import { scanReceipt, scanPump } from '../lib/receiptScan.js';

const STATIONS = ['Petro-Canada', 'Petro-Pass', 'Esso', 'Shell', 'Pilot Flying J', 'Husky', 'Ultramar', 'Irving', 'Other'];
const r2 = (n) => Math.round(n * 100) / 100;
const TAXES = [['hst', 'HST'], ['gst', 'GST'], ['qst', 'QST'], ['pst', 'PST']];

function PhotoBox({ label, hint, img, busy, onFile, testId }) {
  return (
    <label className={`photo-slot fuel-photo ${img ? '' : 'empty'}`} data-testid={testId}>
      {img ? <><img src={img} alt={label} /><div className="cap">{label} · tap to retake</div></>
        : <><Icon name="camera" size={26} /><div className="slot-label">{label}</div><div className="caption secondary">{hint}</div></>}
      {busy && <div className="fuel-reading"><span className="spinner" />{busy}</div>}
      <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}

export default function FuelForm({ onDone, truckId: fixedTruck }) {
  const { data, upsert, toast } = useStore();
  const isDriver = data.me.role === 'driver';
  const truckId0 = fixedTruck || (isDriver ? data.me.truckId : data.trucks[0]?.id);
  const truck = data.trucks.find((t) => t.id === truckId0);
  const [f, setF] = useState({ truckId: truckId0, litres: '', pricePerL: '', subtotal: '', total: '', tax: {}, odometerKm: truck ? Math.round(truck.odometerKm) : '', station: 'Petro-Canada', defLitres: '' });
  const [receipt, setReceipt] = useState(null);
  const [pump, setPump] = useState(null);
  const [read, setRead] = useState(null); // what the receipt said
  const [pumpRead, setPumpRead] = useState(null);
  const [busy, setBusy] = useState({});
  const [note, setNote] = useState('');
  const [taxKind, setTaxKind] = useState('hst');
  const job = data.loads.find((l) => l.truckId === f.truckId && isActive(l));

  const set = (k, v) => setF((x) => {
    const n = { ...x, [k]: v };
    // Keep the money consistent while typing.
    if ((k === 'litres' || k === 'pricePerL') && Number(n.litres) > 0 && Number(n.pricePerL) > 0) {
      n.subtotal = r2(Number(n.litres) * Number(n.pricePerL)).toFixed(2);
      n.total = r2(Number(n.subtotal) + Object.values(n.tax).reduce((a, t) => a + (Number(t) || 0), 0)).toFixed(2);
    }
    if (k === 'subtotal') n.total = r2((Number(v) || 0) + Object.values(n.tax).reduce((a, t) => a + (Number(t) || 0), 0)).toFixed(2);
    return n;
  });
  const setTax = (kind, v) => setF((x) => {
    const tax = { ...x.tax, [kind]: v };
    return { ...x, tax, total: r2((Number(x.subtotal) || 0) + Object.values(tax).reduce((a, t) => a + (Number(t) || 0), 0)).toFixed(2) };
  });

  const onReceipt = async (file) => {
    const url = await compressImage(file, 1600, 0.8);
    setReceipt(url);
    setBusy((b) => ({ ...b, receipt: 'Reading receipt…' }));
    try {
      const r = await scanReceipt(url, (p) => setBusy((b) => ({ ...b, receipt: `Reading receipt… ${Math.round(p * 100)}%` })));
      if (!r.total && !r.litres) throw new Error('Nothing readable');
      setRead(r);
      const k = Object.keys(r.tax).find((x) => r.tax[x]) || taxKind;
      setTaxKind(k);
      setF((x) => ({
        ...x,
        litres: r.litres ? String(r.litres) : x.litres,
        pricePerL: r.pricePerL ? String(r.pricePerL) : x.pricePerL,
        subtotal: r.subtotal ? r.subtotal.toFixed(2) : r.total && r.taxTotal ? r2(r.total - r.taxTotal).toFixed(2) : x.subtotal,
        tax: Object.fromEntries(Object.entries(r.tax).map(([a, v]) => [a, v.toFixed(2)])),
        total: r.total ? r.total.toFixed(2) : x.total,
        station: r.station && STATIONS.includes(r.station) ? r.station : x.station,
      }));
      setNote('Filled in from the receipt. Check the numbers — anything you change is shown to the office.');
    } catch (e) {
      setRead({ failed: true });
      setNote(/unavailable/i.test(e.message) ? 'Automatic reading isn’t available here. Type the amounts from the receipt.' : 'Couldn’t read the receipt clearly. Type the amounts from the receipt.');
    } finally { setBusy((b) => ({ ...b, receipt: null })); }
  };
  const onPump = async (file) => {
    const url = await compressImage(file, 1400, 0.78);
    setPump(url);
    setBusy((b) => ({ ...b, pump: 'Reading pump…' }));
    try { const p = await scanPump(url); if (p.litres || p.amount) setPumpRead(p); } catch { /* the photo is still kept as proof */ } finally { setBusy((b) => ({ ...b, pump: null })); }
  };

  const changed = (k) => read && !read.failed && read[k] && Number(f[k]) > 0 && Math.abs(Number(f[k]) - read[k]) / read[k] > 0.01;
  const taxTotal = Object.values(f.tax).reduce((a, t) => a + (Number(t) || 0), 0);
  const edits = ['litres', 'pricePerL', 'total'].filter(changed);
  const pumpOff = pumpRead && ((pumpRead.litres && Number(f.litres) > 0 && Math.abs(pumpRead.litres - Number(f.litres)) / Number(f.litres) > 0.02));
  const needPhotos = isDriver;
  const missing = needPhotos && !receipt ? 'Photo of the receipt' : needPhotos && !pump ? 'Photo of the pump display' : !(Number(f.litres) > 0) ? 'Litres' : !(Number(f.pricePerL) > 0) ? 'Price per litre' : null;
  const Tag = ({ k }) => (read && !read.failed && read[k] ? (changed(k) ? <span className="fuel-tag edited">Changed</span> : <span className="fuel-tag read"><Icon name="check" size={10} stroke={3} />From receipt</span>) : null);

  const save = async () => {
    const r = await post('/fuel', {
      truckId: f.truckId, litres: Number(f.litres), pricePerL: Number(f.pricePerL), subtotal: Number(f.subtotal) || undefined, total: Number(f.total) || undefined,
      tax: Object.fromEntries(Object.entries(f.tax).map(([k, v]) => [k, Number(v) || 0])), odometerKm: f.odometerKm, station: f.station, defLitres: f.defLitres,
      receipt, pump, read: read && !read.failed ? { litres: read.litres, pricePerL: read.pricePerL, total: read.total, taxTotal: read.taxTotal } : null, pumpRead,
    });
    upsert('fuelLogs', r);
    toast({ title: 'Fuel saved', body: `${r.litres} L · ${money2(r.total)}${job ? ` · added to ${job.ref}` : ''}${r.flags?.length ? ' · the office has been told about the changes' : ''}`, tone: r.flags?.length ? 'warn' : 'ok' });
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
      <div className="fuel-photos">
        <PhotoBox testId="receipt-slot" label="1. Receipt" hint={needPhotos ? 'Required — we read it for you' : 'Optional'} img={receipt} busy={busy.receipt} onFile={onReceipt} />
        <PhotoBox testId="pump-slot" label="2. Pump display" hint={needPhotos ? 'Required — litres and $ on the pump' : 'Optional'} img={pump} busy={busy.pump} onFile={onPump} />
      </div>
      {note && <div className={`fuel-note ${read?.failed ? 'warn' : ''}`}><Icon name={read?.failed ? 'warning' : 'sparkles'} size={15} />{note}</div>}
      {pumpRead && <div className={`fuel-note ${pumpOff ? 'warn' : 'ok'}`}><Icon name={pumpOff ? 'warning' : 'checkCircle'} size={15} />Pump shows {pumpRead.litres ? `${pumpRead.litres} L` : ''}{pumpRead.litres && pumpRead.amount ? ' · ' : ''}{pumpRead.amount ? money2(pumpRead.amount) : ''}{pumpOff ? ' — doesn’t match the receipt' : ' — matches'}</div>}

      <div className="grid grid-2">
        <Field label={<>Litres <Tag k="litres" /></>}><input className="input fuel-big" type="number" inputMode="decimal" placeholder="0" value={f.litres} onChange={(e) => set('litres', e.target.value)} /></Field>
        <Field label={<>Price per litre ($) <Tag k="pricePerL" /></>}><input className="input fuel-big" type="number" inputMode="decimal" step="0.001" placeholder={String(data.settings.fuelPricePerL)} value={f.pricePerL} onChange={(e) => set('pricePerL', e.target.value)} /></Field>
      </div>
      <div className="fuel-money">
        <div className="fuel-money-row"><span>Before tax</span><input className="input num" inputMode="decimal" value={f.subtotal} onChange={(e) => set('subtotal', e.target.value)} placeholder="0.00" /></div>
        <div className="fuel-money-row">
          <span><select className="select fuel-taxsel" value={taxKind} onChange={(e) => { const k = e.target.value; setF((x) => { const v = x.tax[taxKind]; const tax = { ...x.tax }; delete tax[taxKind]; if (v) tax[k] = v; return { ...x, tax }; }); setTaxKind(k); }}>{TAXES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span>
          <input className="input num" inputMode="decimal" value={f.tax[taxKind] || ''} onChange={(e) => setTax(taxKind, e.target.value)} placeholder="0.00" />
        </div>
        {Object.keys(f.tax).filter((k) => k !== taxKind && f.tax[k]).map((k) => (
          <div key={k} className="fuel-money-row"><span>{TAXES.find((x) => x[0] === k)?.[1]}</span><input className="input num" inputMode="decimal" value={f.tax[k]} onChange={(e) => setTax(k, e.target.value)} /></div>
        ))}
        <div className="fuel-money-row total"><span>Total <Tag k="total" /></span><input className="input num" inputMode="decimal" value={f.total} onChange={(e) => setF((x) => ({ ...x, total: e.target.value }))} placeholder={money2(Number(f.litres) * Number(f.pricePerL) || 0)} /></div>
        {taxTotal > 0 && <div className="caption tertiary">Sales tax {money2(taxTotal)} is tracked separately so the job cost uses the pre-tax amount.</div>}
      </div>
      {edits.length > 0 && <div className="fuel-note warn"><Icon name="warning" size={15} />You changed {edits.map((k) => ({ litres: 'litres', pricePerL: 'price', total: 'total' })[k]).join(', ')} from what the receipt says. The office will see this.</div>}

      <div className="grid grid-2">
        <Field label="Odometer (km)"><input className="input" type="number" inputMode="numeric" value={f.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} /></Field>
        <Field label="Station"><select className="select" value={f.station} onChange={(e) => set('station', e.target.value)}>{STATIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <Field label="DEF litres (optional)"><input className="input" type="number" inputMode="decimal" value={f.defLitres} onChange={(e) => set('defLitres', e.target.value)} placeholder="0" /></Field>
      {job && <div className="footnote secondary">This fill-up counts toward the cost of job {job.ref}.</div>}
      <ActionButton className="btn primary xl" disabled={!!missing} onClick={save}>
        <Icon name={missing ? 'camera' : 'check'} size={22} stroke={2.4} />{missing ? `${missing} needed` : `Save fuel · ${money2(Number(f.total) || Number(f.litres) * Number(f.pricePerL) || 0)}`}
      </ActionButton>
    </div>
  );
}
