// Daily vehicle inspection: the driver's checklist form, the signed report, and shop work orders.
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Sheet, Lightbox, Segmented, Field } from './ui.jsx';
import { post } from '../lib/api.js';
import { compressImage } from '../lib/image.js';
import { useStore } from '../lib/store.jsx';
import { dateTime, time, num, money2 } from '../lib/format.js';
import { validPreTrip, repairsToConfirm, RESULT, WO_STATUS, typeLabel, validMs } from '../lib/inspections.js';

/* ------------------------------ signature ------------------------------ */

function SignatureBox({ onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let drawing = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const out = () => {
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0);
      onChange(o.toDataURL('image/png'));
    };
    const down = (e) => { drawing = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
    const move = (e) => { if (drawing) { ctx.lineTo(...pos(e)); ctx.stroke(); } };
    const up = () => { if (drawing) { drawing = false; out(); } };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); };
  }, [onChange]);
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); onChange(null); };
  return (
    <div className="stack-sm">
      <canvas ref={ref} className="signature insp-sign" aria-label="Sign here" />
      <div className="row between"><span className="caption tertiary">Sign with your finger</span><button className="btn small" onClick={clear}>Clear</button></div>
    </div>
  );
}

/* ------------------------------ defect sheet ------------------------------ */

function DefectSheet({ item, unit, unitLabel, value, onSave, onClose }) {
  const options = [...item.minor.map((d) => ({ d, s: 'minor' })), ...item.major.map((d) => ({ d, s: 'major' }))];
  const [pick, setPick] = useState(value ? `${value.severity}|${value.defect}` : '');
  const [other, setOther] = useState(value && !options.some((o) => o.d === value.defect) ? value.defect : '');
  const [otherSev, setOtherSev] = useState(value?.severity || 'minor');
  const [note, setNote] = useState(value?.note || '');
  const [photo, setPhoto] = useState(value?.photo || null);
  const [busy, setBusy] = useState(false);
  const isOther = pick === 'other';
  const [sev, defect] = isOther ? [otherSev, other.trim()] : pick.split('|');
  const ok = pick && defect && photo;
  return (
    <Sheet title={`${item.label} · ${unitLabel}`} onClose={onClose} action={<button className="btn plain" style={{ fontWeight: 600 }} disabled={!ok} onClick={() => onSave({ item: item.key, unit, label: item.label, severity: sev, defect, note, photo })}>Save</button>}>
      <div className="stack">
        <div className="subhead secondary">What’s wrong?</div>
        <div className="list">
          {options.map((o) => (
            <button key={o.d} className={`list-row insp-opt ${pick === `${o.s}|${o.d}` ? 'on' : ''}`} onClick={() => setPick(`${o.s}|${o.d}`)}>
              <span className="radio" />
              <span className="label">{o.d}</span>
              <span className={`pill ${o.s === 'major' ? 'red' : 'orange'}`}>{o.s === 'major' ? 'Major' : 'Minor'}</span>
            </button>
          ))}
          <button className={`list-row insp-opt ${isOther ? 'on' : ''}`} onClick={() => setPick('other')}><span className="radio" /><span className="label">Something else</span></button>
        </div>
        {isOther && (
          <div className="stack-sm">
            <input className="input" placeholder="Describe the defect" value={other} onChange={(e) => setOther(e.target.value)} />
            <Segmented block value={otherSev} onChange={setOtherSev} options={[{ value: 'minor', label: 'Minor — can drive' }, { value: 'major', label: 'Major — do not drive' }]} />
          </div>
        )}
        {sev === 'major' && pick && <div className="insp-warn red"><Icon name="warning" size={16} />Major defect: the truck can’t be driven until the shop repairs it.</div>}
        {sev === 'minor' && pick && <div className="insp-warn orange"><Icon name="wrench" size={16} />Minor defect: you can drive. The shop has to fix it before your next inspection is due.</div>}
        <Field label="Note (where, how bad)"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Left steer tire, cut in sidewall" /></Field>
        <div className={`photo-slot insp-photo ${photo ? '' : 'empty'}`}>
          {photo ? <><img src={photo} alt="Defect" /><div className="cap">Defect photo · Retake</div></> : busy ? <span className="spinner" /> : <><Icon name="camera" size={28} /><div className="slot-label">Photo of the defect</div><div className="caption secondary">Required</div></>}
          <input type="file" accept="image/*" capture="environment" aria-label="Photo of the defect" onChange={async (e) => { const f = e.target.files[0]; if (!f) return; setBusy(true); try { setPhoto(await compressImage(f, 1400, 0.75)); } finally { setBusy(false); e.target.value = ''; } }} />
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ driver form ------------------------------ */

export function InspectionForm({ truck, trailerId: trailer0, defaultType, onDone }) {
  const { data, toast, upsert } = useStore();
  const items = data.meta.inspection.items;
  const walk = data.meta.inspection.walkaround;
  const [type, setType] = useState(defaultType || 'pre');
  const [trailerId, setTrailerId] = useState(trailer0 || '');
  const [odo, setOdo] = useState(String(Math.round(truck.odometerKm || 0)));
  const [marks, setMarks] = useState({}); // "unit:item" → 'ok' | defect
  const [photos, setPhotos] = useState({});
  const [busyPhoto, setBusyPhoto] = useState(null);
  const [editing, setEditing] = useState(null);
  const [acks, setAcks] = useState({});
  const [sig, setSig] = useState(null);
  const [saving, setSaving] = useState(false);
  const trailer = data.trailers.find((t) => t.id === trailerId);
  const units = [{ unit: 'truck', title: `Truck · Unit ${truck.unit}` }, ...(trailer ? [{ unit: 'trailer', title: `Trailer · ${trailer.unit}` }] : [])];
  const rows = units.flatMap((u) => items.filter((i) => i.on.includes(u.unit)).map((i) => ({ ...u, item: i, k: `${u.unit}:${i.key}` })));
  const done = rows.filter((r) => marks[r.k]).length;
  const defects = rows.map((r) => marks[r.k]).filter((m) => m && m !== 'ok');
  const repairs = repairsToConfirm(data, truck.id, trailerId);
  const needPhotos = type === 'pre';
  const missing = done < rows.length ? `Check ${rows.length - done} more item${rows.length - done === 1 ? '' : 's'}`
    : needPhotos && walk.some((w) => !photos[w.key]) ? 'Take the walk-around photos'
      : repairs.some((r) => !acks[r.id]) ? 'Confirm the repairs above'
        : !sig ? 'Sign the report' : null;

  const setAll = (unit) => setMarks((m) => { const n = { ...m }; rows.filter((r) => r.unit === unit && !n[r.k]).forEach((r) => { n[r.k] = 'ok'; }); return n; });
  const takeWalk = async (key, file) => { if (!file) return; setBusyPhoto(key); try { const url = await compressImage(file, 1400, 0.72); setPhotos((p) => ({ ...p, [key]: url })); } finally { setBusyPhoto(null); } };

  const submit = async () => {
    setSaving(true);
    try {
      const r = await post('/inspections', {
        type, trailerId: trailerId || null, odometerKm: Number(odo) || undefined,
        defects: defects.map((d) => ({ item: d.item, unit: d.unit, severity: d.severity, defect: d.defect, note: d.note, photo: d.photo })),
        photos: Object.entries(photos).map(([slot, dataUrl]) => ({ slot, dataUrl })),
        signature: { name: data.me.name, dataUrl: sig }, ackWorkOrderIds: repairs.map((x) => x.id),
      });
      upsert('inspections', r);
      onDone?.(r);
    } catch (e) { toast({ title: 'Inspection not saved', body: e.message, tone: 'error' }); } finally { setSaving(false); }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card pad stack">
        <Segmented block value={type} onChange={setType} options={[{ value: 'pre', label: 'Pre-trip' }, { value: 'post', label: 'Post-trip' }]} />
        <div className="insp-vehicle">
          <Field label="Truck"><div className="input static">Unit {truck.unit} · {truck.make} {truck.model}</div></Field>
          <Field label="Trailer">
            <select className="input" value={trailerId} onChange={(e) => { setTrailerId(e.target.value); setMarks((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('trailer:')))); }}>
              <option value="">No trailer (bobtail)</option>
              {data.trailers.map((t) => <option key={t.id} value={t.id}>{t.unit} · {t.lengthFt} ft {t.make}{t.outOfService ? ' · out of service' : ''}</option>)}
            </select>
          </Field>
          <Field label="Odometer (km)"><input className="input num" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
      </div>

      {repairs.length > 0 && (
        <div className="card pad stack">
          <div className="headline"><Icon name="wrench" size={16} style={{ color: 'var(--green)', marginRight: 6 }} />Repairs since your last inspection</div>
          <div className="footnote secondary">Check each repair, then confirm it.</div>
          {repairs.map((w) => (
            <label key={w.id} className="insp-ack">
              <input type="checkbox" checked={!!acks[w.id]} onChange={(e) => setAcks((a) => ({ ...a, [w.id]: e.target.checked }))} />
              <div><div className="subhead" style={{ fontWeight: 600 }}>{w.number} · {w.defects.map((d) => d.defect).join(', ')}</div><div className="footnote secondary">{w.repairNote} · {w.mechanic} · {dateTime(w.repairedAt)}</div></div>
            </label>
          ))}
        </div>
      )}

      {units.map((u) => {
        const list = rows.filter((r) => r.unit === u.unit);
        const left = list.filter((r) => !marks[r.k]).length;
        return (
          <div key={u.unit}>
            <div className="section-header row between" style={{ alignItems: 'center' }}>
              <span>{u.title}</span>
              {left > 0 ? <button className="btn small" onClick={() => setAll(u.unit)}><Icon name="check" size={14} stroke={2.6} />Rest are OK ({left})</button> : <span className="pill green"><Icon name="check" size={12} stroke={3} />All checked</span>}
            </div>
            <div className="list">
              {list.map((r) => {
                const m = marks[r.k];
                const def = m && m !== 'ok' ? m : null;
                return (
                  <div key={r.k} className={`list-row insp-row ${def ? def.severity : ''}`}>
                    <div className="label">
                      <div className="subhead" style={{ fontWeight: 500 }}>{r.item.label}</div>
                      {def && <button className="insp-def" onClick={() => setEditing(r)}>{def.photo && <img src={def.photo} alt="" />}<span><b>{def.severity === 'major' ? 'Major' : 'Minor'}:</b> {def.defect}{def.note ? ` — ${def.note}` : ''}</span></button>}
                    </div>
                    <div className="insp-toggle" role="group" aria-label={r.item.label}>
                      <button className={m === 'ok' ? 'on ok' : ''} aria-pressed={m === 'ok'} onClick={() => setMarks((x) => ({ ...x, [r.k]: 'ok' }))}><Icon name="check" size={15} stroke={2.6} />OK</button>
                      <button className={def ? `on ${def.severity}` : ''} aria-pressed={!!def} onClick={() => setEditing(r)}><Icon name="warning" size={15} />Defect</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div>
        <div className="section-header">Walk-around photos {needPhotos ? '' : <span className="tertiary" style={{ fontWeight: 400 }}>· optional on post-trip</span>}</div>
        <div className="photo-grid insp-walk">
          {walk.map((w) => (
            <div key={w.key} className={`photo-slot ${photos[w.key] ? '' : 'empty'}`}>
              {photos[w.key] ? <><img src={photos[w.key]} alt={w.label} /><div className="check"><Icon name="check" size={14} stroke={3} /></div><div className="cap">{w.label} · Retake</div></>
                : busyPhoto === w.key ? <span className="spinner" /> : <><Icon name="camera" size={26} /><div className="slot-label">{w.label}</div></>}
              <input type="file" accept="image/*" capture="environment" aria-label={`Photo: ${w.label}`} onChange={(e) => { takeWalk(w.key, e.target.files[0]); e.target.value = ''; }} />
            </div>
          ))}
        </div>
      </div>

      <div className="card pad stack">
        <div className="headline">Sign the report</div>
        <div className="footnote secondary">I, {data.me.name}, inspected this vehicle as required (NSC Standard 13 Schedule 1 / FMCSA 396) and the defects listed are all I found.</div>
        <SignatureBox onChange={setSig} />
      </div>

      <div className="insp-submit">
        <div className="row between footnote secondary" style={{ marginBottom: 8 }}>
          <span>{done}/{rows.length} checked · {defects.length} defect{defects.length === 1 ? '' : 's'}</span>
          {defects.some((d) => d.severity === 'major') && <span className="pill red">Truck goes out of service</span>}
        </div>
        <button className={`btn xl ${defects.length ? 'primary' : 'green'}`} disabled={!!missing || saving} onClick={submit}>
          <Icon name={missing ? 'shield' : 'checkCircle'} size={22} />{saving ? 'Saving…' : missing || (defects.length ? 'Submit — send defects to the shop' : `Submit ${typeLabel(type).toLowerCase()} — no defects`)}
        </button>
      </div>

      {editing && (
        <DefectSheet item={editing.item} unit={editing.unit} unitLabel={editing.unit === 'truck' ? `Unit ${truck.unit}` : trailer?.unit}
          value={marks[editing.k] && marks[editing.k] !== 'ok' ? marks[editing.k] : null}
          onClose={() => setEditing(null)}
          onSave={(d) => { setMarks((x) => ({ ...x, [editing.k]: d })); setEditing(null); }} />
      )}
    </div>
  );
}

/* ------------------------------ status card ------------------------------ */

export function PreTripStatus({ truck, compact, onStart }) {
  const { data } = useStore();
  const pre = validPreTrip(data, truck.id);
  if (truck.outOfService) {
    const wo = data.workOrders?.find((w) => w.id === truck.outOfService.workOrderId);
    return (
      <div className="insp-status red">
        <Icon name="warning" size={22} />
        <div className="spacer"><div className="headline">Unit {truck.unit} is out of service</div><div className="footnote">{truck.outOfService.reason}{wo ? ` · ${wo.number} · ${WO_STATUS[wo.status].label}` : ''}. Don’t drive it until the shop signs it off.</div></div>
      </div>
    );
  }
  if (pre) {
    return (
      <div className="insp-status green">
        <Icon name="checkCircle" size={22} />
        <div className="spacer"><div className="headline">Pre-trip done {time(pre.at)}</div><div className="footnote">Valid until {dateTime(pre.at + validMs(data))}{pre.defects.length ? ` · ${pre.defects.length} minor defect${pre.defects.length === 1 ? '' : 's'} reported` : ''}</div></div>
        {!compact && onStart && <button className="btn small" onClick={onStart}>Post-trip</button>}
      </div>
    );
  }
  return (
    <div className="insp-status orange">
      <Icon name="shield" size={22} />
      <div className="spacer"><div className="headline">Pre-trip inspection due</div><div className="footnote">Required before you drive Unit {truck.unit}. Takes about 5 minutes.</div></div>
      {onStart && <button className="btn small primary" onClick={onStart}>Start</button>}
    </div>
  );
}

/* ------------------------------ report ------------------------------ */

function printSheet() {
  document.body.classList.add('printing-sheet');
  const off = () => { document.body.classList.remove('printing-sheet'); window.removeEventListener('afterprint', off); };
  window.addEventListener('afterprint', off);
  setTimeout(() => window.print(), 50);
}

export function InspectionReport({ insp, onClose }) {
  const { data } = useStore();
  const [open, setOpen] = useState(null);
  const truck = data.trucks.find((t) => t.id === insp.truckId);
  const trailer = data.trailers.find((t) => t.id === insp.trailerId);
  const company = data.me.company;
  const r = RESULT[insp.result];
  const items = data.meta.inspection.items;
  const units = ['truck', ...(insp.trailerId ? ['trailer'] : [])];
  const wos = (data.workOrders || []).filter((w) => insp.workOrderIds?.includes(w.id));
  const acked = (data.workOrders || []).filter((w) => insp.ackWorkOrderIds?.includes(w.id));
  return (
    <Sheet title={`${typeLabel(insp.type)} inspection`} onClose={onClose} wide action={<button className="btn small" onClick={printSheet}><Icon name="print" size={15} />Print</button>}>
      <div className="stack insp-report">
        <div className="row between wrap" style={{ gap: 8 }}>
          <div>
            <div className="title3">{typeLabel(insp.type)} inspection report</div>
            <div className="footnote secondary">{company?.name}{company?.nsc ? ` · NSC ${company.nsc}` : ''}{company?.usdot ? ` · USDOT ${company.usdot}` : ''}</div>
          </div>
          <span className={`pill ${r.tone}`}><Icon name={r.icon} size={13} />{r.label}</span>
        </div>
        <div className="insp-facts">
          <div><span>Date & time</span><b>{dateTime(insp.at)}</b></div>
          <div><span>Driver</span><b>{insp.driverName}</b></div>
          <div><span>Truck</span><b>Unit {truck?.unit} · {truck?.plate}</b></div>
          <div><span>Trailer</span><b>{trailer ? `${trailer.unit} · ${trailer.plate}` : 'None'}</b></div>
          <div><span>Odometer</span><b className="num">{num(insp.odometerKm)} km</b></div>
          <div><span>Items checked</span><b>{insp.checked}</b></div>
        </div>

        {insp.defects.length > 0 && (
          <div className="stack-sm">
            <div className="headline">Defects</div>
            {insp.defects.map((d) => (
              <div key={d.id} className={`insp-defect ${d.severity}`}>
                {d.photo && <button className="thumb" onClick={() => setOpen({ url: d.photo, label: `${d.label} — ${d.defect}`, t: insp.at, by: insp.driverName })}><img src={d.photo} alt="" /></button>}
                <div className="spacer">
                  <div className="subhead" style={{ fontWeight: 600 }}>{d.label} <span className="tertiary" style={{ fontWeight: 400 }}>· {d.unit === 'truck' ? `Unit ${truck?.unit}` : `Trailer ${trailer?.unit}`}</span></div>
                  <div className="footnote">{d.defect}{d.note ? ` — ${d.note}` : ''}</div>
                </div>
                <span className={`pill ${d.severity === 'major' ? 'red' : 'orange'}`}>{d.severity === 'major' ? 'Major' : 'Minor'}</span>
              </div>
            ))}
            {wos.map((w) => <div key={w.id} className="footnote secondary">Work order {w.number} · {WO_STATUS[w.status].label}{w.repairedAt ? ` ${dateTime(w.repairedAt)} — ${w.repairNote}` : ''}</div>)}
          </div>
        )}

        <div className="stack-sm">
          <div className="headline">Checklist</div>
          {units.map((u) => (
            <div key={u} className="insp-checks">
              <div className="caption secondary" style={{ gridColumn: '1 / -1' }}>{u === 'truck' ? `Truck · Unit ${truck?.unit}` : `Trailer · ${trailer?.unit}`}</div>
              {items.filter((i) => i.on.includes(u)).map((i) => {
                const d = insp.defects.find((x) => x.item === i.key && x.unit === u);
                return <div key={i.key} className={d ? d.severity : 'ok'}><Icon name={d ? 'warning' : 'check'} size={13} stroke={2.4} />{i.label}</div>;
              })}
            </div>
          ))}
        </div>

        {insp.photos?.length > 0 && (
          <div className="stack-sm">
            <div className="headline">Walk-around photos</div>
            <div className="photo-row insp-photos">
              {insp.photos.map((p) => <button key={p.slot} className="photo-tile" onClick={() => setOpen({ url: p.url, label: data.meta.inspection.walkaround.find((w) => w.key === p.slot)?.label, t: insp.at, by: insp.driverName })}><img src={p.url} alt={p.slot} /><span className="photo-tag" style={{ opacity: 1 }}>{data.meta.inspection.walkaround.find((w) => w.key === p.slot)?.label}</span></button>)}
            </div>
          </div>
        )}

        {acked.length > 0 && <div className="footnote secondary">Driver confirmed repairs: {acked.map((w) => `${w.number} (${w.repairNote})`).join('; ')}</div>}

        <div className="insp-sig">
          {insp.signature?.url && <img src={insp.signature.url} alt="Signature" />}
          <div className="footnote secondary">Signed by {insp.signature?.name} · {dateTime(insp.signature?.t || insp.at)}<br />Certified: vehicle inspected as required by NSC Standard 13 Schedule 1 / FMCSA 396.11.</div>
        </div>
      </div>
      {open && <Lightbox photo={open} onClose={() => setOpen(null)} />}
    </Sheet>
  );
}

/* ------------------------------ lists ------------------------------ */

export function InspectionRow({ insp, onOpen, showDriver }) {
  const { data } = useStore();
  const truck = data.trucks.find((t) => t.id === insp.truckId);
  const r = RESULT[insp.result];
  return (
    <button className="list-row" onClick={() => onOpen(insp)}>
      <div className="icon-tile" style={{ background: `var(--${r.tone})` }}><Icon name={insp.result === 'ok' ? 'check' : 'warning'} size={15} stroke={2.4} /></div>
      <div className="label">
        <div className="subhead" style={{ fontWeight: 600 }}>{typeLabel(insp.type)} · Unit {truck?.unit}{showDriver ? ` · ${insp.driverName}` : ''}</div>
        <div className="footnote secondary">{dateTime(insp.at)} · {insp.result === 'ok' ? 'No defects' : `${insp.defects.length} defect${insp.defects.length === 1 ? '' : 's'}`}</div>
      </div>
      <Icon name="chevron" size={14} className="tertiary" />
    </button>
  );
}

/* ------------------------------ work orders ------------------------------ */

export function WorkOrderSheet({ wo, onClose }) {
  const { data, toast, upsert } = useStore();
  const [mechanic, setMechanic] = useState(wo.mechanic || '');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [open, setOpen] = useState(null);
  const [report, setReport] = useState(null);
  const insp = data.inspections.find((x) => x.id === wo.inspectionId);
  const act = async (action, extra = {}) => {
    try { upsert('workOrders', await post(`/work-orders/${wo.id}`, { action, mechanic, ...extra })); if (action === 'repaired') { toast({ title: `${wo.number} closed`, body: `${wo.unitLabel} repaired. The driver confirms it on the next inspection.`, tone: 'ok' }); onClose(); } }
    catch (e) { toast({ title: 'Not saved', body: e.message, tone: 'error' }); }
  };
  const st = WO_STATUS[wo.status];
  return (
    <Sheet title={`${wo.number} · ${wo.unitLabel}`} onClose={onClose} wide>
      <div className="stack">
        <div className="row between wrap" style={{ gap: 8 }}>
          <div>
            <div className="title3">{wo.unitLabel}</div>
            <div className="footnote secondary">Reported by {wo.reportedBy} · {dateTime(wo.reportedAt)}{insp ? ` · ${typeLabel(insp.type)}` : ''}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {wo.severity === 'major' && wo.status !== 'repaired' && <span className="pill red">Out of service</span>}
            <span className={`pill ${st.tone}`}>{st.label}</span>
          </div>
        </div>
        {wo.defects.map((d) => (
          <div key={d.id} className={`insp-defect ${d.severity}`}>
            {d.photo && <button className="thumb" onClick={() => setOpen({ url: d.photo, label: `${d.label} — ${d.defect}`, t: wo.reportedAt, by: wo.reportedBy })}><img src={d.photo} alt="" /></button>}
            <div className="spacer"><div className="subhead" style={{ fontWeight: 600 }}>{d.label}</div><div className="footnote">{d.defect}{d.note ? ` — ${d.note}` : ''}</div></div>
            <span className={`pill ${d.severity === 'major' ? 'red' : 'orange'}`}>{d.severity === 'major' ? 'Major' : 'Minor'}</span>
          </div>
        ))}
        {insp && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setReport(insp)}><Icon name="doc" size={15} />Open the inspection report</button>}

        {wo.status === 'repaired' ? (
          <div className="card pad stack-sm">
            <div className="headline" style={{ color: 'var(--green-text)' }}><Icon name="checkCircle" size={16} /> Repaired {dateTime(wo.repairedAt)}</div>
            <div className="subhead">{wo.repairNote}</div>
            <div className="footnote secondary">By {wo.mechanic}{wo.cost ? ` · ${money2(wo.cost)}` : ''} · {wo.ackAt ? `Driver ${wo.ackBy} confirmed ${dateTime(wo.ackAt)}` : 'Waiting for the driver to confirm on the next inspection'}</div>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => act('reopen')}>Reopen</button>
          </div>
        ) : (
          <div className="card pad stack">
            <Field label="Mechanic or shop"><input className="input" value={mechanic} onChange={(e) => setMechanic(e.target.value)} placeholder="e.g. In-house — Dave, or Brampton Truck Centre" /></Field>
            {wo.status === 'open' && <button className="btn" onClick={() => act('start')}><Icon name="wrench" size={15} />Start repair</button>}
            <Field label="What was repaired"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Adjusted slack adjusters, stroke now 1.75 in" /></Field>
            <Field label="Cost (optional)"><input className="input num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" /></Field>
            <button className="btn green" disabled={!note.trim() || !mechanic.trim()} onClick={() => act('repaired', { note, cost })}><Icon name="checkCircle" size={16} />Mark repaired{wo.severity === 'major' ? ' — back in service' : ''}</button>
          </div>
        )}

        <div className="stack-sm">
          <div className="headline">History</div>
          {wo.history.slice().reverse().map((h, i) => <div key={i} className="footnote"><span className="secondary">{dateTime(h.t)} · {h.by}</span> — {h.text}</div>)}
        </div>
      </div>
      {open && <Lightbox photo={open} onClose={() => setOpen(null)} />}
      {report && <InspectionReport insp={report} onClose={() => setReport(null)} />}
    </Sheet>
  );
}

export function useInspectionStats() {
  const { data } = useStore();
  return useMemo(() => {
    const ins = data.inspections || [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return { today: ins.filter((x) => x.at >= today.getTime()) };
  }, [data.inspections]);
}
