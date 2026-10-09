# Mafia World

A persistent, browser-based, text-driven multiplayer mafia/crime game. See [`GAME_DESIGN.md`](./GAME_DESIGN.md) for the full design spec and [`TODO.md`](./TODO.md) for build status.

This repo is being built in phases with Claude acting as lead developer. **Phases 1–11 are complete**: foundation (auth, health check, dashboard), core player (ranks, states, public profiles), crime (Grand Theft Auto, heat), weapons (guns, armour, bullet calculator), PvP (hunt/search, kill resolution, death/revive, witness statements), police (jail bust-outs), cars (vehicle theft, ownership, melting into bullets), co-op crimes (4-hour team jobs, up to 6 players, flat cash+XP payout), hospital recovery (a shorter second stage after death, with treatment/gambling/small-job activities to pass the time), a casino (dice, slots, roulette, blackjack), gangs (up to 10 at a time, with ranks, a shared treasury, and claimable territory), and businesses (8 ownable, upgradeable, income-generating types that can be robbed or seized). See `TODO.md` for the live, detailed status and `GAME_DESIGN.md` for how each system works.

## Stack

- **Frontend:** Next.js (pages router) + React + TypeScript — `web/`
- **Backend:** Node.js + Fastify + TypeScript — `server/`
- **Database:** PostgreSQL — `server/migrations/`

Free hosting target for testing: Vercel (frontend), Render (backend), Supabase (Postgres). See `GAME_DESIGN.md` section "Hosting Plan" for the guided deployment steps once we get there.

## Repository layout

```text
mafia-world/
├── server/            Fastify + TypeScript API
│   ├── src/
│   │   ├── index.ts        App entry point, registers routes
│   │   ├── config.ts        Loads + validates environment variables
│   │   ├── db.ts             Postgres connection pool + transaction helper
│   │   ├── auth.ts           Password hashing, JWT signing/verification, auth guard
│   │   ├── routes/           HTTP route handlers (auth, me, ...)
│   │   └── mafia/            Game systems (crimes, combat, economy) — built phase by phase
│   ├── migrations/     Ordered .sql migration files
│   ├── scripts/migrate.ts   Migration runner
│   └── .env.example
├── web/               Next.js frontend
│   ├── pages/          login, register, dashboard (/mafia)
│   ├── components/
│   ├── lib/api.ts       Fetch helper that talks to the backend
│   └── .env.example
├── GAME_DESIGN.md      Living design document — the source of truth for game mechanics
├── TODO.md             Completed / in progress / next / future
└── README.md           This file
```

## Running it locally

You'll need Node.js 20+ and a PostgreSQL server (13+). The database schema was verified against a real local Postgres 16 while building this, but the sandbox it was built in couldn't reach the npm registry (blocked by that environment's network policy — see "Open questions" in `GAME_DESIGN.md`), so `npm install` and the actual running server/frontend have **not** been tested yet. These steps should work — please report back anything that breaks so it gets fixed fast.

### 1. Database

Create a database and get its connection string, e.g.:

```bash
createdb mafia_world
# connection string looks like: postgres://USER:PASSWORD@localhost:5432/mafia_world
```

(Later, once we set up Supabase, `DATABASE_URL` will point there instead — same steps.)

### 2. Backend

```bash
cd server
cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres connection string,
# and set JWT_SECRET / TICK_SECRET to long random strings, e.g.:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm install
npm run migrate     # creates the users table (safe to re-run)
npm run dev          # starts the API on http://localhost:4000
```

Check it's alive: `curl http://localhost:4000/health` should return `{"ok":true,"data":{...}}`.

### 3. Frontend

In a second terminal:

```bash
cd web
cp .env.example .env.local
# NEXT_PUBLIC_API_URL should point at the backend, e.g. http://localhost:4000

npm install
npm run dev          # starts the site on http://localhost:3000
```

Open `http://localhost:3000`, click **Create Character**, register an account, and you should land on the dashboard showing your cash, XP, bullets, heat and status.

## What's implemented so far

**Auth & profile:** register/login (bcrypt + JWT), `GET /api/v1/me`, public profiles at `GET /api/v1/players/:username`, 8 seeded states, 10 mafia ranks derived from XP.

**Crime:** Grand Theft Auto (`/mafia/crimes`) — cooldown, success chance driven by heat and rank, cash/XP/heat rewards, jail on failure. Heat decays continuously from a timestamp, no background process.

**Weapons:** 5 guns, 3 armour sets, a shop to buy/equip them (`/mafia/armoury`), and a bullet calculator using the brief's exact formula.

**PvP:** search for a target (4-hour timer), then attack once you've found them and you're both still in the same state (`/mafia/hunt`); a kill puts the target in DEAD status for 24 real hours; revive early by spending premium points (`/mafia/revive`); up to 3 random online players witness a kill and can list what they saw for sale (`/mafia/witness`).

**Police:** a failed crime jails you for 60-120 seconds (brief section 24, built back in Phase 3); another player can now attempt to bust you out (`/mafia/bust`) if they're in your state — base 25% success, shifting with their own bust track record, clamped 15-80%, paying them $25,000+ on success.

**Cars:** a successful Grand Theft Auto has a 20% chance of also handing you one of 15 vehicles (`/mafia/cars` shows the full catalog and your garage) — rarer ones are harder to steal and show up less often. Sell an owned car for cash or melt it into bullets; GTA's existing 10-minute cooldown is what keeps that bullet supply from spiraling.

**Co-op crimes:** every 4 hours, one job opens somewhere (`/mafia/co-op`) — up to 6 players join in, optionally picking a flavor role, and everyone still in when the 4-hour timer runs out splits nothing and instead *each* gets the full $250,000 + bonus XP. No running scheduler anywhere: creation and payout both happen lazily, the first time anyone checks status, joins, or the protected `/internal/tick` endpoint is pinged.

**Hospital:** dying without paying to revive no longer falls straight through to ALIVE after 24 hours — it now lands in the hospital for a shorter recovery window first (`/mafia/hospital`). Pay cash for medical treatment to cut the wait, take a capped 50/50 gamble to pass the time, or pick up a small no-risk job for pocket change. Premium-point revive is unchanged and still skips straight to fully ALIVE, bypassing this stage entirely.

**Casino:** four capped, server-resolved games any time you're ALIVE (`/mafia/gambling`) — dice (bet under/seven/over on two dice), slots (three weighted reels), roulette (color/parity/straight-up number on a single-zero wheel), and an auto-played blackjack (naturals, busts, and dealer draws all work normally; the hand just plays itself rather than taking hit/stand input). Every bet is capped per-game — never unlimited-money.

**Gangs:** up to 10 at a time (`/mafia/gangs`), open to join, with five ranks (Boss down to Associate), a shared treasury any member can deposit into, and one claimable territory per gang (a state nobody else actively holds). The Boss runs the gang — kicking, promoting/demoting, withdrawing funds, claiming territory, and disbanding are all Boss-only. A disbanded gang's members become free agents immediately; the gang's own name/treasury/reputation stay on the books as history.

**Businesses:** 8 ownable types (`/mafia/businesses`) — Nightclub, Restaurant, Casino, Garage, Warehouse, Gun Shop, Chop Shop, Protection Racket — one of each per player, upgradeable through 5 levels, each earning cash continuously from the moment it's bought (collect any time; the longer you wait, the more another player stands to steal). Rob someone else's for a cash/XP/heat payoff with jail risk on failure, or seize one for free once its owner has died — businesses never change hands by force while their owner's alive, only after.

Nothing here trusts the client: passwords are hashed with bcrypt, sessions are JWTs verified server-side, every currency/combat operation runs inside a database transaction with row locking, and all player state is read from Postgres on every request.

## Next up

See `TODO.md`. Straight on to Phase 12 (economy/balancing) now — no more per-phase pauses unless something genuinely needs a decision only you can make. Six things worth your own look whenever you do stop to review: `GAME_DESIGN.md` section 16 and "Open questions" #10 flag a deliberate deviation from the brief in how selling witness information works, for currency-safety reasons; "Open questions" #16 flags that co-op crimes run as one global job rather than one per state; "Open questions" #18 flags the biggest judgment call yet at the time — the brief never actually says what sends a player to the hospital, so Phase 9 made it the free path's second stage after death rather than something combat causes directly; "Open questions" #20 flags that blackjack is auto-played with no hit/stand decisions, since real player-decided blackjack would need a new kind of session state nothing else here uses; "Open questions" #22-23 flag that gangs only let the Boss administer anything and can only claim neutral territory, never capture it from another gang; and "Open questions" #27 flags the most speculative gap yet — the brief says businesses are "controllable by gangs," and none of that was built, because the brief gives no shape for what gang control would actually mean.
