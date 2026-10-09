import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withTransaction } from '../db';
import { requireAuth } from '../auth';
import { deriveStatus } from '../mafia/status';
import { pickRandomState } from '../mafia/coop/job';
import { COOP } from '../mafia/config';

/** Same pattern as every other route file's error class — explicit fields,
 * manual assignment, so this file stays checkable with
 * `node --experimental-strip-types`. */
class CoopError extends Error {
  statusCode: number;
  code: string;
  extra: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

interface CoopJobRow {
  id: string;
  state: string;
  opens_at: string;
  closes_at: string;
  reward_cash: string; // bigint comes back as string from pg
  reward_xp: number;
}

interface ParticipantPayoutRow {
  id: string;
  user_id: string;
  role: string | null;
}

export interface ClosedJobPayout {
  resolvedJobIds: string[];
  /** Set only when `callerId` was a participant in one of the jobs this
   * specific call resolved — see the function doc comment below. */
  callerPayout: { cash: number; xp: number; role: string | null } | null;
}

/**
 * Creates a new co-op job if the global scheduler timer says one is due
 * (brief sections 27-28: "every 4 hours" — reframed here as a single
 * global cadence, not one job per state; see 009_coop.sql's header for the
 * full reasoning). Returns whether it actually created one, so callers
 * (the tick endpoint, specifically) can report that without needing to
 * re-query the table themselves.
 *
 * Locks the `scheduler_state` singleton row for the duration of the check
 * so two concurrent requests racing to be "the one that notices it's due"
 * can't both create a job — the second one, after acquiring the lock,
 * re-reads `next_coop_job_at` and finds it already advanced into the
 * future, so it does nothing. Same row-locking principle as everywhere
 * else in this codebase, just applied to a one-row global table instead of
 * a per-player one.
 *
 * MVP choice worth flagging (also in GAME_DESIGN.md): the next due time is
 * anchored to *this creation's own timestamp* (`now() + DURATION_HOURS`),
 * not to the old scheduled time plus the interval. If the game goes
 * completely unread for, say, two days, the next person to check status
 * triggers exactly one catch-up job — not a burst of many back-to-back
 * jobs for every missed window. The tradeoff: the "every 4 hours" cadence
 * is really "every 4 hours of active play," the same way heat decay and
 * hunt reveal already only ever advance when someone looks.
 */
export async function ensureCoopJobExists(client: PoolClient): Promise<boolean> {
  const schedResult = await client.query<{ next_coop_job_at: string }>(
    'SELECT next_coop_job_at FROM scheduler_state WHERE id = 1 FOR UPDATE'
  );
  const nextCoopJobAt = new Date(schedResult.rows[0].next_coop_job_at);
  const now = new Date();
  if (nextCoopJobAt.getTime() > now.getTime()) {
    return false; // not due yet
  }

  const statesResult = await client.query<{ name: string }>('SELECT name FROM states ORDER BY display_order');
  const stateName = pickRandomState(statesResult.rows.map((r) => r.name));
  const closesAt = new Date(now.getTime() + COOP.DURATION_HOURS * 3600 * 1000);

  await client.query(
    `INSERT INTO coop_jobs (state, opens_at, closes_at, reward_cash, reward_xp)
     VALUES ($1, $2, $3, $4, $5)`,
    [stateName, now, closesAt, COOP.REWARD_CASH, COOP.REWARD_XP]
  );

  await client.query('UPDATE scheduler_state SET next_coop_job_at = $1 WHERE id = 1', [closesAt]);
  return true;
}

/**
 * Pays out every job that's past its `closes_at` and hasn't been resolved
 * yet (lazy resolution — see `ensureCoopJobExists` above and
 * 009_coop.sql). Full reward to every participant, not a shared/split
 * pool — the brief's own worked example gives the full $250,000 + XP
 * figure with no mention of splitting it, so that's taken at face value
 * (see GAME_DESIGN.md).
 *
 * Uses a conditional `UPDATE ... WHERE resolved_at IS NULL RETURNING id`
 * as the atomic claim on each candidate job: if two concurrent calls both
 * see the same closed-but-unresolved job, only one of their claiming
 * UPDATEs actually affects a row — the loser's affects 0 rows and it moves
 * on without paying anybody twice. This is the same "exactly one winner"
 * trick as hunts.ts's unique-index-driven ALREADY_HUNTING handling, just
 * expressed as a conditional UPDATE instead of a unique-constraint catch.
 *
 * `callerId` is optional (the tick endpoint has no caller). When given,
 * and that player was a participant in a job resolved during *this*
 * call, their payout is returned so the status route can surface a
 * one-time "you got paid!" notification. If nobody happens to check
 * status in the narrow window between a job closing and someone else's
 * read resolving it first, that specific notification is missed — but the
 * payout itself already landed in cash/XP regardless, every time, so this
 * is a cosmetic gap, not a correctness one. Flagged in GAME_DESIGN.md.
 */
export async function resolveClosedJobs(client: PoolClient, callerId?: string): Promise<ClosedJobPayout> {
  const candidates = await client.query<{ id: string }>(
    'SELECT id FROM coop_jobs WHERE closes_at <= now() AND resolved_at IS NULL'
  );

  const resolvedJobIds: string[] = [];
  let callerPayout: ClosedJobPayout['callerPayout'] = null;

  for (const { id: jobId } of candidates.rows) {
    const claim = await client.query<{ id: string; reward_cash: string; reward_xp: number }>(
      `UPDATE coop_jobs SET resolved_at = now()
       WHERE id = $1 AND resolved_at IS NULL
       RETURNING id, reward_cash, reward_xp`,
      [jobId]
    );
    const job = claim.rows[0];
    if (!job) continue; // someone else's concurrent call already claimed this one

    const rewardCash = Number(job.reward_cash);
    const rewardXp = job.reward_xp;

    // Lock the participant rows before paying them — not strictly load-
    // bearing (the conditional UPDATE above already guarantees only one
    // transaction ever reaches this point for a given job), but costs
    // nothing extra and keeps this file consistent with the rest of the
    // codebase's habit of locking any row it's about to mutate.
    const participants = await client.query<ParticipantPayoutRow>(
      'SELECT id, user_id, role FROM coop_job_participants WHERE job_id = $1 AND paid_out = false FOR UPDATE',
      [jobId]
    );

    for (const participant of participants.rows) {
      await client.query(
        `UPDATE users SET cash = cash + $1, cash_earned = cash_earned + $1, mafia_xp = mafia_xp + $2 WHERE id = $3`,
        [rewardCash, rewardXp, participant.user_id]
      );
      await client.query('UPDATE coop_job_participants SET paid_out = true WHERE id = $1', [participant.id]);

      if (callerId && participant.user_id === callerId) {
        callerPayout = { cash: rewardCash, xp: rewardXp, role: participant.role };
      }
    }

    resolvedJobIds.push(jobId);
  }

  return { resolvedJobIds, callerPayout };
}

async function loadOpenJobView(client: PoolClient, viewerId: string) {
  const jobResult = await client.query<CoopJobRow>(
    `SELECT id, state, opens_at, closes_at, reward_cash, reward_xp
     FROM coop_jobs WHERE resolved_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  );
  const job = jobResult.rows[0];
  if (!job) return null;

  const participantsResult = await client.query<{ username: string; role: string | null; user_id: string }>(
    `SELECT u.username, p.role, p.user_id FROM coop_job_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.job_id = $1
     ORDER BY p.joined_at ASC`,
    [job.id]
  );

  const now = new Date();
  const closesAt = new Date(job.closes_at);
  const yours = participantsResult.rows.find((p) => p.user_id === viewerId);

  return {
    id: job.id,
    state: job.state,
    opensAt: job.opens_at,
    closesAt: job.closes_at,
    secondsRemaining: Math.max(0, Math.ceil((closesAt.getTime() - now.getTime()) / 1000)),
    rewardCash: Number(job.reward_cash),
    rewardXp: job.reward_xp,
    playerCount: participantsResult.rows.length,
    maxPlayers: COOP.MAX_PLAYERS,
    full: participantsResult.rows.length >= COOP.MAX_PLAYERS,
    participants: participantsResult.rows.map((p) => ({ username: p.username, role: p.role })),
    joined: Boolean(yours),
    yourRole: yours?.role ?? null,
  };
}

const joinSchema = z.object({
  role: z.enum(COOP.ROLES).optional(),
});

/**
 * Co-op crime status + joining (brief sections 27-28). Job *creation* and
 * *resolution* are handled by `ensureCoopJobExists`/`resolveClosedJobs`
 * above, called from here (and from `routes/tick.ts`) rather than any
 * running scheduler — this route file is the player-facing read/join
 * surface on top of that shared lazy-evaluation machinery.
 *
 * MVP choices worth flagging (also in GAME_DESIGN.md):
 *   - One global job at a time, not one per state (009_coop.sql's header
 *     has the full reasoning) — a pleasant side effect is that a player
 *     can structurally never be eligible for two jobs at once, so there's
 *     no need for a separate "already in a different active job" check
 *     the way hunts.ts needs its unique-partial-index.
 *   - Flat reward per participant, no success/failure roll — joining and
 *     waiting out the timer always pays out, unlike every other
 *     probabilistic system in this game. The brief's own section 27
 *     doesn't describe a failure case for co-op jobs the way it does for
 *     solo crimes, busts, and GTA.
 *   - No minimum player count and no leave-job endpoint — the brief
 *     doesn't call for either. A lone participant still gets paid in full
 *     when the timer runs out.
 *   - Roles are flavor-only — picking one (or none) has no mechanical
 *     effect on the payout; only the `UNIQUE(job_id, role)` constraint
 *     ("at most one Driver per job") is actually enforced.
 */
export async function coopRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/coop/status', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    const outcome = await withTransaction(async (client) => {
      // Settle the past first, then set up the future, then read — every
      // entry point into this system (status, join, tick) runs this same
      // self-healing pair before doing its own specific work, so none of
      // them can ever act against stale world state.
      const { callerPayout } = await resolveClosedJobs(client, userId);
      await ensureCoopJobExists(client);
      const job = await loadOpenJobView(client, userId);
      return { job, justCompleted: callerPayout };
    });

    return reply.send({ ok: true, data: outcome });
  });

  app.post('/api/v1/mafia/coop/join', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = joinSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid role.' },
      });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        await resolveClosedJobs(client);
        await ensureCoopJobExists(client);

        const jobResult = await client.query<{ id: string; state: string; closes_at: string }>(
          `SELECT id, state, closes_at FROM coop_jobs WHERE resolved_at IS NULL
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
        );
        const job = jobResult.rows[0];
        if (!job) {
          throw new CoopError(404, 'NOT_FOUND', 'No co-op job is available right now.');
        }
        // Defensive — resolveClosedJobs above should already guarantee
        // this, but a job's own deadline is what actually defines "open,"
        // not merely the absence of a resolved_at timestamp.
        if (new Date(job.closes_at).getTime() <= Date.now()) {
          throw new CoopError(409, 'JOB_CLOSED', 'That job has already closed.');
        }

        const userResult = await client.query<{
          state: string;
          dead_until: string | null;
          jail_until: string | null;
          hospital_until: string | null;
        }>('SELECT state, dead_until, jail_until, hospital_until FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userResult.rows[0];
        if (!user) throw new CoopError(404, 'NOT_FOUND', 'User not found.');

        const status = deriveStatus(user);
        if (status !== 'ALIVE') {
          throw new CoopError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${status.toLowerCase()}.`);
        }

        // Real check, close to a no-op until travel ships — same caveat as
        // pvp.ts's and jail.ts's own state-matching checks.
        if (user.state !== job.state) {
          throw new CoopError(409, 'WRONG_STATE', `This job is in ${job.state} — you need to be there to join.`);
        }

        const countResult = await client.query<{ count: string }>(
          'SELECT COUNT(*) FROM coop_job_participants WHERE job_id = $1',
          [job.id]
        );
        if (Number(countResult.rows[0].count) >= COOP.MAX_PLAYERS) {
          throw new CoopError(409, 'JOB_FULL', 'This job already has a full crew.');
        }

        try {
          await client.query('INSERT INTO coop_job_participants (job_id, user_id, role) VALUES ($1, $2, $3)', [
            job.id,
            userId,
            parsed.data.role ?? null,
          ]);
        } catch (err) {
          if (err instanceof Error && 'constraint' in err) {
            const constraint = (err as { constraint?: string }).constraint;
            if (constraint === 'coop_job_participants_job_id_role_key') {
              throw new CoopError(409, 'ROLE_TAKEN', `Someone already took the ${parsed.data.role} role on this job.`);
            }
            if (constraint === 'coop_job_participants_job_id_user_id_key') {
              throw new CoopError(409, 'ALREADY_JOINED', "You're already in on this job.");
            }
          }
          throw err;
        }

        return { jobId: job.id, state: job.state, role: parsed.data.role ?? null, closesAt: job.closes_at };
      });

      return reply.code(201).send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof CoopError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
