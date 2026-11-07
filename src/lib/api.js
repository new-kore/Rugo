// Thin API client. Talks to the Node server, or to the in-browser backend in the standalone build.
import * as backend from '@backend';

export const standalone = backend.standalone;
export const resetDemo = backend.resetDemo;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } },
};

let token = store.get('rugo.token') || '';
export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  store.set('rugo.token', token);
}

export async function api(path, { method = 'GET', body } = {}) {
  let ok; let status; let data;
  if (backend.request) {
    ({ ok, status, data } = await backend.request(method, `/api${path}`, body, token));
  } else {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    ok = res.ok; status = res.status;
    data = await res.json().catch(() => ({}));
  }
  if (!ok) {
    const err = new Error(data.error || 'Network problem — please try again.');
    err.status = status;
    throw err;
  }
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body: body || {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });

/** Live update channel: Server-Sent Events, or the in-browser equivalent. Returns a close function. */
export function openStream(onMessage, onOpen, onError) {
  if (backend.stream) return backend.stream(token, onMessage, onOpen);
  const es = new EventSource(`/api/stream?token=${token}`);
  es.onopen = onOpen;
  es.onerror = onError;
  es.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  return () => es.close();
}
