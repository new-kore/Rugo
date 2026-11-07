// Google Maps Platform: key lookup, script loading and failure handling.
// Key sources, first wins: this browser's Settings → build-time VITE_GOOGLE_MAPS_KEY → server setting.
const LS = 'rugo.googleMapsKey';
let serverKey = '';

export function setServerKey(k) { serverKey = k || ''; publishKey(); }
export function getKey() {
  let local = '';
  try { local = localStorage.getItem(LS) || ''; } catch { /* ignore */ }
  return (local || import.meta.env.VITE_GOOGLE_MAPS_KEY || serverKey || '').trim();
}
export function saveKey(k) {
  try { if (k) localStorage.setItem(LS, k.trim()); else localStorage.removeItem(LS); } catch { /* ignore */ }
}

// Shared route code (server/geo.js) reads this to call the Google Routes API from the browser.
function publishKey() { globalThis.RUGO_GOOGLE_KEY = state.failed ? '' : getKey(); }

const state = { promise: null, failed: false, listeners: new Set() };
export const googleFailed = () => state.failed;
export function onGoogleFailure(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }

/** Loads the Maps JavaScript API once. Resolves to `google.maps`, rejects if there is no key or it is refused. */
export function loadGoogle() {
  const key = getKey();
  if (!key || state.failed) return Promise.reject(new Error('Google Maps is not configured'));
  if (state.promise) return state.promise;
  publishKey();
  state.promise = new Promise((resolve, reject) => {
    window.gm_authFailure = () => {
      state.failed = true;
      publishKey();
      state.listeners.forEach((fn) => fn());
      reject(new Error('Google Maps refused this API key'));
    };
    window.__rugoGoogleReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__rugoGoogleReady`;
    s.async = true;
    s.onerror = () => { state.failed = true; publishKey(); state.listeners.forEach((fn) => fn()); reject(new Error('Google Maps could not be reached')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.google?.maps) { state.failed = true; publishKey(); reject(new Error('Google Maps timed out')); } }, 12000);
  });
  return state.promise;
}

publishKey();
