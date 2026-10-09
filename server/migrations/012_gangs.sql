-- 012_gangs.sql
-- Gangs (brief section 24 / GAME_DESIGN.md section 24): "Max 10 gangs
-- initially. Name, leader, members, roles (Boss, Underboss, Capo,
-- Soldier, Associate), treasury, territory, businesses, reputation,
-- statistics. A destroyed gang can be disbanded, drop businesses,
-- release territory to neutral, and its members become free agents —
-- gang stats persist in history."
--
-- "Leader" is NOT a stored column on `gangs` — same "derive, don't
-- store" reasoning as rank/status everywhere else in this codebase: the
-- leader is just whichever `gang_members` row has rank = 'Boss', kept
-- unique per gang by the partial index below, so there's exactly one
-- source of truth instead of a second column that could drift out of
-- sync with the real membership table.
--
-- "Businesses" are left out entirely — the brief says businesses are
-- "controllable by gangs," but businesses themselves don't exist yet
-- (Phase 11). Nothing to hook up until that table exists.
--
-- Disbanding is a soft-delete (`disbanded_at`), not a row delete, so a
-- disbanded gang's name/treasury/reputation history stays queryable —
-- "gang stats persist in history," read literally. Its *members* do
-- become free agents immediately, though: disbanding deletes their
-- `gang_members` rows for real (handled in the route, not here), since
-- the brief is explicit that membership itself ends right away.
--
-- `gang_registry` is a pure one-row lock point (brief: "max 10 gangs"),
-- mirroring `scheduler_state`'s singleton-row shape from Phase 8 — it
-- carries no real data, it just gives concurrent "create a gang" requests
-- a single row to serialize against before counting how many active
-- gangs already exist, the same problem `scheduler_state` solves for
-- co-op job creation (locking rows that already exist doesn't stop two
-- transactions from both inserting a *new* row past the limit; a shared
-- lock point does).

CREATE TABLE gang_registry (
  id  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)
);

INSERT INTO gang_registry (id) VALUES (1);

CREATE TABLE gangs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  treasury         BIGINT NOT NULL DEFAULT 0 CHECK (treasury >= 0),
  -- NULL = no territory claimed (the "neutral" state a destroyed gang's
  -- territory also returns to). One state, not several — the brief
  -- doesn't describe multi-state territory.
  territory_state  TEXT REFERENCES states(name),
  reputation       INTEGER NOT NULL DEFAULT 0 CHECK (reputation >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = active. Non-null = disbanded (soft-delete; see above).
  disbanded_at     TIMESTAMPTZ
);

-- At most one ACTIVE gang can hold a given state at a time. Disbanded
-- gangs are excluded so a state they once held can be claimed again —
-- this is exactly how territory "releases to neutral" on disband: no
-- explicit release step is even needed, the old row simply stops
-- counting once disbanded_at is set.
CREATE UNIQUE INDEX idx_gangs_territory_active
  ON gangs (territory_state)
  WHERE disbanded_at IS NULL AND territory_state IS NOT NULL;

CREATE TABLE gang_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id    UUID NOT NULL REFERENCES gangs(id),
  -- UNIQUE on its own, not per-gang: a player belongs to at most ONE
  -- gang at a time, globally, enforced here rather than trusted to app
  -- logic (brief section 28's "never trust... prevent forged/fake").
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id),
  rank       TEXT NOT NULL CHECK (rank IN ('Boss', 'Underboss', 'Capo', 'Soldier', 'Associate')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gang_members_gang_id ON gang_members (gang_id);

-- At most one Boss per gang — same NULL-safe partial-unique-index
-- technique as `coop_job_participants`' one-role-per-job constraint from
-- Phase 8, just guaranteeing uniqueness of one specific rank value
-- instead of every role.
CREATE UNIQUE INDEX idx_gang_members_one_boss_per_gang
  ON gang_members (gang_id)
  WHERE rank = 'Boss';
