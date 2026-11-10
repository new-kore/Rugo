// Live weather where each truck is, from Open-Meteo (free, no key). Refreshed every 10 min or when a truck moves 15 km.
// If the weather service can't be reached and the demo simulator is on, trucks get clearly-labelled sample weather.
import { db, save } from './db.js';
import { haversine } from './geo.js';
import { publish, notify, settings } from './fleet.js';
import { ACTIVE } from './constants.js';

const env = () => globalThis.process?.env || {};
const BASE = () => env().RUGO_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';
const FRESH_MS = 10 * 60000;
const MOVED_KM = 15;

/** WMO weather code → plain words, an emoji, and how much it matters on the road. */
export function describe(code, isDay = 1) {
  const c = Number(code);
  const W = (label, emoji, severity = 'ok') => ({ label, emoji, severity });
  if (c === 0) return W(isDay ? 'Clear' : 'Clear night', isDay ? '☀️' : '🌙');
  if (c === 1 || c === 2) return W('Partly cloudy', isDay ? '⛅' : '☁️');
  if (c === 3) return W('Overcast', '☁️');
  if (c === 45 || c === 48) return W(c === 48 ? 'Freezing fog' : 'Fog', '🌫️', 'warn');
  if (c >= 51 && c <= 55) return W('Drizzle', '🌦️');
  if (c === 56 || c === 57) return W('Freezing drizzle', '🧊', 'danger');
  if (c === 61 || c === 80) return W('Light rain', '🌦️');
  if (c === 63 || c === 81) return W('Rain', '🌧️');
  if (c === 65 || c === 82) return W('Heavy rain', '🌧️', 'warn');
  if (c === 66 || c === 67) return W('Freezing rain', '🧊', 'danger');
  if (c === 71 || c === 85) return W('Light snow', '🌨️', 'warn');
  if (c === 73) return W('Snow', '🌨️', 'warn');
  if (c === 75 || c === 86) return W('Heavy snow', '❄️', 'danger');
  if (c === 77) return W('Snow grains', '🌨️', 'warn');
  if (c >= 95) return W(c > 95 ? 'Thunderstorm with hail' : 'Thunderstorm', '⛈️', 'danger');
  return W('—', '🌡️');
}

/** Road advice for the conditions. */
function advice(w) {
  const tips = [];
  if (w.gustKph >= 70) tips.push(`gusts ${Math.round(w.gustKph)} km/h — high-sided trailers at risk`);
  else if (w.gustKph >= 50) tips.push(`gusty wind ${Math.round(w.gustKph)} km/h`);
  if (w.tempC <= -25) tips.push('extreme cold');
  if (['Freezing rain', 'Freezing drizzle'].includes(w.label)) tips.push('black ice likely');
  if (['Heavy snow', 'Snow'].includes(w.label)) tips.push('slippery roads, chains may be needed');
  if (w.label.includes('fog')) tips.push('low visibility');
  if (w.label.startsWith('Thunderstorm')) tips.push('lightning and sudden heavy rain');
  return tips;
}

function shape(cur, simulated = false) {
  const d = describe(cur.weather_code, cur.is_day);
  const w = {
    tempC: Math.round(cur.temperature_2m), feelsC: Math.round(cur.apparent_temperature ?? cur.temperature_2m),
    windKph: Math.round(cur.wind_speed_10m || 0), gustKph: Math.round(cur.wind_gusts_10m || 0), precipMm: cur.precipitation || 0,
    code: cur.weather_code, label: d.label, emoji: d.emoji, severity: d.severity, at: Date.now(), simulated,
  };
  if (w.gustKph >= 70 || w.tempC <= -25) w.severity = 'danger';
  else if (w.gustKph >= 50 && w.severity === 'ok') w.severity = 'warn';
  w.tips = advice(w);
  return w;
}

async function fetchWeather(lat, lng) {
  const q = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lng.toFixed(3), current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,is_day', wind_speed_unit: 'kmh', timezone: 'auto' });
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(`${BASE()}?${q}`, { signal: ac.signal });
    if (!r.ok) throw new Error(`weather ${r.status}`);
    const j = await r.json();
    if (!j.current) throw new Error('no current weather');
    return shape(j.current);
  } finally { clearTimeout(t); }
}

/** Plausible November weather for the offline demo (labelled as a sample). */
function sampleWeather(t) {
  const lat = t.location.lat;
  const hour = Math.floor(Date.now() / 3.6e6);
  const h = [...`${t.id}${hour}`].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const north = Math.max(0, lat - 44);
  const temp = 6 - north * 4 + ((h % 70) / 10 - 3.5);
  const codes = north > 1.5 ? [3, 71, 73, 75, 2, 71] : [0, 1, 3, 61, 63, 45, 2, 80];
  const code = codes[h % codes.length];
  return shape({ temperature_2m: temp, apparent_temperature: temp - 4 - (h % 4), weather_code: temp < 0 && code >= 61 && code <= 63 ? 71 : code, wind_speed_10m: 8 + (h % 18), wind_gusts_10m: 16 + (h % 28), precipitation: code >= 61 ? (h % 30) / 10 : 0, is_day: 1 }, true);
}

let online = true;
let running = false;
export async function refreshWeather(force = false) {
  if (running) return;
  running = true;
  try {
    for (const t of db.trucks.filter((x) => x.location?.lat != null)) {
      const w0 = t.weather;
      const moved = w0?.lat != null ? haversine({ lat: w0.lat, lng: w0.lng }, t.location) : Infinity;
      if (!force && w0 && Date.now() - w0.at < FRESH_MS && moved < MOVED_KM && !(w0.simulated && online)) continue;
      let w = null;
      if (online || force || !w0) {
        try { w = await fetchWeather(t.location.lat, t.location.lng); online = true; } catch { online = false; }
      }
      if (!w && settings().simulation) w = sampleWeather(t);
      if (!w) continue;
      w.lat = t.location.lat; w.lng = t.location.lng;
      t.weather = w;
      // Tell the office once when a truck on a load runs into bad weather.
      const load = db.loads.find((l) => l.truckId === t.id && ACTIVE.includes(l.status));
      if (load && w.severity !== 'ok' && (!w0 || w0.severity === 'ok' || w0.label !== w.label)) {
        notify((v) => v.role === 'dispatcher' && v.companyId === t.carrierId, { title: `${w.emoji} ${w.label} — Unit ${t.unit}`, body: `${load.ref}: ${w.tempC}°C${w.tips.length ? `, ${w.tips.join(', ')}` : ''}.`, loadId: load.id, tone: w.severity === 'danger' ? 'warn' : undefined });
      }
      publish('trucks', t);
    }
    save();
  } finally { running = false; }
}

// Retry the real service every few minutes even after a failure.
setInterval(() => { if (!online) online = true; }, 5 * 60000).unref?.();
const timer = setInterval(() => { refreshWeather().catch(() => {}); }, 60000);
timer.unref?.();
setTimeout(() => { refreshWeather().catch(() => {}); }, 1500);
