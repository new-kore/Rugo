// Top bar tools: global search (⌘K) and the notification bell.
import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Avatar } from './ui.jsx';
import { StatusIcon } from './LoadList.jsx';
import { useStore, useIndex, useNow } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { placeShort, ago, km } from '../lib/format.js';

function useOutside(ref, onOut) {
  useEffect(() => {
    const on = (e) => { if (!ref.current?.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [ref, onOut]);
}

/* -------------------------------- search -------------------------------- */

export function GlobalSearch() {
  const { data } = useStore();
  const idx = useIndex();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const collapse = () => { setOpen(false); setQ(''); setExpanded(false); };
  const expand = () => { setExpanded(true); setOpen(true); input.current?.focus(); setTimeout(() => input.current?.focus(), 30); };
  useOutside(box, () => { setOpen(false); if (!input.current?.value) setExpanded(false); });

  useEffect(() => {
    const on = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setExpanded(true);
        setOpen(true);
        setTimeout(() => input.current?.focus(), 30);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const words = s.split(/\s+/).filter(Boolean);
    const has = (...xs) => { const hay = xs.filter(Boolean).join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); };
    const out = [];
    const role = data.me.role;
    if (!s) {
      // Suggestions before typing: what's moving now, then shortcuts.
      data.loads.filter((l) => ['requested', 'accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'].includes(l.status))
        .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
        .forEach((l) => out.push({
          group: 'Active loads', key: l.id, icon: <StatusIcon status={l.status} />,
          title: <><span className="mono">{l.ref}</span> {placeShort(l.pickup)} → {placeShort(l.dropoff)}</>,
          sub: `${data.meta.statuses.find((x) => x.key === l.status)?.short} · ${l.cargo.description}`,
          go: () => go(`/loads/${l.id}`),
        }));
      if (role === 'dispatcher') {
        data.trucks.slice(0, 4).forEach((t) => out.push({
          group: 'Trucks', key: t.id, icon: <Icon name="truck" size={16} />, title: `Unit ${t.unit}`,
          sub: `${idx.users[t.driverId]?.name || 'No driver'} · ${t.plate}`,
          go: () => { sessionStorage.setItem('rugo.fleetSel', t.id); go('/fleet'); window.dispatchEvent(new Event('rugo:fleet-select')); },
        }));
      }
      return out;
    }
    data.loads
      .filter((l) => has(l.ref, l.poNumber, l.pickup.city, l.pickup.name, l.dropoff.city, l.dropoff.name, l.cargo.description, idx.companies[l.shipperId]?.name, idx.users[l.driverId]?.name))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
      .forEach((l) => out.push({
        group: 'Loads', key: l.id, icon: <StatusIcon status={l.status} />,
        title: <><span className="mono">{l.ref}</span> {placeShort(l.pickup)} → {placeShort(l.dropoff)}</>,
        sub: `${data.meta.statuses.find((x) => x.key === l.status)?.short} · ${l.cargo.description}${l.poNumber ? ` · ${l.poNumber}` : ''}`,
        go: () => go(`/loads/${l.id}`),
      }));
    if (role === 'dispatcher') {
      data.users.filter((u) => u.role === 'driver' && has(u.name, u.phone, u.email)).slice(0, 4).forEach((u) => out.push({
        group: 'Drivers', key: u.id, icon: <Avatar user={u} size="sm" />, title: u.name,
        sub: `${idx.trucks[u.truckId] ? `Unit ${idx.trucks[u.truckId].unit}` : 'No truck'} · ${u.phone}`,
        go: () => { sessionStorage.setItem('rugo.fleetSel', u.truckId || ''); go('/fleet'); window.dispatchEvent(new Event('rugo:fleet-select')); },
      }));
      data.trucks.filter((t) => has(`unit ${t.unit}`, t.unit, t.plate, t.make, t.model, t.vin)).slice(0, 4).forEach((t) => out.push({
        group: 'Trucks', key: t.id, icon: <Icon name="truck" size={16} />, title: `Unit ${t.unit}`,
        sub: `${t.year} ${t.make} ${t.model} · ${t.plate} · ${km(t.odometerKm)}`,
        go: () => { sessionStorage.setItem('rugo.fleetSel', t.id); go('/fleet'); window.dispatchEvent(new Event('rugo:fleet-select')); },
      }));
    }
    data.companies.filter((c) => c.id !== data.me.companyId && has(c.name, c.city)).slice(0, 3).forEach((c) => out.push({
      group: 'Companies', key: c.id, icon: <Icon name="building" size={16} />, title: c.name,
      sub: `${c.type === 'carrier' ? 'Carrier' : 'Shipper'} · ${c.city}`,
      go: () => go(role === 'shipper' ? '/shipments' : '/dispatch'),
    }));
    const pages = [
      ['Request a pickup', '/new', 'shipper'], ['Billing & invoices', '/billing', 'shipper'], ['Load board', '/', 'dispatcher'],
      ['Live fleet', '/fleet', 'dispatcher'], ['Fuel log', '/fuel', 'dispatcher'], ['Reports', '/reports', 'dispatcher'],
      ['Drivers & trucks', '/drivers', 'dispatcher'], ['Log fuel', '/fuel', 'driver'], ['Hours & pay', '/hours', 'driver'], ['Calendar', '/calendar', '*'], ['Settings', '/settings', '*'],
    ];
    pages.filter(([n, , r]) => (r === '*' || r === role) && n.toLowerCase().includes(s)).forEach(([n, p]) => out.push({
      group: 'Go to', key: p + n, icon: <Icon name="chevron" size={14} />, title: n, sub: '', go: () => go(p),
    }));
    return out;
  }, [q, data, idx]);

  useEffect(() => setCursor(0), [q]);
  const pick = (r) => { r.go(); collapse(); input.current?.blur(); };

  return (
    <div className={`gsearch ${expanded ? 'expanded' : ''}`} ref={box}>
      <button className="icon-btn gsearch-toggle" aria-label="Search" title="Search (⌘K)" onClick={expand} tabIndex={expanded ? -1 : 0}>
        <Icon name="search" size={18} />
      </button>
      <label className={`search ${open ? 'focus' : ''}`} aria-hidden={!expanded}>
        <Icon name="search" size={14} />
        <input ref={input} value={q} placeholder={window.matchMedia('(max-width: 860px)').matches ? 'Search…' : 'Search loads, drivers, trucks, places…'} aria-label="Search everything"
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (e.key === 'Enter' && results[cursor]) pick(results[cursor]);
            if (e.key === 'Escape') { collapse(); e.currentTarget.blur(); }
          }} />
        <kbd>esc</kbd>
        <button type="button" className="gsearch-close" aria-label="Close search" onClick={collapse}><Icon name="close" size={13} /></button>
      </label>
      {expanded && open && (
        <div className="popover gsearch-results" role="listbox">
          {q.trim() && results.length > 0 && <div className="pop-count">{results.length} result{results.length === 1 ? '' : 's'} · ↑↓ to move · Enter to open</div>}
          {q.trim() && results.length === 0 && <div className="pop-empty">No results for “{q}”. Try a load number, city, driver or unit.</div>}
          {results.map((r, i) => (
            <div key={r.group + r.key}>
              {(i === 0 || results[i - 1].group !== r.group) && <div className="pop-group">{r.group}</div>}
              <button role="option" aria-selected={i === cursor} className={`pop-item ${i === cursor ? 'on' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => pick(r)}>
                <span className="pop-icon">{r.icon}</span>
                <span className="pop-text"><span className="truncate"><Hl q={q}>{r.title}</Hl></span>{r.sub && <span className="truncate pop-sub"><Hl q={q}>{r.sub}</Hl></span>}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bold the typed words inside text (works through simple nested elements). */
function Hl({ q, children }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return children;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const walk = (node, k = 0) => {
    if (typeof node === 'string') return node.split(re).map((part, i) => (i % 2 ? <mark key={`${k}-${i}`} className="hl">{part}</mark> : part));
    if (Array.isArray(node)) return node.map((n, i) => walk(n, `${k}.${i}`));
    if (isValidElement(node) && node.props.children !== undefined) return cloneElement(node, undefined, walk(node.props.children, k));
    return node;
  };
  return walk(children);
}

/* ---------------------------- notifications ----------------------------- */

const TITLES = {
  requested: (l) => ['New pickup request', `${placeShort(l.pickup)} → ${placeShort(l.dropoff)}`],
  accepted: (l) => ['Carrier assigned', `${placeShort(l.pickup)} → ${placeShort(l.dropoff)}`],
  en_route_pickup: (l) => ['Driver on the way to pickup', placeShort(l.pickup)],
  at_pickup: (l) => ['Arrived at pickup', l.pickup.name],
  in_transit: (l) => ['On the road', `Left ${placeShort(l.pickup)} for ${placeShort(l.dropoff)}`],
  at_delivery: (l) => ['Arrived at destination', l.dropoff.name],
  delivered: (l) => [l.damage?.hasDamage ? 'Delivered — damage reported' : 'Delivered', `${placeShort(l.dropoff)} · signed by ${l.signature?.name || '—'}`],
  cancelled: (l) => ['Cancelled', `${placeShort(l.pickup)} → ${placeShort(l.dropoff)}`],
};

function useNotifications() {
  const { data } = useStore();
  const me = data.me;
  return useMemo(() => {
    const items = [];
    for (const l of data.loads) {
      for (const t of l.timeline) {
        if (t.by === me.name) continue; // your own actions aren't news to you
        if (me.role === 'driver' && !['accepted'].includes(t.status)) continue;
        const [title, body] = (TITLES[t.status] || TITLES.requested)(l);
        items.push({ id: `${l.id}:${t.status}:${t.t}`, t: t.t, title, body, load: l, kind: t.status, warn: t.status === 'delivered' && l.damage?.hasDamage });
      }
      for (const m of l.messages) {
        if (m.userId === me.id) continue;
        items.push({ id: m.id, t: m.t, title: `Message from ${m.name}`, body: m.text, load: l, kind: 'message' });
      }
    }
    for (const tr of data.trucks) {
      for (const n of tr.notes || []) {
        if (n.by === me.name) continue;
        items.push({ id: n.id, t: n.t, title: `Note on Unit ${tr.unit}`, body: n.text, truck: tr, kind: 'note' });
      }
    }
    return items.sort((a, b) => b.t - a.t).slice(0, 40);
  }, [data.loads, data.trucks, me]);
}

export function NotificationBell() {
  const { data } = useStore();
  useNow(30000);
  const items = useNotifications();
  const key = `rugo.seen.${data.me.id}`;
  // First visit: only the last 12 hours count as new.
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem(key)) || Date.now() - 12 * 3.6e6; } catch { return Date.now() - 12 * 3.6e6; } });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useOutside(box, () => setOpen(false));
  const unread = items.filter((n) => n.t > seen).length;
  const markAll = () => {
    const now = Date.now();
    setSeen(now);
    try { localStorage.setItem(key, String(now)); } catch { /* ignore */ }
  };
  const openItem = (n) => {
    setOpen(false);
    if (n.load) go(`/loads/${n.load.id}`);
    else if (n.truck) { sessionStorage.setItem('rugo.fleetSel', n.truck.id); go('/fleet'); window.dispatchEvent(new Event('rugo:fleet-select')); }
  };

  return (
    <div className="bell" ref={box}>
      <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="popover bell-panel">
          <div className="row between" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <span className="headline">Notifications</span>
            <button className="btn plain small" onClick={markAll} disabled={!unread}>Mark all read</button>
          </div>
          <div style={{ maxHeight: 440, overflowY: 'auto' }}>
            {items.length === 0 && <div className="pop-empty">You’re all caught up.</div>}
            {items.map((n) => (
              <button key={n.id} className={`pop-item notif ${n.t > seen ? 'unread' : ''}`} onClick={() => openItem(n)}>
                <span className="pop-icon">
                  {n.kind === 'message' ? <Icon name="message" size={15} /> : n.kind === 'note' ? <Icon name="doc" size={15} /> : <StatusIcon status={n.kind} />}
                </span>
                <span className="pop-text">
                  <span className={n.warn ? 'orange' : ''} style={{ fontWeight: 500 }}>{n.title}</span>
                  <span className="pop-sub" style={{ whiteSpace: 'normal' }}>{n.load ? <><span className="mono">{n.load.ref}</span> · </> : null}{n.body}</span>
                  <span className="caption tertiary">{ago(n.t)}</span>
                </span>
                {n.t > seen && <span className="unread-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
