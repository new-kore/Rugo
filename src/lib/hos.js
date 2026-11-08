// Hours-of-service clocks that come from a connected ELD (Samsara, Motive, Geotab, Isaac).

export const HOS_STATUS = {
  driving: { label: 'Driving', tone: 'green' },
  on_duty: { label: 'On duty', tone: 'blue' },
  off_duty: { label: 'Off duty', tone: 'gray' },
  sleeper: { label: 'Sleeper berth', tone: 'indigo' },
  yard_move: { label: 'Yard move', tone: 'blue' },
  personal_conveyance: { label: 'Personal use', tone: 'gray' },
  unknown: { label: 'Unknown', tone: 'gray' },
};

export const hosStatus = (h) => HOS_STATUS[h?.status] || HOS_STATUS.unknown;

/** "6 h 30 min", "45 min", "0 min". */
export function hm(min) {
  if (min === null || min === undefined) return '—';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** Clocks older than 15 minutes are flagged stale (the ELD stopped reporting or sync is failing). */
export const hosStale = (h, now = Date.now()) => !!h && now - (h.at || 0) > 15 * 60000;

/** Tone for a remaining-time clock. */
export const clockTone = (min, warn = 60) => (min === null || min === undefined ? 'gray' : min <= 0 ? 'red' : min <= warn ? 'orange' : 'green');

/** Can this driver legally drive `hours` more without a reset? */
export function canDrive(h, hours) {
  if (!h) return null;
  const need = hours * 60;
  const left = Math.min(...[h.driveLeftMin, h.shiftLeftMin, h.cycleLeftMin].filter((x) => x !== null && x !== undefined));
  return Number.isFinite(left) ? left >= need : null;
}
export const hosLeft = (h) => {
  if (!h) return null;
  const xs = [h.driveLeftMin, h.shiftLeftMin, h.cycleLeftMin].filter((x) => x !== null && x !== undefined);
  return xs.length ? Math.min(...xs) : null;
};
