// Photo checklist (driver), signature pad, and pickup-vs-delivery comparison (everyone).
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Lightbox } from './ui.jsx';
import { post, del } from '../lib/api.js';
import { compressImage, currentPosition } from '../lib/image.js';
import { useStore } from '../lib/store.jsx';
import { time } from '../lib/format.js';

export function PhotoChecklist({ load, phase }) {
  const { data, toast, upsert } = useStore();
  const slots = data.meta.photoSlots;
  const photos = load.photos[phase];
  const [busy, setBusy] = useState(null);
  const done = slots.filter((s) => s.required && photos.some((p) => p.slot === s.key)).length;
  const need = slots.filter((s) => s.required).length;

  async function upload(slot, file, note) {
    if (!file) return;
    setBusy(slot);
    try {
      const [dataUrl, pos] = await Promise.all([compressImage(file), currentPosition()]);
      await post(`/loads/${load.id}/photos`, { phase, slot, dataUrl, lat: pos?.lat ?? load[phase === 'pickup' ? 'pickup' : 'dropoff'].lat, lng: pos?.lng ?? load[phase === 'pickup' ? 'pickup' : 'dropoff'].lng, note });
    } catch (e) {
      toast({ title: 'Photo not saved', body: e.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <div className="headline">{done} of {need} photos taken</div>
        {done === need && <span className="pill green"><Icon name="check" size={14} />All done</span>}
      </div>
      <div className={`progress ${done === need ? 'green' : ''}`}><div style={{ width: `${(done / need) * 100}%` }} /></div>
      <div className="photo-grid">
        {slots.map((s, i) => {
          const p = photos.find((x) => x.slot === s.key);
          return (
            <div key={s.key} className={`photo-slot ${p ? '' : 'empty'}`} title={s.hint}>
              {p ? (
                <>
                  <img src={p.url} alt={s.label} />
                  <div className="check"><Icon name="check" size={14} stroke={3} /></div>
                  <div className="cap">{s.label} · {time(p.t)} · Retake</div>
                </>
              ) : busy === s.key ? (
                <span className="spinner" />
              ) : (
                <>
                  <Icon name="camera" size={30} />
                  <div className="slot-label">{i + 1}. {s.label}</div>
                  <div className="caption secondary" style={{ padding: '0 10px' }}>{s.required ? s.hint : 'Optional'}</div>
                </>
              )}
              <input type="file" accept="image/*" capture="environment" aria-label={`Take photo: ${s.label}`}
                onChange={(e) => { upload(s.key, e.target.files[0]); e.target.value = ''; }} />
            </div>
          );
        })}
      </div>
      {phase === 'delivery' && <DamageReport load={load} onPhoto={(f, note) => upload('damage', f, note)} busy={busy === 'damage'} upsert={upsert} />}
    </div>
  );
}

function DamageReport({ load, onPhoto, busy }) {
  const { toast } = useStore();
  const [notes, setNotes] = useState(load.damage?.notes || '');
  const has = load.damage?.hasDamage;
  const damagePhotos = load.photos.delivery.filter((p) => p.slot === 'damage');
  const set = async (hasDamage) => {
    try { await post(`/loads/${load.id}/damage`, { hasDamage, notes }); } catch (e) { toast({ title: 'Not saved', body: e.message, tone: 'error' }); }
  };
  return (
    <div className="card pad stack" style={{ marginTop: 8 }}>
      <div className="headline">Is anything damaged?</div>
      <div className="grid grid-2">
        <button className={`chip ${load.damage && !has ? 'on' : ''}`} onClick={() => set(false)}>
          <Icon name="checkCircle" size={26} style={{ color: 'var(--green)' }} />
          <span className="chip-title">No, everything is fine</span>
        </button>
        <button className={`chip ${has ? 'on' : ''}`} onClick={() => set(true)}>
          <Icon name="warning" size={26} style={{ color: 'var(--orange)' }} />
          <span className="chip-title">Yes, there is damage</span>
        </button>
      </div>
      {has && (
        <>
          <textarea className="textarea" placeholder="Describe the damage (what, where, how bad)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => set(true)} />
          <div className="photo-grid">
            {damagePhotos.map((p) => (
              <div key={p.id} className="photo-slot"><img src={p.url} alt="Damage" /><div className="cap">Damage · {time(p.t)}</div></div>
            ))}
            <div className="photo-slot empty">
              {busy ? <span className="spinner" /> : <><Icon name="camera" size={28} /><div className="slot-label">Add damage photo</div></>}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => { onPhoto(e.target.files[0], notes); e.target.value = ''; }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function SignaturePad({ load }) {
  const { toast } = useStore();
  const canvas = useRef(null);
  const [name, setName] = useState(load.signature?.name || load.dropoff.contact || '');
  const [drawn, setDrawn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--label').trim() || '#000';
    let drawing = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e) => { drawing = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
    const move = (e) => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); setDrawn(true); };
    const up = () => { drawing = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); };
  }, [load.signature]);

  const clear = () => { const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setDrawn(false); };
  const save = async () => {
    setSaving(true);
    try {
      // Export on white so the signature reads on the printed POD in any theme.
      const c = canvas.current;
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      const o = out.getContext('2d');
      o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
      o.filter = 'brightness(0)';
      o.drawImage(c, 0, 0);
      await post(`/loads/${load.id}/signature`, { name, dataUrl: out.toDataURL('image/png') });
    } catch (e) { toast({ title: 'Signature not saved', body: e.message, tone: 'error' }); } finally { setSaving(false); }
  };

  if (load.signature) {
    return (
      <div className="card pad row">
        <Icon name="checkCircle" size={28} style={{ color: 'var(--green)' }} />
        <div className="spacer">
          <div className="headline">Signed by {load.signature.name}</div>
          <div className="footnote secondary">{time(load.signature.t)}</div>
        </div>
        {load.signature.url && <img src={load.signature.url} alt="Signature" style={{ height: 48, borderRadius: 6, background: '#fff' }} />}
      </div>
    );
  }
  return (
    <div className="stack">
      <input className="input" placeholder="Receiver’s full name" value={name} onChange={(e) => setName(e.target.value)} />
      <canvas ref={canvas} className="signature" aria-label="Sign here" />
      <div className="row">
        <button className="btn" onClick={clear}>Clear</button>
        <button className="btn primary spacer" disabled={!drawn || !name || saving} onClick={save}>{saving ? 'Saving…' : 'Save signature'}</button>
      </div>
    </div>
  );
}

export function PhotoCompare({ load }) {
  const { data } = useStore();
  const [open, setOpen] = useState(null);
  const slots = data.meta.photoSlots;
  const any = load.photos.pickup.length || load.photos.delivery.length;
  if (!any) return <div className="subhead secondary">Photos appear here when the driver inspects the trailer at pickup.</div>;
  const damage = load.photos.delivery.filter((p) => p.slot === 'damage');
  return (
    <div className="stack">
      {load.damage && (
        <div className={`pill ${load.damage.hasDamage ? 'orange' : 'green'}`} style={{ alignSelf: 'flex-start', padding: '6px 12px' }}>
          <Icon name={load.damage.hasDamage ? 'warning' : 'shield'} size={15} />
          {load.damage.hasDamage ? `Damage reported: ${load.damage.notes || 'see photos'}` : 'No damage reported at delivery'}
        </div>
      )}
      {slots.map((s) => {
        const a = load.photos.pickup.find((p) => p.slot === s.key);
        const b = load.photos.delivery.find((p) => p.slot === s.key);
        if (!a && !b) return null;
        return (
          <div key={s.key}>
            <div className="subhead" style={{ fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
            <div className="compare">
              {[['Pickup', a], ['Delivery', b]].map(([lbl, p]) => (
                <figure key={lbl}>
                  {p ? <img src={p.url} alt={`${s.label} at ${lbl}`} onClick={() => setOpen({ ...p, label: `${s.label} — ${lbl}` })} />
                    : <div className="skeleton" style={{ aspectRatio: '4/3', animation: 'none' }} />}
                  <figcaption>{lbl}{p ? ` · ${time(p.t)}` : ' · waiting'}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        );
      })}
      {damage.length > 0 && (
        <div>
          <div className="subhead orange" style={{ fontWeight: 600, marginBottom: 6 }}>Damage close-ups</div>
          <div className="compare">{damage.map((p) => <figure key={p.id}><img src={p.url} alt="Damage" onClick={() => setOpen({ ...p, label: 'Damage' })} /><figcaption>{time(p.t)}</figcaption></figure>)}</div>
        </div>
      )}
      <Lightbox photo={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export const deletePhoto = (loadId, photoId) => del(`/loads/${loadId}/photos/${photoId}`);
