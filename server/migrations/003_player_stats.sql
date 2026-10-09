-- 003_player_stats.sql
-- Statistics counters (Phase 2 / brief section 36), added from the start as
-- denormalized columns on `users` rather than a full event-log table — the
-- simplest thing that works MVP; revisit as a proper event log once the
-- activity feed (brief section 44) needs per-event detail, not just counts.
-- Everything here starts at 0 and is only ever incremented by the game
-- systems that earn it (crimes in Phase 3, combat in Phase 5, etc.) —
-- nothing populates these yet.

ALTER TABLE users
  ADD COLUMN crimes_committed     INTEGER NOT NULL DEFAULT 0 CHECK (crimes_committed >= 0),
  ADD COLUMN crimes_succeeded     INTEGER NOT NULL DEFAULT 0 CHECK (crimes_succeeded >= 0),
  ADD COLUMN crimes_failed        INTEGER NOT NULL DEFAULT 0 CHECK (crimes_failed >= 0),
  ADD COLUMN kills                INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  ADD COLUMN deaths               INTEGER NOT NULL DEFAULT 0 CHECK (deaths >= 0),
  ADD COLUMN bullets_fired        INTEGER NOT NULL DEFAULT 0 CHECK (bullets_fired >= 0),
  ADD COLUMN bullets_spent        INTEGER NOT NULL DEFAULT 0 CHECK (bullets_spent >= 0),
  ADD COLUMN cash_earned          BIGINT NOT NULL DEFAULT 0 CHECK (cash_earned >= 0),
  ADD COLUMN cash_lost            BIGINT NOT NULL DEFAULT 0 CHECK (cash_lost >= 0),
  ADD COLUMN cars_stolen          INTEGER NOT NULL DEFAULT 0 CHECK (cars_stolen >= 0),
  ADD COLUMN cars_melted          INTEGER NOT NULL DEFAULT 0 CHECK (cars_melted >= 0),
  ADD COLUMN jail_seconds_served  BIGINT NOT NULL DEFAULT 0 CHECK (jail_seconds_served >= 0),
  ADD COLUMN times_arrested       INTEGER NOT NULL DEFAULT 0 CHECK (times_arrested >= 0),
  ADD COLUMN successful_busts     INTEGER NOT NULL DEFAULT 0 CHECK (successful_busts >= 0),
  ADD COLUMN failed_busts         INTEGER NOT NULL DEFAULT 0 CHECK (failed_busts >= 0);
