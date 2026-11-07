import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Segmented, Empty } from '../../components/ui.jsx';
import { LoadCard } from '../../components/LoadBits.jsx';
import { useStore, isActive } from '../../lib/store.jsx';
import { go } from '../../lib/router.js';

export default function Shipments({ showPay }) {
  const { data } = useStore();
  const [tab, setTab] = useState('active');
  const [q, setQ] = useState('');
  const filters = {
    active: (l) => isActive(l) || l.status === 'requested',
    delivered: (l) => l.status === 'delivered',
    all: () => true,
  };
  const list = data.loads
    .filter(filters[tab])
    .filter((l) => !q || `${l.ref} ${l.pickup.city} ${l.dropoff.city} ${l.cargo.description} ${l.poNumber}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="page">
      <PageHead title="Shipments" sub={`${data.loads.length} loads`}>
        {data.me.role === 'shipper' && <button className="btn primary" onClick={() => go('/new')}><Icon name="plus" size={18} stroke={2.4} />Request pickup</button>}
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'delivered', label: 'Delivered' }, { value: 'all', label: 'All' }]} />
        <div className="spacer" />
        <div className="row" style={{ background: 'var(--bg-fill)', borderRadius: 10, padding: '0 10px', height: 36, minWidth: 220 }}>
          <Icon name="search" size={16} style={{ color: 'var(--label-3)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ref, city, PO" style={{ border: 0, background: 'none', outline: 'none', flex: 1 }} />
        </div>
      </div>
      {list.length === 0 ? <div className="card"><Empty title="No shipments here">Try another filter.</Empty></div>
        : <div className="grid grid-2">{list.map((l) => <LoadCard key={l.id} load={l} showPay={showPay} />)}</div>}
    </div>
  );
}
