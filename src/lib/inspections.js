// Client helpers for daily vehicle inspections and shop work orders.
const H = 3600e3;

export const validMs = (data) => (data.meta.inspection?.validHours || 24) * H;

/** Latest pre-trip for a truck that is still valid (24 h), or null. */
export function validPreTrip(data, truckId, now = Date.now()) {
  const ms = validMs(data);
  return (data.inspections || []).filter((x) => x.truckId === truckId && x.type === 'pre' && now - x.at < ms).sort((a, b) => b.at - a.at)[0] || null;
}

/** Why this truck/trailer can't start a trip right now (mirrors the server rule). */
export function tripBlocker(data, truckId, trailerId) {
  const truck = data.trucks.find((t) => t.id === truckId);
  if (truck?.outOfService) return { oos: true, text: `Unit ${truck.unit} is out of service` };
  const trailer = trailerId && data.trailers.find((t) => t.id === trailerId);
  if (trailer?.outOfService) return { oos: true, text: `Trailer ${trailer.unit} is out of service` };
  if (truck && !validPreTrip(data, truck.id)) return { text: 'Do your pre-trip inspection first' };
  return null;
}

/** Repairs on this truck (or its trailer) the driver still has to confirm on the next inspection. */
export const repairsToConfirm = (data, truckId, trailerId) => (data.workOrders || [])
  .filter((w) => w.status === 'repaired' && !w.ackAt && (w.truckId === truckId && (w.unit === 'truck' || w.trailerId === trailerId)));

export const openWorkOrders = (data) => (data.workOrders || []).filter((w) => w.status !== 'repaired');

export const RESULT = {
  ok: { label: 'No defects', tone: 'green', icon: 'checkCircle' },
  minor: { label: 'Minor defects', tone: 'orange', icon: 'warning' },
  major: { label: 'Major defect — out of service', tone: 'red', icon: 'warning' },
};
export const WO_STATUS = {
  open: { label: 'Open', tone: 'red' },
  in_progress: { label: 'In repair', tone: 'orange' },
  repaired: { label: 'Repaired', tone: 'green' },
};
export const typeLabel = (t) => (t === 'post' ? 'Post-trip' : 'Pre-trip');
