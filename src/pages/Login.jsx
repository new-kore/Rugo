import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { post, standalone } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';

const ROLES = [
  { role: 'shipper', color: 'var(--blue)', icon: 'box', title: 'I have freight to ship', body: 'Request a pickup in seconds, see the price up front and follow your load live.', who: 'Dana · Northwind Foods' },
  { role: 'dispatcher', color: 'var(--indigo)', icon: 'building', title: 'I run a trucking company', body: 'Accept loads instantly, dispatch drivers, watch your fleet, fuel and profit.', who: 'Alex · Velocity Freight' },
  { role: 'driver', color: 'var(--green)', icon: 'truck', title: 'I drive the truck', body: 'One big button for every step. Photos, signature and kilometres done for you.', who: 'Marcus · Unit 101' },
];

export default function Login() {
  const { signIn, toast } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null);

  const run = async (key, p) => {
    setBusy(key);
    try { await signIn(p); } catch (e) { toast({ title: 'Couldn’t sign in', body: e.message, tone: 'error' }); setBusy(null); }
  };

  return (
    <div className="login">
      <div className="login-card stack" style={{ gap: 28 }}>
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <div className="brand-mark" style={{ width: 72, height: 72, borderRadius: 18 }}><Icon name="truck" size={38} stroke={2.1} /></div>
          <h1 className="large-title" style={{ fontSize: '2.6rem' }}>Rugo</h1>
          <div className="title3 secondary" style={{ fontWeight: 500, maxWidth: 560 }}>Freight, as easy as a ride. Request a pickup, get a truck, watch it arrive.</div>
        </div>

        <div>
          <div className="section-header" style={{ textAlign: 'center', margin: '0 0 10px' }}>Try it now — choose who you are</div>
          <div className="grid grid-3">
            {ROLES.map((r) => (
              <button key={r.role} className="role-tile" onClick={() => run(r.role, post('/auth/demo', { role: r.role }))} disabled={!!busy}>
                <div className="icon-tile" style={{ background: r.color }}><Icon name={r.icon} size={28} /></div>
                <div className="title3">{r.title}</div>
                <div className="subhead secondary">{r.body}</div>
                <div className="spacer" />
                <div className="row between">
                  <span className="footnote tertiary">{r.who}</span>
                  {busy === r.role ? <span className="spinner" style={{ color: 'var(--blue)' }} /> : <span className="blue headline row" style={{ gap: 2 }}>Continue<Icon name="chevron" size={16} /></span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <form className="card pad-lg stack" style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}
          onSubmit={(e) => { e.preventDefault(); run('form', post('/auth/login', { email, password })); }}>
          <div className="headline">Sign in with your account</div>
          <input className="input" type="email" autoComplete="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn primary large" disabled={!email || !password || !!busy}>{busy === 'form' ? 'Signing in…' : 'Sign in'}</button>
          <div className="footnote tertiary" style={{ textAlign: 'center' }}>Demo accounts use the password “demo”.</div>
          {standalone && <div className="footnote tertiary" style={{ textAlign: 'center' }}>This demo runs entirely in your browser. Sign out and pick another role to see the other side of the same load.</div>}
        </form>
      </div>
    </div>
  );
}
