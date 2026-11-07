export function haversine(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const s = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
export const navUrl = (p) => {
  const ios = /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  return ios ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
};
