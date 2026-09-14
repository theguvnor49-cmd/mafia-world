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
- [x] Verified what could be verified in this sandbox: `001_users.sql` was applied directly against a real local Postgres 16 instance and produces exactly the intended table (columns, defaults, checks, indexes all confirmed with `\d users`); every backend `.ts` file passes a real syntax check (`node --experimental-strip-types --check`). **Not yet verified:** a full `npm install` + running-server + HTTP round-trip test, because this cloud sandbox's network policy blocks `registry.npmjs.org` (and the internal mirror needs credentials this session doesn't have) — see "Open questions" in `GAME_DESIGN.md`. The code was written and reviewed carefully, but treat the first real `npm install && npm run dev` (by you, or once pushed to Render/Vercel) as the real first run.

## In progress

- [ ] Nothing currently in progress — Phase 1 is done and waiting on your review.

## Next

- [ ] **Deployment walkthrough** (Step 8 of the original brief): GitHub repo → Supabase (Postgres) → Render (backend) → Vercel (frontend), one exact step at a time.
- [ ] **Phase 2 — Core player**: proper `states` table (currently just a free-text column on `users`), rank derived from mafia XP (rank XP thresholds are not yet defined — see "Open questions" in `GAME_DESIGN.md`), full player profile page, player statistics scaffolding.

## Future (not started)

- [ ] Phase 3 — Crime (GTA, cooldowns, heat, jail)
- [ ] Phase 4 — Weapons (guns, armour, bullets, equipment, bullet calculator)
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
