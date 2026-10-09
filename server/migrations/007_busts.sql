-- 007_busts.sql
-- Jail bust-outs (brief sections 24-26). No new `users` columns needed here —
-- jail_until (001), and jail_seconds_served/times_arrested/successful_busts/
-- failed_busts (003) already exist, because Phase 2 added the full brief
-- section 36 statistics list up front even though nothing populated the
-- jail-related ones until now. This migration only adds the bust *log*
-- ("All busts should be logged" — brief section 25).
--
-- Mirrors `crimes`/`kills`: one row per attempt, success or failure, enough
-- to reconstruct who busted whom, when, and for how much.

CREATE TABLE busts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buster_id     UUID NOT NULL REFERENCES users(id),
  prisoner_id   UUID NOT NULL REFERENCES users(id),
  success       BOOLEAN NOT NULL,
  cash_reward   BIGINT NOT NULL DEFAULT 0,
  state         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_busts_buster_id_created_at ON busts (buster_id, created_at DESC);
CREATE INDEX idx_busts_prisoner_id_created_at ON busts (prisoner_id, created_at DESC);
