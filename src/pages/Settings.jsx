import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { PageHead, Segmented, Switch, Avatar } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { patch, post } from '../lib/api.js';

function usePref(key, attr, def) {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) || def; } catch { return def; } });
  const set = (x) => {
    setV(x);
    try { localStorage.setItem(key, x); } catch { /* ignore */ }
    if (x === def && attr === 'theme') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset[attr] = x;
  };
  return [v, set];
}

export default function Settings() {
  const { data, signOut, setData, toast } = useStore();
  const [text, setText] = usePref('rugo.text', 'text', 'normal');
  const [theme, setTheme] = usePref('rugo.theme', 'theme', 'auto');
  const me = data.me;
  const s = data.settings;
  const [fuel, setFuel] = useState(s.fuelPricePerL);

  const saveSettings = async (body) => {
    try { const r = await patch('/settings', body); setData((d) => ({ ...d, settings: r })); toast({ title: 'Saved' }); } catch (e) { toast({ title: 'Not saved', body: e.message, tone: 'error' }); }
  };

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead title="Settings" />
      <div className="list">
        <div className="list-row" style={{ padding: 16 }}>
          <Avatar user={me} size="lg" />
          <div className="label">
            <div className="title3">{me.name}</div>
            <div className="subhead secondary">{me.email} · {me.company?.name}</div>
          </div>
        </div>
      </div>

      <div className="section-header">Easy to read</div>
      <div className="list">
        <div className="list-row indent">
          <div className="icon-tile" style={{ background: 'var(--blue)' }}><Icon name="textsize" size={18} /></div>
          <div className="label">Text size</div>
          <Segmented value={text} onChange={setText} options={[{ value: 'normal', label: 'A' }, { value: 'large', label: 'A+' }, { value: 'xlarge', label: 'A++' }]} />
        </div>
        <div className="list-row indent">
          <div className="icon-tile" style={{ background: 'var(--indigo)' }}><Icon name="moon" size={18} /></div>
          <div className="label">Appearance</div>
          <Segmented value={theme} onChange={setTheme} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </div>
      </div>
      <div className="section-footer">Bigger text makes every screen easier to read on the road or in the office.</div>

      {me.role === 'driver' && (
        <>
          <div className="section-header">Location</div>
          <div className="list">
            <div className="list-row indent">
              <div className="icon-tile" style={{ background: 'var(--green)' }}><Icon name="location" size={18} /></div>
              <div className="label">
                <div>Share my phone’s GPS</div>
                <div className="footnote secondary">Off = demo mode, the truck drives itself along the route.</div>
              </div>
              <Switch checked={me.locationSource === 'gps'} onChange={(v) => post('/driver/preferences', { locationSource: v ? 'gps' : 'sim' })} label="Share GPS" />
            </div>
          </div>
        </>
      )}

      {me.role === 'dispatcher' && (
        <>
          <div className="section-header">Fleet costs</div>
          <div className="list">
            <div className="list-row indent">
              <div className="icon-tile" style={{ background: 'var(--orange)' }}><Icon name="fuel" size={18} /></div>
              <div className="label">Diesel price (per litre)</div>
              <input className="inline-input num" style={{ width: 90 }} type="number" step="0.01" value={fuel} onChange={(e) => setFuel(e.target.value)} onBlur={() => saveSettings({ fuelPricePerL: fuel })} />
            </div>
            <div className="list-row indent">
              <div className="icon-tile" style={{ background: 'var(--teal)' }}><Icon name="sparkles" size={18} /></div>
              <div className="label">
                <div>Demo simulation</div>
                <div className="footnote secondary">Moves trucks that aren’t sending phone GPS.</div>
              </div>
              <Switch checked={s.simulation} onChange={(v) => saveSettings({ simulation: v })} label="Simulation" />
            </div>
          </div>
          <div className="section-footer">Used to estimate fuel cost on jobs without a fuel receipt.</div>
        </>
      )}

      <div className="section-header">Pricing</div>
      <div className="list">
        <div className="list-row"><div className="label">Fuel surcharge</div><div className="value">{Math.round(s.fuelSurchargePct * 100)}%</div></div>
        <div className="list-row"><div className="label">Detention after</div><div className="value">{s.detentionFreeHours} h free, then ${s.detentionPerHour}/h</div></div>
        {me.role === 'dispatcher' && <div className="list-row"><div className="label">Truck, insurance & upkeep</div><div className="value">${s.overheadPerKm}/km</div></div>}
        <div className="list-row"><div className="label">Sales tax (HST)</div><div className="value">{Math.round(s.taxRate * 100)}%</div></div>
        <div className="list-row"><div className="label">Currency</div><div className="value">{s.currency}</div></div>
      </div>

      <div className="section-header" />
      <div className="list">
        <button className="list-row" onClick={signOut}><div className="label red" style={{ textAlign: 'center' }}>Sign out</div></button>
      </div>
    </div>
  );
}
