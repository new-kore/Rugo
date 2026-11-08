// Drivers: list with pay and 7-day stats; full driver file with schedule, time off, documents, email and delete.
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Segmented, Avatar, Sheet, Field, ActionButton, ConfirmButton, Switch } from '../../components/ui.jsx';
import { useStore, useIndex, isActive } from '../../lib/store.jsx';
import { money, money2, num, date } from '../../lib/format.js';
import { post, patch, del } from '../../lib/api.js';
import { compressImage } from '../../lib/image.js';
import { Tabs } from '../../components/LoadList.jsx';
import { ScorecardView, ScorecardTable } from './Scorecard.jsx';
import { hosStatus, hm, clockTone, hosLeft } from '../../lib/hos.js';
import { DAYS, weekSchedule, shiftHours, weeklyHours, scheduleText, expiry, driverAlerts } from '../../lib/drivers.js';
import { scanLicence } from '../../lib/licenceScan.js';

export { scheduleText };

const WEEK = 7 * 864e5;

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
  const [edit, setEdit] = useState(() => {
    // Opened from a notification (licence expiring).
    let id = null; try { id = sessionStorage.getItem('rugo.openDriver'); sessionStorage.removeItem('rugo.openDriver'); } catch { /* ignore */ }
    return id ? { __open: id } : null;
  });
  useEffect(() => {
    const on = () => { let id = null; try { id = sessionStorage.getItem('rugo.openDriver'); sessionStorage.removeItem('rugo.openDriver'); } catch { /* ignore */ } if (id) setEdit({ __open: id }); };
    window.addEventListener('rugo:open-driver', on);
    return () => window.removeEventListener('rugo:open-driver', on);
  }, []);
  const [view, setView] = useState('roster');
  const [editTab, setEditTab] = useState('profile');
  const drivers = data.users.filter((u) => u.role === 'driver');
  const editing = edit?.__open ? idx.users[edit.__open] : edit;
  const hasHos = drivers.some((d) => d.hos);
  const attention = drivers.flatMap((d) => driverAlerts(d).map((a) => ({ ...a, d })));
  const onJob = new Set(data.loads.filter(isActive).flatMap((l) => [l.driverId, ...(l.teamDriverIds || [])]));

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead sub={`${drivers.length} drivers`}>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" size={18} stroke={2.4} />Add driver</button>
      </PageHead>
      {attention.length > 0 && (
        <div className="card pad alert-card">
          <Icon name="warning" size={18} />
          <div className="spacer">
            <div className="headline">{attention.length === 1 ? '1 record needs attention' : `${attention.length} records need attention`}</div>
            <div className="footnote secondary">{attention.map((a) => (a.kind === 'hos' ? `${a.d.name} — ${a.text}` : `${a.d.name} — ${a.label.toLowerCase()} ${a.text.toLowerCase()}`)).join(' · ')}</div>
          </div>
          <button className="btn small" onClick={() => setEdit(attention[0].d)}>Review</button>
        </div>
      )}
      <Tabs value={view} onChange={setView} options={[{ value: 'roster', label: 'Roster' }, { value: 'scores', label: 'Scorecards' }]} />
      {view === 'scores' ? <ScorecardTable onOpen={(d) => { setEditTab('score'); setEdit(d); }} /> : (
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Driver</th><th>Status</th>{hasHos && <th>Hours left (ELD)</th>}<th>Truck</th><th>Pay</th><th>Schedule</th><th>Licence</th><th className="r">Hours (7d)</th><th className="r">km (7d)</th><th className="r">Earned (7d)</th><th>Records</th><th /></tr></thead>
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
                  {hasHos && <td><HosCell h={d.hos} /></td>}
                  <td>{idx.trucks[d.truckId] ? `Unit ${idx.trucks[d.truckId].unit}` : '—'}</td>
                  <td>{d.payType === 'per_km' ? `${money2(d.perKmRate)}/km` : `${money2(d.hourlyRate)}/h`}</td>
                  <td className="footnote" style={{ whiteSpace: 'normal', maxWidth: 220 }}>{scheduleText(d.schedule)}</td>
                  <td><LicencePill driver={d} /></td>
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
      )}
      {editing && <DriverSheet key={`${editing.id || 'new'}-${editTab}`} driver={editing} initialTab={editTab} onClose={() => { setEdit(null); setEditTab('profile'); }} />}
    </div>
  );
}


export function LicencePill({ driver }) {
  const e = expiry(driver.licenseExpiry);
  const tone = { expired: 'red', soon: 'orange', ok: 'green', none: 'gray' }[e.level];
  const text = e.level === 'ok' ? `Valid · ${new Date(driver.licenseExpiry).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}` : e.level === 'none' ? 'No expiry' : e.text;
  return <span className={`pill ${tone}`} title={e.text}>{e.level !== 'ok' && e.level !== 'none' && <Icon name="warning" size={12} />}{text}</span>;
}

const toLocalDate = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromLocalDate = (str) => (str ? new Date(`${str}T00:00`).getTime() : null);
const PRESETS = [
  { label: 'Mon–Fri 7–5', week: { 1: ['07:00', '17:00'], 2: ['07:00', '17:00'], 3: ['07:00', '17:00'], 4: ['07:00', '17:00'], 5: ['07:00', '17:00'] } },
  { label: '4 × 10 h', week: { 1: ['06:00', '16:00'], 2: ['06:00', '16:00'], 3: ['06:00', '16:00'], 4: ['06:00', '16:00'] } },
  { label: 'Nights', week: { 0: ['20:00', '06:00'], 1: ['20:00', '06:00'], 2: ['20:00', '06:00'], 3: ['20:00', '06:00'], 4: ['20:00', '06:00'] } },
  { label: 'Weekends', week: { 5: ['08:00', '18:00'], 6: ['08:00', '18:00'], 0: ['08:00', '18:00'] } },
];
const fromPreset = (p) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, p.week[d] ? { start: p.week[d][0], end: p.week[d][1] } : null]));

export function DriverSheet({ driver, onClose, initialTab = 'profile' }) {
  const { data, upsert, toast } = useStore();
  const idx = useIndex();
  const [current, setCurrent] = useState(driver);
  const isNew = !current.id;
  const live = current.id ? idx.users[current.id] || current : current;
  const [tab, setTab] = useState(initialTab);
  const domain = (data.me.email || '').split('@')[1] || 'example.com';
  const takenTrucks = new Set(data.users.filter((u) => u.role === 'driver' && u.id !== current.id && u.truckId).map((u) => u.truckId));
  const freeTruck = data.trucks.find((t) => !takenTrucks.has(t.id));

  // New drivers start fully filled in: email from the name, a free truck, standard pay and hours.
  const [f, setF] = useState(() => ({
    name: '', email: '', phone: '', licenseClass: 'AZ', licenseNumber: '', payType: 'hourly', hourlyRate: 32, perKmRate: 0.62,
    truckId: isNew ? freeTruck?.id || '' : '', timeOff: [],
    ...driver, schedule: weekSchedule(driver.schedule || { days: [1, 2, 3, 4, 5], start: '07:00', end: '17:00' }), licenseExpiry: toLocalDate(driver.licenseExpiry),
  }));
  const [emailTouched, setEmailTouched] = useState(!isNew);
  const [scan, setScan] = useState(null); // { state: 'reading'|'done'|'failed', progress, result, dataUrl, fileName }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const autoEmail = (name) => {
    const parts = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
    return parts.length ? `${parts[0].replace(/[^a-z-]/g, '')}${parts.length > 1 ? `.${parts[parts.length - 1].replace(/[^a-z-]/g, '')}` : ''}@${domain}` : '';
  };
  const setName = (name) => setF((x) => ({ ...x, name, email: emailTouched ? x.email : autoEmail(name) }));
  const setDay = (d, v) => setF((x) => ({ ...x, schedule: { ...x.schedule, [d]: v } }));

  // Licence scan: read the photo, fill the form, keep the file to attach on save.
  const onLicence = async (file) => {
    if (!file) return;
    const dataUrl = await compressImage(file, 2000, 0.9);
    setScan({ state: 'reading', progress: 0, dataUrl, fileName: file.name });
    try {
      const r = await scanLicence(dataUrl, (p) => setScan((s) => s && { ...s, progress: p }));
      setScan({ state: 'done', result: r, dataUrl, fileName: file.name });
      setF((x) => ({
        ...x,
        name: r.name && (isNew || !x.name) ? r.name : x.name,
        email: r.name && !emailTouched && (isNew || !x.name) ? autoEmail(r.name) : x.email,
        licenseNumber: r.licenseNumber || x.licenseNumber, licenseClass: r.licenseClass || x.licenseClass,
        licenseExpiry: r.expiry || x.licenseExpiry,
      }));
    } catch {
      setScan({ state: 'failed', dataUrl, fileName: file.name });
    }
  };

  const save = async () => {
    const body = { ...f, licenseExpiry: fromLocalDate(f.licenseExpiry) };
    delete body.documents;
    const r = isNew ? await post('/drivers', body) : await patch(`/drivers/${current.id}`, body);
    upsert('users', r);
    if (scan?.dataUrl) {
      const withDoc = await post(`/drivers/${r.id}/documents`, { kind: 'licence', name: scan.fileName, dataUrl: scan.dataUrl, expires: body.licenseExpiry });
      upsert('users', withDoc);
      setScan(null);
    }
    if (isNew) {
      toast({ title: 'Driver added', body: `${f.name} signs in with ${r.email} (password: demo).` });
      setCurrent(r); setTab('records');
    } else {
      toast({ title: 'Saved', body: f.name });
      onClose();
    }
  };

  const lic = expiry(fromLocalDate(f.licenseExpiry));
  const alerts = isNew ? [] : driverAlerts(live);
  const truck = idx.trucks[f.truckId];
  const onJob = !isNew && data.loads.some((l) => ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status) && (l.driverId === live.id || (l.teamDriverIds || []).includes(live.id)));
  const tabs = [['profile', 'Profile'], ['score', 'Scorecard'], ['pay', 'Pay'], ['schedule', 'Schedule'], ['timeoff', 'Time off'], ['records', 'Records']];

  return (
    <Sheet title={isNew ? 'New driver' : 'Driver'} onClose={onClose} wide>
      <div className="dsheet">
        <header className="dsheet-head">
          <Avatar user={{ ...live, name: f.name || 'New driver' }} size="lg" />
          <div className="spacer" style={{ minWidth: 0 }}>
            <div className="title2 truncate">{f.name || 'New driver'}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              {!isNew && <span className={`pill ${onJob ? 'blue' : 'green'}`}>{onJob ? 'On a job' : 'Available'}</span>}
              <span className="pill gray">Class {f.licenseClass || '—'}</span>
              {f.licenseExpiry && <span className={`pill ${{ expired: 'red', soon: 'orange', ok: 'green', none: 'gray' }[lic.level]}`}>{lic.text}</span>}
              {truck && <span className="pill gray">Unit {truck.unit}</span>}
              <span className="pill gray">{weeklyHours(f.schedule).toFixed(0)} h / week</span>
            </div>
          </div>
          {!isNew && <div className="row" style={{ gap: 6 }}>
            {live.phone && <a className="btn small" href={`tel:${live.phone}`}><Icon name="phone" size={14} />Call</a>}
            <EmailButton email={live.email} />
          </div>}
        </header>

        {alerts.length > 0 && (
          <div className="alert-card card pad">
            <Icon name="warning" size={18} />
            <div className="spacer">{alerts.map((a) => <div key={a.id} className="subhead"><b>{a.label}</b> — {a.text.toLowerCase()}</div>)}</div>
            <button className="btn small" onClick={() => setTab('records')}>Upload new</button>
          </div>
        )}

        <nav className="dsheet-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} disabled={isNew && (k === 'records' || k === 'score')}>
              {label}{k === 'records' && alerts.length > 0 && <i className="dot-alert" />}
            </button>
          ))}
        </nav>

        <div className="dsheet-body">
          {tab === 'profile' && (
            <div className="stack">
              <label className={`scan-drop ${scan?.state || ''}`}>
                <Icon name="camera" size={22} />
                <div className="spacer">
                  <div className="headline">{scan?.state === 'reading' ? `Reading licence… ${Math.round((scan.progress || 0) * 100)}%` : scan?.state === 'done' ? 'Licence read — check the details below' : scan?.state === 'failed' ? 'Couldn’t read the text here — fill in the details below' : 'Scan driver’s licence'}</div>
                  <div className="footnote secondary">{scan?.state === 'done'
                    ? [scan.result.name && `Name: ${scan.result.name}`, scan.result.licenseNumber && `No. ${scan.result.licenseNumber}`, scan.result.expiry && `Expires ${scan.result.expiry}`].filter(Boolean).join(' · ') || 'Nothing recognised — fill in by hand.'
                    : 'Upload a clear photo of the front. Name, licence number, class and expiry are filled in for you. The photo is saved to their records.'}</div>
                </div>
                {scan?.dataUrl && <img src={scan.dataUrl} alt="Licence" className="scan-thumb" />}
                <input type="file" accept="image/*" capture="environment" onChange={(e) => { onLicence(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <div className="grid grid-2">
                <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} placeholder="First and last name" /></Field>
                <Field label="Email (sign-in)"><input className="input" type="email" value={f.email} onChange={(e) => { setEmailTouched(true); set('email')(e); }} /></Field>
                <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} placeholder="647-555-0100" /></Field>
                <Field label="Assigned truck">
                  <select className="select" value={f.truckId || ''} onChange={set('truckId')}>
                    <option value="">No truck</option>
                    {data.trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit} — {t.make} {t.model}{takenTrucks.has(t.id) ? ' · has a driver' : ''}</option>)}
                  </select>
                </Field>
                <Field label="Licence number"><input className="input mono" value={f.licenseNumber || ''} onChange={set('licenseNumber')} placeholder="A1234-56789-01234" /></Field>
                <div className="grid grid-2" style={{ gap: 12 }}>
                  <Field label="Class"><input className="input" value={f.licenseClass} onChange={set('licenseClass')} /></Field>
                  <Field label="Expiry"><input className="input" type="date" value={f.licenseExpiry} onChange={set('licenseExpiry')} /></Field>
                </div>
              </div>
            </div>
          )}

          {tab === 'pay' && (
            <div className="stack">
              <Segmented block value={f.payType} onChange={(v) => setF((x) => ({ ...x, payType: v }))} options={[{ value: 'hourly', label: 'By the hour' }, { value: 'per_km', label: 'By the kilometre' }]} />
              {f.payType === 'hourly'
                ? <Field label="Hourly rate ($)"><input className="input" type="number" step="0.5" value={f.hourlyRate} onChange={set('hourlyRate')} /></Field>
                : <Field label="Rate per km ($)"><input className="input" type="number" step="0.01" value={f.perKmRate} onChange={set('perKmRate')} /></Field>}
              <div className="footnote secondary">
                {f.payType === 'hourly'
                  ? `About ${money(weeklyHours(f.schedule) * Number(f.hourlyRate || 0))} for a full scheduled week (${weeklyHours(f.schedule).toFixed(0)} h).`
                  : `About ${money(2500 * Number(f.perKmRate || 0))} for a 2,500 km week.`}
              </div>
            </div>
          )}

          {tab === 'schedule' && (
            <div className="stack">
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="footnote secondary" style={{ marginRight: 4 }}>Presets</span>
                {PRESETS.map((p) => <button key={p.label} className="btn small" onClick={() => setF((x) => ({ ...x, schedule: fromPreset(p) }))}>{p.label}</button>)}
              </div>
              <div className="week-table">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const v = f.schedule[d];
                  return (
                    <div key={d} className={`week-row ${v ? '' : 'off'}`}>
                      <div className="week-day">{DAYS[d]}</div>
                      <Switch checked={!!v} onChange={(on) => setDay(d, on ? { start: '07:00', end: '17:00', ...(f.schedule[d] || {}) } : null)} label={`Works ${DAYS[d]}`} />
                      {v ? (
                        <>
                          <input className="input" type="time" value={v.start} onChange={(e) => setDay(d, { ...v, start: e.target.value })} aria-label={`${DAYS[d]} start`} />
                          <span className="secondary">to</span>
                          <input className="input" type="time" value={v.end} onChange={(e) => setDay(d, { ...v, end: e.target.value })} aria-label={`${DAYS[d]} end`} />
                          <span className="week-hours">{shiftHours(v).toFixed(1).replace('.0', '')} h{v && hmLess(v) ? ' (overnight)' : ''}</span>
                          <button className="btn plain small" title="Copy these hours to every working day" onClick={() => setF((x) => ({ ...x, schedule: Object.fromEntries(Object.entries(x.schedule).map(([k, val]) => [k, val ? { ...v } : null])) }))}>Copy to all</button>
                        </>
                      ) : <span className="secondary subhead">Day off</span>}
                    </div>
                  );
                })}
              </div>
              <div className="row between"><span className="footnote secondary">{scheduleText(f.schedule)}</span><span className="headline">{weeklyHours(f.schedule).toFixed(1).replace('.0', '')} h / week</span></div>
            </div>
          )}

          {tab === 'score' && !isNew && <ScorecardView driver={live} />}
          {tab === 'timeoff' && <TimeOff value={f.timeOff || []} onChange={(timeOff) => setF((x) => ({ ...x, timeOff }))} />}

          {tab === 'records' && !isNew && <Documents driver={live} onLicenceExpiry={(t) => setF((x) => ({ ...x, licenseExpiry: toLocalDate(t) }))} />}
        </div>

        <footer className="dsheet-foot">
          {!isNew && (
            <ConfirmButton className="btn danger" confirmLabel="Tap again to delete" disabled={onJob} title={onJob ? 'On a job — replace them on the load first' : undefined}
              onConfirm={async () => { await del(`/drivers/${current.id}`); toast({ title: 'Driver deleted', body: f.name }); onClose(); }}>
              <Icon name="trash" size={14} />Delete
            </ConfirmButton>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{isNew ? 'Cancel' : 'Close'}</button>
          <ActionButton className="btn primary" disabled={!f.name || !f.email || scan?.state === 'reading'} onClick={save}>{isNew ? 'Add driver' : 'Save changes'}</ActionButton>
        </footer>
      </div>
    </Sheet>
  );
}

const hmLess = (v) => v.end <= v.start;

function TimeOff({ value, onChange }) {
  const [off, setOff] = useState({ from: '', to: '', reason: 'Vacation' });
  const sorted = [...value].sort((a, b) => a.from - b.from);
  return (
    <div className="stack">
      {sorted.length === 0 && <div className="subhead secondary">No time off booked.</div>}
      {sorted.map((o) => {
        const past = o.to < Date.now();
        return (
          <div key={o.id || o.from} className="row" style={{ gap: 10, opacity: past ? 0.55 : 1 }}>
            <span className="pill orange">{date(o.from)} – {date(o.to)}</span>
            <span className="subhead spacer">{o.reason || 'Time off'}{past ? ' · past' : ''}</span>
            <span className="footnote secondary">{Math.round((o.to - o.from) / 864e5)} days</span>
            <button className="icon-btn" aria-label="Remove time off" onClick={() => onChange(value.filter((y) => y !== o))}><Icon name="close" size={14} /></button>
          </div>
        );
      })}
      <div className="card pad" style={{ background: 'var(--bg-fill-2)', boxShadow: 'none' }}>
        <div className="grid grid-3" style={{ alignItems: 'end' }}>
          <Field label="From"><input className="input" type="date" value={off.from} onChange={(e) => setOff({ ...off, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={off.to} onChange={(e) => setOff({ ...off, to: e.target.value })} /></Field>
          <Field label="Reason">
            <select className="select" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })}>
              {['Vacation', 'Sick', 'Medical', 'Personal', 'Training', 'Bereavement'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn primary small" style={{ marginTop: 10 }} disabled={!off.from} onClick={() => {
          const from = fromLocalDate(off.from); const to = fromLocalDate(off.to || off.from) + 864e5 - 1;
          onChange([...value, { from, to, reason: off.reason }]); setOff({ from: '', to: '', reason: 'Vacation' });
        }}><Icon name="plus" size={14} stroke={2.4} />Add time off</button>
      </div>
    </div>
  );
}

/** Licence, abstract and other records: upload a photo or PDF, set an expiry, view or remove. */
function Documents({ driver, onLicenceExpiry }) {
  const { toast, upsert } = useStore();
  const [kind, setKind] = useState('abstract');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const docs = useMemo(() => [...(driver.documents || [])].sort((a, b) => b.t - a.t), [driver.documents]);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const isPdf = file.type === 'application/pdf';
      const dataUrl = isPdf
        ? await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); })
        : await compressImage(file, 2000, 0.85);
      let exp = fromLocalDate(expires);
      if (kind === 'licence' && !isPdf && !exp) {
        // Try to read the expiry straight off the licence photo.
        try { const r = await scanLicence(dataUrl); if (r.expiry) { exp = fromLocalDate(r.expiry); onLicenceExpiry(exp); toast({ title: 'Expiry read from licence', body: r.expiry }); } } catch { /* manual */ }
      }
      const u = await post(`/drivers/${driver.id}/documents`, { kind, name: file.name, dataUrl, expires: exp });
      upsert('users', u);
      if (kind === 'licence' && exp) upsert('users', await patch(`/drivers/${driver.id}`, { licenseExpiry: exp }));
      toast({ title: 'Document added', body: file.name });
      setExpires('');
    } catch (e) { toast({ title: 'Upload failed', body: e.message, tone: 'error' }); } finally { setBusy(false); }
  };
  const latest = (k) => docs.find((d) => d.kind === k);
  const Req = ({ k, label }) => {
    const d = latest(k); const e = d ? expiry(k === 'licence' ? driver.licenseExpiry || d.expires : d.expires) : null;
    const tone = !d ? 'red' : { expired: 'red', soon: 'orange', ok: 'green', none: 'green' }[e.level];
    return (
      <div className="req">
        <Icon name={d ? (tone === 'green' ? 'checkCircle' : 'warning') : 'doc'} size={18} style={{ color: `var(--${tone === 'green' ? 'green' : tone === 'orange' ? 'orange' : 'red'})` }} />
        <div className="spacer"><div className="headline">{label}</div><div className="footnote secondary">{d ? (e.level === 'none' ? `On file · ${date(d.t)}` : e.text) : 'Not on file'}</div></div>
        <button className="btn small" onClick={() => setKind(k)}>{d ? 'Replace' : 'Add'}</button>
      </div>
    );
  };
  return (
    <div className="stack">
      <div className="grid grid-3">
        <Req k="licence" label="Driver’s licence" />
        <Req k="abstract" label="Driver abstract" />
        <Req k="medical" label="Medical certificate" />
      </div>
      <div className="card pad" style={{ background: 'var(--bg-fill-2)', boxShadow: 'none' }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <select className="select" style={{ width: 200 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document type">
            <option value="licence">Driver’s licence</option>
            <option value="abstract">Driver abstract</option>
            <option value="medical">Medical certificate</option>
            <option value="other">Other</option>
          </select>
          <input className="input" style={{ width: 170 }} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expiry date" title={kind === 'licence' ? 'Leave empty to read it from the photo' : 'Expiry date (optional)'} />
          <label className="btn primary" style={{ position: 'relative', overflow: 'hidden' }}>
            {busy ? <span className="spinner" /> : <Icon name="plus" size={14} stroke={2.4} />}Upload photo or PDF
            <input type="file" accept="image/*,application/pdf" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
        {kind === 'licence' && <div className="footnote secondary" style={{ marginTop: 6 }}>Leave the date empty and the expiry is read from the licence photo.</div>}
      </div>
      {docs.length > 0 && (
        <div className="list">
          {docs.map((d) => {
            const e = expiry(d.expires);
            return (
              <div key={d.id} className="list-row">
                <Icon name="doc" size={18} />
                <div className="label">
                  <div className="headline">{d.label}</div>
                  <div className="footnote secondary truncate">{d.name} · added {date(d.t)} by {d.by}{d.expires ? ' · ' : ''}{d.expires && <span className={e.level === 'expired' ? 'red' : e.level === 'soon' ? 'orange' : ''}>{e.text}</span>}</div>
                </div>
                <a className="btn small" href={d.url} target="_blank" rel="noreferrer">View</a>
                <ConfirmButton className="btn small danger" confirmLabel="Remove?" aria-label={`Remove ${d.label}`} onConfirm={async () => upsert('users', await del(`/drivers/${driver.id}/documents/${d.id}`))}><Icon name="trash" size={13} /></ConfirmButton>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Compact HOS summary from the ELD: limiting clock + duty status. */
export function HosCell({ h }) {
  if (!h) return <span className="secondary">—</span>;
  const left = hosLeft(h);
  const tone = h.flag === 'violation' ? 'red' : clockTone(left);
  return (
    <div title={`${h.providerName}: drive ${hm(h.driveLeftMin)} · shift ${hm(h.shiftLeftMin)} · cycle ${hm(h.cycleLeftMin)}`}>
      <span className={`pill ${tone}`}><span className="dot" />{h.flag === 'violation' ? 'Violation' : hm(left)}</span>
      <div className="caption secondary" style={{ marginTop: 2 }}>{hosStatus(h).label}</div>
    </div>
  );
}
