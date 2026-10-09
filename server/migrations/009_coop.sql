-- 009_coop.sql
-- Co-op crimes (brief section 27) and the scheduler infrastructure that
-- creates them (brief section 28). This is the first system in the game
-- that is a scheduled, group, state-wide event rather than something one
-- player triggers for themselves — everything here follows the same
-- "never an in-memory timer, always a database timestamp" rule as every
-- other system, extended with the lazy-evaluation-on-first-read pattern
-- already used for heat decay and hunt reveal: both job *creation* and job
-- *resolution* happen whenever anyone reads co-op status after the
-- relevant deadline has passed, not only when an external tick fires.
--
-- `scheduler_state` is a one-row singleton (brief's `coop_next_at`,
-- reframed as a single global timer rather than per-user, since a co-op
-- job is a shared world event, not a personal one) that every job-creation
-- check locks with SELECT ... FOR UPDATE — this is what makes concurrent
-- "is a new job due?" checks from two simultaneous requests race-safe,
-- the same row-locking principle used everywhere else in this codebase,
-- just applied to a singleton instead of a per-player row.
--
-- One job is active at a time, globally — not one per state. The brief's
-- own mockup shows a single "CO-OP HEIST" example, and running 8 parallel
-- state-scoped jobs every cycle would be meaningfully more complex for no
-- brief-stated requirement. `opens_at` and `closes_at` mirror the brief's
-- own field names even though `opens_at` always equals `created_at` in
-- this MVP (a job is immediately joinable, never gated behind a future
-- opening) — see GAME_DESIGN.md for the full reasoning and flagged
-- simplifications.
--
-- `reward_cash` ($250,000) is the brief's own example figure, not a
-- placeholder. `reward_xp` has no brief-given number ("+ Mafia XP" with no
-- amount) — an MVP placeholder, same treatment as GTA's rank-bonus
-- numbers. Both are paid in FULL to every participant (not split as a
-- shared pool) — see GAME_DESIGN.md for why.

CREATE TABLE scheduler_state (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_coop_job_at  TIMESTAMPTZ NOT NULL
);

INSERT INTO scheduler_state (id, next_coop_job_at) VALUES (1, now());

CREATE TABLE coop_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state         TEXT NOT NULL REFERENCES states(name),
  opens_at      TIMESTAMPTZ NOT NULL,
  closes_at     TIMESTAMPTZ NOT NULL,
  reward_cash   BIGINT NOT NULL CHECK (reward_cash >= 0),
  reward_xp     INTEGER NOT NULL CHECK (reward_xp >= 0),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coop_jobs_closes_at ON coop_jobs (closes_at);

CREATE TABLE coop_job_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES coop_jobs(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  -- Flavor only in this MVP (brief: "eventually players should have
  -- roles") — no mechanical effect on success or reward yet. NULL means
  -- "no role picked," and Postgres never treats two NULLs as conflicting
  -- under a UNIQUE constraint, so any number of roleless players can join
  -- the same job alongside at most one of each named role.
  role       TEXT CHECK (role IN ('Driver', 'Gunman', 'Hacker', 'Lookout', 'Muscle', 'Boss')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_out   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (job_id, user_id),
  UNIQUE (job_id, role)
);

CREATE INDEX idx_coop_job_participants_job_id ON coop_job_participants (job_id);
