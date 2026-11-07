// Live map on Google Maps: same props and behaviour as the Leaflet map (trucks, pins, route, travelled track).
import { useEffect, useRef } from 'react';
import { loadGoogle } from '../lib/google.js';

const truckSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 16.5V7a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14.5 7v9.5"/><path d="M14.5 10h3.6l3.4 4v2.5h-1.6"/><circle cx="6.8" cy="17" r="2"/><circle cx="17.6" cy="17" r="2"/></svg>';
const isDark = () => document.documentElement.dataset.theme === 'dark';

function truckEl(t) {
  const moving = t.moving && (t.location?.speed || 0) > 1;
  const color = t.color || '#5e6ad2';
  const el = document.createElement('div');
  el.style.transform = 'translateY(50%)'; // anchor the pin's centre on the position
  el.innerHTML = `<div class="truck-pin ${moving ? 'moving' : 'idle'} ${t.selected ? 'sel' : ''}" style="--pin:${color}" title="${(t.label || '').replace(/"/g, '&quot;')}">
    <div class="arrow" style="transform:rotate(${Math.round(t.location?.heading || 0)}deg)"></div>
    <div class="core" style="background:${color}">${truckSvg}</div></div>`;
  return el;
}
function placeEl(p) {
  const el = document.createElement('div');
  el.style.transform = 'translateY(50%)';
  el.innerHTML = `<div class="place-pin ${p.kind}" title="${(p.label || '').replace(/"/g, '&quot;')}"></div>`;
  return el;
}

export default function GoogleMapView({ trucks = [], places = [], route, track, lines = [], highlight, onLineHover, onLineClick, height = 360, fitKey, onTruckClick, interactive = true, padding = 40, onFail }) {
  const el = useRef(null);
  const g = useRef(null); // { maps, map, Marker }
  const reg = useRef({ trucks: new Map(), places: [], route: [], track: null });
  const fitted = useRef(null);
  const latest = useRef({});
  latest.current = { trucks, places, route, track, lines, highlight, onLineHover, onLineClick, fitKey, onTruckClick, padding };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const maps = await loadGoogle();
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')]);
        if (!alive || !el.current) return;
        const map = new Map(el.current, {
          center: { lat: 44.2, lng: -78.5 }, zoom: 6, mapId: 'DEMO_MAP_ID',
          colorScheme: isDark() ? 'DARK' : 'LIGHT',
          disableDefaultUI: true, zoomControl: interactive, fullscreenControl: interactive, gestureHandling: interactive ? 'greedy' : 'none',
          clickableIcons: false,
        });
        g.current = { maps, map, Marker: AdvancedMarkerElement };
        draw();
      } catch (e) {
        onFail?.(e);
      }
    })();
    return () => { alive = false; };
  }, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    if (!g.current) return;
    const { maps, map, Marker } = g.current;
    const { trucks: ts, places: ps, route: rt, track: tk, fitKey: fk, onTruckClick: click, padding: pad } = latest.current;
    const r = reg.current;

    // Trucks: move existing markers, add/remove as needed.
    const seen = new Set();
    for (const t of ts) {
      if (!t.location) continue;
      seen.add(t.id);
      const pos = { lat: t.location.lat, lng: t.location.lng };
      let mk = r.trucks.get(t.id);
      if (!mk) {
        mk = new Marker({ map, position: pos, content: truckEl(t), zIndex: 1000, title: t.label || '' });
        mk.addListener('click', () => latest.current.onTruckClick?.(t.id));
        r.trucks.set(t.id, mk);
      } else {
        mk.position = pos;
        mk.content = truckEl(t);
      }
    }
    for (const [k, mk] of r.trucks) if (!seen.has(k)) { mk.map = null; r.trucks.delete(k); }

    // Pins, planned route, travelled track.
    if (r.lastPlaces !== ps) {
    r.lastPlaces = ps;
    r.places.forEach((m) => { m.map = null; });
    r.places = ps.filter((p) => p?.lat).map((p) => new Marker({ map, position: { lat: p.lat, lng: p.lng }, content: placeEl(p), title: p.label || '' }));
    }
    if (r.lastRoute !== rt) {
    r.lastRoute = rt;
    r.route.forEach((l) => l.setMap(null));
    r.route = [];
    if (rt?.length > 1) {
      const path = rt.map((p) => ({ lat: p.lat, lng: p.lng }));
      r.route = [
        new maps.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 8, clickable: false }),
        new maps.Polyline({ map, path, strokeColor: '#5e6ad2', strokeOpacity: 0.95, strokeWeight: 5, clickable: false }),
      ];
    }
    }
    if (r.lastTrack !== tk) {
    r.lastTrack = tk;
    r.track?.setMap(null);
    r.track = null;
    if (tk?.length > 1) {
      r.track = new maps.Polyline({
        map, path: tk.map((p) => ({ lat: p.lat, lng: p.lng })), strokeOpacity: 0, clickable: false,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: '#8b8f97', scale: 3 }, offset: '0', repeat: '12px' }],
      });
    }
    }

    // Coloured route lines with hover info.
    const { lines: lns, highlight: hl } = latest.current;
    if (r.lastLines !== lns) {
      r.lastLines = lns;
      (r.lines || []).forEach((x) => { x.halo.setMap(null); x.line.setMap(null); });
      r.info = r.info || new maps.InfoWindow({ disableAutoPan: true });
      r.lines = (lns || []).filter((ln) => ln.points?.length).map((ln) => {
        const path = ln.points.map((p) => ({ lat: p.lat, lng: p.lng }));
        const halo = new maps.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 8 });
        const line = new maps.Polyline({ map, path, strokeColor: ln.color, strokeOpacity: 0.95, strokeWeight: 4 });
        [halo, line].forEach((pl) => {
          pl.addListener('mouseover', (e) => { latest.current.onLineHover?.(ln.id); r.info.setContent(ln.tooltip); r.info.setPosition(e.latLng); r.info.open({ map }); });
          pl.addListener('mouseout', () => { latest.current.onLineHover?.(null); r.info.close(); });
          pl.addListener('click', () => latest.current.onLineClick?.(ln.id));
        });
        return { id: ln.id, halo, line };
      });
    }
    (r.lines || []).forEach((x) => {
      const on = hl === x.id; const dim = hl && !on;
      x.line.setOptions({ strokeWeight: on ? 7 : 4, strokeOpacity: dim ? 0.25 : 0.95, zIndex: on ? 10 : 1 });
      x.halo.setOptions({ strokeWeight: on ? 11 : 8, strokeOpacity: dim ? 0.3 : 0.9, zIndex: on ? 9 : 0 });
    });

    // Fit once per fitKey.
    if (fitted.current !== fk) {
      const b = new maps.LatLngBounds();
      let n = 0;
      [...ps.filter((p) => p?.lat), ...ts.filter((t) => t.location).map((t) => t.location), ...(rt || []), ...(lns || []).flatMap((ln) => ln.points || [])].forEach((p) => { b.extend({ lat: p.lat, lng: p.lng }); n++; });
      if (n) {
        fitted.current = fk;
        if (n === 1) { map.setCenter(b.getCenter()); map.setZoom(11); } else map.fitBounds(b, pad);
      }
    }
    void click;
  }

  useEffect(draw, [trucks, places, route, track, lines, highlight, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map" style={{ height }} />;
}
