import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { initials, placeShort, time, dayLabel } from '../lib/format.js';
import { useStore } from '../lib/store.jsx';
import { go } from '../lib/router.js';

export const STATUS_STYLE = {
  requested: { tone: 'orange', icon: 'search' },
  accepted: { tone: 'indigo', icon: 'person' },
  en_route_pickup: { tone: 'blue', icon: 'truck', live: true },
  at_pickup: { tone: 'blue', icon: 'box' },
  in_transit: { tone: 'blue', icon: 'truck', live: true },
  at_delivery: { tone: 'blue', icon: 'flag' },
  delivered: { tone: 'green', icon: 'checkCircle' },
  cancelled: { tone: 'gray', icon: 'close' },
};
const FLOW = ['requested', 'accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery', 'delivered'];

export function statusLabel(meta, key, short = true) {
  const s = meta?.statuses.find((x) => x.key === key);
  return s ? (short ? s.short : s.label) : key;
}

export function StatusPill({ status, long }) {
  const { data } = useStore();
  const st = STATUS_STYLE[status] || STATUS_STYLE.requested;
  return (
    <span className={`pill ${st.tone} ${st.live ? 'live' : ''}`}>
      <span className="dot" />
      {statusLabel(data?.meta, status, !long)}
    </span>
  );
}

export function Tracker({ status }) {
  const i = FLOW.indexOf(status);
  return (
    <div className={`tracker ${status === 'delivered' ? 'delivered' : ''}`} aria-label={`Step ${i + 1} of ${FLOW.length}`}>
      {FLOW.slice(1).map((s, k) => (
        <div key={s} className={`seg ${k + 1 < i ? 'done' : k + 1 === i ? (status === 'delivered' ? 'done' : 'now') : ''}`} />
      ))}
    </div>
  );
}

export function Avatar({ user, size = '' }) {
  if (!user) return <div className={`avatar ${size}`} style={{ background: 'var(--label-3)' }}>?</div>;
  return <div className={`avatar ${size}`} style={{ background: user.color || 'var(--blue)' }}>{initials(user.name)}</div>;
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export function Segmented({ value, onChange, options, block }) {
  return (
    <div className={`segmented ${block ? 'block' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children, wide, action }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <button className="btn plain" onClick={onClose}>Cancel</button>
          <div className="headline">{title}</div>
          <div style={{ minWidth: 64, textAlign: 'right' }}>{action}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ k, v, d, icon, tone }) {
  return (
    <div className="card stat">
      <div className="k">{icon && <Icon name={icon} size={16} style={{ color: `var(--${tone || 'blue'})` }} />}{k}</div>
      <div className="v">{v}</div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

export function Empty({ icon = 'box', title, children }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={44} stroke={1.4} />
      <div className="headline" style={{ color: 'var(--label)' }}>{title}</div>
      <div className="subhead" style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="large-title">{title}</h1>
        {sub && <div className="sub subhead">{sub}</div>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}

export function RouteLine({ pickup, dropoff, compact, pickupNote, dropoffNote }) {
  return (
    <div className="route-line">
      <div className="dots"><i /><b /><i className="end" /></div>
      <div className="stack" style={{ gap: compact ? 8 : 14 }}>
        <div>
          <div className={compact ? 'headline truncate' : 'headline'}>{compact ? placeShort(pickup) : pickup.name || placeShort(pickup)}</div>
          <div className="footnote secondary truncate">{compact ? pickup.name : `${pickup.address}, ${placeShort(pickup)}`}{pickupNote ? ` · ${pickupNote}` : ''}</div>
        </div>
        <div>
          <div className={compact ? 'headline truncate' : 'headline'}>{compact ? placeShort(dropoff) : dropoff.name || placeShort(dropoff)}</div>
          <div className="footnote secondary truncate">{compact ? dropoff.name : `${dropoff.address}, ${placeShort(dropoff)}`}{dropoffNote ? ` · ${dropoffNote}` : ''}</div>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast glass" onClick={() => { dismiss(t.id); if (t.loadId) go(`/loads/${t.loadId}`); }}>
          <div className="icon-tile" style={{ background: t.tone === 'warn' ? 'var(--orange)' : t.tone === 'error' ? 'var(--red)' : 'var(--blue)' }}>
            <Icon name={t.tone === 'error' || t.tone === 'warn' ? 'warning' : 'bolt'} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="headline">{t.title}</div>
            {t.body && <div className="subhead secondary">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Lightbox({ photo, onClose }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  if (!photo) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <div>
        <img src={photo.url} alt={photo.label || 'Inspection photo'} />
        <div className="meta">
          {photo.label} · {dayLabel(photo.t)} · by {photo.by}
          {photo.lat ? ` · ${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}` : ''}
          {photo.note ? <div>{photo.note}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Async action button that shows progress and reports errors as a toast. */
export function ActionButton({ onClick, children, className = 'btn primary', disabled, ...rest }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useStore();
  return (
    <button {...rest} className={className} disabled={disabled || busy} onClick={async (e) => {
      setBusy(true);
      try { await onClick(e); } catch (err) { toast({ title: 'Couldn’t do that', body: err.message, tone: 'error' }); } finally { setBusy(false); }
    }}>
      {busy ? <span className="spinner" aria-label="Working" /> : null}
      {children}
    </button>
  );
}

/** Two-tap confirmation in the page itself (browser confirm dialogs are blocked in some frames). */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Tap again to confirm', className = 'btn danger', ...rest }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <ActionButton {...rest} className={className} onClick={async (e) => {
      if (!armed) { setArmed(true); return; }
      setArmed(false);
      await onConfirm(e);
    }}>
      {armed ? confirmLabel : children}
    </ActionButton>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="caption tertiary">{hint}</span>}
    </label>
  );
}

export const timeOnly = time;
