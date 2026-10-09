import { CARS } from '../config';

export interface VehicleDropCandidate {
  name: string;
  /** 1-100, brief's own field — also doubles as the inverse selection
   * weight here: harder to steal means rarer to actually land as a drop. */
  theftDifficulty: number;
}

/**
 * Resolves one "did a vehicle drop, and if so which one" roll for a
 * successful GTA attempt (brief sections 21-22). Pure function — the only
 * randomness is the two rolls (each defaults to a fresh Math.random() but
 * is injectable for deterministic tests), and it never touches the
 * database or the vehicle catalog's storage; the route handler
 * (routes/crimes.ts) passes in the already-queried catalog rows.
 *
 * `dropRoll` decides whether anything drops at all (brief: "a successful
 * GTA CAN randomly produce a vehicle" — not guaranteed). `pickRoll` then
 * picks which vehicle via weighted sampling: weight = 101 - theftDifficulty,
 * so a Common car (low difficulty, high weight) is far more likely to come
 * up than a Legendary one (high difficulty, low weight) — mirroring how
 * `pickWitnesses` (Phase 5) is the uniform-sampling version of the same
 * idea, just weighted here instead of uniform.
 */
export function pickVehicleDrop<T extends VehicleDropCandidate>(
  vehicles: T[],
  dropRoll: number = Math.random(),
  pickRoll: number = Math.random()
): T | null {
  if (dropRoll >= CARS.DROP_CHANCE_ON_SUCCESS) return null;
  if (vehicles.length === 0) return null;

  const weights = vehicles.map((v) => Math.max(1, 101 - v.theftDifficulty));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let threshold = pickRoll * totalWeight;
  for (let i = 0; i < vehicles.length; i++) {
    threshold -= weights[i];
    if (threshold <= 0) return vehicles[i];
  }
  // Floating-point safety net — should only trigger if pickRoll is ~1.
  return vehicles[vehicles.length - 1];
}
