// Live map built on Leaflet with Apple Maps–like styling (CARTO basemaps, custom pins).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

export default function MapView({ trucks = [], places = [], route, track, height = 360, fitKey, onTruckClick, interactive = true, padding = 40 }) {
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
    const setTiles = () => {
      layers.current.tiles?.remove();
      layers.current.tiles = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${isDark() ? 'dark_all' : 'voyager'}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO',
      }).addTo(m);
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
        if (t.label) mk.bindTooltip(t.label, { className: 'rugo-tip', direction: 'top', offset: [0, -18] });
        mk.on('click', () => onTruckClick?.(t.id));
        reg.set(t.id, mk);
      } else {
        mk.setLatLng(ll);
        mk.setIcon(truckIcon(t));
        if (t.label) mk.setTooltipContent(t.label);
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

  // Fit to everything once per fitKey
  useEffect(() => {
    const m = map.current;
    if (fitted.current === fitKey) return;
    const pts = [
      ...places.filter((p) => p?.lat).map((p) => [p.lat, p.lng]),
      ...trucks.filter((t) => t.location).map((t) => [t.location.lat, t.location.lng]),
      ...(route || []).map((p) => [p.lat, p.lng]),
    ];
    if (!pts.length) return;
    fitted.current = fitKey;
    if (pts.length === 1) m.setView(pts[0], 11);
    else m.fitBounds(L.latLngBounds(pts), { padding: [padding, padding], maxZoom: 12 });
  }, [fitKey, places, trucks, route, padding]);

  return <div ref={el} className="map" style={{ height }} />;
}
