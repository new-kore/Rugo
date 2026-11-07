import { useMemo } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import { Stat, Empty } from '../../components/ui.jsx';
import { LoadGroups } from '../../components/LoadList.jsx';
import { useStore, useIndex, isActive } from '../../lib/store.jsx';
import { go } from '../../lib/router.js';
import { money } from '../../lib/format.js';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function ShipperHome() {
  const { data } = useStore();
  const idx = useIndex();
  const loads = data.loads;
  const active = loads.filter((l) => isActive(l) || l.status === 'requested').sort((a, b) => b.updatedAt - a.updatedAt);
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const delivered = loads.filter((l) => l.status === 'delivered' && l.deliveredAt >= month.getTime() - 30 * 864e5);
  const spend = delivered.reduce((a, l) => a + (l.invoice?.total || 0), 0);
  const onTime = delivered.length ? Math.round((delivered.filter((l) => !l.damage?.hasDamage).length / delivered.length) * 100) : 100;

  const trucks = useMemo(() => loads.filter(isActive).map((l) => {
    const t = idx.trucks[l.truckId];
    const d = idx.users[l.driverId];
    return t && { ...t, id: l.id, color: d?.color, moving: true, label: `${l.ref} · ${l.dropoff.city}` };
  }).filter(Boolean), [loads, idx]);
  const places = useMemo(() => loads.filter(isActive).map((l) => ({ ...l.dropoff, kind: 'dropoff', label: l.dropoff.city })), [loads]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="subhead secondary">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="large-title">{greeting()}, {data.me.name.split(' ')[0]}</h1>
        </div>
      </div>

      <div className="map-card" style={{ marginBottom: 20 }}>
        <MapView height={400} trucks={trucks} places={places} fitKey={`home-${trucks.length}`} onTruckClick={(id) => go(`/loads/${id}`)} padding={60} />
        <div className="map-overlay" style={{ left: 16, right: 16, top: 16, display: 'flex', justifyContent: 'center' }}>
          <button className="glass row" onClick={() => go('/new')} style={{ border: 0, cursor: 'pointer', padding: '14px 18px', width: 'min(520px, 100%)', gap: 14, textAlign: 'left' }}>
            <div className="icon-tile" style={{ background: 'var(--blue)', width: 40, height: 40, borderRadius: 20 }}><Icon name="search" size={20} stroke={2.2} /></div>
            <div className="spacer">
              <div className="title3">Where is your load going?</div>
              <div className="footnote secondary">Instant price · a truck in minutes</div>
            </div>
            <Icon name="chevron" size={20} style={{ color: 'var(--label-3)' }} />
          </button>
        </div>
        {trucks.length > 0 && (
          <div className="map-overlay glass" style={{ left: 16, bottom: 16, padding: '8px 12px' }}>
            <span className="pill blue live" style={{ background: 'none', padding: 0 }}><span className="dot" />{trucks.length} load{trucks.length > 1 ? 's' : ''} moving now</span>
          </div>
        )}
      </div>

      <div className="grid grid-4" style={{ marginBottom: 8 }}>
        <Stat icon="truck" k="Active now" v={loads.filter(isActive).length} d={`${loads.filter((l) => l.status === 'requested').length} waiting for a carrier`} />
        <Stat icon="checkCircle" tone="green" k="Delivered (30 days)" v={delivered.length} d={`${onTime}% damage-free`} />
        <Stat icon="dollar" tone="indigo" k="Spend (30 days)" v={money(spend)} d={delivered.length ? `${money(spend / delivered.length)} average` : '—'} />
        <Stat icon="route" tone="orange" k="Kilometres moved" v={Math.round(delivered.reduce((a, l) => a + l.metrics.loadedKm, 0)).toLocaleString()} d="GPS tracked" />
      </div>

      <div className="row between" style={{ margin: '24px 4px 10px' }}>
        <h2 className="title2">Your shipments</h2>
        <button className="btn plain" onClick={() => go('/shipments')}>See all</button>
      </div>
      {active.length === 0
        ? <div className="card"><Empty icon="box" title="Nothing on the road">Tap “Where is your load going?” to request a pickup.</Empty></div>
        : <LoadGroups loads={active} />}
    </div>
  );
}
