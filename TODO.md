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

**Not yet verified for any phase:** a full `npm install` + running-server + HTTP round-trip test, and running the vitest suites *as vitest* rather than as a standalone script. This cloud sandbox's network policy blocks `registry.npmjs.org` (confirmed twice now, in two separate sessions a few weeks apart — once as an explicit "host not allowed"/"organization policy" denial, once as outright DNS failure) and the internal mirror needs credentials this session doesn't have — see "Open questions" in `GAME_DESIGN.md`. The code is written and reviewed carefully, but treat the first real `npm install && npm run dev` (by you, or once pushed to Render/Vercel) as the real first run.

## In progress

- [ ] Phase 4 — Weapons (guns, armour, bullets, equipment, bullet calculator) — building now.

## Next

- [ ] **Deployment walkthrough** (Step 8 of the original brief): GitHub repo → Supabase (Postgres) → Render (backend) → Vercel (frontend), one exact step at a time.

## Future (not started)
- [ ] Phase 5 — PvP (search/hunt, kill, death, revive, witnesses)
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
