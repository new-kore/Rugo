// Tiny durable JSON store. Writes are debounced and atomic (write temp file, then rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.RUGO_DATA_DIR || path.resolve('data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const empty = () => ({
  companies: [], users: [], sessions: [], trucks: [], trailers: [], loads: [], fuelLogs: [], shifts: [], integrations: [], settings: {},
});

export const isFresh = !fs.existsSync(FILE);
export const db = isFresh ? empty() : { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
export function flush() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

export const id = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
export const find = (col, key) => db[col].find((x) => x.id === key);

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');

/** Store an uploaded image (data URL). Returns its public URL, or null if it isn't a readable image. */
export function saveUpload(dataUrl) {
  const m = /^data:((?:image\/(jpeg|png|webp))|application\/(pdf));base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const ext = m[3] ? 'pdf' : m[2] === 'jpeg' ? 'jpg' : m[2];
  const buf = Buffer.from(m[4], 'base64');
  if (buf.length > 12 * 1024 * 1024) return null;
  const name = `${randomToken(12)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

/** Write a generated file (e.g. demo SVG photos). Returns its public URL. */
export function writeUpload(name, text) {
  fs.writeFileSync(path.join(UPLOAD_DIR, name), text);
  return `/uploads/${name}`;
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const a = crypto.scryptSync(String(pw), salt, 32);
  return crypto.timingSafeEqual(a, Buffer.from(hash, 'hex'));
}
