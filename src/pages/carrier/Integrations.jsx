// ELD integrations: connect Samsara / Motive / Geotab / Isaac, link their vehicles and drivers, see official HOS clocks.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHead, Sheet, Field, ActionButton, ConfirmButton, Switch, Avatar, Empty } from '../../components/ui.jsx';
import { Tabs } from '../../components/LoadList.jsx';
import { useStore, useNow } from '../../lib/store.jsx';
import { api, post, patch, del, standalone } from '../../lib/api.js';
import { ago } from '../../lib/format.js';
import { hosStatus, hm, clockTone, hosStale } from '../../lib/hos.js';

function Logo({ p, size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: p.color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.42, flex: 'none' }}>
      {p.sandbox ? <Icon name="sparkles" size={size * 0.5} /> : p.name[0]}
    </div>
  );
}

const STATUS_PILL = { connected: ['green', 'Connected'], auth_error: ['red', 'Sign-in failed'], error: ['orange', 'Sync problem'] };

export default function Integrations() {
  const { data, toast } = useStore();
  useNow(15000);
  const [providers, setProviders] = useState([]);
  const [eld, setEld] = useState(undefined);
  const [connecting, setConnecting] = useState(null);
  const [changing, setChanging] = useState(false);
  const [tab, setTab] = useState('hos');

  const load = useCallback(async () => {
    try { const r = await api('/integrations'); setProviders(r.providers); setEld(r.eld); } catch (e) { toast({ title: 'Couldn’t load integrations', body: e.message, tone: 'error' }); }
  }, [toast]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (eld === undefined) return <div className="page"><div className="spinner" /></div>;
  const meta = eld && providers.find((p) => p.id === eld.provider);
  const run = async (fn, okTitle) => {
    try { const r = await fn(); if (r?.provider || r === null) setEld(r); if (okTitle) toast({ title: okTitle }); return r; } catch (e) { toast({ title: 'Something went wrong', body: e.message, tone: 'error' }); return null; }
  };

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHead sub="Connect your ELD so official hours of service and live truck locations flow into Rugo." />

      {eld && meta && !changing ? (
        <>
          <div className="card pad-lg" style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
              <Logo p={meta} size={44} />
              <div className="spacer stack-sm" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="title3">{meta.name}</span>
                  <span className={`pill ${STATUS_PILL[eld.status]?.[0] || 'gray'}`}><span className="dot" />{STATUS_PILL[eld.status]?.[1] || eld.status}</span>
                  {!eld.enabled && <span className="pill gray">Paused</span>}
                  {meta.sandbox && <span className="pill gray">Test data</span>}
                </div>
                <div className="footnote secondary">
                  Last sync {eld.lastSyncAt ? ago(eld.lastSyncAt) : 'never'} · syncs every {Math.round(eld.syncEveryMs / 1000)} s
                  {Object.entries(eld.credsHint || {}).filter(([, v]) => v).map(([k, v]) => ` · ${meta.fields.find((f) => f.key === k)?.label}: ${v}`).join('')}
                </div>
                {eld.stats && (
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    <span className="pill"><Icon name="truck" size={12} />{eld.stats.vehiclesLinked} of {eld.stats.vehicles} vehicles linked</span>
                    <span className="pill"><Icon name="people" size={12} />{eld.stats.driversLinked} of {eld.stats.drivers} drivers linked</span>
                    <span className="pill"><Icon name="clock" size={12} />{eld.stats.withClocks} HOS clocks</span>
                    {meta.positions && <span className="pill"><Icon name="location" size={12} />{eld.stats.positions} live positions</span>}
                  </div>
                )}
              </div>
              <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <label className="row footnote secondary" style={{ gap: 6 }}>Auto sync <Switch checked={eld.enabled} onChange={(v) => run(() => patch('/integrations/eld', { enabled: v }))} label="Auto sync" /></label>
                <ActionButton className="btn" onClick={() => run(() => post('/integrations/eld/sync'), 'Synced')}><Icon name="refresh" size={15} />Sync now</ActionButton>
                <button className="btn" onClick={() => setChanging(true)}>Change provider</button>
                <ConfirmButton className="btn danger" confirmLabel="Disconnect?" onConfirm={() => run(async () => { await del('/integrations/eld'); return null; }, 'ELD disconnected')}>Disconnect</ConfirmButton>
              </div>
            </div>
            {eld.lastError && (
              <div className="row" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-fill-2)', gap: 10 }}>
                <Icon name="warning" size={16} style={{ color: 'var(--red)' }} />
                <span className="subhead spacer">{eld.lastError}</span>
                {eld.status === 'auth_error' && <button className="btn small" onClick={() => setConnecting(meta)}>Update credentials</button>}
              </div>
            )}
            {eld.webhookPath && !standalone && <Webhook path={eld.webhookPath} name={meta.name} />}
          </div>

          <Tabs value={tab} onChange={setTab} options={[
            { value: 'hos', label: 'Hours of service' },
            { value: 'drivers', label: `Drivers · ${eld.drivers.length}` },
            { value: 'vehicles', label: `Vehicles · ${eld.vehicles.length}` },
          ]} />
          {tab === 'hos' && <HosTable users={data.users} trucks={data.trucks} />}
          {tab === 'drivers' && <LinkTable kind="drivers" eld={eld} setEld={setEld} rugo={data.users.filter((u) => u.role === 'driver')} toast={toast} />}
          {tab === 'vehicles' && <LinkTable kind="vehicles" eld={eld} setEld={setEld} rugo={data.trucks} toast={toast} />}
        </>
      ) : (
        <>
          {changing && <button className="btn plain" style={{ marginBottom: 8 }} onClick={() => setChanging(false)}><Icon name="chevronLeft" size={15} />Back to {meta?.name}</button>}
          <div className="section-header" style={{ marginTop: 0 }}>ELD & hours of service</div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {providers.map((p) => (
              <div key={p.id} className="card pad-lg stack-sm">
                <div className="row" style={{ gap: 12 }}>
                  <Logo p={p} />
                  <div className="spacer">
                    <div className="headline">{p.name}</div>
                    <div className="footnote secondary">{p.sandbox ? 'Try it with test data' : `HOS clocks${p.positions ? ' · live GPS' : ''}${p.webhook ? ' · webhooks' : ''}`}</div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 6, minHeight: 22 }}>
                  {p.beta && <span className="pill orange">Partner API</span>}
                  {!p.sandbox && <span className="pill gray">Canada & US certified</span>}
                </div>
                <button className="btn primary" onClick={() => setConnecting(p)}>{eld?.provider === p.id ? 'Reconnect' : 'Connect'}</button>
              </div>
            ))}
          </div>
          <div className="section-footer">Rugo reads drivers, vehicles, duty status, remaining drive / shift / cycle time and GPS. It never writes to your ELD — the ELD stays the official record for roadside inspections.</div>
        </>
      )}

      {connecting && <ConnectSheet p={connecting} existing={eld?.provider === connecting.id ? eld : null} onClose={() => setConnecting(null)}
        onDone={(r) => { setEld(r); setConnecting(null); setChanging(false); setTab('drivers'); toast({ title: `${connecting.name} connected`, body: `${r.stats?.driversLinked ?? 0} drivers and ${r.stats?.vehiclesLinked ?? 0} vehicles linked automatically.` }); }} />}
    </div>
  );
}

function Webhook({ path, name }) {
  const url = `${window.location.origin}${path}`;
  return (
    <div className="row" style={{ marginTop: 12, gap: 10 }}>
      <Icon name="bolt" size={15} style={{ color: 'var(--label-3)' }} />
      <div className="spacer" style={{ minWidth: 0 }}>
        <div className="footnote secondary">Instant updates (optional) — add this webhook URL in {name}:</div>
        <div className="mono footnote truncate">{url}</div>
      </div>
      <button className="btn small" onClick={() => navigator.clipboard?.writeText(url)}>Copy</button>
    </div>
  );
}

function ConnectSheet({ p, existing, onClose, onDone }) {
  const [f, setF] = useState(() => Object.fromEntries(p.fields.map((x) => [x.key, x.secret ? '' : existing?.credsHint?.[x.key] || x.default || ''])));
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const missing = p.fields.some((x) => !x.default && !x.options && !f[x.key] && !(x.secret && existing?.credsHint?.[x.key]));
  const test = async () => {
    setError(''); setResult(null);
    try { setResult(await post('/integrations/eld/test', { provider: p.id, creds: f })); } catch (e) { setError(e.message); }
  };
  const connect = async () => {
    setError('');
    try { onDone(await post('/integrations/eld', { provider: p.id, creds: f })); } catch (e) { setError(e.message); }
  };
  return (
    <Sheet title={`Connect ${p.name}`} onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: 12 }}>
          <Logo p={p} size={40} />
          <ol className="subhead secondary" style={{ margin: 0, paddingLeft: 18 }}>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
        {p.fields.map((x) => (
          <Field key={x.key} label={x.label}>
            {x.options ? (
              <select className="select" value={f[x.key]} onChange={(e) => setF((v) => ({ ...v, [x.key]: e.target.value }))}>{x.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            ) : (
              <input className={`input ${x.secret ? 'mono' : ''}`} type={x.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false}
                placeholder={x.secret && existing?.credsHint?.[x.key] ? `Saved (${existing.credsHint[x.key]}) — leave blank to keep` : x.placeholder || ''}
                value={f[x.key]} onChange={(e) => setF((v) => ({ ...v, [x.key]: e.target.value }))} />
            )}
          </Field>
        ))}
        {p.beta && <div className="footnote orange">Isaac’s partner API isn’t publicly documented. Rugo uses common field names; if your data doesn’t appear, send us Isaac’s API docs and we’ll adjust the mapping.</div>}
        {standalone && !p.sandbox && <div className="footnote orange">This in-browser demo can’t reach ELD servers. Run the Rugo server to connect a real account, or try the Sandbox.</div>}
        {error && <div className="subhead red">{error}</div>}
        {result && <div className="subhead green"><Icon name="checkCircle" size={15} /> Connection works — found {result.vehicles} vehicles and {result.drivers} drivers.</div>}
        <div className="row" style={{ gap: 8 }}>
          {!p.sandbox && <ActionButton className="btn" disabled={missing} onClick={test}>Test connection</ActionButton>}
          <ActionButton className="btn primary spacer" disabled={missing} onClick={connect}><Icon name="plug" size={16} />Connect {p.name}</ActionButton>
        </div>
        <div className="footnote secondary">Keys are stored on the Rugo server only and are never sent back to the browser.</div>
      </div>
    </Sheet>
  );
}

function Clock({ min, warn }) {
  return <span className={`num ${clockTone(min, warn) === 'gray' ? 'secondary' : clockTone(min, warn)}`} style={{ fontWeight: 500 }}>{hm(min)}</span>;
}

function HosTable({ users, trucks }) {
  const rows = users.filter((u) => u.role === 'driver' && u.hos).sort((a, b) => ((a.hos.flag ? 0 : 1) - (b.hos.flag ? 0 : 1)) || (a.hos.driveLeftMin ?? 1e9) - (b.hos.driveLeftMin ?? 1e9));
  if (!rows.length) return <div className="card"><Empty icon="clock" title="No HOS clocks yet">Link drivers in the Drivers tab — their clocks show up here after the next sync.</Empty></div>;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Driver</th><th>Duty status</th><th className="r">Drive left</th><th className="r">Shift left</th><th className="r">Cycle left</th><th className="r">Break due in</th><th>ELD vehicle</th><th>Updated</th></tr></thead>
        <tbody>
          {rows.map((u) => {
            const h = u.hos; const st = hosStatus(h);
            const truck = trucks.find((t) => t.id === h.truckId);
            return (
              <tr key={u.id}>
                <td><div className="row" style={{ gap: 8 }}><Avatar user={u} /><span>{u.name}</span>{h.flag === 'violation' && <span className="pill red">Violation</span>}{h.flag === 'low' && <span className="pill orange">Low</span>}{h.flag === 'break' && <span className="pill orange">Break due</span>}</div></td>
                <td><span className={`pill ${st.tone}`}><span className="dot" />{st.label}</span></td>
                <td className="r"><Clock min={h.driveLeftMin} /></td>
                <td className="r"><Clock min={h.shiftLeftMin} /></td>
                <td className="r"><Clock min={h.cycleLeftMin} warn={300} /></td>
                <td className="r"><Clock min={h.breakLeftMin} warn={30} /></td>
                <td>{truck ? `Unit ${truck.unit}` : h.vehicleName || '—'}</td>
                <td className={hosStale(h) ? 'orange' : 'secondary'}>{ago(h.at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LinkTable({ kind, eld, setEld, rugo, toast }) {
  const isD = kind === 'drivers';
  const items = isD ? eld.drivers : eld.vehicles;
  const map = isD ? eld.driverMap : eld.vehicleMap;
  const [pick, setPick] = useState(() => new Set());
  const unlinked = useMemo(() => items.filter((x) => !map[x.extId]), [items, map]);
  const label = (r) => (isD ? r.name : `Unit ${r.unit}${r.make ? ` — ${r.make} ${r.model}` : ''}`);
  const setLink = async (extId, rid) => {
    try { setEld(await patch('/integrations/eld', { [isD ? 'driverMap' : 'vehicleMap']: { [extId]: rid || null } })); } catch (e) { toast({ title: 'Not saved', body: e.message, tone: 'error' }); }
  };
  const doImport = async () => {
    try {
      const r = await post('/integrations/eld/import', { [kind]: [...pick] });
      setEld(r.eld); setPick(new Set());
      const n = isD ? r.created.drivers : r.created.trucks;
      toast({ title: `Added ${n} ${isD ? 'driver' : 'truck'}${n === 1 ? '' : 's'}`, body: isD ? 'Add their email addresses in Drivers.' : 'Fill in make and model in Inventory.' });
    } catch (e) { toast({ title: 'Couldn’t add', body: e.message, tone: 'error' }); }
  };
  if (!items.length) return <div className="card"><Empty icon={isD ? 'people' : 'truck'} title={`No ${kind} in the ELD account`} /></div>;
  return (
    <>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th style={{ width: 36 }} /><th>In {eld.providerName}</th><th style={{ width: 30 }} /><th>In Rugo</th><th>{isD ? 'Duty status' : 'Last position'}</th></tr></thead>
          <tbody>
            {items.map((x) => {
              const linked = map[x.extId];
              return (
                <tr key={x.extId}>
                  <td>{!linked && <input type="checkbox" aria-label={`Select ${x.name}`} checked={pick.has(x.extId)} onChange={(e) => setPick((s) => { const n = new Set(s); if (e.target.checked) n.add(x.extId); else n.delete(x.extId); return n; })} />}</td>
                  <td>
                    <div>{x.name || x.extId}</div>
                    <div className="footnote secondary truncate">{[isD ? x.email : x.vin, isD ? x.licenseNumber : x.plate, `ID ${x.extId}`].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td><Icon name="chevron" size={14} style={{ color: linked ? 'var(--green)' : 'var(--label-3)' }} /></td>
                  <td>
                    <select className="select" style={{ height: 34, minWidth: 220 }} aria-label={`Link ${x.name}`} value={linked || ''} onChange={(e) => setLink(x.extId, e.target.value)}>
                      <option value="">Not linked</option>
                      {rugo.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
                    </select>
                  </td>
                  <td className="secondary">{isD ? (x.status ? hosStatus({ status: x.status }).label : '—') : x.positionAt ? `${x.address || 'Reported'} · ${ago(x.positionAt)}` : 'No GPS'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <div className="footnote secondary">Matched automatically by {isD ? 'email, licence number or name' : 'VIN, plate or unit number'}. Change any link above.</div>
        {unlinked.length > 0 && <ActionButton className="btn" disabled={!pick.size} onClick={doImport}><Icon name="plus" size={15} />Add {pick.size || ''} as new {isD ? 'drivers' : 'trucks'}</ActionButton>}
      </div>
    </>
  );
}
