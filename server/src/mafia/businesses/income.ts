import { BUSINESSES } from '../config';

export type BusinessType = (typeof BUSINESSES.TYPES)[number]['type'];

export interface BusinessTypeDef {
  type: BusinessType;
  basePrice: number;
  baseIncomePerHour: number;
}

export function getBusinessTypeDef(type: string): BusinessTypeDef {
  const def = BUSINESSES.TYPES.find((t) => t.type === type);
  if (!def) throw new Error(`Unknown business type: ${type}`);
  return def;
}

/**
 * Effective hourly income for a business at a given level. Level
 * multiplies the type's base rate directly — level 1 is exactly the
 * catalog rate, level `BUSINESSES.MAX_LEVEL` is that rate times the max
 * level. Not stored per-row; always derived from (type, level), the same
 * "derive, don't duplicate" principle as rank/status/gang leadership.
 */
export function getIncomePerHour(type: string, level: number): number {
  return getBusinessTypeDef(type).baseIncomePerHour * level;
}

/**
 * Cash accrued since `lastCollectedAt`, as of `now` — a pure function of
 * elapsed real time, the same accrue-by-timestamp shape as heat decay
 * (mafia/heat.ts) just running forward instead of backward. This is what
 * the brief's "factories produce resources on a timestamp basis (never in-
 * memory timers)" becomes here: nothing ticks this up in the background,
 * it's computed fresh whenever read (status, directory listing, rob) or
 * collected (routes/businesses.ts's `collect`/`rob`, which persist a new
 * `last_collected_at` so the clock restarts from that moment). Floors to a
 * whole dollar; clamped at 0 so any clock skew can never produce a
 * negative accrual.
 */
export function computeAccruedCash(
  type: string,
  level: number,
  lastCollectedAt: Date,
  now: Date = new Date()
): number {
  const elapsedHours = Math.max(0, (now.getTime() - lastCollectedAt.getTime()) / 3_600_000);
  return Math.floor(getIncomePerHour(type, level) * elapsedHours);
}

/** Cost to upgrade a business of this type from `currentLevel` to
 * `currentLevel + 1` — scales linearly with the level being left, so
 * cumulative upgrade spend always grows exactly as fast as the income
 * multiplier it bought. */
export function getUpgradeCost(type: string, currentLevel: number): number {
  return getBusinessTypeDef(type).basePrice * currentLevel * BUSINESSES.UPGRADE_COST_PER_LEVEL_MULTIPLIER;
}
