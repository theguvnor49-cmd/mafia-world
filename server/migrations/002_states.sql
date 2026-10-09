-- 002_states.sql
-- A real states table (Phase 2). Players already had a free-text `state`
-- column (001_users.sql); this adds a reference table and a foreign key so
-- a player's state can only ever be one of these, without changing the
-- column itself (keeps the diff small for everything already built on it).
--
-- Travel between states (cost/time/risk/cooldown, brief section 9) is not
-- built yet — this just establishes the set of valid locations so that
-- phase can slot in later without another schema change.

CREATE TABLE states (
  name           TEXT PRIMARY KEY,
  display_order  INTEGER NOT NULL
);

INSERT INTO states (name, display_order) VALUES
  ('New York', 1),
  ('Chicago', 2),
  ('Los Angeles', 3),
  ('Miami', 4),
  ('Las Vegas', 5),
  ('Boston', 6),
  ('Detroit', 7),
  ('Atlanta', 8);

ALTER TABLE users
  ADD CONSTRAINT users_state_fkey FOREIGN KEY (state) REFERENCES states(name);
