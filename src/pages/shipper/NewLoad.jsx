// "Uber-style" pickup request: Where → What → When → Price → Request.
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapView from '../../components/MapView.jsx';
import PlacePicker from '../../components/PlacePicker.jsx';
import { Switch, ActionButton, Field } from '../../components/ui.jsx';
import { PriceBreakdown } from '../../components/LoadBits.jsx';
import { useStore } from '../../lib/store.jsx';
import { post } from '../../lib/api.js';
import { go } from '../../lib/router.js';
import { money, km, duration } from '../../lib/format.js';

const EQ_ICON = { dry_van: 'box', reefer: 'thermometer', flatbed: 'weight', step_deck: 'route', tanker: 'fuel', power_only: 'truck' };
const EQ_HINT = { dry_van: 'Boxed & palletized', reefer: 'Chilled or frozen', flatbed: 'Steel, lumber, machinery', step_deck: 'Tall loads', tanker: 'Liquids', power_only: 'You have the trailer' };
const STEPS = ['Where', 'What', 'When', 'Review'];

function whenOptions() {
  const now = new Date();
  const at = (d, h) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.getTime(); };
  return [
    { key: 'asap', label: 'As soon as possible', sub: 'Within 2 hours', from: Date.now() + 30 * 60e3, to: Date.now() + 2 * 3600e3 },
    { key: 'today', label: 'Later today', sub: '2 – 6 hours', from: Date.now() + 2 * 3600e3, to: Date.now() + 6 * 3600e3 },
    { key: 'tmr_am', label: 'Tomorrow morning', sub: '7:00 – 11:00', from: at(1, 7), to: at(1, 11) },
    { key: 'tmr_pm', label: 'Tomorrow afternoon', sub: '12:00 – 17:00', from: at(1, 12), to: at(1, 17) },
  ];
}

export default function NewLoad() {
  const { data, toast } = useStore();
  const eqs = data.meta.equipment;
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [cargo, setCargo] = useState({ equipment: 'dry_van', description: '', weightKg: '', pallets: '', hazmat: false, tempC: 3, valueCad: '' });
  const [options, setOptions] = useState({ expedite: false, liftgate: false });
  const [when, setWhen] = useState('today');
  const [notes, setNotes] = useState('');
  const [po, setPo] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const wins = useMemo(whenOptions, []);

  useEffect(() => {
    if (!pickup || !dropoff) { setQuote(null); return undefined; }
    let live = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const r = await post('/quote', { pickup, dropoff, cargo, options });
        if (live) setQuote(r);
      } catch (e) { toast({ title: 'No price yet', body: e.message, tone: 'error' }); } finally { if (live) setQuoting(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [pickup, dropoff, cargo.equipment, cargo.hazmat, options.expedite, options.liftgate]); // eslint-disable-line react-hooks/exhaustive-deps

  const places = useMemo(() => [pickup && { ...pickup, kind: 'pickup', label: 'Pickup' }, dropoff && { ...dropoff, kind: 'dropoff', label: 'Destination' }].filter(Boolean), [pickup, dropoff]);
  const canNext = [pickup && dropoff, cargo.equipment && cargo.description.trim(), !!when, true][step];
  const c = (k, v) => setCargo((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    const w = wins.find((x) => x.key === when);
    const load = await post('/loads', {
      pickup, dropoff, cargo: { ...cargo, tempC: cargo.equipment === 'reefer' ? Number(cargo.tempC) : null },
      options, notes, poNumber: po, pickupWindow: { from: w.from, to: w.to },
    });
    toast({ title: 'Pickup requested', body: `${load.ref} is on the load board. We’ll tell you the moment a carrier accepts.` });
    go(`/loads/${load.id}`);
  };

  return (
    <div className="page wide" style={{ maxWidth: 1320 }}>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)' }}>
        <div className="stack" style={{ gap: 18 }}>
          <div>
            <h1 className="large-title">{['Where is it going?', 'What are you shipping?', 'When should we pick up?', 'Review & request'][step]}</h1>
            <div className="row" style={{ gap: 6, marginTop: 14 }}>
              {STEPS.map((s, i) => (
                <button key={s} onClick={() => i < step && setStep(i)} style={{ flex: 1, border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: i < step ? 'pointer' : 'default' }}>
                  <div style={{ height: 4, borderRadius: 4, background: i <= step ? 'var(--blue)' : 'var(--bg-fill)' }} />
                  <div className={`caption ${i === step ? 'blue' : 'secondary'}`} style={{ marginTop: 5, fontWeight: 600 }}>{i + 1}. {s}</div>
                </button>
              ))}
            </div>
          </div>

          {step === 0 && (
            <div className="card pad-lg stack">
              <Field label="Pick up from"><PlacePicker kind="pickup" value={pickup} onChange={setPickup} placeholder="Search a warehouse, street or city" autoFocus /></Field>
              <Field label="Deliver to"><PlacePicker kind="dropoff" value={dropoff} onChange={setDropoff} placeholder="Where should it go?" /></Field>
              {quote && (
                <div className="row" style={{ background: 'var(--bg-fill-2)', borderRadius: 12, padding: 12 }}>
                  <Icon name="route" size={22} style={{ color: 'var(--blue)' }} />
                  <div className="spacer"><div className="headline">{km(quote.quote.distanceKm)}</div><div className="footnote secondary">About {duration(quote.quote.driveHours)} of driving{quote.route.source === 'estimate' ? ' · estimated' : ''}</div></div>
                  <div className="title3 num">from {money(quote.quote.total)}</div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <div className="chips">
                {Object.entries(eqs).map(([k, e]) => (
                  <button key={k} className={`chip ${cargo.equipment === k ? 'on' : ''}`} onClick={() => c('equipment', k)}>
                    <Icon name={EQ_ICON[k]} size={26} />
                    <span className="chip-title">{e.label}</span>
                    <span className="caption secondary">{EQ_HINT[k]}</span>
                  </button>
                ))}
              </div>
              <div className="card pad-lg stack">
                <Field label="What is it?"><input className="input" placeholder="e.g. Frozen pastry, 22 pallets" value={cargo.description} onChange={(e) => c('description', e.target.value)} /></Field>
                <div className="grid grid-2">
                  <Field label="Weight (kg)"><input className="input" type="number" inputMode="numeric" placeholder="15000" value={cargo.weightKg} onChange={(e) => c('weightKg', e.target.value)} /></Field>
                  <Field label="Pallets"><input className="input" type="number" inputMode="numeric" placeholder="22" value={cargo.pallets} onChange={(e) => c('pallets', e.target.value)} /></Field>
                </div>
                {cargo.equipment === 'reefer' && <Field label="Keep at (°C)"><input className="input" type="number" value={cargo.tempC} onChange={(e) => c('tempC', e.target.value)} /></Field>}
                <div className="row between"><div><div className="headline">Dangerous goods (hazmat)</div><div className="footnote secondary">TDG / placarded freight</div></div><Switch checked={cargo.hazmat} onChange={(v) => c('hazmat', v)} label="Hazmat" /></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <div className="grid grid-2">
                {wins.map((w) => (
                  <button key={w.key} className={`chip ${when === w.key ? 'on' : ''}`} onClick={() => setWhen(w.key)}>
                    <Icon name={w.key === 'asap' ? 'bolt' : 'calendar'} size={24} />
                    <span className="chip-title">{w.label}</span>
                    <span className="caption secondary">{w.sub}</span>
                  </button>
                ))}
              </div>
              <div className="list">
                <div className="list-row"><div className="label"><div className="headline">Expedited / team drivers</div><div className="footnote secondary">Non-stop, faster delivery (+25%)</div></div><Switch checked={options.expedite} onChange={(v) => setOptions((o) => ({ ...o, expedite: v }))} label="Expedite" /></div>
                <div className="list-row"><div className="label"><div className="headline">Liftgate needed</div><div className="footnote secondary">No loading dock at one end</div></div><Switch checked={options.liftgate} onChange={(v) => setOptions((o) => ({ ...o, liftgate: v }))} label="Liftgate" /></div>
              </div>
              <div className="card pad-lg stack">
                <Field label="PO / reference number (optional)"><input className="input" value={po} onChange={(e) => setPo(e.target.value)} placeholder="PO-12345" /></Field>
                <Field label="Notes for the driver (optional)"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dock number, gate code, appointment…" /></Field>
              </div>
            </div>
          )}

          {step === 3 && quote && (
            <div className="card pad-lg stack">
              <div className="row between"><div className="headline">{pickup.city} → {dropoff.city}</div><span className="footnote secondary">{km(quote.quote.distanceKm)}</span></div>
              <div className="subhead secondary">{eqs[cargo.equipment].label} · {cargo.description}{cargo.weightKg ? ` · ${Number(cargo.weightKg).toLocaleString()} kg` : ''} · {wins.find((w) => w.key === when).label}</div>
              <div className="divider" />
              <PriceBreakdown q={quote.quote} title="" />
              <div className="footnote secondary">Final price is based on the GPS kilometres actually driven. Waiting over {data.settings.detentionFreeHours} h at a dock is billed at ${data.settings.detentionPerHour}/h.</div>
            </div>
          )}

          <div className="row" style={{ gap: 12 }}>
            {step > 0 && <button className="btn large" onClick={() => setStep(step - 1)}>Back</button>}
            {step < 3 ? (
              <button className="btn primary large spacer" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Continue{step === 0 && quote ? ` · ${money(quote.quote.total)}` : ''}
              </button>
            ) : (
              <ActionButton className="btn primary large spacer" disabled={!quote || quoting} onClick={submit}>
                <Icon name="bolt" size={20} />Request pickup · {quote ? money(quote.quote.total) : '…'}
              </ActionButton>
            )}
          </div>
        </div>

        <div className="map-card sticky-top hide-mobile" style={{ height: 'calc(100vh - 56px)', minHeight: 520 }}>
          <MapView height="100%" places={places} route={quote?.route.points} fitKey={`${pickup?.lat}-${dropoff?.lat}-${!!quote}`} padding={70} />
          {!pickup && (
            <div className="map-overlay glass" style={{ top: 16, left: 16, padding: '12px 16px' }}>
              <div className="headline">Rugo instant quote</div>
              <div className="footnote secondary">Pick two places to see the route and price.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
