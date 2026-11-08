// Client hooks for AI dispatch and scorecards, built on the shared engines in server/.
import { useMemo } from 'react';
import { useStore } from './store.jsx';
import { rankDrivers } from '../../server/dispatch.js';
import { scorecards, fleetAverages } from '../../server/scorecard.js';

function useCtx() {
  const { data } = useStore();
  return useMemo(() => ({
    drivers: data.users.filter((u) => u.role === 'driver'),
    trucks: data.trucks, loads: data.loads, shifts: data.shifts || [], fuelLogs: data.fuelLogs || [], settings: data.settings,
  }), [data.users, data.trucks, data.loads, data.shifts, data.fuelLogs, data.settings]);
}

/** Scorecards for every driver over the last `days`, plus fleet averages. */
export function useScorecards(days = 30) {
  const ctx = useCtx();
  return useMemo(() => {
    const cards = scorecards(ctx.drivers, ctx, days);
    return { cards, fleet: fleetAverages(cards) };
  }, [ctx, days]);
}

/** Drivers ranked for a load (or a draft load). Returns [] when AI dispatch is off. */
export function useMatches(load, { allowBusy = false } = {}) {
  const ctx = useCtx();
  const cards90 = useMemo(() => scorecards(ctx.drivers, ctx, 90), [ctx]);
  return useMemo(() => {
    if (!load?.pickup || !load?.dropoff) return [];
    return rankDrivers(load, { ...ctx, cards: cards90, allowBusy });
  }, [load, ctx, cards90, allowBusy]);
}

export const aiOn = (settings) => (settings?.dispatchMode || 'suggest') !== 'off';
