# Mafia World

A persistent, browser-based, text-driven multiplayer mafia/crime game. See [`GAME_DESIGN.md`](./GAME_DESIGN.md) for the full design spec, [`TODO.md`](./TODO.md) for build status, and [`DEPLOYMENT.md`](./DEPLOYMENT.md) for how to put this live.

This repo is being built in phases with Claude acting as lead developer. **Phases 1–14 are complete**: foundation (auth, health check, dashboard), core player (ranks, states, public profiles), crime (Grand Theft Auto, heat), weapons (guns, armour, bullet calculator), PvP (hunt/search, kill resolution, death/revive, witness statements), police (jail bust-outs), cars (vehicle theft, ownership, melting into bullets), co-op crimes (4-hour team jobs, up to 6 players, flat cash+XP payout), hospital recovery (a shorter second stage after death, with treatment/gambling/small-job activities to pass the time), a casino (dice, slots, roulette, blackjack), gangs (up to 10 at a time, with ranks, a shared treasury, and claimable territory), businesses (8 ownable, upgradeable, income-generating types that can be robbed or seized), an economy/balancing audit that actually computed every system's real numbers via executed simulations rather than eyeballing config values, a minimal admin toolset (look up any player, grant/correct their cash or premium points, clear a stuck status), and a polish pass (shared cross-page navigation, plus a `cash_spent` counter that closes out one of the earlier open questions). See `TODO.md` for the live, detailed status and `GAME_DESIGN.md` for how each system works.

## Stack

- **Frontend:** Next.js (pages router) + React + TypeScript — `web/`
- **Backend:** Node.js + Fastify + TypeScript — `server/`
- **Database:** PostgreSQL — `server/migrations/`

Free hosting target for testing: Vercel (frontend), Render (backend), Supabase (Postgres). See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the guided, step-by-step deployment walkthrough.

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
├── DEPLOYMENT.md       Step-by-step: GitHub → Supabase → Render → Vercel
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

(For a production database instead of a local one, see [`DEPLOYMENT.md`](./DEPLOYMENT.md)'s Supabase steps — same `DATABASE_URL`, pointed somewhere real.)

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

### 4. Make yourself an admin (optional)

There's deliberately no in-app "promote to admin" button (see `GAME_DESIGN.md` section 33 — it's a scope call, not an oversight: a self-service promotion path needs its own bootstrap rule for who can grant the *first* admin, which the brief gives no basis for, so it would just become a privilege-escalation hole). After registering normally, grant yourself admin directly against the database:

```sql
UPDATE users SET is_admin = true WHERE username = 'yourname';
```

Log out and back in (or just refresh — `/me` is re-fetched on load) and an **Admin →** link appears on the dashboard, linking to a page where you can look up any player, grant or correct their cash/premium points, and clear a stuck dead/jail/hospital status. Every admin action is logged to the `admin_actions` table.

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

**Businesses:** 8 ownable types (`/mafia/businesses`) — Nightclub, Restaurant, Casino, Garage, Warehouse, Gun Shop, Chop Shop, Protection Racket — one of each per player, upgradeable through 5 levels, each earning cash continuously from the moment it's bought (collect any time; the longer you wait, the more another player stands to steal). Rob someone else's for a cash/XP/heat payoff with jail risk on failure, or seize one for free once its owner has died — businesses never change hands by force while their owner's alive, only after. Robbing one now gets easier as the robber's own rank rises, same as GTA.

**Economy audit:** Phase 12 didn't add a new system — it actually ran the numbers every other phase's config values imply (a real simulation of GTA's heat over time, Monte Carlo sweeps of all four casino games) instead of eyeballing them. Found and fixed a real outlier (slots' house edge was 32.5% against everything else's 2.7%-25%) and a real gap (business robbery had no reward for the robber's own rank, unlike GTA). Found and deliberately left alone a bigger question — GTA can out-earn even a fully-upgraded, $7.5M Casino by 2-3x per hour — since there's no validated number to retune business income toward yet. Full write-up in `GAME_DESIGN.md` section 31a.

**Admin tools:** a minimal, logged toolset for one privileged tier (`/mafia/admin`, see "4. Make yourself an admin" above) — look up any player's full state, grant or correct their cash/premium points (signed deltas, so a negative amount corrects an over-payment), and clear a stuck dead/jail/hospital status. No self-service admin promotion and no ban/suspend system — both deliberate scope calls, explained in `GAME_DESIGN.md` section 33.

**Polish:** a shared `NavBar` component now sits at the top of every `/mafia/*` subpage, so any system is one click from any other instead of always routing back through the dashboard first; and a new `cash_spent` stat tracks permanent voluntary spending (guns, armour, businesses, gang creation, hospital treatment) separately from `cash_earned`/`cash_lost`, deliberately excluding gang treasury deposits and gambling wagers, neither of which is a real loss. Closes "Open questions" #9. Full write-up in `GAME_DESIGN.md` section 33a.

**Deployment prep:** the repo-side half of Phase 15 — the half that doesn't need an account on anything. Found and fixed a real gap (`CORS_ORIGIN` only ever supported one origin, which would've forced a choice between Vercel's domain and a future custom one — it's comma-separated now), pinned both apps to `engines.node >= 20`, and confirmed the backend was already Render/Supabase-ready from earlier phases (binds `0.0.0.0`, reads its port from the environment, negotiates SSL for a `supabase.co` host automatically). The actual walkthrough — GitHub → Supabase → Render → Vercel, one exact step at a time — is [`DEPLOYMENT.md`](./DEPLOYMENT.md). Full write-up in `GAME_DESIGN.md` section 34a.

Nothing here trusts the client: passwords are hashed with bcrypt, sessions are JWTs verified server-side, every currency/combat operation runs inside a database transaction with row locking, and all player state is read from Postgres on every request.

## Next up

See `TODO.md`. That's Phases 1–14 fully built, plus everything Phase 15 can be from inside this sandbox — which is where this build run ends for now, not because of a design question, but because what's left (creating GitHub/Supabase/Render/Vercel accounts, typing in environment variables, running one command against the live database) genuinely needs to be done by you, from your own machine, with your own accounts. `DEPLOYMENT.md` is written so that's a checklist, not a puzzle. Once it's live — or sooner, if you want changes, new features, or a look at anything below first — just say so and I'll keep going; nothing about "no check-ins" was ever about refusing to pick back up, only about not pausing to ask permission between phases that didn't need it.

Eight things worth your own look whenever you do stop to review: `GAME_DESIGN.md` section 16 and "Open questions" #10 flag a deliberate deviation from the brief in how selling witness information works, for currency-safety reasons; "Open questions" #16 flags that co-op crimes run as one global job rather than one per state; "Open questions" #18 flags the biggest judgment call yet at the time — the brief never actually says what sends a player to the hospital, so Phase 9 made it the free path's second stage after death rather than something combat causes directly; "Open questions" #20 flags that blackjack is auto-played with no hit/stand decisions, since real player-decided blackjack would need a new kind of session state nothing else here uses; "Open questions" #22-23 flag that gangs only let the Boss administer anything and can only claim neutral territory, never capture it from another gang; "Open questions" #27 flags the most speculative gap yet — the brief says businesses are "controllable by gangs," and none of that was built, because the brief gives no shape for what gang control would actually mean; "Open questions" #30 flags Phase 12's own biggest finding — GTA alone can out-earn a maxed-out business by 2-3x per hour, worth a real look once there's actual playtesting data; and "Open questions" #31-32 flag Phase 13's own two scope calls — no self-service admin promotion (direct SQL only, by design) and no ban/suspend system at all (the brief never mentions moderation).
