// "My work"-style page: underline tabs, filter bar, loads grouped by where they are.
import { useState } from 'react';
import Icon from './Icon.jsx';
import { Segmented, Empty } from './ui.jsx';
import { LoadGroups, Tabs, FilterChip, SearchBox, priorityOf, whenOf, PRIORITY_LABEL } from './LoadList.jsx';
import { useStore, useNow, isActive } from '../lib/store.jsx';
import { go } from '../lib/router.js';

const STAGES = [
  { value: 'requested', label: 'Waiting for carrier', match: ['requested'] },
  { value: 'pickup', label: 'Heading to pickup', match: ['accepted', 'en_route_pickup', 'at_pickup'] },
  { value: 'transit', label: 'On the road', match: ['in_transit', 'at_delivery'] },
  { value: 'delivered', label: 'Delivered', match: ['delivered'] },
];

export default function LoadsView({ scope, carrier }) {
  const { data } = useStore();
  useNow(30000);
  const [tab, setTab] = useState('all');
  const [who, setWho] = useState('mine');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [prio, setPrio] = useState('');
  const [eq, setEq] = useState('');
  const me = data.me;

  const base = data.loads.filter(scope);
  const mine = (l) => (carrier ? l.carrierId === me.companyId : l.createdBy === me.id);
  const week = Date.now() - 7 * 864e5;
  const tabs = {
    all: () => true,
    active: (l) => l.status === 'requested' || isActive(l),
    late: (l) => whenOf(l).late,
    week: (l) => (l.deliveredAt || l.createdAt) > week || isActive(l),
  };
  const list = base
    .filter((l) => (who === 'mine' ? mine(l) : true))
    .filter(tabs[tab])
    .filter((l) => !stage || STAGES.find((s) => s.value === stage).match.includes(l.status))
    .filter((l) => prio === '' || priorityOf(l) === Number(prio))
    .filter((l) => !eq || l.cargo.equipment === eq)
    .filter((l) => !q || `${l.ref} ${l.pickup.city} ${l.dropoff.city} ${l.cargo.description} ${l.poNumber}`.toLowerCase().includes(q.toLowerCase()));
  const lateCount = base.filter((l) => (who === 'mine' ? mine(l) : true)).filter(tabs.late).length;

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <Tabs value={tab} onChange={setTab}
        options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'late', label: lateCount ? `Running late · ${lateCount}` : 'Running late' }, { value: 'week', label: 'This week' }]}
        right={<Segmented value={who} onChange={setWho} options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: carrier ? 'Everyone' : 'Company' }]} />} />
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Filter by ref, city, PO…" />
        <FilterChip icon="route" label="Status" value={stage} onChange={setStage} options={STAGES} />
        <FilterChip icon="chart" label="Priority" value={prio} onChange={setPrio} options={[4, 3, 2, 1, 0].map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))} />
        <FilterChip icon="truck" label="Trailer" value={eq} onChange={setEq} options={Object.entries(data.meta.equipment).map(([k, e]) => ({ value: k, label: e.label }))} />
        <div className="spacer" />
        {!carrier && <button className="btn primary" onClick={() => go('/new')}><Icon name="plus" size={15} stroke={2.4} />Request pickup</button>}
      </div>
      <LoadGroups loads={list} showPay={carrier}
        empty={<Empty icon="box" title="Nothing matches">Try another tab or clear the filters.</Empty>} />
    </div>
  );
}
