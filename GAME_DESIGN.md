# Mafia World — Game Design Document

Living design doc. This is the source of truth for game mechanics — if a new
feature would conflict with something written here, that gets flagged and
discussed before changing it. Update this file as each phase is built.

**Status:** Phases 1–2 complete. See `TODO.md` for what's built vs. designed-only.

---

## 1. Core concept

A persistent online text-based mafia/crime world. Players create a criminal
character and build an empire through crimes, grand theft auto, cash, mafia
XP, ranks, guns, armour, bullets, player hunting, assassinations, death,
reviving, hospital, jail, police/government, busting players out of jail,
witness statements, selling information, gangs, businesses, factories,
territory/states, travel, multiplayer/co-op crimes, gambling, PvP,
competitions, economy, progression, player profiles and statistics —
eventually a premium points economy.

The loop: make money → improve character → take risks → gain power →
attract enemies → fight/kill/be hunted → build businesses/gangs → become
powerful → potentially lose everything.

## 2. Design philosophy

Text-based, not graphics-heavy. Atmosphere comes from writing, mafia/crime
terminology, events, player names, notifications, logs, timers, risk/reward,
economy, reputation, player interactions, territory mechanics and police
pressure — not from action-game visuals. The interface should be modern and
attractive; the mechanics are text, stats, buttons, menus, tables,
notifications and logs. Think: browser mafia simulator + persistent
multiplayer RPG + crime/economy game.

## 3. Tech stack

- **Frontend:** Next.js + React + TypeScript (`web/`)
- **Backend:** Node.js + Fastify + TypeScript (`server/`)
- **Database:** PostgreSQL
- **Free hosting for testing:** Vercel Hobby (frontend), Render Free
  (backend), Supabase Free (Postgres). Paid hosting + a `.com` domain come
  later, once the game is worth the cost.

## 4. Environment variables

Backend (`server/.env`): `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`,
`CORS_ORIGIN`, `TICK_SECRET`. Frontend (`web/.env.local`):
`NEXT_PUBLIC_API_URL`. Never hard-coded, never committed — see
`.env.example` in each app.

## 5. Database migrations

SQL files in `server/migrations/`, numbered in order (`001_users.sql`,
`002_...`). `server/scripts/migrate.ts` creates a `schema_migrations`
table, applies any migration not yet recorded there (each inside its own
transaction, rolled back on failure), and is safe to re-run and safe to run
during deployment.

## 6. Player account (implemented — `users` table)

id, username, email, password hash, created_at, last_seen, state, cash,
premium points, mafia XP, bullets, equipped gun, equipped armour, heat,
and three status timers: `dead_until`, `jail_until`, `hospital_until`.

Passwords are bcrypt-hashed, sessions are JWTs. **Design decisions made
during implementation:**
- **Rank is not a stored column.** Section 10 says "rank should be based on
  Mafia XP," so it's derived from `mafia_xp`, not duplicated. The actual
  XP thresholds per rank are an open question — see "Open questions" below.
- **Status (ALIVE/DEAD/JAIL/HOSPITAL) is not a stored column either.** It's
  derived server-side from the three `*_until` timestamps on every read.
  One source of truth, no risk of a stored flag disagreeing with the timer
  that's supposed to drive it. Matches the "server time is authoritative"
  rule (section 8/47 of the original brief).

## 7. Player status system

- **ALIVE** — normal gameplay.
- **DEAD** — `dead_until = now() + 24h`. Revivable early with premium points.
- **JAIL** — `jail_until` set on arrest; normal criminal activity blocked
  until it passes or a bust-out succeeds.
- **HOSPITAL** — `hospital_until` set by future combat/events; a recovery
  percentage is shown, not a boring waiting screen (small recovery
  activities come in Phase 9).

Server time is authoritative everywhere — never trust a browser-side timer
for anything that matters.

## 8. States / locations (implemented — `states` table)

8 seeded states (New York, Chicago, Los Angeles, Miami, Las Vegas, Boston,
Detroit, Atlanta — the set is easy to extend). `users.state` is now a real
foreign key into `states.name`, not free text. `GET /api/v1/states` lists
them. Some actions require the acting players to share a state: hunting,
killing, busting prisoners, certain crimes, gang/territory activities.
**Travel between states is still not built** — no cost/time/risk/cooldown,
no endpoint to change state. The table existing is what lets that phase
slot in later without another schema change.

## 9. Mafia ranks (implemented — `server/src/mafia/config.ts` + `ranks.ts`)

10 ranks, driven by Mafia XP — derived on every read via `getRankForXp()`,
never stored. `baseBulletsToKill` is each rank's approximate *bullets
required to kill* before weapon/armour modifiers (used by the bullet
calculator in Phase 4) and is from the brief directly. `minXp` (the XP
needed to *reach* each rank) was NOT specified in the brief — the values
below are an MVP placeholder (still flagged in "Open questions"). All of it
lives in one config file so it can be tuned without touching the formula
code that uses it.

| # | Rank | Min XP (placeholder) | Base bullets to kill |
|---|------|----------------------|----------------------|
| 1 | Rookie | 0 | 120 |
| 2 | Associate | 1,000 | 160 |
| 3 | Soldier | 3,000 | 210 |
| 4 | Enforcer | 7,000 | 270 |
| 5 | Capo | 15,000 | 340 |
| 6 | Consigliere | 30,000 | 420 |
| 7 | Underboss | 60,000 | 520 |
| 8 | Boss | 120,000 | 650 |
| 9 | Don | 250,000 | 820 |
| 10 | Legend | 500,000 | 1,050 |

## 10. Guns (Phase 4 — not yet built)

| Gun | Bullet multiplier |
|-----|--------------------|
| Pocket Pistol | 1.10x |
| 9mm | 1.00x |
| SMG | 0.88x |
| Assault Rifle | 0.78x |
| Sniper Rifle | 0.70x |

Lower multiplier = fewer bullets needed to kill. Each gun: id, name, bullet
multiplier, price, optional description, optional rank requirement.

## 11. Armour (Phase 4 — not yet built)

| Armour | Bonus bullets | Multiplier |
|--------|---------------|------------|
| Light Vest | +40 | 1.10x |
| Kevlar Kit | +90 | 1.20x |
| Heavy Plates | +160 | 1.35x |

Armour belongs to the defender and increases the bullets needed to kill
them. Later: durability, damage reduction, repair, armour classes.

## 12. Bullet calculator (Phase 4 — not yet built)

```
gunApplied = targetRankBaseBullets × gunMultiplier
withArmor  = gunApplied + armourBonusBullets
final      = withArmor × armourMultiplier
result     = max(25, round(final))
```

The server calculates the real number; a frontend calculator is
informational only. Combat is never client-authoritative.

## 13. Hunt / search (Phase 5 — not yet built)

A player can't attack instantly — they search first. Search takes 4 hours
(server-timestamp-based: `started_at` / `completes_at`, never
`setTimeout`). On completion the target's state at that moment is revealed.
The attacker must reach that state, and the target must *still* be there
when the kill is attempted — if the target moves, the hunt fails and must
be redone. This is what makes movement a real strategic choice instead of
"instant global assassination."

## 14. Kill resolution (Phase 5 — not yet built)

Requires, in order: attacker alive → target exists and is alive → search
completed → attacker in the discovered state → target still in that state
→ bullets required calculated server-side → attacker has enough bullets →
bullets deducted atomically → target set DEAD 24h → witnesses generated →
combat event logged → search consumed. All inside one DB transaction with
row locking on both players, to prevent double-spend / double-kill (see
section 20, "Transactions").

## 15. Death & revive (Phase 5 — not yet built)

Death lasts 24 hours (`dead_until = now() + 24h`). Revive costs **50
premium points** (MVP price — configurable) and brings the player back
immediately. Real-money purchases are out of scope for now; for testing,
points are simply granted/admin-controlled.

## 16. Witness system (Phase 5 — not yet built)

On a kill, up to 3 random *online* players witness it and can sell what
they saw (victim, killer, time, location) to another player — an
information economy that enables diplomacy, revenge and espionage.
Witnesses are not forced to expose what they know publicly.

## 17. Crimes (Phase 3 — not yet built)

First crime: **Grand Theft Auto.** Cooldown 10 minutes. Success chance
`0.78 − heat×0.004 + rank×0.01`, clamped 20–90%. Success: $18,000–$75,000 +
rank bonus, 20–60 XP + rank bonus, +6–14 heat. Failure: 6–18 XP, +10–22
heat, 1–2 minutes jail. All configurable, not sacred.

## 18. Heat

0–100, represents police attention. Higher heat lowers crime success and
raises jail/police risk. Decays over time (proper decay system, not
permanent accumulation).

## 19. Vehicles & melting (Phase 7 — not yet built)

~15 stealable vehicles (rarity: Common/Uncommon/Rare/Epic/Legendary), each
with value, theft difficulty, "bullet-melting" value, optional resale. GTA
can randomly produce one. Cars can be sold, stored, used, or melted into
bullets — the resource loop `crime → steal → melt → bullets → PvP`.
Balance carefully so bullets can't become infinite.

## 20. Police / jail / bust-outs (Phase 6 — not yet built)

Failed crimes can jail a player (`jail_until`, e.g. 60–120s on a failed
GTA). Other players can attempt a bust-out: both must share a state, the
buster can't bust themselves. Base success 25%, +2%/prior successful bust,
−1%/prior failed bust, clamped 15–80%. Reward $25,000 + $4,000/prior
successful bust. Track jail time served, successful/failed busts, times
arrested.

## 21. Co-op crimes (Phase 8 — not yet built)

Every 4 hours, per state, up to 6 players, with a reward well above solo
crimes. Eventually roles: Driver, Gunman, Hacker, Lookout, Muscle, Boss.

## 22. Hospital (Phase 9 — not yet built)

Recovery percentage shown, small recovery activities (rest, medical
treatment, limited gambling, small jobs) rather than a forced wait screen.

## 23. Gambling (Phase 10 — not yet built)

Server-authoritative, transactional, logged, capped — never unlimited-money.
Candidates: dice, slots, blackjack, roulette.

## 24. Gangs (Phase 10 — not yet built)

Max 10 gangs initially. Name, leader, members, roles (Boss, Underboss,
Capo, Soldier, Associate), treasury, territory, businesses, reputation,
statistics. A destroyed gang can be disbanded, drop businesses, release
territory to neutral, and its members become free agents — gang stats
persist in history.

## 25. Businesses & factories (Phase 11 — not yet built)

Nightclub, restaurant, casino, garage, warehouse, gun shop, chop shop,
protection racket. Buyable/upgradeable/robbable/seizable, dropped on death,
controllable by gangs. Factories produce resources on a timestamp basis
(never in-memory timers) — e.g. a bullet factory producing N/hour.

## 26. Player profile & statistics (implemented)

`GET /api/v1/players/:username` returns a public profile: rank, XP, status,
state, cash, gang (always `null` until Phase 10), and the stats below.
Never exposes email, password hash, premium points, bullets or equipped
gear. The 14 statistics from brief section 36 (crimes committed/succeeded/
failed, kills, deaths, bullets fired/spent, cash earned/lost, cars stolen/
melted, jail time served, times arrested, successful/failed busts) exist
as columns on `users`, added in `003_player_stats.sql` — all starting at 0,
since no gameplay system populates them yet. **Simplification:** this is
denormalized counters, not a full event-log table. Revisit as a real event
log once the activity feed (section 44) needs per-event detail rather than
just totals.

## 27. Economy

Two currencies. **Cash** — earned through gameplay, spent on guns, armour,
cars, businesses, travel, etc. **Premium points** — eventually
purchasable, used for revive, premium features, cosmetics; for now,
granted/admin-controlled (no real-money payments yet).

## 28. Security principles

Never trust the frontend. The server validates identity, currency,
bullets, cooldowns, timers, location, combat, inventory, rank, XP, jail,
death, search completion, revive, gambling and trading. Financial/combat
operations run in DB transactions with row locks where needed, to prevent
double-spending, duplicate rewards, replay attacks, negative balances,
forged cooldowns, fake kills and fake rewards.

## 29. API style

```json
{ "ok": true, "data": {} }
```
```json
{ "ok": false, "error": { "code": "NO_BULLETS", "message": "Not enough bullets." } }
```

No stack traces ever reach the client (see the Fastify error handler in
`server/src/index.ts`).

## 30. Scheduler / game tick

Free-tier backends can sleep, so nothing important relies on in-memory
timers (`setTimeout`) — every timer is a database timestamp
(`dead_until`, `jail_until`, `hospital_until`, `crime_next_at`,
`coop_next_at`, search `completes_at`, etc.). A protected
`POST /internal/tick` endpoint (guarded by `TICK_SECRET`) will later handle
scheduled co-op jobs, heat decay, factory production and other due events;
an external scheduled request wakes the free backend to run it. Not built
yet — added when the first system that needs it (heat decay or co-op jobs)
is built.

## 31. Balancing

Nothing important is a magic number buried in code. GTA cooldown, crime
rewards/success, heat, jail duration, revive price, search duration, death
duration, bust chance/reward, gun/armour multipliers, rank XP thresholds,
factory production — all configurable, moving into constants/config or
database tables as each system is built.

## 32. Current MVP values (from the original brief)

Search 4h · Death 24h · Revive 50 premium points · 5 initial guns · 3
initial armour sets · 10 initial ranks · GTA cooldown 10 min · Co-op crime
every 4h, max 6 players · Witnesses up to 3 random online users · Jail from
failed GTA 1–2 min · Max 10 gangs. All changeable after real testing.

## 33. Phases (see `TODO.md` for live status)

1. Foundation 2. Core player 3. Crime 4. Weapons 5. PvP 6. Police
7. Cars 8. Co-op 9. Hospital 10. Gangs 11. Businesses/factories
12. Economy/balancing 13. Admin tools 14. Polish 15. Production deployment

---

## Open questions (need a decision before the relevant phase starts)

1. **Rank XP thresholds.** Section 9 above gives each rank's *combat*
   value (bullets to kill) but not the Mafia XP needed to *reach* each
   rank. Needed before Phase 2 can compute rank from `mafia_xp`.
2. **Starting cash.** Not specified — implementation currently uses
   **$5,000** as a placeholder (see `STARTING_CASH` in
   `server/src/routes/auth.ts`). Easy to change.
3. **Username rules.** Not specified — implementation currently requires
   3–20 characters, letters/numbers/underscores only. Easy to change.
4. **Password rules.** Not specified — implementation currently requires
   8+ characters. Easy to change.
5. **Session length.** Not specified — implementation currently issues
   7-day JWTs. Easy to change.
6. **Full local runtime verification.** The Claude cloud sandbox this repo
   was built in has a network policy that blocks `registry.npmjs.org` /
   `pypi.org` outright (confirmed: direct requests and proxied requests both
   come back "host not allowed" / "organization policy"; an internal
   Anthropic mirror exists but needs credentials this session doesn't have).
   So `npm install` couldn't be run here. What *was* verified in-sandbox:
   `server/migrations/001_users.sql` applied cleanly to a real local
   Postgres 16 and produced exactly the intended schema, and every backend
   `.ts` file passed a real syntax check. What's still unverified: actually
   starting the Fastify server and the Next.js app and exercising the HTTP
   endpoints. Do that first via the README's "Running it locally" steps (or
   once deployed to Render/Vercel) and report back anything that breaks.

None of these block Phase 1; they're flagged here so they get a real
decision (not just an assumption baked in silently) before the phases that
depend on them.
