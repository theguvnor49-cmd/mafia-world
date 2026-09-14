-- 001_users.sql
-- Core player account table. See GAME_DESIGN.md section 7 (Player Account System).
--
-- Design notes:
--   * Mafia rank is NOT stored — it's derived from mafia_xp (brief section 10).
--     The XP thresholds per rank aren't decided yet; that lands in Phase 2.
--   * Player status (ALIVE/DEAD/JAIL/HOSPITAL) is NOT stored as an enum column —
--     it's derived server-side from dead_until/jail_until/hospital_until so there's
--     a single source of truth and no risk of the flag and the timer disagreeing.
--   * equipped_gun / equipped_armour are free-text for now; they'll become foreign
--     keys into catalog tables in Phase 4 once guns/armour exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Player location. Free text until Phase 2 introduces a proper states table.
  state           TEXT NOT NULL DEFAULT 'New York',

  cash            BIGINT NOT NULL DEFAULT 0 CHECK (cash >= 0),
  premium_points  INTEGER NOT NULL DEFAULT 0 CHECK (premium_points >= 0),
  mafia_xp        BIGINT NOT NULL DEFAULT 0 CHECK (mafia_xp >= 0),
  bullets         INTEGER NOT NULL DEFAULT 0 CHECK (bullets >= 0),

  equipped_gun     TEXT,
  equipped_armour  TEXT,

  heat            INTEGER NOT NULL DEFAULT 0 CHECK (heat >= 0 AND heat <= 100),

  -- Status timers. NULL = not currently dead/jailed/hospitalised.
  dead_until      TIMESTAMPTZ,
  jail_until      TIMESTAMPTZ,
  hospital_until  TIMESTAMPTZ
);

CREATE INDEX idx_users_state ON users (state);
CREATE INDEX idx_users_username_lower ON users (lower(username));
CREATE INDEX idx_users_email_lower ON users (lower(email));
