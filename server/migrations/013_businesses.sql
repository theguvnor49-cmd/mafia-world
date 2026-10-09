-- 013_businesses.sql
-- Businesses & factories (brief section 25 / GAME_DESIGN.md section 25):
-- "Nightclub, restaurant, casino, garage, warehouse, gun shop, chop shop,
-- protection racket. Buyable/upgradeable/robbable/seizable, dropped on
-- death, controllable by gangs. Factories produce resources on a
-- timestamp basis (never in-memory timers) — e.g. a bullet factory
-- producing N/hour."
--
-- "Factories produce resources on a timestamp basis" becomes, here, every
-- business accruing CASH continuously from `last_collected_at` — the same
-- accrue/decay-by-elapsed-time shape as heat decay (mafia/heat.ts) and
-- hospital recovery, just running forward instead of backward, and
-- collected on demand rather than ticked by any process. "e.g. a bullet
-- factory" is the brief's own example, not a separate requirement — a
-- literal second, bullet-shaped resource output (on top of the two
-- bullet-acquisition paths this game already has: buying guns, melting
-- cars) was deliberately not built; see GAME_DESIGN.md section 25.
--
-- "Controllable by gangs" is also deliberately NOT built — businesses
-- below are individually player-owned only, same reasoning as gangs'
-- "only the Boss has power" simplification (012_gangs.sql already
-- flagged this exact gap on its own "businesses" forward-reference):
-- the brief gives no shape for what gang control of a business would
-- actually mean (treasury-funded purchase? shared income? seizure by
-- the gang itself?), so nothing was invented. Flagged in "Open
-- questions."
--
-- "Dropped on death" + "seizable" read together, the same way Phase 10's
-- gang territory handles "destroyed... release territory to neutral":
-- there's no mechanic to take a business from its *active* owner by
-- force (no PvP-vs-business-owner combat exists), only to claim one that
-- a death has already made ownerless. `owner_id` going NULL (on the
-- victim's row, inside the existing kill transaction in routes/pvp.ts)
-- IS the "drop"; `seize` is claiming a NULL-owner row, free, inheriting
-- whatever level it was already upgraded to.

CREATE TABLE businesses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = unowned/seizable (either never claimed after a drop, or — in
  -- practice — always claimed almost immediately after one, since seizing
  -- is free).
  owner_id           UUID REFERENCES users(id),
  type               TEXT NOT NULL CHECK (type IN (
                        'Nightclub', 'Restaurant', 'Casino', 'Garage',
                        'Warehouse', 'Gun Shop', 'Chop Shop', 'Protection Racket'
                      )),
  -- Where it physically is — set once, to the buyer's (or seizer's)
  -- current state, same "claims wherever you're currently standing"
  -- pattern as gang territory. Matters for rob/seize (same-state required,
  -- mirroring the kill transaction's attacker/target state check) even
  -- though travel barely exists yet — see "Open questions" #13.
  state              TEXT NOT NULL REFERENCES states(name),
  level              INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 5),
  -- The factory clock. Effective hourly income is a pure function of
  -- (type, level) looked up from BUSINESSES.TYPES in config.ts, not
  -- stored per-row — only the last-collected timestamp needs to persist.
  last_collected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_businesses_owner ON businesses (owner_id);
CREATE INDEX idx_businesses_state ON businesses (state);

-- At most one business of a given TYPE per owner, while actually owned —
-- the same NULL-safe partial-unique-index technique as gang_members' one-
-- Boss-per-gang and coop_job_participants' one-role-per-job. Unlike the
-- 10-gang cap, this needs no dedicated mutex row: it's a uniqueness rule
-- on a specific (owner, type) pair, not a global COUNT(*) threshold a
-- phantom INSERT could slip past, so a plain unique index already closes
-- the race on its own — two concurrent buy/seize calls for the same
-- (owner, type) simply can't both commit.
CREATE UNIQUE INDEX idx_businesses_one_per_type_per_owner
  ON businesses (owner_id, type)
  WHERE owner_id IS NOT NULL;

-- Per-robber cooldown on business robbery — its own column, deliberately
-- not sharing GTA's gta_next_at, since the two are unrelated activities
-- (brief gives no reason they should gate each other).
ALTER TABLE users ADD COLUMN business_rob_next_at TIMESTAMPTZ;

-- One log table for every business event, same "one table, an event_type
-- enum column" shape as hospital_activities (rather than gambling_bets'
-- one-table-per-concern-but-still-one-table split) — picked here because
-- every event type shares the exact same columns (who, which business,
-- cash, XP), unlike gambling's very game-specific `detail` payloads.
CREATE TABLE business_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  business_id  UUID NOT NULL REFERENCES businesses(id),
  event_type   TEXT NOT NULL CHECK (event_type IN (
                 'buy', 'upgrade', 'collect', 'rob_success', 'rob_fail', 'seize'
               )),
  cash_delta   BIGINT NOT NULL DEFAULT 0,
  xp_delta     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_events_user_created ON business_events (user_id, created_at);
