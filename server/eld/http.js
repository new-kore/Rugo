// Shared HTTP plumbing for ELD providers: timeouts, readable errors, base-URL overrides and URL safety.
const env = () => globalThis.process?.env || {};
const inBrowser = typeof window !== 'undefined';

export class EldError extends Error {
  constructor(message, code = 'error') { super(message); this.code = code; }
}

/** Base URL for a provider. RUGO_ELD_<PROVIDER>_URL overrides it (used for testing against a mock). */
export function baseUrl(provider, fallback) {
  return (env()[`RUGO_ELD_${provider.toUpperCase()}_URL`] || fallback).replace(/\/+$/, '');
}

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i;

/** Only allow https URLs to public hosts (no internal network), unless RUGO_ELD_ALLOW_LOCAL=1. */
export function assertSafeUrl(raw, { hostSuffix } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw new EldError('That URL isn’t valid.', 'config'); }
  if (env().RUGO_ELD_ALLOW_LOCAL === '1') return u;
  if (u.protocol !== 'https:') throw new EldError('The URL must start with https://', 'config');
  if (PRIVATE.test(u.hostname)) throw new EldError('That URL points to a private network.', 'config');
  if (hostSuffix && !u.hostname.toLowerCase().endsWith(hostSuffix)) throw new EldError(`The server must be a ${hostSuffix} address.`, 'config');
  return u;
}

export async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 20000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new EldError('The ELD provider took too long to answer.', 'timeout');
    throw new EldError(inBrowser
      ? 'This browser can’t reach the ELD provider directly. Connect from the Rugo server (npm start) instead.'
      : `Couldn’t reach the ELD provider (${e.cause?.code || e.message}).`, 'network');
  } finally { clearTimeout(timer); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.status === 401 || res.status === 403) throw new EldError('The provider rejected the API key. Check it and its permissions.', 'auth');
  if (res.status === 429) throw new EldError('The provider is rate-limiting requests. Rugo will retry shortly.', 'rate');
  if (!res.ok) throw new EldError(`The provider answered with an error (${res.status})${data?.message ? `: ${data.message}` : ''}.`, 'http');
  if (data === null) throw new EldError('The provider sent a response Rugo couldn’t read.', 'parse');
  return data;
}

export const msToMin = (ms) => (Number.isFinite(Number(ms)) ? Math.round(Number(ms) / 60000) : null);
export const secToMin = (s) => (Number.isFinite(Number(s)) ? Math.round(Number(s) / 60) : null);
export const num = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
