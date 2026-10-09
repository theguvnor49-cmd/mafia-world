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

/** Jail bust-outs (brief section 25). Every value here is taken directly
 * from the brief — unlike GTA's rank-bonus numbers, there's no MVP
 * placeholder needed for this system. */
export const BUST = {
  BASE_SUCCESS_CHANCE: 0.25,
  SUCCESS_BONUS_PER_SUCCESSFUL_BUST: 0.02,
  FAILURE_PENALTY_PER_FAILED_BUST: 0.01,
  MIN_SUCCESS_CHANCE: 0.15,
  MAX_SUCCESS_CHANCE: 0.8,

  BASE_REWARD: 25_000,
  REWARD_BONUS_PER_SUCCESSFUL_BUST: 4_000,
};

/** GTA vehicle system (brief sections 21-22). The brief says only that "a
 * successful GTA CAN randomly produce a vehicle" — it never gives a rate,
 * so DROP_CHANCE_ON_SUCCESS is an MVP placeholder. Picked deliberately low:
 * combined with GTA's existing 10-minute cooldown and melting consuming
 * the car (one-time, not repeatable per car), this is the main lever for
 * the brief's own instruction to "balance carefully so bullets cannot
 * become infinite too easily" — bullet income from melting is bounded by
 * the same cooldown that already bounds cash/XP income, not a faster
 * parallel loop. */
export const CARS = {
  DROP_CHANCE_ON_SUCCESS: 0.2,
};

/** Co-op crimes (brief sections 27-28). MAX_PLAYERS (6) and DURATION_HOURS
 * (4, "co-op crimes happen every 4 hours") are from the brief directly.
 * REWARD_CASH ($250,000) is the brief's own worked example, not a
 * placeholder — it's the one number in this whole system the brief
 * actually gives. REWARD_XP has no brief-given figure ("+ Mafia XP" with
 * no amount) — an MVP placeholder, picked to feel "substantially higher"
 * than a solo crime's XP the same way the cash reward is. ROLES is the
 * brief's own example list (section 27: "Eventually players should have
 * roles. For example: ...") — flavor-only in this MVP, no mechanical
 * effect on success or reward. */
export const COOP = {
  MAX_PLAYERS: 6,
  DURATION_HOURS: 4,
  REWARD_CASH: 250_000,
  REWARD_XP: 300,
  ROLES: ['Driver', 'Gunman', 'Hacker', 'Lookout', 'Muscle', 'Boss'] as const,
};

/** Hospital recovery (brief section 22). Every value here is an MVP
 * placeholder — the brief names the four recovery activities ("rest,
 * medical treatment, limited gambling, small jobs") but gives no numbers
 * for any of them, and doesn't say what sends a player to the hospital in
 * the first place. See GAME_DESIGN.md section 22 and "Open questions" for
 * the full reasoning behind the design this landed on: hospital is the
 * free path's second stage after death (replacing the old "24h then
 * instantly ALIVE" fallthrough), not something combat causes directly —
 * nothing about Phase 5's shipped kill transaction changes. Premium-point
 * revive is untouched and still skips straight to fully ALIVE. */
export const HOSPITAL = {
  // Shorter than death's 24h (brief-given) since this is the lighter of
  // the two sequential stages.
  RECOVERY_HOURS: 2,

  // "Medical treatment" — pay cash (not premium points, unlike revive) to
  // shave time off the stay. Repeatable as many times as affordable.
  TREATMENT_COST: 10_000,
  TREATMENT_REDUCTION_SECONDS: 30 * 60,

  // "Limited gambling" — a plain 50/50 double-or-nothing coin flip, capped
  // per bet (brief section 23's own gambling-safety principle — "never
  // unlimited-money" — applied here even though that section is about the
  // later, full Gambling phase).
  GAMBLE_MIN_BET: 500,
  GAMBLE_MAX_BET: 5_000,

  // "Small jobs" — a scaled-down crime usable only while hospitalized
  // (normal GTA requires ALIVE). Deliberately simple: fixed reward,
  // always succeeds, no heat/jail risk — you're already laid up, this
  // isn't a heist. Short cooldown so there's something to do across a
  // multi-hour stay without being spammable.
  SMALL_JOB_COOLDOWN_SECONDS: 5 * 60,
  SMALL_JOB_CASH_REWARD: 2_000,
  SMALL_JOB_XP_REWARD: 10,
};
