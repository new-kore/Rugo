// Drivers: list with pay and 7-day stats; full driver file with schedule, time off, documents, email and delete.
import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Segmented, Avatar, Sheet, Field, ActionButton, ConfirmButton } from '../../components/ui.jsx';
import { useStore, useIndex, isActive } from '../../lib/store.jsx';
import { money, money2, num, date } from '../../lib/format.js';
import { post, patch, del } from '../../lib/api.js';
import { compressImage } from '../../lib/image.js';

const WEEK = 7 * 864e5;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function driverStats(d, data, since = Date.now() - WEEK) {
  const shifts = data.shifts.filter((s) => s.driverId === d.id && (s.end || Date.now()) > since);
  const hours = shifts.reduce((a, s) => a + (Math.min(s.end || Date.now(), Date.now()) - Math.max(s.start, since)) / 3.6e6, 0);
  const jobs = data.loads.filter((l) => (l.driverId === d.id || (l.teamDriverIds || []).includes(d.id)) && l.status === 'delivered' && l.deliveredAt > since);
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

/** Email link plus the address as text (some browsers block mail links inside embedded pages). */
export function EmailButton({ email, small = true, label = 'Email' }) {
  const { toast } = useStore();
  if (!email) return null;
  return (
    <a className={`btn ${small ? 'small' : ''}`} href={`mailto:${email}`} target="_blank" rel="noreferrer" title={email}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(email).then(() => toast({ title: 'Email copied', body: email })).catch(() => {}); }}>
      <Icon name="message" size={14} />{label}
    </a>
  );
}

export default function Drivers() {
  const { data, toast } = useStore();
  const idx = useIndex();
  const [edit, setEdit] = useState(null);
  const drivers = data.users.filter((u) => u.role === 'driver');
  const onJob = new Set(data.loads.filter(isActive).flatMap((l) => [l.driverId, ...(l.teamDriverIds || [])]));

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead sub={`${drivers.length} drivers`}>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" size={18} stroke={2.4} />Add driver</button>
      </PageHead>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Driver</th><th>Status</th><th>Truck</th><th>Pay</th><th>Schedule</th><th className="r">Hours (7d)</th><th className="r">km (7d)</th><th className="r">Earned (7d)</th><th>Records</th><th /></tr></thead>
          <tbody>
            {drivers.map((d) => {
              const s = driverStats(d, data);
              const off = (d.timeOff || []).find((o) => o.from <= Date.now() && o.to >= Date.now());
              const st = onJob.has(d.id) ? ['blue', 'On a job'] : off ? ['orange', 'Time off'] : d.status === 'off_duty' ? ['gray', 'Off duty'] : ['green', 'Available'];
              const docs = d.documents || [];
              const lic = docs.some((x) => x.kind === 'licence'); const abs = docs.some((x) => x.kind === 'abstract');
              return (
                <tr key={d.id} className="click" onClick={() => setEdit(d)}>
                  <td><div className="row"><Avatar user={d} size="sm" /><div><div className="headline">{d.name}</div><div className="caption secondary">{d.phone} · Class {d.licenseClass}</div></div></div></td>
                  <td><span className={`pill ${st[0]}`}>{st[1]}</span></td>
                  <td>{idx.trucks[d.truckId] ? `Unit ${idx.trucks[d.truckId].unit}` : '—'}</td>
                  <td>{d.payType === 'per_km' ? `${money2(d.perKmRate)}/km` : `${money2(d.hourlyRate)}/h`}</td>
                  <td className="footnote">{scheduleText(d.schedule)}</td>
                  <td className="r">{num(s.hours, 1)}</td>
                  <td className="r">{num(s.kms)}</td>
                  <td className="r">{money(s.pay)}</td>
                  <td>
                    <span className={`pill ${lic ? 'green' : 'gray'}`} title="Driver’s licence">{lic ? '✓' : '—'} Licence</span>{' '}
                    <span className={`pill ${abs ? 'green' : 'gray'}`} title="Driver abstract">{abs ? '✓' : '—'} Abstract</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <EmailButton email={d.email} />
                      <ConfirmButton className="btn small danger" confirmLabel="Delete?" aria-label={`Delete ${d.name}`} disabled={onJob.has(d.id)}
                        title={onJob.has(d.id) ? 'On a job — replace them on the load first' : undefined}
                        onConfirm={async () => { await del(`/drivers/${d.id}`); toast({ title: 'Driver deleted', body: d.name }); }}>
                        <Icon name="trash" size={14} />
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <DriverSheet driver={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export const scheduleText = (s) => {
  if (!s) return '—';
  const days = [...s.days].sort();
  const run = days.length && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = days.length === 7 ? 'Every day' : run && days.length > 2 ? `${DAYS[days[0]]}–${DAYS[days[days.length - 1]]}` : days.map((d) => DAYS[d]).join(', ');
  return `${dayText} · ${s.start}–${s.end}`;
};

const toLocalDate = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromLocalDate = (s) => (s ? new Date(`${s}T00:00`).getTime() : null);

export function DriverSheet({ driver, onClose }) {
  const { data, upsert, toast } = useStore();
  const idx = useIndex();
  const [current, setCurrent] = useState(driver);
  const isNew = !current.id;
  const live = current.id ? idx.users[current.id] || current : current;
  const domain = (data.users.find((u) => u.id === data.me.id)?.email || data.me.email || '').split('@')[1] || 'example.com';
  const takenTrucks = new Set(data.users.filter((u) => u.role === 'driver' && u.id !== current.id && u.truckId).map((u) => u.truckId));
  const freeTruck = data.trucks.find((t) => !takenTrucks.has(t.id));

  // New drivers start fully filled in: email from the name, a free truck, standard pay and hours.
  const [f, setF] = useState(() => ({
    name: '', email: '', phone: '', licenseClass: 'AZ', payType: 'hourly', hourlyRate: 32, perKmRate: 0.62,
    truckId: isNew ? freeTruck?.id || '' : '', schedule: { days: [1, 2, 3, 4, 5], start: '07:00', end: '17:00' }, timeOff: [],
    ...driver, licenseExpiry: toLocalDate(driver.licenseExpiry),
  }));
  const [emailTouched, setEmailTouched] = useState(!isNew);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const autoEmail = (name) => {
    const parts = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
    return parts.length ? `${parts[0].replace(/[^a-z-]/g, '')}${parts[1] ? `.${parts[parts.length - 1].replace(/[^a-z-]/g, '')}` : ''}@${domain}` : '';
  };
  const onName = (e) => { const name = e.target.value; setF((x) => ({ ...x, name, email: emailTouched ? x.email : autoEmail(name) })); };
  const toggleDay = (d) => setF((x) => ({ ...x, schedule: { ...x.schedule, days: x.schedule.days.includes(d) ? x.schedule.days.filter((y) => y !== d) : [...x.schedule.days, d] } }));
  const [off, setOff] = useState({ from: '', to: '', reason: '' });

  const save = async () => {
    const body = { ...f, licenseExpiry: fromLocalDate(f.licenseExpiry) };
    const r = isNew ? await post('/drivers', body) : await patch(`/drivers/${current.id}`, body);
    upsert('users', r);
    if (isNew) {
      toast({ title: 'Driver added', body: `${f.name} can sign in with ${r.email} (password: demo). Now add their licence and abstract.` });
      setCurrent(r); // stay open so records can be attached
    } else {
      toast({ title: 'Saved', body: f.name });
      onClose();
    }
  };

  return (
    <Sheet title={isNew ? 'New driver' : f.name} onClose={onClose} wide>
      <div className="route-form">
        <section>
          <h4>Profile</h4>
          <div className="grid grid-2">
            <Field label="Full name"><input className="input" value={f.name} onChange={onName} autoFocus={isNew} placeholder="First and last name" /></Field>
            <Field label="Email (sign-in)">
              <div className="row" style={{ gap: 6 }}>
                <input className="input" type="email" value={f.email} onChange={(e) => { setEmailTouched(true); set('email')(e); }} />
                {!isNew && <EmailButton email={live.email} small={false} />}
              </div>
            </Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} placeholder="647-555-0100" /></Field>
            <Field label="Licence class"><input className="input" value={f.licenseClass} onChange={set('licenseClass')} /></Field>
            <Field label="Licence expiry"><input className="input" type="date" value={f.licenseExpiry} onChange={set('licenseExpiry')} /></Field>
            <Field label="Assigned truck">
              <select className="select" value={f.truckId || ''} onChange={set('truckId')}>
                <option value="">No truck</option>
                {data.trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit} — {t.make} {t.model}{takenTrucks.has(t.id) ? ' · has a driver' : ''}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section>
          <h4>Pay</h4>
          <Segmented block value={f.payType} onChange={(v) => setF((x) => ({ ...x, payType: v }))} options={[{ value: 'hourly', label: 'By the hour' }, { value: 'per_km', label: 'By the kilometre' }]} />
          {f.payType === 'hourly'
            ? <Field label="Hourly rate ($)"><input className="input" type="number" step="0.5" value={f.hourlyRate} onChange={set('hourlyRate')} /></Field>
            : <Field label="Rate per km ($)"><input className="input" type="number" step="0.01" value={f.perKmRate} onChange={set('perKmRate')} /></Field>}
        </section>

        <section>
          <h4>Schedule</h4>
          <div className="row wrap" style={{ gap: 6 }}>
            {DAYS.map((d, i) => (
              <button key={d} type="button" className={`day-toggle ${f.schedule.days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)} aria-pressed={f.schedule.days.includes(i)}>{d}</button>
            ))}
          </div>
          <div className="grid grid-2">
            <Field label="Shift starts"><input className="input" type="time" value={f.schedule.start} onChange={(e) => setF((x) => ({ ...x, schedule: { ...x.schedule, start: e.target.value } }))} /></Field>
            <Field label="Shift ends"><input className="input" type="time" value={f.schedule.end} onChange={(e) => setF((x) => ({ ...x, schedule: { ...x.schedule, end: e.target.value } }))} /></Field>
          </div>
          <div className="footnote secondary">Time off</div>
          {(f.timeOff || []).map((o) => (
            <div key={o.id || o.from} className="row" style={{ gap: 8 }}>
              <span className="pill orange">{date(o.from)} – {date(o.to)}</span>
              <span className="subhead spacer">{o.reason || 'Time off'}</span>
              <button className="icon-btn" aria-label="Remove time off" onClick={() => setF((x) => ({ ...x, timeOff: x.timeOff.filter((y) => y !== o) }))}><Icon name="close" size={14} /></button>
            </div>
          ))}
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" style={{ width: 160 }} type="date" value={off.from} onChange={(e) => setOff({ ...off, from: e.target.value })} aria-label="Time off from" />
            <input className="input" style={{ width: 160 }} type="date" value={off.to} onChange={(e) => setOff({ ...off, to: e.target.value })} aria-label="Time off to" />
            <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Reason (vacation, medical…)" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} />
            <button className="btn" disabled={!off.from} onClick={() => {
              const from = fromLocalDate(off.from); const to = fromLocalDate(off.to || off.from) + 864e5 - 1;
              setF((x) => ({ ...x, timeOff: [...(x.timeOff || []), { from, to, reason: off.reason }] })); setOff({ from: '', to: '', reason: '' });
            }}><Icon name="plus" size={14} stroke={2.4} />Add time off</button>
          </div>
        </section>

        {!isNew && <Documents driver={live} />}

        <div className="row" style={{ gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0 2px' }}>
          {!isNew && (
            <ConfirmButton className="btn danger" confirmLabel="Tap again to delete" onConfirm={async () => { await del(`/drivers/${current.id}`); toast({ title: 'Driver deleted', body: f.name }); onClose(); }}>
              <Icon name="trash" size={14} />Delete driver
            </ConfirmButton>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{isNew ? 'Cancel' : 'Close'}</button>
          <ActionButton className="btn primary large" disabled={!f.name || !f.email} onClick={save}>{isNew ? 'Add driver' : 'Save changes'}</ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

/** Licence, abstract and other records: upload a photo or PDF, set an expiry, view or remove. */
function Documents({ driver }) {
  const { toast } = useStore();
  const [kind, setKind] = useState('licence');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const docs = useMemo(() => [...(driver.documents || [])].sort((a, b) => b.t - a.t), [driver.documents]);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = file.type === 'application/pdf'
        ? await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); })
        : await compressImage(file, 2000, 0.85);
      await post(`/drivers/${driver.id}/documents`, { kind, name: file.name, dataUrl, expires: fromLocalDate(expires) });
      toast({ title: 'Document added', body: file.name });
      setExpires('');
    } catch (e) { toast({ title: 'Upload failed', body: e.message, tone: 'error' }); } finally { setBusy(false); }
  };
  const has = (k) => docs.some((d) => d.kind === k);
  return (
    <section>
      <h4>Records</h4>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className={`pill ${has('licence') ? 'green' : 'orange'}`}>{has('licence') ? '✓ Licence on file' : 'Licence missing'}</span>
        <span className={`pill ${has('abstract') ? 'green' : 'orange'}`}>{has('abstract') ? '✓ Abstract on file' : 'Abstract missing'}</span>
      </div>
      {docs.length > 0 && (
        <div className="list">
          {docs.map((d) => {
            const expired = d.expires && d.expires < Date.now();
            return (
              <div key={d.id} className="list-row">
                <Icon name="doc" size={18} />
                <div className="label">
                  <div className="headline">{d.label}</div>
                  <div className="footnote secondary truncate">{d.name} · added {date(d.t)}{d.expires ? ` · ` : ''}{d.expires && <span className={expired ? 'red' : ''}>{expired ? 'expired' : 'expires'} {date(d.expires)}</span>}</div>
                </div>
                <a className="btn small" href={d.url} target="_blank" rel="noreferrer">View</a>
                <ConfirmButton className="btn small danger" confirmLabel="Remove?" aria-label={`Remove ${d.label}`} onConfirm={() => del(`/drivers/${driver.id}/documents/${d.id}`)}><Icon name="trash" size={13} /></ConfirmButton>
              </div>
            );
          })}
        </div>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <select className="select" style={{ width: 200 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document type">
          <option value="licence">Driver’s licence</option>
          <option value="abstract">Driver abstract</option>
          <option value="medical">Medical certificate</option>
          <option value="other">Other</option>
        </select>
        <input className="input" style={{ width: 170 }} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expiry date (optional)" title="Expiry date (optional)" />
        <label className="btn primary" style={{ position: 'relative', overflow: 'hidden' }}>
          {busy ? <span className="spinner" /> : <Icon name="plus" size={14} stroke={2.4} />}Upload photo or PDF
          <input type="file" accept="image/*,application/pdf" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
    </section>
  );
}
