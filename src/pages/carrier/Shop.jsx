// Office / shop: defects from daily inspections, work orders, out-of-service units and the inspection log.
import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Segmented } from '../../components/ui.jsx';
import { KpiTile } from '../../components/Charts.jsx';
import { InspectionReport, InspectionRow, WorkOrderSheet } from '../../components/DailyInspection.jsx';
import { useStore, isActive } from '../../lib/store.jsx';
import { dateTime, ago } from '../../lib/format.js';
import { validPreTrip, WO_STATUS, typeLabel } from '../../lib/inspections.js';

export default function Shop() {
  const { data } = useStore();
  const [tab, setTab] = useState('open');
  const [wo, setWo] = useState(null);
  const [report, setReport] = useState(null);
  const [q, setQ] = useState('');
  const wos = data.workOrders || [];
  const ins = useMemo(() => (data.inspections || []).slice().sort((a, b) => b.at - a.at), [data.inspections]);
  const open = wos.filter((w) => w.status !== 'repaired').sort((a, b) => (b.severity === 'major') - (a.severity === 'major') || b.reportedAt - a.reportedAt);
  const closed = wos.filter((w) => w.status === 'repaired').sort((a, b) => b.repairedAt - a.repairedAt);
  const oos = [...data.trucks.filter((t) => t.outOfService).map((t) => ({ ...t, kind: 'Unit' })), ...data.trailers.filter((t) => t.outOfService).map((t) => ({ ...t, kind: 'Trailer' }))];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIns = ins.filter((x) => x.at >= today.getTime());
  const drivers = data.users.filter((u) => u.role === 'driver');
  // Drivers on a job (or a truck) without a valid pre-trip right now.
  const missing = drivers.filter((d) => d.truckId && data.loads.some((l) => isActive(l) && l.driverId === d.id) && !validPreTrip(data, d.truckId));
  const filtered = ins.filter((x) => {
    if (!q) return true;
    const t = data.trucks.find((y) => y.id === x.truckId);
    return `${x.driverName} ${t?.unit} ${typeLabel(x.type)}`.toLowerCase().includes(q.toLowerCase());
  });
  const live = wo && wos.find((w) => w.id === wo.id);

  return (
    <div className="page">
      <div className="dkpis" style={{ marginBottom: 16 }}>
        <KpiTile icon={<Icon name="warning" size={20} />} tone="red" k="Out of service" v={oos.length} d={oos.map((u) => `${u.kind} ${u.unit}`).join(', ') || 'none'} alert={oos.length > 0} onClick={() => setTab('open')} />
        <KpiTile icon={<Icon name="wrench" size={20} />} tone="orange" k="Open defects" v={open.length} d={`${open.filter((w) => w.status === 'in_progress').length} in repair`} onClick={() => setTab('open')} />
        <KpiTile icon={<Icon name="shield" size={20} />} tone="green" k="Inspections" v={todayIns.length} d={`today · ${todayIns.filter((x) => x.result !== 'ok').length} with defects`} onClick={() => setTab('log')} />
        <KpiTile icon={<Icon name="clock" size={20} />} tone="purple" k="Missing pre-trip" v={missing.length} d={missing.map((d) => d.name.split(' ')[0]).join(', ') || 'everyone is done'} alert={missing.length > 0} />
        <KpiTile icon={<Icon name="checkCircle" size={20} />} tone="teal" k="Repaired" v={closed.filter((w) => Date.now() - w.repairedAt < 7 * 864e5).length} d="last 7 days" onClick={() => setTab('closed')} />
      </div>

      {oos.length > 0 && (
        <div className="stack-sm" style={{ marginBottom: 16 }}>
          {oos.map((u) => (
            <button key={u.id} className="insp-status red" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const w = wos.find((x) => x.id === u.outOfService.workOrderId); if (w) setWo(w); }}>
              <Icon name="warning" size={22} />
              <div className="spacer"><div className="headline">{u.kind} {u.unit} is out of service</div><div className="footnote">{u.outOfService.reason} · since {ago(u.outOfService.since)} · can’t be dispatched until it’s repaired</div></div>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
      )}

      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'open', label: `Work orders · ${open.length}` }, { value: 'closed', label: 'Repaired' }, { value: 'log', label: 'Inspection log' }]} />
        {tab === 'log' && <input className="input" style={{ maxWidth: 260 }} placeholder="Search driver or unit" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>

      {tab !== 'log' && (
        <div className="list">
          {(tab === 'open' ? open : closed).length === 0 && <div className="list-row secondary">{tab === 'open' ? 'No open defects. Every unit is good to go.' : 'Nothing repaired yet.'}</div>}
          {(tab === 'open' ? open : closed).map((w) => {
            const st = WO_STATUS[w.status];
            return (
              <button key={w.id} className="list-row wo-row" onClick={() => setWo(w)}>
                <div className="icon-tile" style={{ background: `var(--${w.status === 'repaired' ? 'green' : w.severity === 'major' ? 'red' : 'orange'})` }}><Icon name={w.status === 'repaired' ? 'check' : 'wrench'} size={15} stroke={2.2} /></div>
                <div className="label">
                  <div className="subhead" style={{ fontWeight: 600 }}>{w.number} · {w.unitLabel} <span className="secondary" style={{ fontWeight: 400 }}>· {w.defects.map((d) => d.defect).join(', ')}</span></div>
                  <div className="footnote secondary">{w.status === 'repaired' ? `Repaired ${dateTime(w.repairedAt)} · ${w.mechanic}${w.ackAt ? ' · driver confirmed' : ' · waiting for driver to confirm'}` : `Reported by ${w.reportedBy} · ${ago(w.reportedAt)}${w.mechanic ? ` · ${w.mechanic}` : ''}`}</div>
                </div>
                {w.defects.find((d) => d.photo) && <img className="wo-thumb" src={w.defects.find((d) => d.photo).photo} alt="" />}
                {w.severity === 'major' && w.status !== 'repaired' && <span className="pill red hide-mobile">Out of service</span>}
                <span className={`pill ${st.tone}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'log' && (
        <div className="list">
          {filtered.slice(0, 80).map((x) => <InspectionRow key={x.id} insp={x} onOpen={setReport} showDriver />)}
          {filtered.length === 0 && <div className="list-row secondary">No inspections match.</div>}
        </div>
      )}

      {live && <WorkOrderSheet wo={live} onClose={() => setWo(null)} />}
      {report && <InspectionReport insp={report} onClose={() => setReport(null)} />}
    </div>
  );
}
