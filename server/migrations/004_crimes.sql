-- 004_crimes.sql
-- Grand Theft Auto (brief section 19) needs two things on `users`: a
-- cooldown timestamp, and a reference point for heat to decay from
-- continuously (brief sections 18/20/30 — heat decay must not depend on a
-- running process). It also needs a log table ("crime logs" is explicit
-- Phase 3 scope).
--
-- gta_next_at is GTA-specific rather than a generic per-crime-type cooldown
-- table — there's only one crime type so far. Revisit (a `crime_cooldowns`
-- table keyed by crime_type) once a second crime type needs its own timer.

ALTER TABLE users
  ADD COLUMN gta_next_at TIMESTAMPTZ,
  ADD COLUMN heat_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE crimes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  crime_type    TEXT NOT NULL,
  success       BOOLEAN NOT NULL,
  cash_reward   BIGINT NOT NULL DEFAULT 0,
  xp_reward     INTEGER NOT NULL DEFAULT 0,
  heat_change   INTEGER NOT NULL DEFAULT 0,
  jail_seconds  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crimes_user_id_created_at ON crimes (user_id, created_at DESC);
