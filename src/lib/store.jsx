// App-wide data store: loads everything the user may see once, then stays live over Server-Sent Events.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, post } from './api.js';

const Ctx = createContext(null);
const COLS = ['companies', 'users', 'trucks', 'loads', 'fuelLogs', 'shifts'];

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [authed, setAuthed] = useState(!!getToken());
  const [toasts, setToasts] = useState([]);
  const [online, setOnline] = useState(true);
  const esRef = useRef(null);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x.slice(-2), { id, ...t }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.ms || 5000);
  }, []);
  const dismiss = (id) => setToasts((x) => x.filter((y) => y.id !== id));

  const load = useCallback(async () => {
    try {
      setData(await api('/bootstrap'));
    } catch (e) {
      if (e.status === 401) { setToken(''); setAuthed(false); setData(null); }
      else throw e;
    }
  }, []);

  useEffect(() => {
    if (!authed) return undefined;
    load();
    const es = new EventSource(`/api/stream?token=${getToken()}`);
    esRef.current = es;
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'toast') return toast(msg);
      setData((d) => {
        if (!d || !COLS.includes(msg.col)) return d;
        const list = d[msg.col];
        if (msg.type === 'remove') return { ...d, [msg.col]: list.filter((x) => x.id !== msg.id) };
        const i = list.findIndex((x) => x.id === msg.item.id);
        const next = i === -1 ? [...list, msg.item] : list.map((x, k) => (k === i ? msg.item : x));
        const me = msg.col === 'users' && msg.item.id === d.me.id ? { ...d.me, ...msg.item } : d.me;
        return { ...d, me, [msg.col]: next };
      });
    };
    return () => es.close();
  }, [authed, load, toast]);

  const signIn = useCallback(async (promise) => {
    const r = await promise;
    setToken(r.token);
    setAuthed(true);
  }, []);
  const signOut = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    esRef.current?.close();
    setToken('');
    setAuthed(false);
    setData(null);
    window.location.hash = '/';
  }, []);

  /** Optimistically merge a server response into the store (SSE will confirm). */
  const upsert = useCallback((col, item) => {
    setData((d) => {
      if (!d) return d;
      const list = d[col];
      const i = list.findIndex((x) => x.id === item.id);
      return { ...d, [col]: i === -1 ? [...list, item] : list.map((x, k) => (k === i ? { ...x, ...item } : x)) };
    });
  }, []);

  const value = useMemo(() => {
    const byId = (col) => Object.fromEntries((data?.[col] || []).map((x) => [x.id, x]));
    return { data, authed, signIn, signOut, toast, toasts, dismiss, upsert, reload: load, online, byId, setData };
  }, [data, authed, signIn, signOut, toast, toasts, upsert, load, online]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

export function useIndex() {
  const { data } = useStore();
  return useMemo(() => {
    const idx = {};
    for (const c of COLS) idx[c] = Object.fromEntries((data?.[c] || []).map((x) => [x.id, x]));
    return idx;
  }, [data]);
}

/** Re-render every `ms` so relative times and ETAs tick. */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const ACTIVE = ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'];
export const isActive = (l) => ACTIVE.includes(l.status);
