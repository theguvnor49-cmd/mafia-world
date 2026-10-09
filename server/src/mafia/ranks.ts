import { RANKS, type RankDefinition } from './config';

export interface RankInfo extends RankDefinition {
  /** 0-based position in RANKS — Rookie = 0, Legend = 9. Used as the "rank"
   * term in formulas like the GTA success chance (brief section 19). */
  index: number;
}

/**
 * Returns the highest rank whose XP threshold the player has reached.
 * RANKS must stay sorted ascending by minXp (it is, by construction).
 */
export function getRankForXp(xp: number): RankInfo {
  let result: RankInfo = { ...RANKS[0], index: 0 };
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].minXp) {
      result = { ...RANKS[i], index: i };
    } else {
      break;
    }
  }
  return result;
}
