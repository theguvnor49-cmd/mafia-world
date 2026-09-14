# Mafia World

A persistent, browser-based, text-driven multiplayer mafia/crime game. See [`GAME_DESIGN.md`](./GAME_DESIGN.md) for the full design spec and [`TODO.md`](./TODO.md) for build status.

This repo is being built in phases with Claude acting as lead developer. **Phase 1 (Foundation) is complete**: repo structure, database migrations, authentication (register/login/JWT), a health endpoint, and a minimal dashboard.

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

- `GET /health` — liveness check
- `POST /api/v1/auth/register` — create a character (username, email, password)
- `POST /api/v1/auth/login` — log in with username-or-email + password
- `GET /api/v1/me` — the authenticated player's current state (auth required via `Authorization: Bearer <token>`)
- A minimal dashboard at `/mafia` showing cash, premium points, mafia XP, bullets, heat, state and status (ALIVE/DEAD/JAIL/HOSPITAL, derived server-side from timestamps)

Nothing here trusts the client: passwords are hashed with bcrypt, sessions are JWTs verified server-side, and all player state is read from Postgres on every request.

## Next up

See `TODO.md`. Short version: once you're happy with the foundation, we walk through GitHub → Supabase → Render → Vercel to get this live on free hosting, then move to Phase 2 (full player profile, states, ranks).
