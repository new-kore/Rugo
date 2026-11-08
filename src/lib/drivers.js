// Driver helpers shared by Drivers, Calendar and notifications.
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 864e5;

/** Normalise either schedule shape to { 0..6: {start,end}|null }. */
export function weekSchedule(s) {
  const out = {};
  for (let d = 0; d < 7; d++) out[d] = null;
  if (!s) return out;
  if (Array.isArray(s.days)) { s.days.forEach((d) => { out[d] = { start: s.start, end: s.end }; }); return out; }
  for (let d = 0; d < 7; d++) { const v = s[d] ?? s[String(d)]; if (v) out[d] = { start: v.start, end: v.end }; }
  return out;
}
export const daySchedule = (s, dow) => weekSchedule(s)[dow];
export const hm = (x) => { const [h, m] = String(x || '0:0').split(':').map(Number); return (h || 0) + (m || 0) / 60; };
export const shiftHours = (v) => (v ? ((hm(v.end) - hm(v.start) + 24) % 24) || 24 : 0);
export const weeklyHours = (s) => Object.values(weekSchedule(s)).reduce((a, v) => a + shiftHours(v), 0);
const fmt = (x) => { const [h, m] = x.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`; };

/** "Mon–Thu 6a–4p · Fri 6a–2p" */
export function scheduleText(s) {
  const w = weekSchedule(s);
  const groups = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const v = w[d]; if (!v) continue;
    const key = `${v.start}-${v.end}`;
    const last = groups[groups.length - 1];
    const prev = last && last.days[last.days.length - 1];
    if (last && last.key === key && (prev + 1) % 7 === d) last.days.push(d); else groups.push({ key, v, days: [d] });
  }
  if (!groups.length) return 'No set hours';
  return groups.map((g) => `${g.days.length > 2 ? `${DAYS[g.days[0]]}–${DAYS[g.days[g.days.length - 1]]}` : g.days.map((d) => DAYS[d]).join(', ')} ${fmt(g.v.start)}–${fmt(g.v.end)}`).join(' · ');
}

/** Expiry state for licences and documents: 'expired' | 'soon' (≤ 30 days) | 'ok' | 'none'. */
export function expiry(t, now = Date.now()) {
  if (!t) return { level: 'none', days: null, text: 'No expiry on file' };
  const days = Math.ceil((t - now) / DAY_MS);
  if (days < 0) return { level: 'expired', days, text: `Expired ${-days} day${days === -1 ? '' : 's'} ago` };
  if (days <= 30) return { level: 'soon', days, text: days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}` };
  return { level: 'ok', days, text: `Valid until ${new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` };
}

/** Everything about a driver that needs attention soon. */
export function driverAlerts(d) {
  const out = [];
  const lic = expiry(d.licenseExpiry);
  if (lic.level === 'expired' || lic.level === 'soon') out.push({ id: `exp:${d.id}:licence:${d.licenseExpiry}`, kind: 'licence', label: 'Driver’s licence', at: d.licenseExpiry, ...lic });
  for (const doc of d.documents || []) {
    if (doc.kind === 'licence') continue;
    const e = expiry(doc.expires);
    if (e.level === 'expired' || e.level === 'soon') out.push({ id: `exp:${d.id}:${doc.id}:${doc.expires}`, kind: doc.kind, label: doc.label, at: doc.expires, ...e });
  }
  return out;
}
