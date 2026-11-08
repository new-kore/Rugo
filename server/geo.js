// Geographic helpers: distance, bearing, routing (OSRM with offline fallback).
const R = 6371; // km
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

/** Offline fallback: a gently curved path with a road factor so distances stay realistic. */
function syntheticRoute(a, b) {
  const n = 48;
  const pts = [];
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const bend = 0.08; // perpendicular offset as a fraction of the span
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = Math.sin(Math.PI * t) * bend;
    pts.push({ lat: a.lat + dy * t + dx * off * 0.5, lng: a.lng + dx * t - dy * off });
  }
  const straight = pathLength(pts);
  return { points: pts, distanceKm: straight * 1.12, source: 'estimate' };
}

/** Decode a Google encoded polyline. */
export function decodePolyline(str) {
  const pts = [];
  let i = 0; let lat = 0; let lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0; let result = 0; let byte;
      do { byte = str.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

const googleKey = () => globalThis.RUGO_GOOGLE_KEY || globalThis.process?.env?.GOOGLE_MAPS_API_KEY || '';

/** Truck route from the Google Routes API (needs a key with the Routes API enabled). */
async function googleRoute(a, b, key) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    signal: AbortSignal.timeout(6000),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', units: 'METRIC',
    }),
  });
  if (!res.ok) throw new Error(`Routes API ${res.status}`);
  const r = (await res.json()).routes?.[0];
  if (!r) throw new Error('No route');
  return {
    points: thin(decodePolyline(r.polyline.encodedPolyline), 400),
    distanceKm: r.distanceMeters / 1000,
    durationH: parseFloat(r.duration) / 3600,
    source: 'google',
  };
}

/** Driving route between two points: Google (when a key is set), then the public OSRM router, then an estimate. */
export async function route(a, b) {
  if (haversine(a, b) < 0.05) return { points: [a, b], distanceKm: 0, source: 'estimate' };
  const key = googleKey();
  if (key) {
    try { return await googleRoute(a, b, key); } catch { /* fall through */ }
  }
  if (typeof window === 'undefined' && globalThis.process?.env?.RUGO_OFFLINE_ROUTING !== '1') {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Rugo-Freight/1.0' } });
      if (res.ok) {
        const j = await res.json();
        const r = j.routes?.[0];
        if (r) {
          const points = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
          return { points: thin(points, 400), distanceKm: r.distance / 1000, durationH: r.duration / 3600, source: 'road' };
        }
      }
    } catch {
      /* offline or rate limited – fall through */
    }
  }
  return syntheticRoute(a, b);
}

function thin(points, max) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/** Move `km` along `points` starting at `cursorKm`. Returns the new position and heading. */
export function pointAlong(points, km) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1], points[i]);
    if (acc + seg >= km) {
      const t = seg === 0 ? 0 : (km - acc) / seg;
      const p = {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
      };
      return { ...p, heading: bearing(points[i - 1], points[i]), done: false };
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2] || last;
  return { ...last, heading: bearing(prev, last), done: true };
}
