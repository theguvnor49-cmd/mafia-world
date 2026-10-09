-- 010_hospital.sql
-- Hospital recovery (brief section 22). `hospital_until` has existed since
-- 001_users.sql, flagged there as "set by future combat/events" — this is
-- that future system, finally arriving.
--
-- Design choice worth flagging up front (full reasoning in GAME_DESIGN.md
-- section 22 and "Open questions"): hospital is the FREE path's second
-- stage after death, not a separate thing combat can cause directly. A
-- kill still always either succeeds or is rejected outright for lacking
-- bullets, exactly as Phase 5 shipped and verified it — nothing about the
-- kill transaction's own success/failure logic changes here. What changes
-- is what happens *after* a death's 24-hour `dead_until` timer runs out
-- with nobody paying to revive early: instead of falling straight through
-- to ALIVE (as it did through Phase 8), the player now lands in a shorter
-- HOSPITAL recovery window first. Premium-point revive is untouched and
-- still skips straight to fully ALIVE — paying skips *both* remaining
-- stages, not just the first.
--
-- `hospital_job_next_at` is this system's equivalent of `gta_next_at` — a
-- per-player cooldown for the one recovery activity ("small jobs") that
-- needs one. The other two activities (medical treatment, limited
-- gambling) don't need their own cooldown column: treatment is naturally
-- self-limiting (nothing to do once you're fully recovered), and gambling
-- has no cooldown at all in this MVP (capped bet size is what keeps it
-- bounded, not a timer — see "Open questions").
--
-- `hospital_activities` logs every treat/gamble/small-job action, same
-- spirit as `busts` and `crimes` logging their own systems' attempts —
-- the running `cash_earned`/`cash_lost`/`mafia_xp` counters on `users`
-- are what persists in aggregate; this table is the per-event detail.

ALTER TABLE users
  ADD COLUMN hospital_job_next_at TIMESTAMPTZ;

CREATE TABLE hospital_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  activity    TEXT NOT NULL CHECK (activity IN ('treatment', 'gamble', 'small_job')),
  -- Net change to cash from this one action — negative for a cost or a
  -- lost bet, positive for a job's pay or a won bet.
  cash_delta  BIGINT NOT NULL,
  xp_delta    INTEGER NOT NULL DEFAULT 0,
  -- Only meaningful for 'gamble' (NULL for the other two activities).
  won         BOOLEAN,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hospital_activities_user_id ON hospital_activities (user_id, created_at);
