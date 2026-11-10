// Live map built on Leaflet with Apple Maps–like styling (CARTO basemaps, custom pins).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { standalone } from '../lib/api.js';
import { WATER, RIVERS, CITIES } from '../lib/basemap.js';
import { useState } from 'react';
import GoogleMapView from './GoogleMapView.jsx';
import { getKey, googleFailed, onGoogleFailure } from '../lib/google.js';
import { truckTipHtml } from './WeatherChip.jsx';

const truckSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 16.5V7a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14.5 7v9.5"/><path d="M14.5 10h3.6l3.4 4v2.5h-1.6"/><circle cx="6.8" cy="17" r="2"/><circle cx="17.6" cy="17" r="2"/></svg>';

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function truckIcon(t) {
  const moving = t.moving && (t.location?.speed || 0) > 1;
  const color = t.color || '#007aff';
  return L.divIcon({
    className: 'smooth-marker',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    html: `<div class="truck-pin ${moving ? 'moving' : 'idle'} ${t.selected ? 'sel' : ''}" style="--pin:${color}">
      <div class="arrow" style="transform:rotate(${Math.round(t.location?.heading || 0)}deg)"></div>
      <div class="core" style="background:${color}">${truckSvg}</div></div>`,
  });
}
const placeIcon = (kind) => L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="place-pin ${kind}"></div>` });

// Whether real map tiles can load here (blocked inside some sandboxed pages). Learned once per page.
let tilesOk = !standalone;

/** Simplified offline map, drawn until (unless) real tiles load. Returns a function that removes it. */
function drawBasemap(m) {
  const group = L.layerGroup().addTo(m);
  m.attributionControl.addAttribution('Simplified offline map');
  WATER.forEach((ring) => L.polygon(ring, { className: 'bm-water', weight: 1, interactive: false, smoothFactor: 0 }).addTo(group));
  RIVERS.forEach((line) => L.polyline(line, { className: 'bm-river', weight: 3, interactive: false }).addTo(group));
  const labels = CITIES.map(([name, lat, lng, rank]) => ({
    rank,
    mk: L.marker([lat, lng], {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: `bm-city r${rank}`, iconSize: [0, 0], html: `<i></i><span>${name}</span>` }),
    }),
  }));
  const sync = () => {
    const z = m.getZoom();
    labels.forEach(({ rank, mk }) => {
      const show = rank === 1 || (rank === 2 && z >= 6) || (rank === 3 && z >= 8);
      if (show && !group.hasLayer(mk)) mk.addTo(group);
      if (!show && group.hasLayer(mk)) group.removeLayer(mk);
    });
  };
  m.on('zoomend', sync);
  sync();
  return () => {
    m.off('zoomend', sync);
    group.remove();
    m.attributionControl.removeAttribution('Simplified offline map');
  };
}

function LeafletMapView({ trucks = [], places = [], route, track, lines = [], highlight, onLineHover, onLineClick, height = 360, fitKey, onTruckClick, interactive = true, padding = 40 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({ trucks: new Map(), places: L.layerGroup(), route: null, track: null, tiles: null });
  const fitted = useRef(null);

  useEffect(() => {
    const m = L.map(el.current, {
      zoomControl: interactive, attributionControl: true, scrollWheelZoom: interactive, dragging: interactive,
      doubleClickZoom: interactive, touchZoom: interactive, keyboard: interactive,
    }).setView([44.2, -78.5], 6);
    map.current = m;
    let removeBasemap = tilesOk ? null : drawBasemap(m);
    if (removeBasemap) el.current.classList.add('offline');
    const setTiles = () => {
      layers.current.tiles?.remove();
      const t = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${isDark() ? 'dark_all' : 'voyager'}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO',
      });
      t.once('tileload', () => {
        tilesOk = true;
        removeBasemap?.();
        removeBasemap = null;
        el.current?.classList.remove('offline');
      });
      layers.current.tiles = t.addTo(m);
    };
    setTiles();
    layers.current.places.addTo(m);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', setTiles);
    const obs = new MutationObserver(setTiles);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    m.on('zoomstart', () => el.current?.classList.add('zooming'));
    m.on('zoomend', () => el.current?.classList.remove('zooming'));
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { mq.removeEventListener('change', setTiles); obs.disconnect(); ro.disconnect(); m.remove(); };
  }, [interactive]);

  // Trucks
  useEffect(() => {
    const m = map.current;
    const reg = layers.current.trucks;
    const seen = new Set();
    for (const t of trucks) {
      if (!t.location) continue;
      seen.add(t.id);
      const ll = [t.location.lat, t.location.lng];
      let mk = reg.get(t.id);
      if (!mk) {
        mk = L.marker(ll, { icon: truckIcon(t), zIndexOffset: 1000 }).addTo(m);
        if (t.label || t.weather) mk.bindTooltip(truckTipHtml(t), { className: 'rugo-tip', direction: 'top', offset: [0, -18] });
        mk.on('click', () => onTruckClick?.(t.id));
        reg.set(t.id, mk);
      } else {
        mk.setLatLng(ll);
        mk.setIcon(truckIcon(t));
        if (t.label || t.weather) { if (mk.getTooltip()) mk.setTooltipContent(truckTipHtml(t)); else mk.bindTooltip(truckTipHtml(t), { className: 'rugo-tip', direction: 'top', offset: [0, -18] }); }
      }
    }
    for (const [k, mk] of reg) if (!seen.has(k)) { mk.remove(); reg.delete(k); }
  }, [trucks, onTruckClick]);

  // Places, planned route, travelled track
  useEffect(() => {
    const m = map.current;
    const lay = layers.current;
    lay.places.clearLayers();
    for (const p of places) {
      if (!p?.lat) continue;
      const mk = L.marker([p.lat, p.lng], { icon: placeIcon(p.kind) });
      if (p.label) mk.bindTooltip(p.label, { className: 'rugo-tip', direction: 'top', offset: [0, -10] });
      lay.places.addLayer(mk);
    }
    lay.route?.remove(); lay.route = null;
    lay.track?.remove(); lay.track = null;
    const blue = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#007aff';
    if (route?.length > 1) {
      lay.route = L.layerGroup([
        L.polyline(route.map((p) => [p.lat, p.lng]), { color: '#ffffff', weight: 8, opacity: 0.9 }),
        L.polyline(route.map((p) => [p.lat, p.lng]), { color: blue, weight: 5, opacity: 0.9 }),
      ]).addTo(m);
    }
    if (track?.length > 1) {
      lay.track = L.polyline(track.map((p) => [p.lat, p.lng]), { color: '#8e8e93', weight: 5, opacity: 0.85, dashArray: '1 9', lineCap: 'round' }).addTo(m);
    }
  }, [places, route, track]);

  // Coloured route lines (calendar map): hover tooltip, highlight, click.
  const lineLayers = useRef(new Map());
  useEffect(() => {
    const m = map.current;
    for (const g of lineLayers.current.values()) g.remove();
    lineLayers.current.clear();
    for (const ln of lines) {
      if (!ln.points?.length) continue;
      const ll = ln.points.map((p) => [p.lat, p.lng]);
      const halo = L.polyline(ll, { color: '#fff', weight: 8, opacity: 0.9 });
      const line = L.polyline(ll, { color: ln.color, weight: 4, opacity: 0.95, lineCap: 'round' });
      // Both ends in the day's colour: circle = pickup, square = delivery.
      const pin = (kind) => L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<div class="day-pin ${kind}" style="background:${ln.color}"></div>` });
      const a = L.marker(ll[0], { icon: pin('pickup'), zIndexOffset: 500 });
      const b = L.marker(ll[ll.length - 1], { icon: pin('dropoff'), zIndexOffset: 500 });
      const g = L.featureGroup([halo, line, a, b]).addTo(m);
      g.bindTooltip(ln.tooltip, { sticky: true, className: 'rugo-tip', direction: 'top', offset: [0, -8] });
      g.on('mouseover', () => onLineHover?.(ln.id));
      g.on('mouseout', () => onLineHover?.(null));
      g.on('click', () => onLineClick?.(ln.id));
      g._line = line; g._halo = halo;
      lineLayers.current.set(ln.id, g);
    }
    return () => { for (const g of lineLayers.current.values()) g.remove(); lineLayers.current.clear(); };
  }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const [id, g] of lineLayers.current) {
      const on = highlight === id;
      const dim = highlight && !on;
      g._line.setStyle({ weight: on ? 7 : 4, opacity: dim ? 0.25 : 0.95 });
      g._halo.setStyle({ weight: on ? 11 : 8, opacity: dim ? 0.3 : 0.9 });
      g.eachLayer((x) => x.setOpacity?.(dim ? 0.3 : 1));
      if (on) g.bringToFront();
    }
  }, [highlight, lines]);

  // Fit to everything once per fitKey
  useEffect(() => {
    const m = map.current;
    if (fitted.current === fitKey) return;
    const pts = [
      ...places.filter((p) => p?.lat).map((p) => [p.lat, p.lng]),
      ...trucks.filter((t) => t.location).map((t) => [t.location.lat, t.location.lng]),
      ...(route || []).map((p) => [p.lat, p.lng]),
      ...lines.flatMap((ln) => (ln.points || []).map((p) => [p.lat, p.lng])),
    ];
    if (!pts.length) return;
    fitted.current = fitKey;
    if (pts.length === 1) m.setView(pts[0], 11);
    else m.fitBounds(L.latLngBounds(pts), { padding: [padding, padding], maxZoom: 12 });
  }, [fitKey, places, trucks, route, lines, padding]);

  return <div ref={el} className="map" style={{ height }} />;
}

/** Google Maps when a key is configured and accepted; otherwise the built-in map. */
export default function MapView(props) {
  const [useGoogle, setUseGoogle] = useState(() => !!getKey() && !googleFailed());
  useEffect(() => onGoogleFailure(() => setUseGoogle(false)), []);
  if (useGoogle) return <GoogleMapView {...props} onFail={() => setUseGoogle(false)} />;
  return <LeafletMapView {...props} />;
}
