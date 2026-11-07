import { useEffect } from 'react';
import { useStore, isActive } from './lib/store.jsx';
import { useRoute, go, match } from './lib/router.js';
import Icon from './components/Icon.jsx';
import { Toasts } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import LoadDetail from './pages/LoadDetail.jsx';
import ShipperHome from './pages/shipper/Home.jsx';
import NewLoad from './pages/shipper/NewLoad.jsx';
import Shipments from './pages/shipper/Shipments.jsx';
import Billing from './pages/shipper/Billing.jsx';
import Board from './pages/carrier/Board.jsx';
import Dispatch from './pages/carrier/Dispatch.jsx';
import Fleet from './pages/carrier/Fleet.jsx';
import Drivers from './pages/carrier/Drivers.jsx';
import Fuel from './pages/carrier/Fuel.jsx';
import Reports from './pages/carrier/Reports.jsx';
import DriverJob, { DriverGps } from './pages/driver/DriverJob.jsx';
import DriverFuel from './pages/driver/DriverFuel.jsx';
import DriverHours from './pages/driver/DriverHours.jsx';

const NAV = {
  shipper: [
    { path: '/', label: 'Home', icon: 'map', page: ShipperHome },
    { path: '/new', label: 'Request pickup', icon: 'plusCircle', page: NewLoad },
    { path: '/shipments', label: 'Shipments', icon: 'box', page: Shipments },
    { path: '/billing', label: 'Billing', icon: 'receipt', page: Billing },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings },
  ],
  dispatcher: [
    { path: '/', label: 'Load board', icon: 'list', page: Board, badge: (d) => d.loads.filter((l) => l.status === 'requested').length },
    { path: '/dispatch', label: 'Active jobs', icon: 'route', page: Dispatch, badge: (d) => d.loads.filter(isActive).length, quiet: true },
    { path: '/fleet', label: 'Live fleet', icon: 'map', page: Fleet },
    { path: '/drivers', label: 'Drivers & trucks', icon: 'people', page: Drivers },
    { path: '/fuel', label: 'Fuel', icon: 'fuel', page: Fuel },
    { path: '/reports', label: 'Reports', icon: 'chart', page: Reports },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings },
  ],
  driver: [
    { path: '/', label: 'My job', icon: 'truck', page: DriverJob },
    { path: '/fuel', label: 'Fuel', icon: 'fuel', page: DriverFuel },
    { path: '/hours', label: 'Hours & pay', icon: 'clock', page: DriverHours },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings },
  ],
};

const ROLE_LABEL = { shipper: 'Shipper', dispatcher: 'Carrier dispatch', driver: 'Driver' };

export default function App() {
  const { data, authed, online } = useStore();
  const path = useRoute();

  useEffect(() => {
    const pref = (k, attr) => { try { const v = localStorage.getItem(k); if (v) document.documentElement.dataset[attr] = v; } catch { /* ignore */ } };
    pref('rugo.text', 'text');
    pref('rugo.theme', 'theme');
  }, []);

  if (!authed) return <><Login /><Toasts /></>;
  if (!data) return <Splash />;

  const role = data.me.role;
  const nav = NAV[role];
  let page = null;
  const loadParams = match('/loads/:id', path);
  if (loadParams) page = role === 'driver' ? <DriverJob loadId={loadParams.id} /> : <LoadDetail id={loadParams.id} />;
  else {
    const item = nav.find((n) => n.path === path) || nav[0];
    const P = item.page;
    page = <P />;
  }
  const activePath = loadParams ? (role === 'shipper' ? '/shipments' : role === 'dispatcher' ? '/dispatch' : '/') : path;
  const mobileNav = nav.filter((n) => !(role === 'dispatcher' && n.path === '/fuel'));

  return (
    <div className="app">
      {!online && <div className="offline-bar">Reconnecting… live updates paused</div>}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="truck" size={20} stroke={2.2} /></div>
          <div>
            <div className="brand-name">Rugo</div>
            <div className="brand-sub">{data.me.company?.name}</div>
          </div>
        </div>
        {nav.map((n) => {
          const b = n.badge?.(data);
          return (
            <button key={n.path} className={`nav-item ${activePath === n.path ? 'active' : ''}`} onClick={() => go(n.path)}>
              <Icon name={n.icon} size={20} />
              {n.label}
              {b ? <span className="badge" style={n.quiet ? { background: activePath === n.path ? 'rgba(255,255,255,.3)' : 'var(--bg-fill)', color: 'inherit' } : undefined}>{b}</span> : null}
            </button>
          );
        })}
        <div className="sidebar-foot">
          <div className="list-row" style={{ padding: '10px' }}>
            <div className="avatar sm" style={{ background: data.me.color }}>{data.me.name.split(' ').map((x) => x[0]).join('')}</div>
            <div style={{ minWidth: 0 }}>
              <div className="subhead truncate" style={{ fontWeight: 600 }}>{data.me.name}</div>
              <div className="caption secondary">{ROLE_LABEL[role]}</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">{page}</main>
      <nav className="tabbar">
        {mobileNav.slice(0, 5).map((n) => {
          const b = n.badge?.(data);
          return (
            <button key={n.path} className={`tab ${activePath === n.path ? 'active' : ''}`} onClick={() => go(n.path)}>
              <Icon name={n.icon} size={25} stroke={activePath === n.path ? 2.2 : 1.8} />
              {n.label.replace('Drivers & trucks', 'Fleet').replace('Request pickup', 'Request')}
              {b && !n.quiet ? <span className="badge">{b}</span> : null}
            </button>
          );
        })}
      </nav>
      <Toasts />
      {role === 'driver' && <DriverGps />}
    </div>
  );
}

function Splash() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <div className="stack" style={{ alignItems: 'center' }}>
        <div className="brand-mark" style={{ width: 64, height: 64, borderRadius: 16 }}><Icon name="truck" size={34} stroke={2.2} /></div>
        <span className="spinner" style={{ color: 'var(--label-3)' }} />
      </div>
    </div>
  );
}
