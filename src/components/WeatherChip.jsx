// Weather at a truck's position: emoji, temperature and conditions; amber/red when it matters for driving.
import { ago } from '../lib/format.js';
import WeatherIcon from './WeatherIcon.jsx';
import { kindOfW } from '../lib/weatherPopup.js';

export function weatherTitle(w) {
  if (!w) return '';
  return `${w.label}, ${w.tempC}°C (feels ${w.feelsC}°C) · wind ${w.windKph} km/h, gusts ${w.gustKph} km/h${w.precipMm ? ` · ${w.precipMm} mm/h` : ''}${w.tips?.length ? ` · ${w.tips.join(', ')}` : ''} · updated ${ago(w.at)}${w.simulated ? ' · sample weather (weather service not reachable)' : ''}`;
}

export default function WeatherChip({ w, compact, onDark }) {
  if (!w) return null;
  return (
    <span className={`wx ${w.severity} ${compact ? 'compact' : ''} ${onDark ? 'on-dark' : ''}`} title={weatherTitle(w)}>
      <WeatherIcon kind={kindOfW(w)} size={compact ? 18 : 22} />
      <b className="num">{w.tempC}°</b>
      {!compact && <span className="wx-l">{w.label}</span>}
      {!compact && w.gustKph >= 50 && <span className="wx-l">· gusts {w.gustKph}</span>}
      {w.simulated && !compact && <span className="wx-s">sample</span>}
    </span>
  );
}

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = (t) => new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });

/** Weather line for a truck's map hover, e.g. "❄️ −6°C Heavy snow · feels −13° · gusts 62 km/h · as of 2:05 p.m.". */
export function weatherLine(w) {
  if (!w) return '';
  return `${w.emoji} ${w.tempC}°C ${w.label} · feels ${w.feelsC}° · wind ${w.windKph}${w.gustKph >= 40 ? `, gusts ${w.gustKph}` : ''} km/h · as of ${clock(w.at)}${w.simulated ? ' (sample)' : ''}`;
}

/** Map hover for a truck: its label, then the weather where it is right now (HTML for Leaflet). */
export function truckTipHtml(t) {
  const w = t.weather;
  if (!w) return t.label ? esc(t.label) : '';
  return `${t.label ? `<div>${esc(t.label)}</div>` : ''}<div class="tip-wx ${w.severity}">${esc(weatherLine(w))}</div>${w.tips?.length ? `<div class="tip-wx-tip">⚠️ ${esc(w.tips.join(', '))}</div>` : ''}`;
}

/** Same as plain text (Google Maps marker title). */
export function truckTipText(t) {
  const w = t.weather;
  return [t.label, w && weatherLine(w), w?.tips?.length && `⚠️ ${w.tips.join(', ')}`].filter(Boolean).join('\n');
}
