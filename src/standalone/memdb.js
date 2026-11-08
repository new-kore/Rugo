// Browser replacement for server/db.js: same API, data kept in memory and (best effort) in localStorage.
const KEY = 'rugo.demo.db.v3';
const empty = () => ({ companies: [], users: [], sessions: [], trucks: [], trailers: [], loads: [], fuelLogs: [], shifts: [], integrations: [], settings: {} });

let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }

export const isFresh = !saved;
export const db = saved ? { ...empty(), ...saved } : empty();
export const UPLOAD_DIR = '';

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
}
export function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: keep running in memory */ }
}
export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
export const id = (prefix) => `${prefix}_${hex(6)}`;
export const randomToken = (bytes = 24) => hex(bytes);
export const find = (col, key) => db[col].find((x) => x.id === key);

// Photos stay as data URLs inside the browser.
export function saveUpload(dataUrl) {
  return /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(dataUrl || '') ? dataUrl : null;
}
export function writeUpload(_name, text) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

// Demo only: everyone signs in with “demo”.
export const hashPassword = (pw) => `plain:${pw}`;
export const checkPassword = (pw, stored) => stored === `plain:${pw}`;
