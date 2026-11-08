// Office dashboard: everything happening today on one screen — live map, what needs attention, today's stops, what's coming in.
import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import { Avatar, StatusPill } from '../../components/ui.jsx';
import { StatusIcon } from '../../components/LoadList.jsx';
import { Donut, Gauge, MiniBars, KpiTile, Progress } from '../../components/Charts.jsx';
import { useStore, useIndex, useNow, isActive } from '../../lib/store.jsx';
import { go } from '../../lib/router.js';
import { money, time, ago, km } from '../../lib/format.js';
import { driverAlerts } from '../../lib/drivers.js';
import { unread, openShift } from '../../lib/chat.js';
import { useMatches } from '../../lib/ai.js';
import { stopWindow, punctuality } from '../../../server/scorecard.js';
import { post } from '../../lib/api.js';

const H = 3.6e6;
const MOVING = ['en_route_pickup', 'in_transit'];
const AT_STOP = ['at_pickup', 'at_delivery'];
export const STATUS_COLOR = { requested: '#f59e0b', accepted: '#6366f1', en_route_pickup: '#3b82f6', at_pickup: '#f97316', in_transit: '#10b981', at_delivery: '#14b8a6', delivered: '#9ca3af', cancelled: '#d1d5db' };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const legOf = (l) => (['accepted', 'en_route_pickup'].includes(l.status) ? l.legs?.toPickup : l.legs?.toDropoff);

/** Everything that needs a dispatcher's eye right now, most urgent first. */
export function attentionItems(data, idx, now = Date.now()) {
  const out = [];
  const s = data.settings;
  for (const l of data.loads) {
    const d = idx.users[l.driverId]; const who = d?.name || 'Driver';
    if (['accepted', 'en_route_pickup'].includes(l.status) && l.pickupWindow?.to) {
      const lateBy = (now - l.pickupWindow.to) / 60000;
      if (lateBy > 15) out.push({ id: `od:${l.id}`, sev: 3, icon: 'warning', tone: 'red', title: `Pickup overdue — ${l.ref}`, body: `${who} hasn’t reached ${l.pickup.city}. Window closed ${Math.round(lateBy)} min ago.`, load: l });
      else if (l.eta?.pickupAt && l.eta.pickupAt > l.pickupWindow.to + 10 * 60000) out.push({ id: `rp:${l.id}`, sev: 2, icon: 'clock', tone: 'orange', title: `Running late to pickup — ${l.ref}`, body: `ETA ${time(l.eta.pickupAt)}, window closes ${time(l.pickupWindow.to)}.`, load: l });
    }
    if (l.status === 'in_transit' && l.eta?.deliveryAt) {
      const due = stopWindow(l, 'delivery')?.due;
      if (due && l.eta.deliveryAt > due + 15 * 60000) out.push({ id: `rd:${l.id}`, sev: 2, icon: 'clock', tone: 'orange', title: `Delivery at risk — ${l.ref}`, body: `ETA ${time(l.eta.deliveryAt)}, due ${time(due)} at ${l.dropoff.city}.`, load: l });
    }
    if (l.routeWatch?.off) out.push({ id: `or:${l.id}`, sev: 3, icon: 'route', tone: 'red', title: `Off the planned route — ${l.ref}`, body: `${who} is up to ${(l.routeWatch.maxKm || 0).toFixed(1)} km off since ${time(l.routeWatch.since)}.`, load: l });
    if (AT_STOP.includes(l.status)) {
      const since = l.status === 'at_pickup' ? l.arrivedPickupAt : l.arrivedDeliveryAt;
      const hrs = since ? (now - since) / H : 0;
      if (hrs > (s.detentionFreeHours || 2)) out.push({ id: `dw:${l.id}`, sev: 1, icon: 'clock', tone: 'orange', title: `Detention running — ${l.ref}`, body: `${who} has been at ${l.status === 'at_pickup' ? l.pickup.city : l.dropoff.city} for ${hrs.toFixed(1)} h.`, load: l });
    }
    if (l.status === 'requested') {
      const waited = (now - l.createdAt) / 60000;
      if (waited > 30) out.push({ id: `nb:${l.id}`, sev: 1, icon: 'list', tone: 'orange', title: `Waiting for a carrier — ${l.ref}`, body: `${l.pickup.city} → ${l.dropoff.city}, posted ${Math.round(waited)} min ago.`, load: l });
    }
    if (isActive(l) && d && ['denied', 'unavailable', 'stopped'].includes(d.gps?.state)) out.push({ id: `gps:${l.id}`, sev: 2, icon: 'location', tone: 'red', title: `GPS off — ${who}`, body: `Not tracking ${l.ref}.`, load: l });
  }
  for (const u of data.users.filter((x) => x.role === 'driver')) {
    if (u.hos?.flag === 'violation') out.push({ id: `hos:${u.id}`, sev: 3, icon: 'warning', tone: 'red', title: `HOS violation — ${u.name}`, body: 'Driving past an hours-of-service limit.', driver: u });
    else if (u.hos?.flag === 'low') out.push({ id: `hosl:${u.id}`, sev: 2, icon: 'clock', tone: 'orange', title: `Hours running low — ${u.name}`, body: `${u.hos.driveLeftMin} min of driving left.`, driver: u });
    for (const a of driverAlerts(u).filter((x) => x.kind !== 'hos')) out.push({ id: a.id, sev: a.level === 'expired' ? 2 : 0, icon: 'doc', tone: a.level === 'expired' ? 'red' : 'orange', title: `${a.label} — ${u.name}`, body: a.text, driver: u });
  }
  for (const t of data.trucks) if ((t.nextServiceKm || 0) - (t.odometerKm || 0) <= 0) out.push({ id: `svc:${t.id}`, sev: 0, icon: 'wrench', tone: 'orange', title: `Service overdue — Unit ${t.unit}`, body: `${km(t.odometerKm - t.nextServiceKm)} past the service mark.`, truck: t });
  const oldInv = data.loads.filter((l) => l.invoice && !l.invoice.paid && now - l.invoice.issuedAt > 30 * 864e5);
  if (oldInv.length) out.push({ id: 'inv', sev: 0, icon: 'receipt', tone: 'orange', title: `${oldInv.length} invoice${oldInv.length > 1 ? 's' : ''} unpaid over 30 days`, body: money(oldInv.reduce((a, l) => a + l.invoice.total, 0)), to: '/reports' });
  return out.sort((a, b) => b.sev - a.sev);
}

export default function Dashboard() {
  const { data } = useStore();
  const idx = useIndex();
  const now = useNow(15000);
  const [filter, setFilter] = useState('all');
  const t0 = dayStart(); const t1 = t0 + 24 * H;
  const loads = data.loads;
  const active = loads.filter(isActive);
  const board = loads.filter((l) => l.status === 'requested');
  const drivers = data.users.filter((u) => u.role === 'driver');
  const onShift = drivers.filter((d) => openShift(data, d.id));
  const deliveredToday = loads.filter((l) => l.status === 'delivered' && l.deliveredAt >= t0);
  const revenueToday = deliveredToday.reduce((a, l) => a + (l.economics?.revenue || l.quote?.carrierPayout || 0), 0);
  const attention = useMemo(() => attentionItems(data, idx, now), [data, idx, now]);
  const problemIds = new Set(attention.filter((a) => a.load && a.sev >= 2).map((a) => a.load.id));
  const overdue = attention.filter((a) => a.id.startsWith('od:')).length;

  // Today's stops: pickups and deliveries scheduled or happening today.
  const stops = useMemo(() => loads.filter((l) => l.status !== 'cancelled' && l.status !== 'requested').flatMap((l) => {
    const out = [];
    const pu = l.arrivedPickupAt || l.pickupWindow?.from || l.eta?.pickupAt;
    if (pu >= t0 && pu < t1) out.push({ l, kind: 'pickup', t: pu, done: !!l.arrivedPickupAt, late: punctuality(l, 'pickup')?.kind === 'late' || (!l.arrivedPickupAt && l.pickupWindow?.to < now) });
    const de = l.arrivedDeliveryAt || l.eta?.deliveryAt || l.deliveryWindow?.from;
    if (de >= t0 && de < t1) out.push({ l, kind: 'delivery', t: de, done: !!l.arrivedDeliveryAt, late: punctuality(l, 'delivery')?.kind === 'late' });
    return out;
  }).sort((a, b) => a.t - b.t), [loads, t0, t1, now]);

  // Live activity across loads, fuel and driver messages.
  const feed = useMemo(() => {
    const since = now - 24 * H;
    const items = [];
    for (const l of loads) for (const e of l.timeline || []) if (e.t > since) items.push({ t: e.t, icon: <StatusIcon status={e.status} />, text: `${l.ref} · ${data.meta.statuses.find((s) => s.key === e.status)?.label}`, sub: e.by, to: `/loads/${l.id}` });
    for (const f of data.fuelLogs || []) if (f.t > since) items.push({ t: f.t, icon: <Icon name="fuel" size={14} style={{ color: 'var(--orange)' }} />, text: `Fuel · Unit ${idx.trucks[f.truckId]?.unit} · ${Math.round(f.litres)} L`, sub: f.by, to: '/fuel' });
    for (const m of data.chat || []) if (m.t > since && m.role === 'driver') items.push({ t: m.t, icon: <Icon name="message" size={14} style={{ color: 'var(--blue)' }} />, text: m.text || 'Photo', sub: m.name, to: `/messages?t=${m.threadId}` });
    return items.sort((a, b) => b.t - a.t).slice(0, 14);
  }, [loads, data.fuelLogs, data.chat, data.meta, idx, now]);

  // Map.
  const shown = active.filter((l) => filter === 'all' || (filter === 'moving' && MOVING.includes(l.status)) || (filter === 'problems' && problemIds.has(l.id)));
  const lines = useMemo(() => (filter === 'new' ? [] : shown).map((l) => ({ id: l.id, points: legOf(l)?.points || [l.pickup, l.dropoff], color: problemIds.has(l.id) ? '#ef4444' : STATUS_COLOR[l.status], tooltip: `${l.ref} · ${idx.users[l.driverId]?.name || ''} · ${data.meta.statuses.find((s) => s.key === l.status)?.short}${l.eta?.remainingKm ? ` · ${Math.round(l.eta.remainingKm)} km left` : ''}` })), [shown, filter, idx, data.meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const trucks = useMemo(() => data.trucks.filter((t) => t.location).map((t) => {
    const l = active.find((x) => x.truckId === t.id); const d = idx.users[t.driverId];
    return { ...t, color: d?.color, moving: !!l && MOVING.includes(l.status), label: `Unit ${t.unit} · ${d?.name || 'No driver'}${l ? ` · ${l.ref}` : ' · available'}` };
  }), [data.trucks, active, idx]);
  const places = useMemo(() => (filter === 'all' || filter === 'new' ? board.map((l) => ({ ...l.pickup, kind: 'pickup', label: `NEW ${l.ref} · ${l.pickup.city} → ${l.dropoff.city} · ${money(l.quote.carrierPayout)}` })) : []), [board, filter]);

  // Charts.
  const fleet = [
    { label: 'Driving', value: data.trucks.filter((t) => active.some((l) => l.truckId === t.id && MOVING.includes(l.status))).length, color: STATUS_COLOR.in_transit },
    { label: 'At a stop', value: data.trucks.filter((t) => active.some((l) => l.truckId === t.id && AT_STOP.includes(l.status))).length, color: STATUS_COLOR.at_pickup },
    { label: 'Assigned', value: data.trucks.filter((t) => active.some((l) => l.truckId === t.id && l.status === 'accepted')).length, color: STATUS_COLOR.accepted },
  ];
  fleet.push({ label: 'Available', value: data.trucks.length - fleet.reduce((a, x) => a + x.value, 0), color: '#cbd5e1' });
  const week = Array.from({ length: 7 }, (_, i) => {
    const s = t0 - (6 - i) * 24 * H;
    const v = loads.filter((l) => l.status === 'delivered' && l.deliveredAt >= s && l.deliveredAt < s + 24 * H).reduce((a, l) => a + (l.economics?.revenue || 0), 0);
    return { label: new Date(s).toLocaleDateString('en-CA', { weekday: 'short' }), value: Math.round(v) };
  });
  const todayStops = stops.filter((x) => x.done);
  const onTimePct = todayStops.length ? Math.round((todayStops.filter((x) => !x.late).length / todayStops.length) * 100) : null;
  const unreadN = unread(data);

  return (
    <div className="page wide dash" style={{ maxWidth: 1480 }}>
      <div className="dash-head">
        <div>
          <div className="subhead secondary">{new Date(now).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })} · {time(now)}</div>
          <h1 className="large-title">{greeting()}, {data.me.name.split(' ')[0]}</h1>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="pill green live"><span className="dot" />Live</span>
          <button className="btn" onClick={() => go('/board')}><Icon name="list" size={15} />Load board</button>
          <button className="btn primary" onClick={() => go('/calendar')}><Icon name="plus" size={15} stroke={2.4} />Add route</button>
        </div>
      </div>

      <div className="dkpis">
        <KpiTile icon={<Icon name="truck" size={20} />} tone="green" k="Moving now" v={active.filter((l) => MOVING.includes(l.status)).length} d={`${active.filter((l) => AT_STOP.includes(l.status)).length} at a dock`} onClick={() => setFilter('moving')} />
        <KpiTile icon={<Icon name="list" size={20} />} tone="orange" k="New loads" v={board.length} d="on the load board" onClick={() => go('/board')} />
        <KpiTile icon={<Icon name="warning" size={20} />} tone="red" k="Overdue" v={overdue} d={`pickups · ${attention.filter((a) => a.sev >= 2).length} urgent`} alert={overdue > 0} onClick={() => setFilter('problems')} />
        <KpiTile icon={<Icon name="checkCircle" size={20} />} tone="teal" k="Delivered" v={deliveredToday.length} d={`today · ${stops.filter((x) => !x.done).length} stops to go`} />
        <KpiTile icon={<Icon name="dollar" size={20} />} tone="indigo" k="Revenue" v={money(revenueToday)} d={`today · ${money(week.reduce((a, x) => a + x.value, 0))} week`} onClick={() => go('/reports')} />
        <KpiTile icon={<Icon name="people" size={20} />} tone="blue" k="On shift" v={`${onShift.length}/${drivers.length}`} d={`drivers · ${drivers.filter((d) => !active.some((l) => l.driverId === d.id) && openShift(data, d.id)).length} free`} onClick={() => go('/drivers')} />
        <KpiTile icon={<Icon name="message" size={20} />} tone="blue" k="Messages" v={unreadN} d="unread from drivers" alert={unreadN > 0} onClick={() => go('/messages')} />
      </div>

      <div className="dash-main">
        <div className="map-card dash-map">
          <MapView height="100%" trucks={trucks} places={places} lines={lines} fitKey={`dash-${filter}-${lines.length}-${places.length}`} padding={50}
            onLineClick={(id) => go(`/loads/${id}`)} onTruckClick={(tid) => { const l = active.find((x) => x.truckId === tid); if (l) go(`/loads/${l.id}`); }} />
          <div className="map-overlay glass dash-filters">
            {[['all', 'Everything'], ['moving', 'Moving'], ['problems', `Problems${problemIds.size ? ` · ${problemIds.size}` : ''}`], ['new', `New loads · ${board.length}`]].map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="map-overlay glass dash-legend">
            {[['To pickup', STATUS_COLOR.en_route_pickup], ['Loaded', STATUS_COLOR.in_transit], ['Assigned', STATUS_COLOR.accepted], ['Problem', '#ef4444']].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
            <span><i className="pin-new" />New load</span>
          </div>
        </div>

        <div className="card dash-attn">
          <div className="dash-card-head"><Icon name="flag" size={16} style={{ color: 'var(--red)' }} /><span className="headline">Needs attention</span><span className="badge" style={{ position: 'static' }}>{attention.length}</span></div>
          <div className="dash-scroll">
            {attention.length === 0 && <div className="empty-mini"><Icon name="checkCircle" size={28} style={{ color: 'var(--green)' }} /><div>All clear — nothing needs you right now.</div></div>}
            {attention.map((a) => (
              <button key={a.id} className={`attn ${a.tone}`} onClick={() => go(a.load ? `/loads/${a.load.id}` : a.driver ? '/drivers' : a.truck ? '/inventory' : a.to || '/board')}>
                <div className="attn-icon"><Icon name={a.icon} size={16} /></div>
                <div style={{ minWidth: 0 }}><div className="subhead" style={{ fontWeight: 600 }}>{a.title}</div><div className="footnote secondary">{a.body}</div></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-row3">
        <div className="card">
          <div className="dash-card-head"><Icon name="calendar" size={16} style={{ color: 'var(--blue)' }} /><span className="headline">Today’s stops</span><span className="footnote secondary">{stops.filter((x) => x.done).length} of {stops.length} done</span></div>
          <div className="dash-scroll">
            {stops.length === 0 && <div className="empty-mini">No pickups or deliveries scheduled today.</div>}
            {stops.map((x) => (
              <button key={`${x.l.id}${x.kind}`} className={`stop ${x.done ? 'done' : ''} ${x.late ? 'late' : ''}`} onClick={() => go(`/loads/${x.l.id}`)}>
                <div className="stop-time num">{time(x.t)}</div>
                <div className={`stop-dot ${x.kind}`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="subhead truncate" style={{ fontWeight: 600 }}>{x.kind === 'pickup' ? 'Pickup' : 'Delivery'} · {(x.kind === 'pickup' ? x.l.pickup : x.l.dropoff).city}</div>
                  <div className="footnote secondary truncate">{x.l.ref} · {idx.users[x.l.driverId]?.name || 'Unassigned'}</div>
                </div>
                <span className={`pill ${x.done ? (x.late ? 'orange' : 'green') : x.late ? 'red' : 'gray'}`}>{x.done ? (x.late ? 'Late' : 'Done') : x.late ? 'Overdue' : x.kind === 'delivery' ? 'ETA' : 'Due'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="dash-card-head"><Icon name="bolt" size={16} style={{ color: 'var(--orange)' }} /><span className="headline">Coming in</span><span className="footnote secondary">{board.length} new</span></div>
          <div className="dash-scroll">
            {board.length === 0 && <div className="empty-mini">No new loads right now.</div>}
            {board.sort((a, b) => b.createdAt - a.createdAt).map((l) => <IncomingLoad key={l.id} l={l} />)}
          </div>
        </div>

        <div className="card">
          <div className="dash-card-head"><Icon name="refresh" size={16} style={{ color: 'var(--green)' }} /><span className="headline">Live activity</span><span className="footnote secondary">last 24 h</span></div>
          <div className="dash-scroll">
            {feed.map((f, i) => (
              <button key={i} className="feed" onClick={() => go(f.to)}>
                <span className="feed-icon">{f.icon}</span>
                <span style={{ minWidth: 0, flex: 1 }}><span className="subhead truncate" style={{ display: 'block' }}>{f.text}</span><span className="footnote secondary">{f.sub}</span></span>
                <span className="caption tertiary">{ago(f.t)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-charts">
        <div className="card pad-lg"><div className="headline">Fleet right now</div><Donut segments={fleet} sub="trucks" /></div>
        <div className="card pad-lg">
          <div className="headline">Loads on the go</div>
          <Donut segments={[['requested', 'Waiting'], ['accepted', 'Assigned'], ['en_route_pickup', 'To pickup'], ['at_pickup', 'Loading'], ['in_transit', 'On the road'], ['at_delivery', 'Unloading']].map(([k, l]) => ({ label: l, value: loads.filter((x) => x.status === k).length, color: STATUS_COLOR[k] }))} sub="loads" />
        </div>
        <div className="card pad-lg"><div className="headline">Revenue, last 7 days</div><MiniBars data={week} color="var(--indigo)" format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)} /></div>
        <div className="card pad-lg dash-gauges">
          <div className="headline">Today</div>
          <div className="row" style={{ justifyContent: 'space-around', gap: 8, flexWrap: 'wrap' }}>
            <Gauge value={onTimePct ?? 0} max={100} display={onTimePct == null ? '—' : `${onTimePct}%`} label="On-time stops" color={onTimePct == null || onTimePct >= 90 ? 'var(--green)' : 'var(--orange)'} />
            <Gauge value={onShift.length} max={drivers.length || 1} display={`${onShift.length}/${drivers.length}`} label="On shift" color="var(--blue)" />
          </div>
        </div>
      </div>

      <div className="card pad-lg" style={{ marginTop: 14 }}>
        <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="people" size={16} style={{ color: 'var(--blue)' }} /><span className="headline">Drivers</span></div>
        <div className="dash-drivers">
          {drivers.map((d) => {
            const l = active.find((x) => x.driverId === d.id || (x.teamDriverIds || []).includes(d.id));
            const pr = l ? Math.min(100, Math.max(5, ((l.metrics?.loadedKm || 0) / (l.quote?.distanceKm || 1)) * 100)) : 0;
            return (
              <button key={d.id} className="dash-driver" onClick={() => go(l ? `/loads/${l.id}` : '/drivers')}>
                <Avatar user={d} online={!!openShift(data, d.id)} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="subhead truncate" style={{ fontWeight: 600 }}>{d.name}</div>
                  <div className="footnote secondary truncate">{l ? `${l.ref} · ${l.pickup.city} → ${l.dropoff.city}` : openShift(data, d.id) ? 'On shift · free' : 'Off shift'}</div>
                  {l && <Progress value={l.status === 'in_transit' ? pr : l.status === 'at_delivery' ? 96 : 8} color={STATUS_COLOR[l.status]} />}
                </div>
                {l ? <StatusPill status={l.status} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IncomingLoad({ l }) {
  const { toast, upsert, data } = useStore();
  const best = useMatches(l).find((r) => r.eligible);
  const send = async (e) => {
    e.stopPropagation();
    try { upsert('loads', await post(`/loads/${l.id}/accept`, { driverId: best.driver.id, truckId: best.truck.id })); toast({ title: `${l.ref} accepted`, body: `${best.driver.name} has been notified.` }); } catch (err) { toast({ title: 'Couldn’t accept', body: err.message, tone: 'error' }); }
  };
  return (
    <div className="incoming" role="button" tabIndex={0} onClick={() => go(`/loads/${l.id}`)}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="subhead truncate" style={{ fontWeight: 600 }}>{l.pickup.city} → {l.dropoff.city}</div>
        <div className="footnote secondary truncate">{l.ref} · {data.meta.equipment[l.cargo.equipment]?.label} · {ago(l.createdAt)}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="headline green num">{money(l.quote.carrierPayout)}</div>
        {best && <button className="btn small primary" onClick={send} title={`Match ${best.score}/100`}><Icon name="sparkles" size={12} />Send {best.driver.name.split(' ')[0]}</button>}
      </div>
    </div>
  );
}
