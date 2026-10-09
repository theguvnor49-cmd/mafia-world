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
/** Gambling (brief section 23). "Candidates: dice, slots, blackjack,
 * roulette" — all four are built (see GAME_DESIGN.md section 23 for why
 * blackjack is auto-played rather than interactive). None of the specific
 * payouts, odds, or bet caps are given in the brief — every number below
 * is an MVP placeholder, picked to give the house a modest, standard-
 * casino-shaped edge rather than being purely a coin flip like hospital's
 * narrow gamble, while still honoring "never unlimited-money" with hard
 * per-bet caps on every game. Distinct from, and not a replacement for,
 * `HOSPITAL`'s own narrow gamble above, which stays hospital-only. */
export const GAMBLING = {
  DICE: {
    MIN_BET: 100,
    MAX_BET: 25_000,
    // Two six-sided dice (2-12). UNDER = 2-6, SEVEN = exactly 7, OVER =
    // 8-12 — a real casino side-bet shape ("Over/Under Seven"). UNDER/OVER
    // each land 15/36 (~41.7%) of rolls; SEVEN lands 6/36 (~16.7%) but
    // pays more, so every bet type's expected return is intentionally
    // below 1x (the house edge "never unlimited-money" implies).
    UNDER_OVER_PAYOUT_MULTIPLIER: 1.9,
    SEVEN_PAYOUT_MULTIPLIER: 4.5,
  },
  SLOTS: {
    MIN_BET: 100,
    MAX_BET: 25_000,
    // Weighted so the jackpot symbol is rare and the common one is common.
    // Payout multipliers are for three-of-a-kind; two cherries (anywhere)
    // pays a small consolation amount, matching how real slot machines
    // usually give cherries a non-jackpot role.
    SYMBOLS: [
      { symbol: '🍒', weight: 40, threeOfAKindMultiplier: 2 },
      { symbol: '🍋', weight: 28, threeOfAKindMultiplier: 3 },
      { symbol: '🔔', weight: 18, threeOfAKindMultiplier: 6 },
      { symbol: '💎', weight: 10, threeOfAKindMultiplier: 15 },
      { symbol: '7️⃣', weight: 4, threeOfAKindMultiplier: 40 },
    ] as const,
    // Phase 12 balancing pass: was 1.5, which worked out (see
    // GAME_DESIGN.md's economy-audit section) to a real ~32.5% house
    // edge — noticeably steeper than every other game here (roulette
    // ~2.7%, dice ~21-25%, blackjack ~5.8%), despite this file's own
    // comment claiming all four share "a modest, standard-casino-shaped
    // edge." That claim was true for three of the four and silently
    // false for this one until an actual Monte-Carlo run caught it.
    // Raised to 1.75, which (exact math: 3-of-a-kind EV 0.246408 +
    // 0.288 * 1.75 = 0.750408) lands slots at a ~25% edge — tied with
    // dice's own steepest bet (SEVEN) instead of well above everything
    // else. Still the steepest game here, which matches real-world
    // slots conventionally running worse odds than table games — just
    // no longer an outlier by a factor of ~1.5x.
    TWO_CHERRIES_MULTIPLIER: 1.75,
  },
  ROULETTE: {
    MIN_BET: 100,
    MAX_BET: 25_000,
    // Single-zero European wheel (0-36), not the double-zero American
    // one — simpler and gives a lower, cleaner house edge without a
    // second green number to special-case. Real standard payouts: even
    // money for color/parity, 35:1 (36x return) for a straight-up number.
    COLOR_OR_PARITY_PAYOUT_MULTIPLIER: 2,
    STRAIGHT_UP_PAYOUT_MULTIPLIER: 36,
  },
  BLACKJACK: {
    MIN_BET: 100,
    MAX_BET: 25_000,
    // Standard 3:2 natural-blackjack payout (2.5x return). A plain win
    // pays even money (2x return); a push returns the bet (1x, net 0).
    BLACKJACK_PAYOUT_MULTIPLIER: 2.5,
    WIN_PAYOUT_MULTIPLIER: 2,
  },
};

/** Gangs (brief section 24). `MAX_GANGS` (10) and `RANKS` are from the
 * brief directly — note the brief lists ranks high-to-low ("Boss,
 * Underboss, Capo, Soldier, Associate"); `RANKS` here is low-to-high
 * instead, since that's the order promote/demote actually walks. Every
 * cost/reward number is an MVP placeholder — the brief names a treasury,
 * territory, and reputation but gives no figures for any of them. */
export const GANGS = {
  MAX_GANGS: 10,
  RANKS: ['Associate', 'Soldier', 'Capo', 'Underboss', 'Boss'] as const,

  // Cash straight from the founder's own pocket, not the (not-yet-
  // existing) treasury — there's nothing in the treasury before a gang
  // exists to have one.
  CREATION_COST: 100_000,

  // Claiming territory isn't free, and it's deliberately a *treasury*
  // cost (see routes/gangs.ts) so a gang needs to actually accumulate
  // shared funds before expanding, rather than one rich founder
  // single-handedly claiming every open state.
  TERRITORY_CLAIM_COST: 500_000,
  TERRITORY_CLAIM_REPUTATION: 50,
};

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

/** Businesses & factories (brief section 25). The brief names 8 business
 * types and four verbs (buyable/upgradeable/robbable/seizable) but gives
 * no prices, income rates, or formulas for any of them — every number
 * below is an MVP placeholder, scaled so later-listed/pricier types pay
 * proportionally more per hour, same tiering spirit as the vehicle
 * catalog's rarity tiers. See GAME_DESIGN.md section 25 for the full
 * reasoning, including why "factories produce resources" became uniform
 * cash income rather than a separate bullet-resource output, and why
 * "controllable by gangs" wasn't built at all. */
export const BUSINESSES = {
  MAX_LEVEL: 5,
  TYPES: [
    { type: 'Chop Shop', basePrice: 50_000, baseIncomePerHour: 500 },
    { type: 'Gun Shop', basePrice: 75_000, baseIncomePerHour: 750 },
    { type: 'Garage', basePrice: 100_000, baseIncomePerHour: 1_000 },
    { type: 'Protection Racket', basePrice: 150_000, baseIncomePerHour: 1_750 },
    { type: 'Warehouse', basePrice: 200_000, baseIncomePerHour: 2_500 },
    { type: 'Restaurant', basePrice: 300_000, baseIncomePerHour: 4_000 },
    { type: 'Nightclub', basePrice: 500_000, baseIncomePerHour: 7_500 },
    { type: 'Casino', basePrice: 750_000, baseIncomePerHour: 12_000 },
  ] as const,

  // Upgrading from level N to N+1 costs N * that type's own base price, and
  // each level multiplies income by that same level — so income scales
  // exactly as fast as cumulative upgrade spend, no faster.
  UPGRADE_COST_PER_LEVEL_MULTIPLIER: 1,

  // Robbery (a crime, unlike plain buy/upgrade/collect — mirrors GTA's
  // shape: a success chance, cash/XP/heat on success, jail/XP/heat on
  // failure). Chance depends on the TARGET business's own level (its
  // "security") *and*, as of the Phase 12 balancing pass, the ROBBER's
  // own rank — previously it was level-only, flagged in "Open questions"
  // #28 as a static-feeling gap compared to GTA's rank bonus. Resolved
  // by adding ROBBER_RANK_BONUS_PER_LEVEL at the same 0.01/level GTA
  // itself uses (GTA.RANK_BONUS_PER_LEVEL) — deliberately the same
  // number, not a newly-invented one, so a Legend-rank robber gets the
  // same +0.09 edge here they'd get grinding GTA, keeping the two
  // "rank rewards experience" curves in this game consistent with each
  // other rather than inventing a second, unrelated scale.
  ROB: {
    BASE_CHANCE: 0.45,
    LEVEL_PENALTY_PER_LEVEL_ABOVE_ONE: 0.06,
    MIN_CHANCE: 0.1,
    MAX_CHANCE: 0.6,
    COOLDOWN_SECONDS: 10 * 60,
    ROBBER_RANK_BONUS_PER_LEVEL: 0.01,

    SUCCESS_XP_MIN: 15,
    SUCCESS_XP_MAX: 40,
    SUCCESS_HEAT_MIN: 8,
    SUCCESS_HEAT_MAX: 16,

    FAILURE_XP_MIN: 4,
    FAILURE_XP_MAX: 12,
    FAILURE_HEAT_MIN: 8,
    FAILURE_HEAT_MAX: 18,
    FAILURE_JAIL_SECONDS_MIN: 60,
    FAILURE_JAIL_SECONDS_MAX: 120,
  },
};
