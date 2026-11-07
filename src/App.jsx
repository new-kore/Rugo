import { useEffect } from 'react';
import { useStore, isActive } from './lib/store.jsx';
import { useRoute, go, match } from './lib/router.js';
import Icon from './components/Icon.jsx';
import { Toasts } from './components/ui.jsx';
import { GlobalSearch, NotificationBell } from './components/TopbarTools.jsx';
import { applyTheme } from './lib/theme.js';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import CalendarPage from './pages/Calendar.jsx';
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
    { path: '/shipments', label: 'Shipments', icon: 'box', page: Shipments, section: 'Workspace', badge: (d) => d.loads.filter((l) => l.status === 'requested' || isActive(l)).length, quiet: true },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', page: CalendarPage, section: 'Workspace', desktopOnly: true },
    { path: '/billing', label: 'Billing', icon: 'receipt', page: Billing, section: 'Workspace' },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings, section: 'Workspace' },
  ],
  dispatcher: [
    { path: '/', label: 'Load board', icon: 'list', page: Board, badge: (d) => d.loads.filter((l) => l.status === 'requested').length },
    { path: '/dispatch', label: 'Jobs', icon: 'route', page: Dispatch, badge: (d) => d.loads.filter(isActive).length, quiet: true },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', page: CalendarPage },
    { path: '/fleet', label: 'Live fleet', icon: 'map', page: Fleet, section: 'Fleet' },
    { path: '/drivers', label: 'Drivers & trucks', icon: 'people', page: Drivers, section: 'Fleet' },
    { path: '/fuel', label: 'Fuel', icon: 'fuel', page: Fuel, section: 'Fleet' },
    { path: '/reports', label: 'Reports', icon: 'chart', page: Reports, section: 'Fleet' },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings, section: 'Workspace' },
  ],
  driver: [
    { path: '/', label: 'My job', icon: 'truck', page: DriverJob },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', page: CalendarPage, section: 'Workspace' },
    { path: '/fuel', label: 'Fuel', icon: 'fuel', page: DriverFuel, section: 'Workspace' },
    { path: '/hours', label: 'Hours & pay', icon: 'clock', page: DriverHours, section: 'Workspace' },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings, section: 'Workspace' },
  ],
};

const ROLE_LABEL = { shipper: 'Shipper', dispatcher: 'Carrier dispatch', driver: 'Driver' };

export default function App() {
  const { data, authed, online } = useStore();
  const path = useRoute();

  useEffect(() => {
    let text = null; let theme = null;
    try { text = localStorage.getItem('rugo.text'); theme = localStorage.getItem('rugo.theme'); } catch { /* ignore */ }
    if (text) document.documentElement.dataset.text = text;
    applyTheme(theme);
  }, []);

  if (!authed) return <><Login /><Toasts /></>;
  if (!data) return <Splash />;

  const role = data.me.role;
  const nav = NAV[role];
  let page = null;
  const loadParams = match('/loads/:id', path);
  const activePath = loadParams ? (role === 'shipper' ? '/shipments' : role === 'dispatcher' ? '/dispatch' : '/') : (nav.find((n) => n.path === path) ? path : '/');
  const current = nav.find((n) => n.path === activePath);
  if (loadParams) {
    page = role === 'driver' ? <DriverJob loadId={loadParams.id} /> : <LoadDetail id={loadParams.id} />;
    const ref = data.loads.find((l) => l.id === loadParams.id)?.ref;
    void ref;
  } else {
    const P = current.page;
    page = <P />;
  }
  const mobileNav = nav.filter((n) => !n.desktopOnly && !(role === 'dispatcher' && n.path === '/fuel'));
  const sections = [...new Set(nav.map((n) => n.section || ''))];
  const initials = (data.me.company?.name || 'R').split(/\s+/).map((w) => w[0]).slice(0, 2).join('');

  return (
    <div className="app">
      {!online && <div className="offline-bar">Reconnecting… live updates paused</div>}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" style={{ fontSize: 11, fontWeight: 700 }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name truncate">{data.me.company?.name}</div>
          </div>
          <div className="spacer" />
          <span className="tertiary" title="Rugo"><Icon name="truck" size={16} /></span>
        </div>
        {sections.map((sec) => (
          <div key={sec || 'main'} className="stack" style={{ gap: 1 }}>
            {sec && <div className="nav-label">{sec}<Icon name="chevron" size={11} style={{ transform: 'rotate(90deg)' }} /></div>}
            {nav.filter((n) => (n.section || '') === sec).map((n) => {
              const b = n.badge?.(data);
              return (
                <button key={n.path} className={`nav-item ${activePath === n.path ? 'active' : ''}`} onClick={() => go(n.path)}>
                  <Icon name={n.icon} size={17} />
                  {n.label}
                  {b ? (n.quiet ? <span className="count">{b}</span> : <span className="badge">{b}</span>) : null}
                </button>
              );
            })}
          </div>
        ))}
        <div className="sidebar-foot">
          <button className="nav-item" style={{ height: 44 }} onClick={() => go('/settings')}>
            <div className="avatar sm" style={{ background: data.me.color }}>{data.me.name.split(' ').map((x) => x[0]).join('')}</div>
            <div style={{ minWidth: 0, lineHeight: 1.2 }}>
              <div className="subhead truncate">{data.me.name}</div>
              <div className="caption secondary">{ROLE_LABEL[role]}</div>
            </div>
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="panel">
          <header className="topbar">
            <GlobalSearch />
            <div className="spacer" />
            <span className={`pill hide-mobile ${online ? 'green live' : 'orange'}`} style={{ border: 0 }}><span className="dot" />{online ? 'Live' : 'Offline'}</span>
            <NotificationBell />
          </header>
          {page}
        </div>
      </main>
      <nav className="tabbar">
        {mobileNav.slice(0, 5).map((n) => {
          const b = n.badge?.(data);
          return (
            <button key={n.path} className={`tab ${activePath === n.path ? 'active' : ''}`} onClick={() => go(n.path)}>
              <Icon name={n.icon} size={23} stroke={activePath === n.path ? 2.1 : 1.7} />
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
        <div className="brand-mark" style={{ width: 48, height: 48, borderRadius: 12 }}><Icon name="truck" size={26} stroke={2.2} /></div>
        <span className="spinner" style={{ color: 'var(--label-3)' }} />
      </div>
    </div>
  );
}
