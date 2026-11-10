// Right-click weather on maps: figure out what was clicked (a truck, a route, or open map),
// when the truck will be there, fetch the weather for that place and time, and build an Apple-Weather-style card.
import { api } from './api.js';
import { CITIES } from './basemap.js';
import { weatherSvg, skyOf } from '../components/WeatherIcon.jsx';

const KPH = 75; // average truck speed for "when will it get here"

export function kindFromCode(code, isDay = 1) {
  const c = Number(code);
  if (c === 0) return isDay ? 'sun' : 'moon';
  if (c === 1 || c === 2) return isDay ? 'partly' : 'partly-night';
  if (c === 3) return 'cloud';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 55) return 'drizzle';
  if ([56, 57, 66, 67].includes(c)) return 'sleet';
  if ([61, 63, 80, 81].includes(c)) return 'rain';
  if (c === 65 || c === 82) return 'heavy-rain';
  if ([71, 73, 77, 85].includes(c)) return 'snow';
  if (c === 75 || c === 86) return 'heavy-snow';
  if (c >= 95) return 'storm';
  return 'cloud';
}
export const kindOfW = (w) => w?.kind || kindFromCode(w?.code, 1);

export function nearestCity(p) {
  let best = null; let bd = Infinity;
  for (const c of CITIES) { const d = (c[1] - p.lat) ** 2 + ((c[2] - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2; if (d < bd) { bd = d; best = c; } }
  return best ? { name: best[0], km: Math.sqrt(bd) * 111 } : null;
}

/** Project a point onto a polyline: distance from the line and distance along it (km). */
function project(p, points) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180); const ky = 110.57;
  let best = { off: Infinity, along: 0 }; let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const ax = (points[i - 1].lng - p.lng) * kx; const ay = (points[i - 1].lat - p.lat) * ky;
    const bx = (points[i].lng - p.lng) * kx; const by = (points[i].lat - p.lat) * ky;
    const dx = bx - ax; const dy = by - ay; const len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (len * len))) : 0;
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.off) best = { off, along: acc + t * len };
    acc += len;
  }
  return best;
}

/**
 * Work out what a right-click at `p` means.
 * ctx: { lines: [{id, points, truckId?}], route: points[], trucks: [{id, unit, label, location}] }
 */
export function resolveClick(p, ctx, now = Date.now()) {
  const cands = [];
  for (const ln of ctx.lines || []) if (ln.points?.length > 1) cands.push({ points: ln.points, truck: (ctx.trucks || []).find((t) => t.id === ln.truckId || t.id === ln.id) });
  if (ctx.route?.length > 1) {
    // The truck driving this route is the one closest to it.
    const onRoute = (ctx.trucks || []).filter((t) => t.location).map((t) => ({ t, off: project(t.location, ctx.route).off })).sort((a, b) => a.off - b.off)[0];
    cands.push({ points: ctx.route, truck: onRoute && onRoute.off < 8 ? onRoute.t : null });
  }
  let hit = null;
  const tol = Math.max(1.5, ctx.tolKm || 4);
  for (const c of cands) { const pr = project(p, c.points); if (pr.off < tol && (!hit || pr.off < hit.pr.off)) hit = { ...c, pr }; }
  if (!hit || !hit.truck?.location) return { at: now, mode: hit ? 'route' : 'point' };
  const tp = project(hit.truck.location, hit.points);
  const ahead = hit.pr.along - tp.along;
  const unit = hit.truck.unit ? `Unit ${hit.truck.unit}` : 'The truck';
  if (ahead > 1) {
    const speed = Math.max(55, Math.min(100, hit.truck.location.speed || KPH));
    return { at: now + (ahead / speed) * 3.6e6, mode: 'eta', unit, aheadKm: ahead };
  }
  return { at: now, mode: 'passed', unit };
}

const clock = (t) => new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Apple-Weather-style card. */
export function weatherCardHtml(w, { place, when, foot } = {}) {
  const sky = skyOf({ ...w, kind: kindOfW(w) });
  const cell = (k, v) => `<div class="wxp-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  return `<div class="wxp sky-${sky}">
    <div class="wxp-top">
      <div class="wxp-head"><div class="wxp-place">${esc(place || 'This spot')}</div><div class="wxp-when">${esc(when || `Now · ${clock(Date.now())}`)}</div></div>
      ${weatherSvg(kindOfW(w), 58)}
    </div>
    <div class="wxp-temp">${w.tempC}°</div>
    <div class="wxp-cond">${esc(w.label)}</div>
    <div class="wxp-grid">
      ${cell('Feels like', `${w.feelsC}°`)}${cell('Wind', `${w.windKph} km/h`)}${cell('Gusts', `${w.gustKph} km/h`)}${cell('Precip.', `${(w.precipMm || 0).toFixed(1)} mm`)}
    </div>
    ${w.tips?.length ? `<div class="wxp-alert"><span>⚠︎</span>${esc(w.tips.join(' · '))}</div>` : ''}
    ${foot || w.simulated ? `<div class="wxp-foot">${esc([foot, w.simulated ? 'Sample weather — weather service not reachable' : ''].filter(Boolean).join(' · '))}</div>` : ''}
  </div>`;
}

export const loadingCardHtml = (place) => `<div class="wxp sky-cloudy loading"><div class="wxp-place">${esc(place || 'This spot')}</div><div class="wxp-when">Checking the weather…</div><div class="wxp-spin"></div></div>`;
export const errorCardHtml = (msg) => `<div class="wxp sky-cloudy"><div class="wxp-place">Weather unavailable</div><div class="wxp-when">${esc(msg)}</div></div>`;

/** Kilometres covered by `px` screen pixels at a web-map zoom level. */
export const pxToKm = (px, zoom, lat) => (px * 40075.016 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);

/** Fetch and describe the weather for a right-click at `p`. Returns the card HTML. */
export async function weatherForClick(p, ctx) {
  const r = resolveClick(p, ctx);
  const city = nearestCity(p);
  const place = city ? (city.km < 8 ? city.name : `Near ${city.name}`) : 'This spot';
  const when = r.mode === 'eta' ? `When ${r.unit} gets here · ~${clock(r.at)} (${Math.round(r.aheadKm)} km ahead)`
    : r.mode === 'passed' ? `Now · ${clock(Date.now())} · ${r.unit} already passed here` : `Now · ${clock(Date.now())}`;
  try {
    const w = await api(`/weather?lat=${p.lat.toFixed(4)}&lng=${p.lng.toFixed(4)}&at=${Math.round(r.at)}`);
    return { place, html: weatherCardHtml(w, { place, when: r.mode === 'eta' && w.forecast ? when : r.mode === 'eta' ? `${when}` : when }) };
  } catch (e) { return { place, html: errorCardHtml(e.message) }; }
}

/** Card for a truck's own position right now. */
export async function weatherForTruck(t) {
  const p = t.location;
  const city = nearestCity(p);
  const place = `${t.unit ? `Unit ${t.unit}` : 'Truck'} · ${city ? (city.km < 8 ? city.name : `near ${city.name}`) : ''}`;
  let w = t.weather && Date.now() - t.weather.at < 15 * 60000 ? t.weather : null;
  if (!w) { try { w = await api(`/weather?lat=${p.lat.toFixed(4)}&lng=${p.lng.toFixed(4)}`); } catch (e) { return { place, html: errorCardHtml(e.message) }; } }
  return { place, html: weatherCardHtml(w, { place, when: `Right now · as of ${clock(w.at)}`, foot: (t.label || '').split(' · ').slice(1, 3).join(' · ') }) };
}
