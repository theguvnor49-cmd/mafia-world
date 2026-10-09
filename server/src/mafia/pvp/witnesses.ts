/**
 * Picks up to `max` witnesses at random, without replacement, from a list
 * of candidates (brief section 18: "Select up to 3 random online
 * players"). Pure and injectable `rng` so it's actually testable — real
 * callers never pass `rng` and get `Math.random`.
 *
 * Partial Fisher-Yates: swap a random remaining candidate into the front,
 * one at a time, stopping once `max` have been picked or the pool runs
 * out. Every candidate has an equal chance of being picked; order among
 * the picked ones carries no meaning.
 */
export function pickWitnesses<T>(candidates: readonly T[], max: number, rng: () => number = Math.random): T[] {
  const pool = candidates.slice();
  const picked: T[] = [];

  while (pool.length > 0 && picked.length < max) {
    const index = Math.floor(rng() * pool.length);
    // Defensive clamp: rng() is contracted to return [0, 1), but a bad
    // caller-supplied rng (e.g. one that can return exactly 1) should
    // never cause an out-of-bounds splice.
    const safeIndex = Math.min(index, pool.length - 1);
    picked.push(pool[safeIndex]);
    pool.splice(safeIndex, 1);
  }

  return picked;
}
