-- 011_gambling.sql
-- Gambling (brief section 23 / GAME_DESIGN.md section 23) — "server-
-- authoritative, transactional, logged, capped — never unlimited-money."
-- Candidates named in the brief: dice, slots, blackjack, roulette. All
-- four are built, each as a single-request, instantly-resolved bet (bet
-- amount in, outcome + net cash change out) rather than a multi-step
-- session — see GAME_DESIGN.md section 23 for why blackjack in particular
-- is "auto-played" (no hit/stand decisions) rather than interactive: it
-- keeps every game resolvable by the same one-pure-function-per-bet
-- pattern already used everywhere else in this codebase (GTA, busts,
-- hospital's own gamble), instead of introducing a brand new multi-turn
-- session-state architecture for one game.
--
-- This is distinct from, and unrelated to, Phase 9's `hospital_activities`
-- gamble entries — that's a narrow coin-flip usable only while
-- hospitalized; this is the general-purpose casino, usable any time
-- you're ALIVE.
--
-- One log table for all four games (not four separate tables) — `game`
-- discriminates, `detail` (JSONB) holds whatever's specific to that game
-- (dice rolled, slot symbols, roulette number/color, blackjack hands),
-- since each game's "what happened" shape genuinely differs and forcing
-- them into shared flat columns would mean a lot of always-NULL columns
-- per row. Mirrors every other phase's log table otherwise: indexed on
-- (user_id, created_at), same as crimes/busts/hospital_activities.

CREATE TABLE gambling_bets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  game        TEXT NOT NULL CHECK (game IN ('dice', 'slots', 'roulette', 'blackjack')),
  bet_amount  BIGINT NOT NULL CHECK (bet_amount > 0),
  net_change  BIGINT NOT NULL,
  detail      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gambling_bets_user_id_created_at ON gambling_bets (user_id, created_at);
