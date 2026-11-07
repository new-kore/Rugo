// Dense, grouped load list: status groups with counts, one-line rows (priority · ref · status · title · tag · date · people).
import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Avatar } from './ui.jsx';
import { useStore, useIndex } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { placeShort, time, date } from '../lib/format.js';

const FLOW = ['requested', 'accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery', 'delivered'];
const STATUS_COLOR = {
  requested: 'var(--label-3)', accepted: 'var(--label-2)', en_route_pickup: 'var(--yellow)', at_pickup: 'var(--yellow)',
  in_transit: 'var(--green)', at_delivery: 'var(--green)', delivered: 'var(--blue)', cancelled: 'var(--label-3)',
};

/** Circle that fills as the load moves through its steps. */
export function StatusIcon({ status, size = 15 }) {
  const c = STATUS_COLOR[status] || 'var(--label-3)';
  const r = 6; const cx = 8;
  if (status === 'delivered') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Delivered">
        <circle cx={cx} cy={cx} r={7} fill={c} />
        <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'cancelled') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Cancelled">
        <circle cx={cx} cy={cx} r={7} fill={c} />
        <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'requested') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Waiting for a carrier">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.4 2.2" />
      </svg>
    );
  }
  const frac = FLOW.indexOf(status) / (FLOW.length - 1);
  const a = frac * 2 * Math.PI;
  const inner = 3.6;
  const x = cx + inner * Math.sin(a); const y = cx - inner * Math.cos(a);
  const path = frac >= 0.999 ? '' : `M${cx},${cx} L${cx},${cx - inner} A${inner},${inner} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)} Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={status}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={c} strokeWidth="1.6" />
      {path && <path d={path} fill={c} />}
    </svg>
  );
}

/** Urgency, from the load itself: expedite → urgent, hazmat → high, near pickup → medium, otherwise none. */
export function priorityOf(l) {
  if (l.options?.expedite) return 4;
  if (l.cargo?.hazmat) return 3;
  if (l.status === 'requested' && l.pickupWindow?.from - Date.now() < 3 * 3600e3) return 2;
  if (['requested', 'accepted'].includes(l.status)) return 1;
  return 0;
}
export const PRIORITY_LABEL = ['No priority', 'Low', 'Medium', 'High', 'Urgent'];

export function PriorityIcon({ level }) {
  if (level === 4) {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-label="Urgent">
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="var(--orange)" />
        <path d="M8 4.2v4.6M8 11.2v.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (level === 0) return <svg width="15" height="15" viewBox="0 0 16 16" aria-label="No priority"><path d="M3.5 8h9" stroke="var(--label-3)" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-label={PRIORITY_LABEL[level]}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={10 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill={i < level ? 'var(--label-2)' : 'var(--border-strong)'} />
      ))}
    </svg>
  );
}

export const EQ_COLOR = { dry_van: '#5e6ad2', reefer: '#26b5ce', flatbed: '#f2994a', step_deck: '#8e6ad8', tanker: '#eb5757', power_only: '#4cb782' };

/** The date that matters for each status, and whether it's late. */
export function whenOf(l) {
  const rel = (t) => {
    const d = t - Date.now();
    const ad = Math.abs(d);
    const h = ad / 3.6e6;
    const day = new Date(t).toDateString();
    if (day === new Date().toDateString()) return h < 1 ? (d > 0 ? `in ${Math.max(1, Math.round(ad / 60000))}m` : 'Today') : time(t);
    if (day === new Date(Date.now() - 864e5).toDateString()) return 'Yesterday';
    if (day === new Date(Date.now() + 864e5).toDateString()) return 'Tomorrow';
    const days = Math.round(ad / 864e5);
    if (days < 14) return d > 0 ? `in ${days}d` : `${days}d ago`;
    return date(t);
  };
  if (l.status === 'delivered') return { text: rel(l.deliveredAt), late: false, title: 'Delivered' };
  if (l.status === 'cancelled') return { text: rel(l.updatedAt), late: false, title: 'Cancelled' };
  if (l.status === 'requested') return { text: rel(l.pickupWindow.from), late: l.pickupWindow.to < Date.now(), title: 'Pickup window' };
  const t = ['accepted', 'en_route_pickup'].includes(l.status) ? l.eta?.pickupAt : l.eta?.deliveryAt;
  if (!t) return { text: '—', late: false, title: '' };
  return { text: rel(t), late: l.status !== 'in_transit' && t < Date.now(), title: ['accepted', 'en_route_pickup'].includes(l.status) ? 'Pickup ETA' : 'Delivery ETA' };
}

export function LoadRow({ load, showPay }) {
  const { data } = useStore();
  const idx = useIndex();
  const driver = idx.users[load.driverId];
  const shipper = idx.companies[load.shipperId];
  const carrier = idx.companies[load.carrierId];
  const w = whenOf(load);
  const eq = data.meta.equipment[load.cargo.equipment]?.label;
  const prio = priorityOf(load);
  const people = [
    data.me.role === 'shipper' ? (carrier && { name: carrier.name, color: '#8b8f97' }) : (shipper && { name: shipper.name, color: '#8b8f97' }),
    driver,
  ].filter(Boolean);
  return (
    <div className="irow" role="link" tabIndex={0} onClick={() => go(`/loads/${load.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/loads/${load.id}`)}>
      <span className="prio" title={PRIORITY_LABEL[prio]}><PriorityIcon level={prio} /></span>
      <span className="ref">{load.ref}</span>
      <span title={data.meta.statuses.find((s) => s.key === load.status)?.label}><StatusIcon status={load.status} /></span>
      <span className="ttl">
        {placeShort(load.pickup)} → {placeShort(load.dropoff)}
        <span className="sub">{load.cargo.description}{showPay ? ` · $${Math.round(load.quote.carrierPayout).toLocaleString()}` : ''}</span>
      </span>
      <span className="tag"><i style={{ background: EQ_COLOR[load.cargo.equipment] }} />{eq}</span>
      <span className={`when ${w.late ? 'late' : ''}`} title={w.title}>{w.text}</span>
      <span className="avatars">{people.map((p) => <Avatar key={p.name} user={p} size="sm" />)}</span>
    </div>
  );
}

const GROUPS = [
  { key: 'review', label: 'Waiting for carrier', match: ['requested'] },
  { key: 'pickup', label: 'Heading to pickup', match: ['accepted', 'en_route_pickup', 'at_pickup'] },
  { key: 'transit', label: 'On the road', match: ['in_transit', 'at_delivery'] },
  { key: 'done', label: 'Delivered', match: ['delivered'], closed: true },
  { key: 'cancelled', label: 'Cancelled', match: ['cancelled'], closed: true },
];
const GROUP_ICON = { review: 'requested', pickup: 'en_route_pickup', transit: 'in_transit', done: 'delivered', cancelled: 'cancelled' };

export function LoadGroups({ loads, showPay, empty }) {
  const [closed, setClosed] = useState(() => Object.fromEntries(GROUPS.map((g) => [g.key, !!g.closed])));
  const groups = useMemo(() => GROUPS.map((g) => ({
    ...g,
    items: loads.filter((l) => g.match.includes(l.status)).sort((a, b) => priorityOf(b) - priorityOf(a) || (b.updatedAt - a.updatedAt)),
  })).filter((g) => g.items.length), [loads]);
  if (!groups.length) return empty || null;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.key}>
          <button className={`group-head ${closed[g.key] ? 'closed' : ''}`} onClick={() => setClosed((c) => ({ ...c, [g.key]: !c[g.key] }))} aria-expanded={!closed[g.key]}>
            <Icon name="chevron" size={13} className="caret" style={{ transform: closed[g.key] ? 'none' : 'rotate(90deg)' }} />
            <StatusIcon status={GROUP_ICON[g.key]} size={14} />
            {g.label}<span className="count">{g.items.length}</span>
          </button>
          {!closed[g.key] && g.items.map((l) => <LoadRow key={l.id} load={l} showPay={showPay} />)}
        </div>
      ))}
    </div>
  );
}

/** Underline tabs with an optional right-hand slot. */
export function Tabs({ value, onChange, options, right }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={`t ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
      {right && <div className="tabs-right">{right}</div>}
    </div>
  );
}

/** A filter chip that opens the native picker. */
export function FilterChip({ icon, label, value, onChange, options }) {
  const active = value !== '' && value != null;
  const shown = active ? options.find((o) => String(o.value) === String(value))?.label : label;
  return (
    <label className={`chip-select ${active ? 'on' : ''}`}>
      <Icon name={icon} size={14} />
      {shown}
      <Icon name="chevron" size={11} style={{ transform: 'rotate(90deg)' }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">Any {label.toLowerCase()}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Filter…' }) {
  return (
    <label className="search">
      <Icon name="search" size={14} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

/**
 * Where a truck on a job is heading, how far is left and when it should get there.
 * Refreshes stale ETAs (e.g. a parked truck) from the remaining distance at the average speed.
 */
export function progressOf(load, avgSpeedKmh = 82) {
  if (!load) return null;
  const e = load.eta || {};
  const now = Date.now();
  const fresh = (at, km) => {
    const est = now + (km / avgSpeedKmh) * 3.6e6;
    return !at || at < now ? est : at;
  };
  switch (load.status) {
    case 'accepted':
    case 'en_route_pickup': {
      const km = e.toPickupKm ?? 0;
      return {
        stage: 'To pickup', place: load.pickup, kmLeft: km, etaAt: fresh(e.pickupAt, km),
        totalKmLeft: e.remainingKm ?? km + load.quote.distanceKm, deliveryAt: fresh(e.deliveryAt, e.remainingKm ?? km + load.quote.distanceKm),
      };
    }
    case 'at_pickup':
      return { stage: 'Loading', place: load.pickup, kmLeft: 0, etaAt: null, totalKmLeft: load.quote.distanceKm, deliveryAt: fresh(e.deliveryAt, load.quote.distanceKm) };
    case 'in_transit': {
      const km = e.remainingKm ?? load.quote.distanceKm;
      return { stage: 'To delivery', place: load.dropoff, kmLeft: km, etaAt: fresh(e.deliveryAt, km), totalKmLeft: km, deliveryAt: fresh(e.deliveryAt, km) };
    }
    case 'at_delivery':
      return { stage: 'Unloading', place: load.dropoff, kmLeft: 0, etaAt: null, totalKmLeft: 0, deliveryAt: null };
    default:
      return null;
  }
}
