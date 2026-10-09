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

**Not yet verified for any phase:** a full `npm install` + running-server + HTTP round-trip test, and running the vitest suites *as vitest* rather than as a standalone script. This cloud sandbox's network policy blocks `registry.npmjs.org` (confirmed twice now, in two separate sessions a few weeks apart — once as an explicit "host not allowed"/"organization policy" denial, once as outright DNS failure) and the internal mirror needs credentials this session doesn't have — see "Open questions" in `GAME_DESIGN.md`. The code is written and reviewed carefully, but treat the first real `npm install && npm run dev` (by you, or once pushed to Render/Vercel) as the real first run.

## In progress

- [ ] None right now — see "Next". Phase 5 (PvP) is substantial enough (hunt/search, kill resolution, death/revive, witnesses) that it's worth a quick check-in before diving in; see the message alongside this update.

## Next

- [ ] Phase 5 — PvP (search/hunt, kill, death, revive, witnesses)
- [ ] **Deployment walkthrough** (Step 8 of the original brief): GitHub repo → Supabase (Postgres) → Render (backend) → Vercel (frontend), one exact step at a time.

## Future (not started)
- [ ] Phase 6 — Police (jail bust-outs, jail statistics, government framework)
- [ ] Phase 7 — Cars (15 vehicles, theft, ownership, melting → bullets)
- [ ] Phase 8 — Co-op crimes (4-hour jobs, 6-player teams, roles)
- [ ] Phase 9 — Hospital (recovery, activities)
- [ ] Phase 10 — Gangs (max 10, roles, treasury, territory, destruction)
- [ ] Phase 11 — Businesses / factories
- [ ] Phase 12 — Economy / balancing pass
- [ ] Phase 13 — Admin tools
- [ ] Phase 14 — Polish
- [ ] Phase 15 — Production deployment (paid hosting + `.com` domain)
