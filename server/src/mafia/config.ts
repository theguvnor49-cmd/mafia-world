/**
 * Game-balancing constants live here, not scattered through route handlers
 * (brief section 46). Every value below is either taken directly from the
 * original brief, or is an MVP placeholder — each placeholder says so in a
 * comment and is also listed in "Open questions" in GAME_DESIGN.md. Nothing
 * here is sacred; it's meant to be tuned after real playtesting.
 */

export interface RankDefinition {
  name: string;
  /** Mafia XP needed to reach this rank. MVP placeholder — not specified in
   *  the brief (which only gave each rank's combat value, below). */
  minXp: number;
  /** Approximate bullets required to kill a player at this rank, before
   *  weapon/armour modifiers. From the brief directly (section 10). Used by
   *  the bullet calculator once Phase 4 builds it. */
  baseBulletsToKill: number;
}

export const RANKS: RankDefinition[] = [
  { name: 'Rookie', minXp: 0, baseBulletsToKill: 120 },
  { name: 'Associate', minXp: 1_000, baseBulletsToKill: 160 },
  { name: 'Soldier', minXp: 3_000, baseBulletsToKill: 210 },
  { name: 'Enforcer', minXp: 7_000, baseBulletsToKill: 270 },
  { name: 'Capo', minXp: 15_000, baseBulletsToKill: 340 },
  { name: 'Consigliere', minXp: 30_000, baseBulletsToKill: 420 },
  { name: 'Underboss', minXp: 60_000, baseBulletsToKill: 520 },
  { name: 'Boss', minXp: 120_000, baseBulletsToKill: 650 },
  { name: 'Don', minXp: 250_000, baseBulletsToKill: 820 },
  { name: 'Legend', minXp: 500_000, baseBulletsToKill: 1_050 },
];

/** Heat (brief section 18/20): 0-100, decays over real time rather than
 * being decremented by a running process (see mafia/heat.ts). Decay rate is
 * an MVP placeholder. */
export const HEAT = {
  MIN: 0,
  MAX: 100,
  DECAY_PER_SECOND: 1 / 180, // ~1 point every 3 minutes — placeholder
};

/** Grand Theft Auto (brief section 19). Reward ranges, success formula and
 * heat/jail values are from the brief directly; the rank-bonus multipliers
 * are MVP placeholders (the brief says "+ rank bonus" without a formula). */
export const GTA = {
  COOLDOWN_SECONDS: 10 * 60,
  BASE_SUCCESS_CHANCE: 0.78,
  HEAT_PENALTY_PER_POINT: 0.004,
  RANK_BONUS_PER_LEVEL: 0.01,
  MIN_SUCCESS_CHANCE: 0.2,
  MAX_SUCCESS_CHANCE: 0.9,

  SUCCESS_CASH_MIN: 18_000,
  SUCCESS_CASH_MAX: 75_000,
  SUCCESS_CASH_RANK_BONUS_PER_LEVEL: 2_000, // placeholder

  SUCCESS_XP_MIN: 20,
  SUCCESS_XP_MAX: 60,
  SUCCESS_XP_RANK_BONUS_PER_LEVEL: 2, // placeholder

  SUCCESS_HEAT_MIN: 6,
  SUCCESS_HEAT_MAX: 14,

  FAILURE_XP_MIN: 6,
  FAILURE_XP_MAX: 18,

  FAILURE_HEAT_MIN: 10,
  FAILURE_HEAT_MAX: 22,

  FAILURE_JAIL_SECONDS_MIN: 60,
  FAILURE_JAIL_SECONDS_MAX: 120,
};

/** Bullet calculator (brief section 12) — MIN_BULLETS is "max(25, ...)"
 * directly from the brief, not a placeholder. Gun/armour catalog values
 * (multiplier, bonus, price) live in the `guns`/`armour` tables, not here —
 * see 005_weapons.sql — so they can be tuned with an UPDATE, no deploy
 * needed, same reasoning as the `states` catalog. */
export const BULLET_CALC = {
  MIN_BULLETS: 25,
};

/** PvP: hunt/search, kill, death, revive, witnesses (brief sections
 * 14-18). SEARCH_HOURS, DEATH_HOURS, REVIVE_PREMIUM_POINTS and
 * MAX_WITNESSES are from the brief directly. ONLINE_WINDOW_SECONDS is an
 * MVP placeholder — the brief says witnesses are drawn from "random online
 * players" but never defines "online" numerically; here it means
 * `last_seen` within this many seconds, kept fresh by `requireAuth`
 * bumping it on every authenticated request (see auth.ts). */
export const PVP = {
  SEARCH_HOURS: 4,
  DEATH_HOURS: 24,
  REVIVE_PREMIUM_POINTS: 50,
  MAX_WITNESSES: 3,
  ONLINE_WINDOW_SECONDS: 5 * 60,
};
