-- 006_pvp.sql
-- Hunt/search, kill resolution, death, and the witness system (brief
-- sections 14-18). The first phase with real cross-player stakes: a
-- successful kill puts a *specific other real player* into DEAD status
-- for 24 real hours.
--
-- hunts: "The search records: hunter, target, state where target was
-- found, started time, completion time, found status" (brief section
-- 14), literally. `target_state` is NULL until someone actually checks
-- status after `completes_at` has passed -- there's no scheduler to snap
-- it exactly at the 4-hour mark (section 30: never a running process), so
-- the first read after completion captures the target's state AT THAT
-- MOMENT and freezes it permanently. One unconsumed hunt per hunter at a
-- time (enforced in the route layer, not here) -- simplest reading of the
-- brief's singular "the search", and easy to relax later.
--
-- kills: one row per resolved kill attempt (the combat event log the
-- brief's section 54 transaction sketch calls for).
--
-- witness_statements: the exact fields the brief lists in section 18
-- (victim, killer, time, witness, whether sold, buyer, sale price), plus
-- `state` to match its own example UI ("Location: New York") without a
-- join, and `kill_id` for traceability. `asking_price` is this project's
-- addition -- see GAME_DESIGN.md section 18 for why a witness doesn't
-- unilaterally charge a named buyer.

CREATE TABLE hunts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_id     UUID NOT NULL REFERENCES users(id),
  target_id     UUID NOT NULL REFERENCES users(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completes_at  TIMESTAMPTZ NOT NULL,
  target_state  TEXT REFERENCES states(name),
  consumed_at   TIMESTAMPTZ,
  CHECK (hunter_id <> target_id)
);

-- UNIQUE (not just indexed) so "one active hunt per hunter" is a hard
-- database guarantee, not just an app-level check-then-insert with a race
-- window -- two concurrent "start a search" requests from the same hunter
-- can't both succeed; the loser gets a clean unique-violation the route
-- layer turns into a friendly 409.
CREATE UNIQUE INDEX idx_hunts_one_active_per_hunter ON hunts (hunter_id) WHERE consumed_at IS NULL;

CREATE TABLE kills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id   UUID NOT NULL REFERENCES users(id),
  target_id     UUID NOT NULL REFERENCES users(id),
  state         TEXT NOT NULL REFERENCES states(name),
  bullets_used  INTEGER NOT NULL CHECK (bullets_used >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kills_target_id ON kills (target_id, created_at DESC);
CREATE INDEX idx_kills_attacker_id ON kills (attacker_id, created_at DESC);

CREATE TABLE witness_statements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kill_id       UUID NOT NULL REFERENCES kills(id),
  victim_id     UUID NOT NULL REFERENCES users(id),
  killer_id     UUID NOT NULL REFERENCES users(id),
  witness_id    UUID NOT NULL REFERENCES users(id),
  state         TEXT NOT NULL REFERENCES states(name),
  occurred_at   TIMESTAMPTZ NOT NULL,
  asking_price  BIGINT CHECK (asking_price >= 0),
  sold          BOOLEAN NOT NULL DEFAULT false,
  buyer_id      UUID REFERENCES users(id),
  sale_price    BIGINT CHECK (sale_price >= 0),
  sold_at       TIMESTAMPTZ
);

CREATE INDEX idx_witness_statements_witness_id ON witness_statements (witness_id, occurred_at DESC);
