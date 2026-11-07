// Runs Rugo's real server routes inside the browser, with a tiny Express-like router.
import { routes } from '../../server/routes.js';
import { seed } from '../../server/seed.js';
import { isFresh, resetDemo } from './memdb.js'; // server/db.js resolves to this file in the standalone build

export const standalone = true;
export { resetDemo };

const table = [];
const add = (method) => (path, ...handlers) => {
  const keys = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  table.push({ method, re, keys, handlers });
};
const app = { get: add('GET'), post: add('POST'), patch: add('PATCH'), delete: add('DELETE'), use() {} };
routes(app);

const ready = (async () => { if (isFresh) await seed(); })();

function run(method, url, body, token, res) {
  const u = new URL(url, 'http://rugo.local');
  const r = table.find((x) => x.method === method && x.re.test(u.pathname));
  if (!r) return res.status(404).json({ error: 'Not found.' });
  const m = r.re.exec(u.pathname);
  const closers = [];
  const req = {
    method, body: body ? JSON.parse(JSON.stringify(body)) : {},
    params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
    query: Object.fromEntries(u.searchParams), headers: { authorization: token ? `Bearer ${token}` : '' },
    on: (ev, fn) => ev === 'close' && closers.push(fn),
  };
  let i = 0;
  const next = async (err) => {
    if (err) throw err;
    const h = r.handlers[i++];
    if (h) await h(req, res, next);
  };
  Promise.resolve(next()).catch((e) => { console.error(e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });
  return () => closers.forEach((fn) => fn());
}

export async function request(method, url, body, token) {
  await ready;
  await new Promise((r) => setTimeout(r, 60)); // feel like a network round trip
  return new Promise((resolve) => {
    let code = 200;
    const res = {
      status(c) { code = c; return res; },
      json(d) { resolve({ ok: code < 400, status: code, data: JSON.parse(JSON.stringify(d ?? {})) }); },
    };
    run(method, url, body, token, res);
  });
}

/** Live updates: the same SSE frames the Node server writes, parsed in memory. */
export function stream(token, onMessage, onOpen) {
  let close = () => {};
  let dead = false;
  ready.then(() => {
    if (dead) return;
    const res = {
      status() { return res; }, json() {}, writeHead() { onOpen?.(); },
      write(chunk) {
        for (const line of String(chunk).split('\n')) {
          if (line.startsWith('data: ')) setTimeout(() => onMessage(JSON.parse(line.slice(6))), 0);
        }
      },
    };
    close = run('GET', `/api/stream?token=${token}`, null, token, res);
  });
  return () => { dead = true; close(); };
}
