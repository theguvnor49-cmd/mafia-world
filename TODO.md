# TODO

Tracks build status against the 15 phases in `GAME_DESIGN.md`. Keep this updated as we go — it's the single source of truth for "what's actually built" vs. "what's designed but not built yet."

## Completed

**Phase 1 — Foundation**
- [x] Repository structure (`server/` + `web/`, clean separation)
- [x] Fastify + TypeScript backend skeleton
- [x] Next.js + TypeScript frontend skeleton
- [x] Postgres connection pool + transaction helper
- [x] Migration runner (`schema_migrations` table, ordered, idempotent, transactional)
- [x] `001_users.sql` — users table (identity, cash, premium points, mafia XP, bullets, equipped gun/armour, heat, dead/jail/hospital timestamps)
- [x] `GET /health`
- [x] `POST /api/v1/auth/register`, `POST /api/v1/auth/login` (bcrypt password hashing, JWT sessions)
- [x] `GET /api/v1/me` (JWT-protected, status derived server-side from timestamps)
- [x] Frontend: `/`, `/login`, `/register`, `/mafia` (dashboard) — dark-themed, shows cash/points/XP/bullets/heat/state/status
- [x] `.env.example` for both apps, no secrets committed
- [x] Verified what could be verified in this sandbox for Phase 1: `001_users.sql` was applied directly against a real local Postgres 16 instance and produces exactly the intended table; every backend `.ts` file passes a real syntax check (`node --experimental-strip-types --check`).

**Phase 2 — Core player**
- [x] `002_states.sql` — real `states` table (8 seeded states), `users.state` now a real foreign key
- [x] `003_player_stats.sql` — the 14 statistics columns from brief section 36, all starting at 0
- [x] `server/src/mafia/config.ts` + `ranks.ts` — rank derived from mafia XP, never stored
- [x] `GET /api/v1/players/:username` — public profile (rank, XP, status, state, cash, stats; never email/password/points/bullets)
- [x] `GET /api/v1/states`
- [x] `GET /api/v1/me` now returns rank + the full stats block
- [x] Frontend: `/mafia/profile/[username]`, dashboard shows rank and links to your own profile
- [x] Verified the same way as Phase 1 (direct `psql` for the migrations, `node --check` for every backend file) — same npm-install caveat applies, see below.

**Phase 3 — Crime**
- [x] `004_crimes.sql` — `users.gta_next_at` + `users.heat_updated_at`, new `crimes` log table (indexed on `user_id, created_at`)
- [x] `server/src/mafia/heat.ts` — `computeEffectiveHeat` (pure, timestamp-based decay, no timers/cron) + `clampHeat`
- [x] `server/src/mafia/crimes/gta.ts` — `getGtaSuccessChance` + `resolveGta`, pure functions, config-driven
- [x] `GET /api/v1/mafia/crime/gta/status`, `POST /api/v1/mafia/crime/gta` — transactional (`SELECT ... FOR UPDATE`), checks ALIVE + cooldown, one atomic update + crime-log insert
- [x] Frontend: `/mafia/crimes` — cooldown countdown, attempt button, session-local activity log; dashboard links to it
- [x] `vitest` added as a devDependency; `gta.test.ts` + `heat.test.ts` mirror the assertions already run as a standalone script (below)
- [x] **Actually executed**, not just syntax-checked: the GTA/heat pure logic was run via a manually-detyped standalone copy with plain `node` — 20 assertions, all passing. Caught one flawed test expectation in the process (see `GAME_DESIGN.md` section 17 — the brief's 90% success-chance cap isn't reachable through rank/heat alone; realistic ceiling is 87%). That finding is now also asserted in `gta.test.ts`.

**Phase 4 — Weapons**
- [x] `005_weapons.sql` — real `guns` (5 seeded) and `armour` (3 seeded) catalog tables; `users.equipped_gun`/`equipped_armour` are now real foreign keys into them (free text since Phase 1, specifically for this)
- [x] `server/src/mafia/bulletCalculator.ts` — `calculateBulletsToKill`, pure, catalog-agnostic (same function Phase 5's real kill resolution will use)
- [x] `GET /api/v1/mafia/weapons/guns` / `armour`, `POST .../guns/:name/buy` / `armour/:name/buy` — transactional, locks the row, rejects re-buying what's already equipped, checks affordability
- [x] `GET /api/v1/mafia/weapons/calculator` — informational "what-if" endpoint, never looks up a real player
- [x] `GET /api/v1/ranks` — new public endpoint exposing the rank ladder (needed so the calculator's target-rank dropdown isn't guessing the numbers)
- [x] `GET /api/v1/me` now joins the catalog tables and returns equipped gun/armour as `{name, bulletMultiplier}` / `{name, bonusBullets, multiplier}` instead of a bare string
- [x] Frontend: `/mafia/armoury` — gun/armour shop with afford/equipped states, bullet calculator form; dashboard shows equipped gear and links to it
- [x] `bulletCalculator.test.ts` added; same actually-executed-in-a-scratchpad-script verification as Phase 3 (hand-worked examples + a 40-combination sanity sweep across every real rank × gun × armour combo)
- [x] Verified the migration directly via `psql`, including proving the new FK rejects a bogus gun name and that the `/api/v1/me` join returns correct values for a real equipped gun/armour

**Phase 5 — PvP**
- [x] `006_pvp.sql` — `hunts`, `kills`, `witness_statements` tables. One active hunt per hunter enforced by a **unique partial index**, not just app logic.
- [x] `server/src/mafia/pvp/witnesses.ts` — `pickWitnesses()`, pure random-sampling, unit tested + actually executed (8 assertions, including a 30k-trial uniformity check)
- [x] `POST /api/v1/mafia/search/start`, `GET .../search/status` — lazy state-reveal-on-first-read (no scheduler), requires ALIVE
- [x] `POST /api/v1/mafia/kill` — the big one: both players locked in **sorted-id order** (deadlock-safe against a simultaneous reverse attack), full brief-section-54 check order, bullets via the same `calculateBulletsToKill` Phase 4 built, witnesses generated inline
- [x] `POST /api/v1/mafia/revive` — transactional, checks DEAD + premium points, sets `dead_until = NULL`
- [x] `GET /api/v1/mafia/witness/me`, `POST .../witness/sell`, `POST .../witness/:id/buy` — **note the extra endpoint**: selling only lists a price, buying is the buyer's own action. Deliberate safety deviation from the brief's literal one-endpoint design — flagged prominently in `GAME_DESIGN.md` section 16 and "Open questions" #10, worth your own look.
- [x] `requireAuth` now refreshes `last_seen` on every request (debounced to 1/minute) so "online" witnesses means something
- [x] Frontend: `/mafia/hunt`, `/mafia/revive`, `/mafia/witness`; dashboard shows a DEAD banner linking to revive
- [x] Fixed a real gap while building this: `GET /api/v1/me` was querying `dead_until`/`jail_until`/`hospital_until` but never returning them (only the derived `status` string) — the new DEAD banner needs the actual timestamp, so it's now returned as `deadUntil`/`jailUntil`/`hospitalUntil`.
- [x] Verified every migration via `psql` as usual, **plus** two full manual dry-runs of every SQL statement in the kill transaction and the witness buy/sell transaction against real seeded rows (correct bullet math end to end: 120 base × 1.00 gun + 40 armour bonus × 1.10 armour multiplier = 176; correct cash movement on a witness sale) — this phase's transactions are complex enough that syntax-checking alone didn't feel like enough.

**Phase 6 — Police (jail bust-outs)**
- [x] Jail itself (`jail_until`, 60–120s on a failed GTA, `jail_seconds_served`/`times_arrested` tracking) was already built in Phase 3/2 — this phase is specifically the bust-*out* action.
- [x] `007_busts.sql` — `busts` log table (buster, prisoner, success, cash_reward, state, timestamp). No new `users` columns needed; `jail_until`/`successful_busts`/`failed_busts` have existed since Phase 1/2.
- [x] `server/src/mafia/jail/bust.ts` — `getBustSuccessChance`, `getBustReward`, `resolveBust`, pure and config-driven, every value straight from the brief (no placeholders, unlike GTA)
- [x] `POST /api/v1/mafia/jail/bust` — locks buster + prisoner in sorted-id order (same deadlock-safe pattern as the Phase 5 kill transaction), checks buster ALIVE / prisoner actually JAIL / same state / no self-busts, applies the cash reward + stat increments on success or just `failed_busts` on failure, logs every attempt
- [x] Fixed a small real gap while building this: the *public* player profile endpoint returned `successfulBusts`/`failedBusts`/`jailSecondsServed` but not `timesArrested`, even though brief section 26 lists all four as profile-displayable. Added.
- [x] Frontend: `/mafia/bust` (username input, attempt, local activity log, own bust stats); dashboard gained a jail banner with a live mm:ss countdown matching the brief's own section 24 mockup; profile page gained a "Times Arrested" stat
- [x] `bust.test.ts` added; same actually-executed-in-a-scratchpad-script verification as every prior phase's pure logic (17 assertions, including a 50k-trial empirical-rate sanity sweep)
- [x] Verified the migration via `psql` as usual, **plus** a full manual dry-run of both the success and failure branches of the bust transaction against real seeded rows (confirmed: success frees the prisoner and pays the exact scaled reward; failure leaves the prisoner jailed and moves no cash either direction) — explicitly rolled back, residue confirmed zero afterward

**Phase 7 — Cars (vehicles, theft, melting into bullets)**
- [x] `008_vehicles.sql` — `vehicles` catalog (15 seeded, 3 per rarity tier) + `user_vehicles` per-instance ownership table + a nullable `vehicle_dropped` column added to the existing `crimes` table
- [x] `server/src/mafia/vehicles/drop.ts` — `pickVehicleDrop()`, pure weighted-random selection (weight = 101 − theft difficulty), mirroring Phase 5's `pickWitnesses()` style
- [x] `routes/crimes.ts` extended: on a successful GTA, rolls an independent 20% chance (MVP placeholder — the brief never gives a rate) for a vehicle drop, inside the same transaction as the rest of the crime's rewards
- [x] New `routes/vehicles.ts`: `GET /api/v1/mafia/cars` (public catalog), `GET .../cars/mine`, `POST .../cars/:id/sell`, `POST .../cars/:id/melt` — sell/melt lock only the acting user's own two rows (no cross-player locking needed, unlike kill/bust)
- [x] Frontend: `/mafia/cars` (catalog browse + garage with sell/melt buttons); `/mafia/crimes` now mentions a vehicle drop in its activity log when one happens; dashboard gained a "Garage" nav link
- [x] `drop.test.ts` added; same actually-executed-in-a-scratchpad-script verification as every prior phase's pure logic (16 assertions, including a 100k-trial check that each rarity tier's empirical drop share matches its formula-predicted share, and that the overall drop rate matches the configured 20%)
- [x] Verified the migration via `psql` as usual, **plus** a full manual dry-run covering all three money/resource-moving paths (a GTA success that drops a Lamborghini, a sell, a melt) against real seeded rows, **plus** a dedicated check confirming the sell/melt ownership-scoping predicate (`WHERE id = $1 AND user_id = $2`) actually blocks a different user from touching someone else's car — all explicitly rolled back, residue confirmed zero after

**Phase 8 — Co-op crimes**
- [x] `009_coop.sql` — `scheduler_state` singleton table (one row, `CHECK (id = 1)`, holds `next_coop_job_at`), `coop_jobs` table (state, opens/closes_at, reward_cash/xp, resolved_at), `coop_job_participants` (job_id + user_id + optional role, `UNIQUE(job_id, user_id)` and `UNIQUE(job_id, role)` — the latter NULL-safe, so any number of roleless players can coexist alongside at most one of each named role)
- [x] `server/src/mafia/coop/job.ts` — `pickRandomState()`, pure uniform selection over whatever state names are passed in, same style as every other probabilistic pick in this codebase
- [x] `routes/coop.ts` — `ensureCoopJobExists()` and `resolveClosedJobs()`, the shared lazy-evaluation machinery (locks the `scheduler_state` row to create a job only when due; a conditional `UPDATE ... WHERE resolved_at IS NULL` claims a closed job for resolution so two concurrent callers can't both pay it out), called from both the player-facing routes below and `routes/tick.ts`
- [x] `GET /api/v1/mafia/coop/status` — resolves anything overdue, creates a new job if one is due, returns the current job (state, timer, reward, roster, your role) plus a one-time `justCompleted` payout notice when your own read is the one that triggered a resolution
- [x] `POST /api/v1/mafia/coop/join` — optional role; checks ALIVE, same state as the job (real check, same travel caveat as PvP/jail), job not full (6-player cap enforced by an app-level count *protected by the job row's own lock*, not a DB constraint — see "Open questions" #16), not already joined, role not already taken (the last two caught as friendly errors off the real `UNIQUE` constraints, same pattern as `search/start`'s `ALREADY_HUNTING`)
- [x] `routes/tick.ts` — `POST /internal/tick`, guarded by a `X-Tick-Secret` header compared with `crypto.timingSafeEqual`; runs the same ensure/resolve pair as `coop/status`. Deliberately not a correctness dependency — every lazy system here (heat, hunt reveal, now co-op) self-heals on its own next real read with or without a tick ever firing.
- [x] Frontend: `/mafia/co-op` — current job card (state, countdown, reward, roster with roles), join form with a role dropdown (disables already-taken roles), a dismissible "you got paid" banner; dashboard gained a "Co-op heist" nav link
- [x] `job.test.ts` added; same actually-executed-in-a-scratchpad-script verification as every prior phase's pure logic (9 assertions, including the roll-exactly-1 clamp boundary and an 80k-trial uniformity sweep across the real 8 states)
- [x] Verified the migration via `psql` as usual (including proving the `scheduler_state` singleton really does reject a second row), **plus** a full manual dry-run of the entire job lifecycle against real seeded rows in one script: creation, a second near-simultaneous due-check creating nothing (idempotent), a role conflict correctly rejected then retried roleless, the roster filling to exactly 6 and a 7th joiner correctly blocked, a wrong-state joiner correctly distinguished, and resolution paying all 6 participants the exact reward exactly once — re-claiming the same job afterward affects 0 rows and leaves nobody double-paid. Explicitly rolled back; residue confirmed zero from a fresh connection afterward.

**Not yet verified for any phase:** a full `npm install` + running-server + HTTP round-trip test, and running the vitest suites *as vitest* rather than as a standalone script. This cloud sandbox's network policy blocks `registry.npmjs.org` (confirmed twice now, in two separate sessions a few weeks apart — once as an explicit "host not allowed"/"organization policy" denial, once as outright DNS failure) and the internal mirror needs credentials this session doesn't have — see "Open questions" in `GAME_DESIGN.md`. The code is written and reviewed carefully, but treat the first real `npm install && npm run dev` (by you, or once pushed to Render/Vercel) as the real first run.

## In progress

- [ ] None right now. Phases 1-8 are all committed. Pushing straight through the remaining phases per Glenn's instruction — no more per-phase check-ins unless a genuine design decision blocks progress.

## Next

- [ ] Phase 9 — Hospital (recovery percentage, small recovery activities instead of a forced wait screen)
- [ ] **Deployment walkthrough** (Step 8 of the original brief): GitHub repo → Supabase (Postgres) → Render (backend) → Vercel (frontend), one exact step at a time.

## Future (not started)
- [ ] Phase 10 — Gambling (dice/slots/blackjack/roulette) + Gangs (max 10, roles, treasury, territory, destruction) — both land under "Phase 10" per `GAME_DESIGN.md` sections 23-24; this line will split if they end up big enough to build separately.
- [ ] Phase 11 — Businesses / factories
- [ ] Phase 12 — Economy / balancing pass
- [ ] Phase 13 — Admin tools
- [ ] Phase 14 — Polish
- [ ] Phase 15 — Production deployment (paid hosting + `.com` domain)
