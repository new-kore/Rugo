// Multicolour weather symbols in the style of Apple's Weather app (original drawings).
// weatherSvg() returns an SVG string (used inside map popups); <WeatherIcon> renders it in React.

let uid = 0;
const CLOUD = 'M18.5 50h29a11.5 11.5 0 0 0 1.4-22.9A15.5 15.5 0 0 0 19 25.4 12.3 12.3 0 0 0 18.5 50z';

function cloud(id, { y = 0, dark = false, scale = 1, x = 0 } = {}) {
  const top = dark ? '#9aa1ad' : '#ffffff'; const bot = dark ? '#5f6672' : '#d5dbe4';
  return `<defs><linearGradient id="c${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>
  <path d="${CLOUD}" transform="translate(${x} ${y}) scale(${scale})" fill="url(#c${id})" stroke="${dark ? '#4b515c' : '#c3cad5'}" stroke-width="0.8"/>`;
}

function sun(id, cx = 32, cy = 32, r = 11, rays = true) {
  const ray = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4; const r1 = r + 5; const r2 = r + 10;
    return `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"/>`;
  }).join('');
  return `<defs><radialGradient id="s${id}" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#ffe066"/><stop offset="0.6" stop-color="#ffcc00"/><stop offset="1" stop-color="#ff9f0a"/></radialGradient></defs>
  ${rays ? `<g class="wxi-rays" style="transform-origin:${cx}px ${cy}px" stroke="#ffcc00" stroke-width="3.6" stroke-linecap="round">${ray}</g>` : ''}
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s${id})"/>`;
}

function moon(id, cx = 30, cy = 30, r = 15) {
  return `<defs><linearGradient id="m${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7d6"/><stop offset="1" stop-color="#ffd60a"/></linearGradient></defs>
  <path d="M${cx + r * 0.35} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55} a${r * 0.82} ${r * 0.82} 0 1 1 -${r * 0.65} -${r * 1.55}z" fill="url(#m${id})"/>`;
}

const drops = (n, heavy) => Array.from({ length: n }, (_, i) => {
  const x = 22 + i * (n > 3 ? 7 : 9.5);
  return `<line class="wxi-drop" style="animation-delay:${(i * 0.27).toFixed(2)}s" x1="${x}" y1="${heavy ? 47 : 48}" x2="${x - 3}" y2="${heavy ? 57 : 55}"/>`;
}).join('');
const flakes = (n) => Array.from({ length: n }, (_, i) => {
  const x = 22 + i * (n > 3 ? 7 : 9.5); const y = 52 + (i % 2) * 4;
  return `<g class="wxi-flake" style="animation-delay:${(i * 0.4).toFixed(2)}s;transform-origin:${x}px ${y}px"><line x1="${x - 2.6}" y1="${y}" x2="${x + 2.6}" y2="${y}"/><line x1="${x - 1.3}" y1="${y - 2.3}" x2="${x + 1.3}" y2="${y + 2.3}"/><line x1="${x + 1.3}" y1="${y - 2.3}" x2="${x - 1.3}" y2="${y + 2.3}"/></g>`;
}).join('');

/** SVG markup for an icon kind: sun, moon, partly, partly-night, cloud, fog, drizzle, rain, heavy-rain, sleet, snow, heavy-snow, storm. */
export function weatherSvg(kind = 'cloud', size = 48) {
  const id = `wx${uid++}`;
  let body = '';
  switch (kind) {
    case 'sun': body = sun(id); break;
    case 'moon': body = moon(id, 32, 32, 16); break;
    case 'partly': body = sun(id, 23, 23, 9) + cloud(id, { y: 4, x: 4, scale: 0.92 }); break;
    case 'partly-night': body = moon(id, 22, 20, 11) + cloud(id, { y: 4, x: 4, scale: 0.92 }); break;
    case 'fog': body = `${cloud(id, { y: -8 })}<g stroke="#aab3bf" stroke-width="3.4" stroke-linecap="round"><line x1="16" y1="50" x2="48" y2="50"/><line x1="20" y1="57" x2="44" y2="57"/></g>`; break;
    case 'drizzle': body = `${cloud(id, { y: -10 })}<g stroke="#0a84ff" stroke-width="3" stroke-linecap="round">${drops(3)}</g>`; break;
    case 'rain': body = `${cloud(id, { y: -10 })}<g stroke="#0a84ff" stroke-width="3.4" stroke-linecap="round">${drops(3, true)}</g>`; break;
    case 'heavy-rain': body = `${cloud(id, { y: -10, dark: true })}<g stroke="#0a84ff" stroke-width="3.4" stroke-linecap="round">${drops(5, true)}</g>`; break;
    case 'sleet': body = `${cloud(id, { y: -10 })}<g stroke="#0a84ff" stroke-width="3" stroke-linecap="round">${drops(1)}</g><g stroke="#5ac8fa" stroke-width="1.8" stroke-linecap="round" transform="translate(16 0)">${flakes(1)}</g><g stroke="#0a84ff" stroke-width="3" stroke-linecap="round" transform="translate(28 0)">${drops(1)}</g>`; break;
    case 'snow': body = `${cloud(id, { y: -10 })}<g stroke="#5ac8fa" stroke-width="1.9" stroke-linecap="round">${flakes(3)}</g>`; break;
    case 'heavy-snow': body = `${cloud(id, { y: -10, dark: true })}<g stroke="#5ac8fa" stroke-width="1.9" stroke-linecap="round">${flakes(5)}</g>`; break;
    case 'storm': body = `${cloud(id, { y: -10, dark: true })}<path class="wxi-bolt" d="M33 40 25 53h7l-3 10 11-15h-7l4-8z" fill="#ffcc00" stroke="#ff9f0a" stroke-width="0.8" stroke-linejoin="round"/>`; break;
    default: body = `${cloud(id, { y: -2, scale: 1.05, x: -1.5 })}`;
  }
  return `<svg class="wxi" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

/** Background "sky" for Apple-style weather cards. */
export function skyOf(w) {
  if (!w) return 'cloudy';
  const k = w.kind || 'cloud';
  if (k === 'moon' || k === 'partly-night') return 'night';
  if (k === 'storm') return 'storm';
  if (k.includes('snow') || k === 'sleet') return 'snow';
  if (k.includes('rain') || k === 'drizzle') return 'rain';
  if (k === 'fog') return 'fog';
  if (k === 'sun' || k === 'partly') return 'clear';
  return 'cloudy';
}

export default function WeatherIcon({ kind, size = 48, className = '' }) {
  return <span className={`wxi-wrap ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: weatherSvg(kind, size) }} />;
}
