/**
 * Picks which state a newly-created co-op job belongs to (brief section
 * 27: "a job belongs to a state"). Pure, uniform random selection over
 * whatever state names are passed in — the route handler queries the real
 * `states` table and passes the names here, so this function never
 * touches the database, mirroring every other probabilistic pick in this
 * codebase (resolveGta, pickWitnesses, resolveBust, pickVehicleDrop).
 */
export function pickRandomState(stateNames: string[], roll: number = Math.random()): string {
  if (stateNames.length === 0) {
    throw new Error('pickRandomState: no states to choose from.');
  }
  const index = Math.min(stateNames.length - 1, Math.floor(roll * stateNames.length));
  return stateNames[index];
}
