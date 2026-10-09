import { GANGS } from '../config';

export type GangRank = (typeof GANGS.RANKS)[number];

/**
 * One step up `GANGS.RANKS` (Associate -> Soldier -> Capo -> Underboss ->
 * Boss), or `null` if already at the top. This is honest ladder math
 * only — it happily returns 'Boss' for an Underboss, same as it would any
 * other step. It's deliberately the *route* layer's job
 * (`routes/gangs.ts`'s promote handler), not this pure function's, to
 * refuse ever actually promoting a member into Boss: a gang has exactly
 * one Boss (the founder; see `012_gangs.sql`'s partial unique index) and
 * leadership transfer isn't built (see "Open questions"), so that refusal
 * is a business rule about who may call this, not a property of the
 * ladder itself.
 */
export function getNextRank(rank: GangRank): GangRank | null {
  const index = GANGS.RANKS.indexOf(rank);
  if (index === -1 || index >= GANGS.RANKS.length - 1) return null;
  return GANGS.RANKS[index + 1];
}

/** One step down `GANGS.RANKS`, or `null` if already at the bottom
 * (Associate). */
export function getPreviousRank(rank: GangRank): GangRank | null {
  const index = GANGS.RANKS.indexOf(rank);
  if (index <= 0) return null;
  return GANGS.RANKS[index - 1];
}
