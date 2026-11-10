// Photo checklist (driver), signature pad, and pickup-vs-delivery comparison (everyone).
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Lightbox, Sheet } from './ui.jsx';
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

/** Horizontal, swipeable photo strip (3 across) with arrow buttons and a photo-count chip. */
function PhotoStrip({ children, count, onAll }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const update = () => {
    const el = ref.current; if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(() => { update(); const ro = new ResizeObserver(update); if (ref.current) ro.observe(ref.current); return () => ro.disconnect(); }, []);
  const go = (dir) => { const el = ref.current; el?.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' }); };
  return (
    <div className="photo-strip-wrap">
      <div className="photo-strip" ref={ref} onScroll={update}>{children}</div>
      {!edge.start && <button className="photo-arrow left" aria-label="Previous photos" onClick={() => go(-1)}><Icon name="chevronLeft" size={18} /></button>}
      {!edge.end && <button className="photo-arrow right" aria-label="More photos" onClick={() => go(1)}><Icon name="chevron" size={18} /></button>}
      <button className="photo-count" onClick={onAll} aria-label={`See all ${count} photos`}><Icon name="camera" size={16} />{count}</button>
    </div>
  );
}

export function PhotoCompare({ load }) {
  const { data } = useStore();
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const slots = data.meta.photoSlots;
  const order = (xs) => [...xs].sort((x, y) => (x.slot === 'damage') - (y.slot === 'damage') || slots.findIndex((s) => s.key === x.slot) - slots.findIndex((s) => s.key === y.slot));
  const pickup = order(load.photos.pickup); const delivery = order(load.photos.delivery);
  const [view, setView] = useState(delivery.length ? 'delivery' : 'pickup');
  if (!pickup.length && !delivery.length) return <div className="subhead secondary">Photos appear here when the driver inspects the trailer at pickup.</div>;
  const label = (p, phase) => `${p.slot === 'damage' ? 'Damage' : slots.find((s) => s.key === p.slot)?.label || 'Photo'} — ${phase}`;
  const list = view === 'pickup' ? pickup : delivery;
  const total = pickup.length + delivery.length;
  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="segmented" role="tablist">
          <button className={view === 'pickup' ? 'on' : ''} onClick={() => setView('pickup')}>Pickup · {pickup.length}</button>
          <button className={view === 'delivery' ? 'on' : ''} onClick={() => setView('delivery')}>Delivery · {delivery.length}</button>
          <button className={view === 'compare' ? 'on' : ''} onClick={() => setView('compare')}>Compare</button>
        </div>
        {load.damage && (
          <span className={`pill ${load.damage.hasDamage ? 'orange' : 'green'}`}>
            <Icon name={load.damage.hasDamage ? 'warning' : 'shield'} size={13} />{load.damage.hasDamage ? 'Damage reported' : 'No damage at delivery'}
          </span>
        )}
      </div>

      {view !== 'compare' && (list.length === 0
        ? <div className="photo-row-empty">{view === 'delivery' ? 'Delivery photos appear when the driver arrives at the customer.' : 'No pickup photos yet.'}</div>
        : (
          <PhotoStrip key={view} count={total} onAll={() => setAll(true)}>
            {list.map((p) => (
              <button key={p.id} className={`photo-tile ${p.slot === 'damage' ? 'damage' : ''}`} onClick={() => setOpen({ ...p, label: label(p, view === 'pickup' ? 'Pickup' : 'Delivery') })}>
                <img src={p.url} alt={label(p, view)} loading="lazy" draggable={false} />
                <span className="photo-tag">{p.slot === 'damage' ? 'Damage' : slots.find((s) => s.key === p.slot)?.label}</span>
              </button>
            ))}
          </PhotoStrip>
        ))}

      {view === 'compare' && (
        <div className="stack">
          {slots.map((s) => {
            const a = pickup.find((p) => p.slot === s.key); const b = delivery.find((p) => p.slot === s.key);
            if (!a && !b) return null;
            return (
              <div key={s.key}>
                <div className="subhead" style={{ fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                <div className="photo-row two">
                  {[['Pickup', a], ['Delivery', b]].map(([lbl, p]) => (p
                    ? <button key={lbl} className="photo-tile" onClick={() => setOpen({ ...p, label: `${s.label} — ${lbl}` })}><img src={p.url} alt={`${s.label} at ${lbl}`} /><span className="photo-tag">{lbl} · {time(p.t)}</span></button>
                    : <div key={lbl} className="photo-tile empty"><span className="photo-tag">{lbl} · waiting</span></div>))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {load.damage?.hasDamage && load.damage.notes && <div className="footnote orange">{load.damage.notes}</div>}

      {all && (
        <Sheet title={`All photos · ${total}`} onClose={() => setAll(false)} wide>
          {[['Pickup', pickup], ['Delivery', delivery]].filter(([, xs]) => xs.length).map(([phase, xs]) => (
            <div key={phase} style={{ marginBottom: 16 }}>
              <div className="headline" style={{ marginBottom: 8 }}>{phase} · {xs.length}</div>
              <div className="photo-grid">
                {xs.map((p) => (
                  <button key={p.id} className={`photo-tile ${p.slot === 'damage' ? 'damage' : ''}`} onClick={() => setOpen({ ...p, label: label(p, phase) })}>
                    <img src={p.url} alt={label(p, phase)} loading="lazy" /><span className="photo-tag">{p.slot === 'damage' ? 'Damage' : slots.find((s) => s.key === p.slot)?.label} · {time(p.t)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Sheet>
      )}
      <Lightbox photo={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export const deletePhoto = (loadId, photoId) => del(`/loads/${loadId}/photos/${photoId}`);
