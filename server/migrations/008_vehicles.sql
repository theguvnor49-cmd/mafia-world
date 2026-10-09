-- 008_vehicles.sql
-- GTA vehicle system (brief sections 21-22): ~15 stealable vehicles, a
-- successful GTA can randomly produce one, and owned vehicles can be sold
-- or melted into bullets. Same catalog-vs-code split as guns/armour
-- (005_weapons.sql) — the 15 vehicles are reference data that should be
-- tunable with an UPDATE, not a deploy; the weighted-selection *logic* that
-- picks among them lives in code (mafia/vehicles/drop.ts).
--
-- `name` as primary key matches `states`/`guns`/`armour` — human-readable,
-- no separate id/slug to keep in sync.
--
-- `value` is flavor/display worth; `resale_value` is a 60% markdown of it
-- (an MVP placeholder — the brief lists both fields but gives no ratio;
-- selling a stolen car to a fence for less than it's "worth" is the more
-- realistic reading, and it's trivially changed with an UPDATE).
-- `theft_difficulty` (1-100, brief's own field) doubles as the inverse
-- selection weight when a drop occurs — harder to steal means rarer to
-- actually get. `bullet_melt_value` is each vehicle's own melt-into-bullets
-- value (brief section 22); both it and `resale_value` scale up with
-- rarity by hand-picked design, not a formula, same as gun/armour pricing.
--
-- Ownership is per-instance, not a count: "a successful GTA can randomly
-- produce A vehicle" (singular, repeatable) and cars are later sold or
-- melted individually, so `user_vehicles` is one row per owned car, not a
-- quantity column on `vehicles` — the same shape as `kills`/`crimes`/
-- `busts` being one-row-per-event, except a vehicle row persists until
-- consumed (sold/melted) instead of being an append-only log.
--
-- `crimes.vehicle_dropped` is nullable and added to the *existing* table
-- rather than a new log, because a vehicle drop is an attribute of a GTA
-- crime event that already gets logged, not a separate kind of event.

CREATE TABLE vehicles (
  name               TEXT PRIMARY KEY,
  rarity             TEXT NOT NULL CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary')),
  value              BIGINT NOT NULL CHECK (value >= 0),
  theft_difficulty   INTEGER NOT NULL CHECK (theft_difficulty BETWEEN 1 AND 100),
  bullet_melt_value  INTEGER NOT NULL CHECK (bullet_melt_value >= 0),
  resale_value       BIGINT NOT NULL CHECK (resale_value >= 0),
  description        TEXT,
  display_order      INTEGER NOT NULL
);

INSERT INTO vehicles (name, rarity, value, theft_difficulty, bullet_melt_value, resale_value, description, display_order) VALUES
  ('Hatchback',                 'Common',    6_000,   8,  12,  3_600,   'Nobody looks twice at a stolen hatchback.', 1),
  ('Sedan',                     'Common',    8_000,   10, 15,  4_800,   'Reliable, forgettable, easy to lift.', 2),
  ('Pickup Truck',              'Common',    10_000,  12, 18,  6_000,   'Useful. Unremarkable. Unlocked, usually.', 3),
  ('SUV',                       'Uncommon',  22_000,  22, 35,  13_200,  'A soccer-mom special with a surprisingly good alarm.', 4),
  ('Sports Coupe',              'Uncommon',  25_000,  25, 40,  15_000,  'Fast enough to be worth the risk.', 5),
  ('Muscle Car',                'Uncommon',  30_000,  28, 45,  18_000,  'Loud, thirsty, and somebody''s pride and joy.', 6),
  ('Luxury Sedan',               'Rare',      60_000,  45, 90,  36_000,  'Tinted windows, better locks, bigger payday.', 7),
  ('Convertible',               'Rare',      65_000,  48, 95,  39_000,  'Great for a getaway. Terrible for staying hidden.', 8),
  ('Armored Van',               'Rare',      70_000,  50, 100, 42_000,  'Reinforced doors. Someone really didn''t want this stolen.', 9),
  ('Vintage Classic',           'Epic',      140_000, 68, 200, 84_000,  'Collector''s item. Collector is going to be furious.', 10),
  ('Supercar',                  'Epic',      150_000, 70, 220, 90_000,  'Parked behind a private security gate, usually.', 11),
  ('Armored Limousine',         'Epic',      160_000, 72, 230, 96_000,  'Bulletproof glass. Not thief-proof, apparently.', 12),
  ('Lamborghini',               'Legendary', 350_000, 90, 500, 210_000, 'The car everyone brags about stealing.', 13),
  ('Bugatti',                   'Legendary', 400_000, 92, 550, 240_000, 'Eight figures of Italian engineering, gone in seconds.', 14),
  ('Armored Presidential Limo', 'Legendary', 450_000, 95, 600, 270_000, 'Convoy-grade armor. Convoy-grade target.', 15);

CREATE TABLE user_vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  vehicle_name  TEXT NOT NULL REFERENCES vehicles(name),
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_vehicles_user_id ON user_vehicles (user_id);

ALTER TABLE crimes
  ADD COLUMN vehicle_dropped TEXT REFERENCES vehicles(name);
