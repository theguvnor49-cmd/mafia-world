-- 005_weapons.sql
-- Guns and armour catalogs (brief sections 10-11). `users.equipped_gun` /
-- `users.equipped_armour` have existed as free text since 001_users.sql
-- specifically so they could become real foreign keys once these catalog
-- tables existed (see that migration's header comment) — this is that step.
--
-- Primary keys are the item's display name (TEXT), the same pattern
-- 002_states.sql used for `states` — human-readable, and it means the
-- brief's own tables below map onto rows with no separate id/slug to keep
-- in sync.
--
-- bullet_multiplier / bonus_bullets / armour multiplier are from the brief
-- directly (sections 10-11). `price` is NOT specified anywhere in the
-- brief — these are MVP placeholders, roughly scaled so the better an
-- item's combat value, the more it costs. Flagged in GAME_DESIGN.md "Open
-- questions"; trivially changed with an UPDATE, no code changes needed.

CREATE TABLE guns (
  name              TEXT PRIMARY KEY,
  bullet_multiplier NUMERIC(4,2) NOT NULL CHECK (bullet_multiplier > 0),
  price             BIGINT NOT NULL CHECK (price >= 0),
  description       TEXT,
  display_order     INTEGER NOT NULL
);

INSERT INTO guns (name, bullet_multiplier, price, description, display_order) VALUES
  ('Pocket Pistol',   1.10, 2_000,   'Cheap, concealable, and about as weak as it gets.', 1),
  ('9mm',             1.00, 6_000,   'The baseline sidearm everyone starts saving for.', 2),
  ('SMG',             0.88, 18_000,  'Sprays more lead per attempt than it aims it.', 3),
  ('Assault Rifle',   0.78, 45_000,  'Serious hardware for a serious earner.', 4),
  ('Sniper Rifle',    0.70, 100_000, 'The least merciful option in the catalog.', 5);

CREATE TABLE armour (
  name           TEXT PRIMARY KEY,
  bonus_bullets  INTEGER NOT NULL CHECK (bonus_bullets >= 0),
  multiplier     NUMERIC(4,2) NOT NULL CHECK (multiplier > 0),
  price          BIGINT NOT NULL CHECK (price >= 0),
  description    TEXT,
  display_order  INTEGER NOT NULL
);

INSERT INTO armour (name, bonus_bullets, multiplier, price, description, display_order) VALUES
  ('Light Vest',    40,  1.10, 4_000,  'Better than a t-shirt. Barely.', 1),
  ('Kevlar Kit',     90, 1.20, 15_000, 'Standard-issue peace of mind.', 2),
  ('Heavy Plates',  160, 1.35, 45_000, 'Overkill, which is the point.', 3);

ALTER TABLE users
  ADD CONSTRAINT users_equipped_gun_fkey FOREIGN KEY (equipped_gun) REFERENCES guns(name),
  ADD CONSTRAINT users_equipped_armour_fkey FOREIGN KEY (equipped_armour) REFERENCES armour(name);
