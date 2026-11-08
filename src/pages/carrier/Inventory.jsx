// Inventory: every truck and trailer, what it's doing now, and which route it's attached to.
import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Segmented, Sheet, Field, ActionButton, ConfirmButton, Empty } from '../../components/ui.jsx';
import { useStore, useIndex, isActive } from '../../lib/store.jsx';
import { money2, km, date, placeShort } from '../../lib/format.js';
import { post, patch, del } from '../../lib/api.js';
import { go } from '../../lib/router.js';
import { truckEconomy } from './Drivers.jsx';
import { EQ_COLOR } from '../../components/LoadList.jsx';

export default function Inventory() {
  const { data, toast } = useStore();
  const idx = useIndex();
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('rugo.invTab') || 'trucks'; } catch { return 'trucks'; } });
  const [edit, setEdit] = useState(null);
  const [attach, setAttach] = useState(null);
  const active = data.loads.filter(isActive);
  const jobOfTruck = Object.fromEntries(active.map((l) => [l.truckId, l]));
  const jobOfTrailer = Object.fromEntries(active.filter((l) => l.trailerId).map((l) => [l.trailerId, l]));
  const lastOfTrailer = (id) => data.loads.filter((l) => l.trailerId === id && l.status === 'delivered').sort((a, b) => b.deliveredAt - a.deliveredAt)[0];
  const trailers = data.trailers || [];
  const changeTab = (t) => { setTab(t); try { sessionStorage.setItem('rugo.invTab', t); } catch { /* ignore */ } };
  const inShop = trailers.filter((t) => t.status === 'shop').length;

  const StatusCell = ({ job, shop }) => (job
    ? <button className="pill blue" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); go(`/loads/${job.id}`); }}><span className="dot" />On {job.ref}</button>
    : shop ? <span className="pill orange">In the shop</span> : <span className="pill green">Available</span>);

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <PageHead sub={`${data.trucks.length} trucks · ${trailers.length} trailers · ${Object.keys(jobOfTruck).length + Object.keys(jobOfTrailer).length} in use${inShop ? ` · ${inShop} in the shop` : ''}`}>
        <Segmented value={tab} onChange={changeTab} options={[{ value: 'trucks', label: `Trucks (${data.trucks.length})` }, { value: 'trailers', label: `Trailers (${trailers.length})` }]} />
        <button className="btn primary" onClick={() => setEdit({ kind: tab === 'trucks' ? 'truck' : 'trailer', item: {} })}><Icon name="plus" size={18} stroke={2.4} />Add {tab === 'trucks' ? 'truck' : 'trailer'}</button>
      </PageHead>

      {tab === 'trucks' ? (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Unit</th><th>Vehicle</th><th>Status</th><th>Route & driver</th><th className="r">Odometer</th><th className="r">L/100 km</th><th className="r">Next service</th><th /></tr></thead>
            <tbody>
              {data.trucks.map((t) => {
                const job = jobOfTruck[t.id]; const e = truckEconomy(t, data); const service = t.nextServiceKm - t.odometerKm;
                return (
                  <tr key={t.id} className="click" onClick={() => setEdit({ kind: 'truck', item: t })}>
                    <td className="headline">Unit {t.unit}</td>
                    <td>{t.year} {t.make} {t.model}<div className="caption secondary mono">{t.plate}</div></td>
                    <td><StatusCell job={job} /></td>
                    <td>{job ? `${placeShort(job.pickup)} → ${placeShort(job.dropoff)}` : '—'}<div className="caption secondary">{idx.users[t.driverId]?.name || 'No driver'}</div></td>
                    <td className="r">{km(t.odometerKm)}</td>
                    <td className="r">{e.lPer100 ? e.lPer100.toFixed(1) : `${t.fuelLPer100} (spec)`}</td>
                    <td className={`r ${service < 0 ? 'red' : service < 2000 ? 'orange' : ''}`}>{service < 0 ? `Overdue ${km(-service)}` : `in ${km(service)}`}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn small" onClick={() => setAttach({ kind: 'truck', item: t })}>{job ? 'Move' : 'Attach to route'}</button>
                        <ConfirmButton className="btn small danger" confirmLabel="Delete?" disabled={!!job} aria-label={`Delete unit ${t.unit}`}
                          onConfirm={async () => { await del(`/trucks/${t.id}`); toast({ title: 'Truck deleted', body: `Unit ${t.unit}` }); }}><Icon name="trash" size={14} /></ConfirmButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card table-wrap">
          {trailers.length === 0 ? <Empty icon="truck" title="No trailers yet">Add your first trailer to start tracking it.</Empty> : (
            <table className="table">
              <thead><tr><th>Trailer</th><th>Type</th><th>Status</th><th>Route</th><th>Last job</th><th>Inspection</th><th /></tr></thead>
              <tbody>
                {trailers.map((t) => {
                  const job = jobOfTrailer[t.id]; const last = lastOfTrailer(t.id);
                  const insp = t.nextInspection; const due = insp && insp < Date.now() + 14 * 864e5;
                  return (
                    <tr key={t.id} className="click" onClick={() => setEdit({ kind: 'trailer', item: t })}>
                      <td><div className="headline">{t.unit}</div><div className="caption secondary">{t.year} {t.make} · <span className="mono">{t.plate}</span></div></td>
                      <td><span className="tag"><i style={{ background: EQ_COLOR[t.equipment] }} />{data.meta.equipment[t.equipment]?.label}</span></td>
                      <td><StatusCell job={job} shop={t.status === 'shop'} />{t.notes && t.status === 'shop' && <div className="caption secondary">{t.notes}</div>}</td>
                      <td>{job ? <>{placeShort(job.pickup)} → {placeShort(job.dropoff)}<div className="caption secondary">Unit {idx.trucks[job.truckId]?.unit || '—'} · {idx.users[job.driverId]?.name || ''}</div></> : '—'}</td>
                      <td className="footnote">{last ? `${last.ref} · ${date(last.deliveredAt)}` : '—'}</td>
                      <td className={due ? (insp < Date.now() ? 'red' : 'orange') : ''}>{insp ? (insp < Date.now() ? `Overdue (${date(insp)})` : date(insp)) : '—'}</td>
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn small" disabled={t.status === 'shop'} onClick={() => setAttach({ kind: 'trailer', item: t })}>{job ? 'Move' : 'Attach to route'}</button>
                          <ConfirmButton className="btn small danger" confirmLabel="Delete?" disabled={!!job} aria-label={`Delete ${t.unit}`}
                            onConfirm={async () => { await del(`/trailers/${t.id}`); toast({ title: 'Trailer deleted', body: t.unit }); }}><Icon name="trash" size={14} /></ConfirmButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {edit?.kind === 'truck' && <TruckSheet truck={edit.item} onClose={() => setEdit(null)} />}
      {edit?.kind === 'trailer' && <TrailerSheet trailer={edit.item} onClose={() => setEdit(null)} />}
      {attach && <AttachSheet asset={attach} onClose={() => setAttach(null)} />}
    </div>
  );
}

/** Attach a truck or trailer to a route in progress. */
function AttachSheet({ asset, onClose }) {
  const { data, toast, upsert } = useStore();
  const idx = useIndex();
  const isTrailer = asset.kind === 'trailer';
  const loads = data.loads.filter((l) => isActive(l) && l.carrierId === data.me.companyId).sort((a, b) => (a.cargo.equipment === asset.item.equipment ? -1 : 1) - (b.cargo.equipment === asset.item.equipment ? -1 : 1));
  const name = isTrailer ? asset.item.unit : `Unit ${asset.item.unit}`;
  const pick = async (l) => {
    const r = await post(`/loads/${l.id}/equipment`, isTrailer ? { trailerId: asset.item.id } : { truckId: asset.item.id });
    upsert('loads', r);
    toast({ title: `${name} attached`, body: `${l.ref} · ${placeShort(l.pickup)} → ${placeShort(l.dropoff)}` });
    onClose();
  };
  return (
    <Sheet title={`Attach ${name} to a route`} onClose={onClose}>
      <div className="stack">
        <div className="subhead secondary">Routes in progress. {isTrailer ? 'The trailer it replaces becomes available.' : 'The truck it replaces becomes free.'}</div>
        <div className="list">
          {loads.length === 0 && <div className="list-row secondary">No routes in progress. Add one from the calendar.</div>}
          {loads.map((l) => {
            const cur = isTrailer ? idx.trailers?.[l.trailerId]?.unit : idx.trucks[l.truckId] && `Unit ${idx.trucks[l.truckId].unit}`;
            const same = isTrailer ? l.trailerId === asset.item.id : l.truckId === asset.item.id;
            return (
              <ActionButton key={l.id} className="list-row" disabled={same} onClick={() => pick(l)}>
                <div className="label">
                  <div className="headline"><span className="mono">{l.ref}</span> {placeShort(l.pickup)} → {placeShort(l.dropoff)}</div>
                  <div className="footnote secondary">
                    {data.meta.equipment[l.cargo.equipment]?.label}{l.cargo.equipment !== asset.item.equipment && isTrailer ? ' · different trailer type' : ''} · {idx.users[l.driverId]?.name || 'no driver'} · now: {cur || 'none'}
                  </div>
                </div>
                {same ? <span className="pill green">Attached</span> : <Icon name="chevron" size={15} className="chev" />}
              </ActionButton>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

export function TruckSheet({ truck, onClose }) {
  const { data, upsert, toast } = useStore();
  const isNew = !truck.id;
  const [f, setF] = useState({ unit: '', make: '', model: '', year: 2024, plate: '', vin: '', equipment: 'dry_van', odometerKm: 0, fuelLPer100: 36, tankL: 900, ...truck });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const r = isNew ? await post('/trucks', f) : await patch(`/trucks/${truck.id}`, f);
    upsert('trucks', r);
    toast({ title: isNew ? 'Truck added' : 'Saved' });
    onClose();
  };
  return (
    <Sheet title={isNew ? 'New truck' : `Unit ${f.unit}`} onClose={onClose}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Unit number"><input className="input" value={f.unit} onChange={set('unit')} autoFocus={isNew} /></Field>
          <Field label="Plate"><input className="input" value={f.plate} onChange={set('plate')} /></Field>
          <Field label="Make"><input className="input" value={f.make} onChange={set('make')} /></Field>
          <Field label="Model"><input className="input" value={f.model} onChange={set('model')} /></Field>
          <Field label="Year"><input className="input" type="number" value={f.year} onChange={set('year')} /></Field>
          <Field label="Usual trailer type">
            <select className="select" value={f.equipment} onChange={set('equipment')}>
              {Object.entries(data.meta.equipment).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="Odometer (km)"><input className="input" type="number" value={f.odometerKm} onChange={set('odometerKm')} /></Field>
          <Field label="Fuel use (L/100 km)"><input className="input" type="number" step="0.1" value={f.fuelLPer100} onChange={set('fuelLPer100')} /></Field>
          {!isNew && <Field label="Next service at (km)"><input className="input" type="number" value={f.nextServiceKm} onChange={set('nextServiceKm')} /></Field>}
          <Field label="Tank size (L)"><input className="input" type="number" value={f.tankL} onChange={set('tankL')} /></Field>
        </div>
        <Field label="VIN"><input className="input mono" value={f.vin} onChange={set('vin')} /></Field>
        <ActionButton className="btn primary large" disabled={!f.unit} onClick={save}>{isNew ? 'Add truck' : 'Save changes'}</ActionButton>
      </div>
    </Sheet>
  );
}

function TrailerSheet({ trailer, onClose }) {
  const { data, upsert, toast } = useStore();
  const isNew = !trailer.id;
  const toDate = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const next = `T-${200 + (data.trailers?.length || 0) + 1}`;
  const [f, setF] = useState({ unit: isNew ? next : '', equipment: 'dry_van', make: '', year: 2024, lengthFt: 53, plate: '', vin: '', status: 'available', notes: '', ...trailer, nextInspection: toDate(trailer.nextInspection) });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const body = { ...f, nextInspection: f.nextInspection ? new Date(`${f.nextInspection}T00:00`).getTime() : null };
    const r = isNew ? await post('/trailers', body) : await patch(`/trailers/${trailer.id}`, body);
    upsert('trailers', r);
    toast({ title: isNew ? 'Trailer added' : 'Saved', body: r.unit });
    onClose();
  };
  return (
    <Sheet title={isNew ? 'New trailer' : f.unit} onClose={onClose}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Trailer number"><input className="input" value={f.unit} onChange={set('unit')} /></Field>
          <Field label="Type">
            <select className="select" value={f.equipment} onChange={set('equipment')}>
              {Object.entries(data.meta.equipment).filter(([k]) => k !== 'power_only').map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="Make"><input className="input" value={f.make} onChange={set('make')} placeholder="Utility, Great Dane…" /></Field>
          <Field label="Year"><input className="input" type="number" value={f.year} onChange={set('year')} /></Field>
          <Field label="Length (ft)"><input className="input" type="number" value={f.lengthFt} onChange={set('lengthFt')} /></Field>
          <Field label="Plate"><input className="input" value={f.plate} onChange={set('plate')} /></Field>
          <Field label="Next inspection"><input className="input" type="date" value={f.nextInspection} onChange={set('nextInspection')} /></Field>
          <Field label="Status">
            <select className="select" value={f.status} onChange={set('status')}>
              <option value="available">Available</option>
              <option value="shop">In the shop</option>
            </select>
          </Field>
        </div>
        <Field label="VIN"><input className="input mono" value={f.vin} onChange={set('vin')} /></Field>
        <Field label="Notes"><textarea className="textarea" style={{ minHeight: 60 }} value={f.notes} onChange={set('notes')} placeholder="Repairs, damage, reefer unit hours…" /></Field>
        <ActionButton className="btn primary large" disabled={!f.unit} onClick={save}>{isNew ? 'Add trailer' : 'Save changes'}</ActionButton>
      </div>
    </Sheet>
  );
}

export { money2 };
