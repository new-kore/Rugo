// Driver: daily pre-trip / post-trip inspection.
import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Empty } from '../../components/ui.jsx';
import { InspectionForm, PreTripStatus, InspectionReport, InspectionRow } from '../../components/DailyInspection.jsx';
import { useStore, isActive } from '../../lib/store.jsx';
import { go } from '../../lib/router.js';
import { validPreTrip, RESULT, typeLabel } from '../../lib/inspections.js';

export default function DriverInspect() {
  const { data } = useStore();
  const truck = data.trucks.find((t) => t.id === data.me.truckId);
  const load = data.loads.find((l) => isActive(l) && (l.driverId === data.me.id || (l.teamDriverIds || []).includes(data.me.id)));
  const [form, setForm] = useState(null); // null | 'pre' | 'post'
  const [done, setDone] = useState(null);
  const [report, setReport] = useState(null);
  const mine = (data.inspections || []).filter((x) => x.driverId === data.me.id).sort((a, b) => b.at - a.at).slice(0, 12);

  if (!truck) return <div className="page"><Empty icon="truck" title="No truck assigned">Ask the office to assign you a truck before your inspection.</Empty></div>;

  if (done) {
    const r = RESULT[done.result];
    return (
      <div className="page" style={{ maxWidth: 680 }}>
        <div className={`driver-hero ${done.result === 'ok' ? 'green' : done.result === 'minor' ? 'orange' : 'red'}`}>
          <Icon name={r.icon} size={34} />
          <div className="title1" style={{ marginTop: 8 }}>{done.result === 'ok' ? 'All good — safe to drive' : done.result === 'minor' ? 'Minor defects sent to the shop' : 'Do not drive this truck'}</div>
          <div className="subhead" style={{ marginTop: 6, opacity: 0.92 }}>
            {done.result === 'ok' ? `${typeLabel(done.type)} saved and signed. Valid for 24 hours.`
              : done.result === 'minor' ? 'You can drive. The office has the work order and photos.'
                : 'A major defect puts the truck out of service. The office has been told — wait for the shop to fix it.'}
          </div>
        </div>
        <div className="stack" style={{ marginTop: 16 }}>
          {load && done.result !== 'major' && <button className="btn xl primary" onClick={() => go(`/loads/${load.id}`)}><Icon name="navigate" size={22} />Go to my job</button>}
          <button className="btn xl" onClick={() => setReport(done)}><Icon name="doc" size={20} />View the report</button>
          <button className="btn plain" onClick={() => setDone(null)}>Done</button>
        </div>
        {report && <InspectionReport insp={report} onClose={() => setReport(null)} />}
      </div>
    );
  }

  if (form) {
    return (
      <div className="page" style={{ maxWidth: 680 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <button className="btn plain" onClick={() => setForm(null)}><Icon name="chevronLeft" size={16} />Back</button>
          <span className="footnote secondary">Unit {truck.unit}</span>
        </div>
        <InspectionForm truck={truck} trailerId={load?.trailerId || ''} defaultType={form} onDone={(r) => { setForm(null); setDone(r); window.scrollTo({ top: 0 }); }} />
      </div>
    );
  }

  const pre = validPreTrip(data, truck.id);
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PreTripStatus truck={truck} onStart={() => setForm(pre ? 'post' : 'pre')} />
      <div className="insp-start">
        <button className={`btn xl ${pre ? '' : 'primary'}`} onClick={() => setForm('pre')}><Icon name="shield" size={22} />Pre-trip inspection</button>
        <button className={`btn xl ${pre ? 'primary' : ''}`} onClick={() => setForm('post')}><Icon name="flag" size={20} />Post-trip inspection</button>
      </div>
      <div className="footnote secondary" style={{ marginTop: 8 }}>
        Do a pre-trip before you drive each day (valid 24 h) and a post-trip when you park. Report anything wrong with a photo — major defects take the truck out of service until it’s repaired.
      </div>
      <div className="section-header">My inspections</div>
      <div className="list">
        {mine.length === 0 && <div className="list-row secondary">No inspections yet.</div>}
        {mine.map((x) => <InspectionRow key={x.id} insp={x} onOpen={setReport} />)}
      </div>
      {report && <InspectionReport insp={report} onClose={() => setReport(null)} />}
    </div>
  );
}
