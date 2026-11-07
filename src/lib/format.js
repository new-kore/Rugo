export const money = (n, cur = 'CAD', digits = 0) =>
  n == null || Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: cur, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const money2 = (n, cur) => money(n, cur, 2);
export const km = (n, d = 0) => (n == null ? '—' : `${Number(n).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })} km`);
export const num = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const kg = (n) => (n ? `${Number(n).toLocaleString('en-CA')} kg` : '—');

export function duration(hours) {
  if (hours == null || Number.isNaN(hours)) return '—';
  const m = Math.round(hours * 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')} min`;
}
export const time = (t) => (t ? new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '—');
export const date = (t) => (t ? new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—');
export const dateTime = (t) => (t ? `${date(t)}, ${time(t)}` : '—');
export function dayLabel(t) {
  const d = new Date(t); const now = new Date();
  const diff = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (diff === 0) return `Today, ${time(t)}`;
  if (diff === 1) return `Yesterday, ${time(t)}`;
  if (diff === -1) return `Tomorrow, ${time(t)}`;
  return dateTime(t);
}
export function ago(t) {
  if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return date(t);
}
export const initials = (name = '') => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const placeShort = (p) => (p ? `${p.city}${p.region ? `, ${p.region}` : ''}` : '—');
