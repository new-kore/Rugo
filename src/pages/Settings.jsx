import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { PageHead, Segmented, Switch, Avatar, ConfirmButton } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { applyTheme } from '../lib/theme.js';
import { getKey, saveKey, googleFailed } from '../lib/google.js';
import { patch, standalone, resetDemo, setToken } from '../lib/api.js';

function usePref(key, attr, def) {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) || def; } catch { return def; } });
  const set = (x) => {
    setV(x);
    try { localStorage.setItem(key, x); } catch { /* ignore */ }
    if (attr === 'theme') applyTheme(x);
    else document.documentElement.dataset[attr] = x;
  };
  return [v, set];
}

export default function Settings() {
  const { data, signOut, setData, toast } = useStore();
  const [text, setText] = usePref('rugo.text', 'text', 'normal');
  const [theme, setTheme] = usePref('rugo.theme', 'theme', 'light');
  const me = data.me;
  const s = data.settings;
  const [fuel, setFuel] = useState(s.fuelPricePerL);
  const [gkey, setGkey] = useState(() => getKey());
  const gOn = !!getKey() && !googleFailed();

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
          <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'System' }]} />
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
                <div>GPS tracking</div>
                <div className="footnote secondary">Turns on by itself when you start a load or clock in, and stops when the load is delivered or you clock out or sign out. Keep location set to “Always” or “While using” for Rugo.</div>
              </div>
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

          <div className="section-header">AI dispatch</div>
          <div className="list">
            <div className="list-row indent">
              <div className="icon-tile" style={{ background: 'var(--indigo)' }}><Icon name="sparkles" size={18} /></div>
              <div className="label">
                <div>Driver matching</div>
                <div className="footnote secondary">{{ off: 'You pick drivers yourself.', suggest: 'Ranks drivers on every load; you confirm.', auto: 'Accepts good board loads and assigns the best driver automatically.' }[s.dispatchMode || 'suggest']}</div>
              </div>
              <Segmented value={s.dispatchMode || 'suggest'} onChange={(v) => saveSettings({ dispatchMode: v })} options={[{ value: 'off', label: 'Off' }, { value: 'suggest', label: 'Suggest' }, { value: 'auto', label: 'Auto' }]} />
            </div>
            {s.dispatchMode === 'auto' && (
              <>
                <div className="list-row indent">
                  <div className="label">Minimum driver match</div>
                  <input className="inline-input num" style={{ width: 70 }} type="number" min="0" max="100" defaultValue={s.autoMinScore} onBlur={(e) => saveSettings({ autoMinScore: e.target.value })} aria-label="Minimum match score" />
                  <span className="footnote secondary">/ 100</span>
                </div>
                <div className="list-row indent">
                  <div className="label">Minimum pay</div>
                  <input className="inline-input num" style={{ width: 70 }} type="number" step="0.05" min="0" defaultValue={s.autoMinPerKm} onBlur={(e) => saveSettings({ autoMinPerKm: e.target.value })} aria-label="Minimum pay per km" />
                  <span className="footnote secondary">$ / km</span>
                </div>
              </>
            )}
          </div>
          <div className="section-footer">Match score weighs distance to pickup (25), timing & schedule (20), cost to run (20), lane history (15), hours left (10) and the driver’s scorecard (10).</div>
        </>
      )}

      <div className="section-header">Maps</div>
      <div className="list">
        <div className="list-row indent" style={{ alignItems: 'flex-start' }}>
          <div className="icon-tile" style={{ background: gOn ? 'var(--green)' : 'var(--label-3)' }}><Icon name="map" size={16} /></div>
          <div className="label stack-sm">
            <div className="row between">
              <span>Google Maps</span>
              <span className={`pill ${gOn ? 'green' : 'gray'}`}>{gOn ? 'Connected' : getKey() ? 'Key not accepted' : 'Not connected'}</span>
            </div>
            <div className="footnote secondary">Paste a Google Maps Platform API key to use Google maps, real road routes and kilometres, and Google address search. The key is saved in this browser.</div>
            <div className="row">
              <input id="gmaps-key" className="input mono" style={{ fontSize: '0.85rem' }} placeholder="AIza…" value={gkey} onChange={(e) => setGkey(e.target.value)} />
              <button className="btn primary" disabled={gkey.trim() === getKey()} onClick={() => { saveKey(gkey); window.location.reload(); }}>Save</button>
              {getKey() && <button className="btn" onClick={() => { saveKey(''); window.location.reload(); }}>Remove</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="section-header">Pricing</div>
      <div className="list">
        <div className="list-row"><div className="label">Fuel surcharge</div><div className="value">{Math.round(s.fuelSurchargePct * 100)}%</div></div>
        <div className="list-row"><div className="label">Detention after</div><div className="value">{s.detentionFreeHours} h free, then ${s.detentionPerHour}/h</div></div>
        {me.role === 'dispatcher' && <div className="list-row"><div className="label">Truck, insurance & upkeep</div><div className="value">${s.overheadPerKm}/km</div></div>}
        <div className="list-row"><div className="label">Sales tax (HST)</div><div className="value">{Math.round(s.taxRate * 100)}%</div></div>
        <div className="list-row"><div className="label">Currency</div><div className="value">{s.currency}</div></div>
      </div>

      {standalone && (
        <>
          <div className="section-header">Demo</div>
          <div className="list">
            <div className="list-row">
              <div className="label">
                <div>Start the demo over</div>
                <div className="footnote secondary">Everything runs in this browser. This brings back the original sample loads.</div>
              </div>
              <ConfirmButton className="btn small danger" confirmLabel="Tap to reset" onConfirm={async () => { resetDemo(); setToken(''); window.location.hash = ''; window.location.reload(); }}>Reset</ConfirmButton>
            </div>
          </div>
        </>
      )}

      <div className="section-header" />
      <div className="list">
        <button className="list-row" onClick={signOut}><div className="label red" style={{ textAlign: 'center' }}>Sign out</div></button>
      </div>
    </div>
  );
}
