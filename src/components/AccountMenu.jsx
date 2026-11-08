// Sidebar account menu: profile, company, quick preferences, settings and sign out.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Avatar, Segmented } from './ui.jsx';
import { useStore } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { applyTheme } from '../lib/theme.js';
import { getKey, googleFailed } from '../lib/google.js';
import { standalone } from '../lib/api.js';

const ROLE_LABEL = { shipper: 'Shipper', dispatcher: 'Carrier dispatch', driver: 'Driver' };
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export default function AccountMenu() {
  const { data, signOut } = useStore();
  const me = data.me;
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => read('rugo.theme', 'light'));
  const [text, setText] = useState(() => read('rugo.text', 'normal'));
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', out);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('keydown', esc); };
  }, [open]);

  const goTo = (p) => { setOpen(false); go(p); };
  const company = me.company || {};
  const truck = data.trucks.find((t) => t.id === me.truckId);
  const maps = getKey() && !googleFailed();

  return (
    <div className="acct" ref={box}>
      {open && (
        <div className="popover acct-menu" role="menu">
          <div className="acct-head">
            <Avatar user={me} size="lg" />
            <div style={{ minWidth: 0 }}>
              <div className="headline truncate">{me.name}</div>
              <div className="footnote secondary truncate">{me.email}</div>
              <div className="footnote secondary">{ROLE_LABEL[me.role]}</div>
            </div>
          </div>

          <div className="acct-section">
            <div className="acct-row"><Icon name="building" size={15} /><span className="spacer">{company.name}</span></div>
            {company.city && <div className="acct-row"><Icon name="pin" size={15} /><span className="spacer secondary">{company.city}</span></div>}
            {me.phone && <div className="acct-row"><Icon name="phone" size={15} /><span className="spacer secondary" style={{ userSelect: 'all' }}>{me.phone}</span></div>}
            {company.nsc && <div className="acct-row"><Icon name="shield" size={15} /><span className="spacer secondary">NSC {company.nsc} · USDOT {company.usdot}</span></div>}
            {truck && <div className="acct-row"><Icon name="truck" size={15} /><span className="spacer secondary">Unit {truck.unit} · {truck.plate}</span></div>}
            {me.role === 'driver' && <div className="acct-row"><Icon name="dollar" size={15} /><span className="spacer secondary">{me.payType === 'per_km' ? `$${me.perKmRate}/km` : `$${me.hourlyRate}/h`}</span></div>}
          </div>

          <div className="acct-section">
            <div className="acct-row">
              <Icon name="moon" size={15} /><span className="spacer">Appearance</span>
              <Segmented value={theme} onChange={(v) => { setTheme(v); write('rugo.theme', v); applyTheme(v); }}
                options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]} />
            </div>
            <div className="acct-row">
              <Icon name="textsize" size={15} /><span className="spacer">Text size</span>
              <Segmented value={text} onChange={(v) => { setText(v); write('rugo.text', v); document.documentElement.dataset.text = v; }}
                options={[{ value: 'normal', label: 'A' }, { value: 'large', label: 'A+' }, { value: 'xlarge', label: 'A++' }]} />
            </div>
            <div className="acct-row"><Icon name="map" size={15} /><span className="spacer">Google Maps</span><span className={`pill ${maps ? 'green' : 'gray'}`}>{maps ? 'Connected' : 'Off'}</span></div>
          </div>

          <div className="acct-section">
            <button className="acct-item" role="menuitem" onClick={() => goTo('/settings')}><Icon name="gear" size={15} />All settings</button>
            {me.role === 'shipper' && <button className="acct-item" role="menuitem" onClick={() => goTo('/billing')}><Icon name="receipt" size={15} />Billing & invoices</button>}
            {me.role === 'dispatcher' && <button className="acct-item" role="menuitem" onClick={() => goTo('/drivers')}><Icon name="people" size={15} />Drivers & trucks</button>}
            {me.role === 'driver' && <button className="acct-item" role="menuitem" onClick={() => goTo('/hours')}><Icon name="clock" size={15} />Hours & pay</button>}
          </div>

          <div className="acct-section">
            <button className="acct-item" role="menuitem" onClick={signOut}><Icon name="logout" size={15} />{standalone ? 'Sign out / switch role' : 'Sign out'}</button>
          </div>
        </div>
      )}
      <button className={`nav-item acct-btn ${open ? 'active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar user={me} size="sm" />
        <div style={{ minWidth: 0, lineHeight: 1.2, flex: 1 }}>
          <div className="subhead truncate">{me.name}</div>
          <div className="caption secondary truncate">{ROLE_LABEL[me.role]}</div>
        </div>
        <Icon name="chevron" size={13} style={{ transform: 'rotate(-90deg)' }} />
      </button>
    </div>
  );
}
