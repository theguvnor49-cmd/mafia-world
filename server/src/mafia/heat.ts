import { HEAT } from './config';

/**
 * Heat decays continuously over real time rather than via a running
 * process (brief sections 18/20/30 — never build core mechanics around
 * setInterval/a scheduler that might not be running). Pass the stored heat
 * and the timestamp it was last written, and this returns what the heat
 * actually is right now. It does NOT write anything — the caller persists
 * the result (with a fresh timestamp) whenever it's already writing to the
 * row anyway, e.g. during crime resolution (routes/crimes.ts).
 */
export function computeEffectiveHeat(storedHeat: number, heatUpdatedAt: Date, now: Date = new Date()): number {
  const elapsedSeconds = Math.max(0, (now.getTime() - heatUpdatedAt.getTime()) / 1000);
  const decayed = storedHeat - elapsedSeconds * HEAT.DECAY_PER_SECOND;
  return clampHeat(decayed);
}

export function clampHeat(value: number): number {
  return Math.min(HEAT.MAX, Math.max(HEAT.MIN, Math.round(value)));
}
