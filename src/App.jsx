import { useEffect, useState } from 'react';
import { useStore, isActive } from './lib/store.jsx';
import { useRoute, go, match, viewTransitions } from './lib/router.js';
import Icon from './components/Icon.jsx';
import { Toasts, Sheet } from './components/ui.jsx';
import AccountMenu from './components/AccountMenu.jsx';
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
import Inventory from './pages/carrier/Inventory.jsx';
import Fuel from './pages/carrier/Fuel.jsx';
import Reports from './pages/carrier/Reports.jsx';
import DriverJob from './pages/driver/DriverJob.jsx';
import DriverGps from './components/DriverGps.jsx';
import DriverFuel from './pages/driver/DriverFuel.jsx';
import Integrations from './pages/carrier/Integrations.jsx';
import Dashboard from './pages/carrier/Dashboard.jsx';
import DriverToday from './pages/driver/DriverToday.jsx';
import Messages from './pages/Messages.jsx';
import ChatDelivery from './components/ChatDelivery.jsx';
import { unread } from './lib/chat.js';
import DriverHours from './pages/driver/DriverHours.jsx';

const NAV = {
  shipper: [
    { path: '/', label: 'Dashboard', icon: 'grid', page: ShipperHome },
    { path: '/new', label: 'Request pickup', icon: 'plusCircle', page: NewLoad },
    { path: '/shipments', label: 'Shipments', icon: 'box', page: Shipments, section: 'Workspace', badge: (d) => d.loads.filter((l) => l.status === 'requested' || isActive(l)).length, quiet: true },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', page: CalendarPage, section: 'Workspace', desktopOnly: true },
    { path: '/billing', label: 'Billing', icon: 'receipt', page: Billing, section: 'Workspace' },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings, section: 'Workspace', mobileOnly: true },
  ],
  dispatcher: [
    { path: '/', label: 'Dashboard', icon: 'grid', page: Dashboard },
    { path: '/board', label: 'Load board', icon: 'list', page: Board, badge: (d) => d.loads.filter((l) => l.status === 'requested').length },
    { path: '/dispatch', label: 'Jobs', icon: 'route', page: Dispatch, badge: (d) => d.loads.filter(isActive).length, quiet: true },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', page: CalendarPage },
    { path: '/messages', label: 'Messages', icon: 'message', page: Messages, badge: (d) => unread(d) },
    { path: '/fleet', label: 'Live fleet', icon: 'map', page: Fleet, section: 'Fleet' },
    { path: '/drivers', label: 'Drivers', icon: 'people', page: Drivers, section: 'Fleet' },
    { path: '/inventory', label: 'Inventory', icon: 'truck', page: Inventory, section: 'Fleet' },
    { path: '/fuel', label: 'Fuel', icon: 'fuel', page: Fuel, section: 'Fleet' },
    { path: '/reports', label: 'Reports', icon: 'chart', page: Reports, section: 'Fleet' },
    { path: '/integrations', label: 'Integrations', icon: 'plug', page: Integrations, section: 'Fleet', desktopOnly: true },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings, section: 'Workspace', mobileOnly: true },
  ],
  driver: [
    { path: '/', label: 'Today', icon: 'grid', page: DriverToday },
    { path: '/job', label: 'My job', icon: 'truck', page: DriverJob },
    { path: '/messages', label: 'Messages', icon: 'message', page: Messages, badge: (d) => unread(d) },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', page: CalendarPage, section: 'Workspace' },
    { path: '/fuel', label: 'Fuel', icon: 'fuel', page: DriverFuel, section: 'Workspace' },
    { path: '/hours', label: 'Hours & pay', icon: 'clock', page: DriverHours, section: 'Workspace' },
    { path: '/settings', label: 'Settings', icon: 'gear', page: Settings, section: 'Workspace', mobileOnly: true },
  ],
};

const ROLE_LABEL = { shipper: 'Shipper', dispatcher: 'Carrier dispatch', driver: 'Driver' };

export default function App() {
  const { data, authed, online } = useStore();
  const path = useRoute();
  const [more, setMore] = useState(false);

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
  const activePath = loadParams ? (role === 'shipper' ? '/shipments' : role === 'dispatcher' ? '/dispatch' : '/job') : (nav.find((n) => n.path === path) ? path : '/');
  const current = nav.find((n) => n.path === activePath);
  if (loadParams) {
    page = role === 'driver' ? <DriverJob loadId={loadParams.id} /> : <LoadDetail id={loadParams.id} />;
    const ref = data.loads.find((l) => l.id === loadParams.id)?.ref;
    void ref;
  } else {
    const P = current.page;
    page = <P />;
  }
  // Phones: 4 main tabs + "More" for everything else (so every page is reachable).
  const PRIMARY = { dispatcher: ['/', '/board', '/messages', '/fleet'], driver: ['/', '/job', '/messages', '/fuel'], shipper: ['/', '/new', '/shipments', '/billing'] }[role] || [];
  const tabs = PRIMARY.map((p) => nav.find((n) => n.path === p)).filter(Boolean);
  const moreNav = nav.filter((n) => !PRIMARY.includes(n.path));
  const deskNav = nav.filter((n) => !n.mobileOnly);
  const sections = [...new Set(deskNav.map((n) => n.section || ''))];
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
            {deskNav.filter((n) => (n.section || '') === sec).map((n) => {
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
          <AccountMenu />
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
          <div key={path} className={`page-anim ${viewTransitions ? '' : 'fade'}`}>{page}</div>
        </div>
      </main>
      <nav className="tabbar">
        {tabs.map((n) => {
          const b = n.badge?.(data);
          return (
            <button key={n.path} className={`tab ${activePath === n.path ? 'active' : ''}`} onClick={() => go(n.path)}>
              <Icon name={n.icon} size={23} stroke={activePath === n.path ? 2.1 : 1.7} />
              {n.label.replace('Request pickup', 'Request')}
              {b && !n.quiet ? <span className="badge">{b}</span> : null}
            </button>
          );
        })}
        {moreNav.length > 0 && (() => {
          const on = moreNav.some((n) => n.path === activePath);
          const b = moreNav.reduce((a, n) => a + (n.quiet ? 0 : Number(n.badge?.(data) || 0)), 0);
          return (
            <button className={`tab ${on ? 'active' : ''}`} onClick={() => setMore(true)} aria-label="More pages">
              <Icon name="list" size={23} stroke={on ? 2.1 : 1.7} />More
              {b ? <span className="badge">{b}</span> : null}
            </button>
          );
        })()}
      </nav>
      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="more-grid">
            {moreNav.map((n) => {
              const b = n.badge?.(data);
              return (
                <button key={n.path} className={`more-item ${activePath === n.path ? 'on' : ''}`} onClick={() => { setMore(false); go(n.path); }}>
                  <Icon name={n.icon} size={24} />{n.label}
                  {b && !n.quiet ? <span className="badge">{b}</span> : null}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      <Toasts />
      {role === 'driver' && <DriverGps />}
      {(role === 'driver' || role === 'dispatcher') && <ChatDelivery />}
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
