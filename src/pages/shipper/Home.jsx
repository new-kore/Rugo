// Customer dashboard: every load live on a map, where it is and when it arrives, plus pickup/delivery photos.
import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import { StatusPill, Lightbox, Avatar } from '../../components/ui.jsx';
import { Donut, MiniBars, KpiTile, Progress } from '../../components/Charts.jsx';
import { useStore, useIndex, useNow, isActive } from '../../lib/store.jsx';
import { go } from '../../lib/router.js';
import { money, time, km, date, ago } from '../../lib/format.js';
import { punctuality } from '../../../server/scorecard.js';

const H = 3.6e6; const DAY = 864e5;
const COLOR = { requested: '#f59e0b', accepted: '#6366f1', en_route_pickup: '#3b82f6', at_pickup: '#f97316', in_transit: '#10b981', at_delivery: '#14b8a6' };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const progressOf = (l) => ({ requested: 2, accepted: 6, en_route_pickup: 15, at_pickup: 30, in_transit: 35 + Math.min(55, ((l.metrics?.loadedKm || 0) / (l.quote?.distanceKm || 1)) * 55), at_delivery: 95, delivered: 100 }[l.status] || 0);

export default function ShipperHome() {
  const { data } = useStore();
  const idx = useIndex();
  const now = useNow(15000);
  const [photo, setPhoto] = useState(null);
  const [hover, setHover] = useState(null);
  const loads = data.loads.filter((l) => l.shipperId === data.me.companyId);
  const live = loads.filter((l) => isActive(l) || l.status === 'requested').sort((a, b) => progressOf(b) - progressOf(a));
  const t0 = dayStart();
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const deliveredMonth = loads.filter((l) => l.status === 'delivered' && l.deliveredAt >= month.getTime());
  const spendMonth = deliveredMonth.reduce((a, l) => a + (l.invoice?.total || 0), 0);
  const arrivingToday = live.filter((l) => l.eta?.deliveryAt && l.eta.deliveryAt < t0 + DAY).length;
  const delivered30 = loads.filter((l) => l.status === 'delivered' && l.deliveredAt > now - 30 * DAY);
  const pd = delivered30.map((l) => punctuality(l, 'delivery')).filter(Boolean);
  const onTime = pd.length ? Math.round((pd.filter((x) => x.kind !== 'late').length / pd.length) * 100) : null;
  const unpaid = loads.filter((l) => l.invoice && !l.invoice.paid);

  const trucks = useMemo(() => loads.filter(isActive).map((l) => {
    const t = idx.trucks[l.truckId]; const d = idx.users[l.driverId];
    return t?.location && { ...t, id: l.id, color: d?.color || COLOR[l.status], moving: ['en_route_pickup', 'in_transit'].includes(l.status), label: `${l.ref} · ${l.dropoff.city}${l.eta?.deliveryAt ? ` · arrives ${time(l.eta.deliveryAt)}` : ''}` };
  }).filter(Boolean), [loads, idx]);
  const lines = useMemo(() => live.filter((l) => l.status !== 'requested').map((l) => ({ id: l.id, points: (l.status === 'accepted' || l.status === 'en_route_pickup' ? [l.pickup, l.dropoff] : l.legs?.toDropoff?.points) || [l.pickup, l.dropoff], color: COLOR[l.status], tooltip: `${l.ref} · ${l.pickup.city} → ${l.dropoff.city}` })), [live]);
  const places = useMemo(() => live.filter((l) => l.status === 'requested').map((l) => ({ ...l.pickup, kind: 'pickup', label: `${l.ref} · waiting for a carrier` })), [live]);

  // Photos from loads that arrived recently (delivery) or are loaded (pickup).
  const gallery = loads.filter((l) => (l.photos?.delivery?.length || l.photos?.pickup?.length) && (l.deliveredAt || l.departedPickupAt || 0) > now - 21 * DAY)
    .sort((a, b) => (b.arrivedDeliveryAt || b.departedPickupAt || 0) - (a.arrivedDeliveryAt || a.departedPickupAt || 0)).slice(0, 6);

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const s = t0 - (7 - i) * 7 * DAY - ((new Date(t0).getDay() + 6) % 7) * DAY;
    const xs = loads.filter((l) => l.status === 'delivered' && l.deliveredAt >= s && l.deliveredAt < s + 7 * DAY);
    return { label: `${new Date(s).getMonth() + 1}/${new Date(s).getDate()}`, loads: xs.length, spend: Math.round(xs.reduce((a, l) => a + (l.invoice?.total || 0), 0)) };
  });

  return (
    <div className="page wide dash" style={{ maxWidth: 1400 }}>
      <div className="dash-head">
        <div>
          <div className="subhead secondary">{new Date(now).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="large-title">{greeting()}, {data.me.name.split(' ')[0]}</h1>
        </div>
        <button className="btn primary large" onClick={() => go('/new')}><Icon name="plus" size={18} stroke={2.4} />Request a pickup</button>
      </div>

      <div className="dkpis">
        <KpiTile icon={<Icon name="truck" size={20} />} tone="green" k="On the road" v={loads.filter(isActive).length} d={`${loads.filter((l) => l.status === 'in_transit').length} loaded and moving`} />
        <KpiTile icon={<Icon name="flag" size={20} />} tone="teal" k="Arriving today" v={arrivingToday} d="by ETA" />
        <KpiTile icon={<Icon name="search" size={20} />} tone="orange" k="Finding a carrier" v={loads.filter((l) => l.status === 'requested').length} d="waiting for acceptance" />
        <KpiTile icon={<Icon name="checkCircle" size={20} />} tone="indigo" k="Delivered this month" v={deliveredMonth.length} d={onTime == null ? '—' : `${onTime}% on time (30 days)`} />
        <KpiTile icon={<Icon name="dollar" size={20} />} tone="blue" k="Spend this month" v={money(spendMonth)} d={`${money(unpaid.reduce((a, l) => a + l.invoice.total, 0))} unpaid`} onClick={() => go('/billing')} />
      </div>

      <div className="dash-main">
        <div className="map-card dash-map">
          <MapView height="100%" trucks={trucks} places={places} lines={lines} highlight={hover} fitKey={`ship-${lines.length}-${places.length}`} padding={60}
            onLineClick={(id) => go(`/loads/${id}`)} onTruckClick={(id) => go(`/loads/${id}`)} />
          <div className="map-overlay glass dash-legend">
            {[['To pickup', COLOR.en_route_pickup], ['Loaded', COLOR.in_transit], ['Carrier assigned', COLOR.accepted]].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
          </div>
        </div>
        <div className="card dash-attn">
          <div className="dash-card-head"><Icon name="box" size={16} style={{ color: 'var(--blue)' }} /><span className="headline">Your loads live</span><span className="footnote secondary">{live.length}</span></div>
          <div className="dash-scroll">
            {live.length === 0 && <div className="empty-mini">Nothing on the road. Tap “Request a pickup”.</div>}
            {live.map((l) => {
              const d = idx.users[l.driverId]; const t = idx.trucks[l.truckId];
              return (
                <button key={l.id} className="liveload" onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)} onClick={() => go(`/loads/${l.id}`)}>
                  <div className="row between" style={{ gap: 8 }}><b className="subhead truncate">{l.pickup.city} → {l.dropoff.city}</b><StatusPill status={l.status} /></div>
                  <Progress value={progressOf(l)} color={COLOR[l.status]} height={6} />
                  <div className="row between footnote secondary" style={{ gap: 8 }}>
                    <span className="truncate">{l.ref}{d ? ` · ${d.name.split(' ')[0]}` : ''}{t ? ` · Unit ${t.unit}` : ''}</span>
                    <span style={{ flex: 'none' }}>{l.status === 'requested' ? `posted ${ago(l.createdAt)}` : l.eta?.deliveryAt ? `arrives ${time(l.eta.deliveryAt)}` : ''}{l.eta?.remainingKm ? ` · ${km(l.eta.remainingKm)}` : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card pad-lg" style={{ marginTop: 14 }}>
        <div className="dash-card-head" style={{ padding: 0, border: 0 }}><Icon name="camera" size={16} style={{ color: 'var(--indigo)' }} /><span className="headline">Photos of your loads</span><span className="footnote secondary">taken by the driver at pickup and delivery</span></div>
        {gallery.length === 0 ? <div className="empty-mini">Photos appear here as soon as your loads are picked up and delivered.</div> : (
          <div className="gallery">
            {gallery.map((l) => {
              const del = l.photos.delivery || []; const pu = l.photos.pickup || [];
              const shots = (del.length ? del : pu).slice(0, 4);
              const d = idx.users[l.driverId];
              return (
                <div key={l.id} className="gal-card">
                  <div className="gal-grid">
                    {shots.map((p) => <button key={p.id} className="gal-img" onClick={() => setPhoto({ ...p, label: `${l.ref} · ${p.slot === 'damage' ? 'Damage' : del.length ? 'Delivery' : 'Pickup'}` })}><img src={p.url} alt="" loading="lazy" /></button>)}
                  </div>
                  <div className="gal-meta">
                    <div className="row between" style={{ gap: 6 }}><b className="subhead truncate">{l.ref} · {l.dropoff.city}</b>{l.damage?.hasDamage ? <span className="pill red">Damage noted</span> : del.length ? <span className="pill green">Delivered</span> : <span className="pill blue">Loaded</span>}</div>
                    <div className="footnote secondary truncate">
                      {del.length ? `Arrived ${date(l.arrivedDeliveryAt)} ${time(l.arrivedDeliveryAt)}${l.signature ? ` · signed by ${l.signature.name}` : ''}` : `Picked up ${date(l.departedPickupAt)} ${time(l.departedPickupAt)}`}
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>{d && <Avatar user={d} size="sm" />}<span className="footnote secondary">{d?.name || ''} · {del.length + pu.length} photos</span><span className="spacer" /><button className="btn small" onClick={() => go(`/loads/${l.id}`)}>All photos</button></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dash-charts">
        <div className="card pad-lg"><div className="headline">Shipments per week</div><MiniBars data={weeks.map((w) => ({ label: w.label, value: w.loads }))} color="var(--blue)" /></div>
        <div className="card pad-lg"><div className="headline">Spend per week</div><MiniBars data={weeks.map((w) => ({ label: w.label, value: w.spend }))} color="var(--indigo)" format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)} /></div>
        <div className="card pad-lg"><div className="headline">Deliveries on time (30 days)</div><Donut segments={[{ label: 'On time', value: pd.filter((x) => x.kind !== 'late').length, color: '#10b981' }, { label: 'Late', value: pd.filter((x) => x.kind === 'late').length, color: '#f97316' }]} center={onTime == null ? '—' : `${onTime}%`} sub="on time" /></div>
        <div className="card pad-lg">
          <div className="headline">Invoices</div>
          {unpaid.length === 0 ? <div className="empty-mini"><Icon name="checkCircle" size={24} style={{ color: 'var(--green)' }} />All paid</div> : unpaid.slice(0, 5).map((l) => (
            <button key={l.id} className="feed" onClick={() => go('/billing')}>
              <span className="feed-icon"><Icon name="receipt" size={14} style={{ color: 'var(--orange)' }} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><span className="subhead" style={{ display: 'block' }}>{l.invoice.number}</span><span className="footnote secondary">{l.ref} · {date(l.invoice.issuedAt)}</span></span>
              <b className="num">{money(l.invoice.total)}</b>
            </button>
          ))}
        </div>
      </div>
      {photo && <Lightbox photo={photo} onClose={() => setPhoto(null)} />}
    </div>
  );
}
