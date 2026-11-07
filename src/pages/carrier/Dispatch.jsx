import { useState } from 'react';
import { PageHead, Segmented, Empty, StatusPill, Tracker, Avatar } from '../../components/ui.jsx';
import { etaText } from '../../components/LoadBits.jsx';
import { useStore, useIndex, isActive, useNow } from '../../lib/store.jsx';
import { money, km, date, placeShort, ago } from '../../lib/format.js';
import { go } from '../../lib/router.js';

export default function Dispatch() {
  const { data } = useStore();
  const idx = useIndex();
  useNow(10000);
  const [tab, setTab] = useState('active');
  const mine = data.loads.filter((l) => l.carrierId === data.me.companyId);
  const list = (tab === 'active' ? mine.filter(isActive) : mine.filter((l) => l.status === 'delivered')).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead title="Jobs" sub={`${mine.filter(isActive).length} in progress`}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'In progress' }, { value: 'done', label: 'Completed' }]} />
      </PageHead>
      <div className="card table-wrap">
        {list.length === 0 ? <Empty icon="route" title={tab === 'active' ? 'No jobs in progress' : 'No completed jobs'}>Accept a load from the board to dispatch a driver.</Empty> : (
          <table className="table">
            <thead>
              <tr><th>Load</th><th>Driver</th><th>Route</th><th style={{ minWidth: 160 }}>Progress</th><th>{tab === 'active' ? 'ETA' : 'Delivered'}</th>
                <th className="r">km (GPS)</th><th className="r">Payout</th>{tab === 'done' && <th className="r">Profit</th>}<th>Photos</th></tr>
            </thead>
            <tbody>
              {list.map((l) => {
                const d = idx.users[l.driverId];
                const t = idx.trucks[l.truckId];
                const photos = l.photos.pickup.length + l.photos.delivery.length;
                return (
                  <tr key={l.id} className="click" onClick={() => go(`/loads/${l.id}`)}>
                    <td><div className="mono headline">{l.ref}</div><StatusPill status={l.status} /></td>
                    <td><div className="row"><Avatar user={d} size="sm" /><div><div>{d?.name}</div><div className="caption secondary">Unit {t?.unit}</div></div></div></td>
                    <td>{placeShort(l.pickup)} → {placeShort(l.dropoff)}</td>
                    <td><Tracker status={l.status} />{t?.location?.updatedAt && tab === 'active' && <div className="caption tertiary" style={{ marginTop: 4 }}>GPS {ago(t.location.updatedAt)}</div>}</td>
                    <td>{tab === 'active' ? etaText(l) || '—' : date(l.deliveredAt)}</td>
                    <td className="r">{km(l.metrics.loadedKm + l.metrics.deadheadKm)}</td>
                    <td className="r">{money(l.invoice?.carrierPayout ?? l.quote.carrierPayout)}</td>
                    {tab === 'done' && <td className={`r ${l.economics?.margin >= 0 ? 'green' : 'red'}`}>{money(l.economics?.margin)}</td>}
                    <td>{photos ? `${photos}${l.damage?.hasDamage ? ' · ⚠︎' : ''}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
