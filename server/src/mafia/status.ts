export type PlayerStatus = 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL';

export interface StatusTimers {
  dead_until: string | Date | null;
  jail_until: string | Date | null;
  hospital_until: string | Date | null;
}

/**
 * Derives ALIVE / DEAD / JAIL / HOSPITAL from timestamps rather than a
 * stored flag, so there's exactly one source of truth and no chance of a
 * flag disagreeing with the timer that's supposed to drive it. Server time
 * is authoritative (brief sections 8 and 47) — `now` defaults to the
 * current instant but can be overridden for tests.
 */
export function deriveStatus(timers: StatusTimers, now: Date = new Date()): PlayerStatus {
  const t = now.getTime();
  if (timers.dead_until && new Date(timers.dead_until).getTime() > t) return 'DEAD';
  if (timers.jail_until && new Date(timers.jail_until).getTime() > t) return 'JAIL';
  if (timers.hospital_until && new Date(timers.hospital_until).getTime() > t) return 'HOSPITAL';
  return 'ALIVE';
}
