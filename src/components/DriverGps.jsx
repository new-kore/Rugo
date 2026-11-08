// Driver app GPS: starts automatically when the driver starts a load or clocks in,
// and runs until the load is delivered (auto shift ends) or they clock out / sign out.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useStore } from '../lib/store.jsx';
import { post } from '../lib/api.js';

const MOVING = ['en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'];
const SEND_EVERY_MS = 5000;

export default function DriverGps() {
  const { data } = useStore();
  const me = data.me;
  const clockedIn = (data.shifts || []).some((s) => s.driverId === me.id && !s.end);
  const onLoad = data.loads.some((l) => (l.driverId === me.id || (l.teamDriverIds || []).includes(me.id)) && MOVING.includes(l.status));
  const want = clockedIn || onLoad;
  const [state, setState] = useState('off'); // off | starting | on | denied | unavailable
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const reported = useRef('off');

  const report = (s) => {
    if (reported.current === s) return;
    reported.current = s;
    post('/driver/gps', { state: s }).catch(() => {});
  };

  useEffect(() => {
    if (!want) { setState('off'); if (reported.current !== 'off') report('off'); return undefined; }
    if (!navigator.geolocation) { setState('unavailable'); report('unavailable'); return undefined; }
    setState('starting');
    const id = navigator.geolocation.watchPosition((p) => {
      setState('on'); report('on');
      if (Date.now() - last.current < SEND_EVERY_MS) return;
      last.current = Date.now();
      post('/driver/location', { lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed, heading: p.coords.heading, accuracy: p.coords.accuracy }).catch(() => {});
    }, (err) => {
      const s = err.code === 1 ? 'denied' : 'unavailable';
      setState(s); report(s);
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [want]);

  // Keep the screen awake while tracking so the phone doesn't pause GPS.
  useEffect(() => {
    if (state !== 'on' || !navigator.wakeLock) return undefined;
    let lock = null; let dead = false;
    const grab = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
    const onVis = () => { if (!dead && document.visibilityState === 'visible') grab(); };
    grab();
    document.addEventListener('visibilitychange', onVis);
    return () => { dead = true; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [state]);

  if (!want) return null;
  if (hidden && (state === 'denied' || state === 'unavailable')) return <div className="gps-chip off" aria-live="polite"><span className="dot" />GPS off</div>;
  if ((state === 'denied' || state === 'unavailable') && !hidden) {
    return (
      <div className="gps-banner red" role="alert">
        <Icon name="location" size={18} />
        <div>
          <b>{state === 'denied' ? 'Location is turned off for Rugo' : 'Can’t get your location'}</b>
          <div className="footnote">{state === 'denied' ? 'Dispatch can’t track your load. Allow location for Rugo in your phone settings, then reopen the app.' : 'Move to open sky or check that location services are on.'}</div>
        </div>
        <button className="gps-x" aria-label="Hide" onClick={() => setHidden(true)}><Icon name="close" size={16} /></button>
      </div>
    );
  }
  return (
    <div className={`gps-chip ${state === 'on' ? 'on' : ''}`} aria-live="polite">
      <span className="dot" />{state === 'on' ? 'GPS tracking' : 'Starting GPS…'}
    </div>
  );
}
