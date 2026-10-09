# Deploying Mafia World

This is Phase 15 (the last phase in the 7–15 run) — Step 8 of the original
brief: GitHub → Supabase (Postgres) → Render (backend) → Vercel (frontend).
It's written as a literal, one-exact-step-at-a-time walkthrough because,
unlike every phase before it, most of these steps are things only you can
do — they need your own accounts, your own email, and in a couple of
places your own payment method, on services I have no access to and no
business signing you up for. I did everything that doesn't require that
(see "What I did vs. what's left to you" at the bottom), and wrote this so
the parts that are left are just "follow these steps," not "figure out
what to do."

**Scope note:** the brief's Step 8 names the free tiers specifically
(Supabase free, Render free, Vercel Hobby) — that's what this walkthrough
sets up. `GAME_DESIGN.md` section 3 already flagged paid hosting and a
`.com` domain as a later upgrade "once the game is worth the cost," so
that's covered as an optional closing section, not folded into the main
walkthrough — nothing here requires you to spend money, and the one place
money *can* come in (a custom domain) is clearly marked and entirely your
call on timing.

A quick note before you start: free-tier limits and dashboard button
labels on all three services change often enough that anything I say about
them could be stale by the time you read this. The architecture and the
order of operations below won't go stale; if a specific screen doesn't
match what I describe, that's the platform having moved a button, not a
sign that something's wrong — the current name should still be easy to
spot.

**What's actually reachable from this sandbox (tested, not guessed):**
I directly tested outbound connections to all four services rather than
assuming. `github.com` and `api.github.com` are both open — so is the
git push protocol itself. `supabase.com`, `render.com`, and `vercel.com`
are all hard-blocked at the network level — the proxy this sandbox sits
behind refuses the connection outright and says why: "organization
policy." That's not a credentials gap or an account I'm missing; it's a
network rule on this whole sandbox, so no API token for those three would
change the answer. GitHub being open changes Step 1 below — there's now a
faster option than pushing from your own machine.

## The shape of it

Three services, each hosting one piece, wired together with environment
variables:

- **Supabase** hosts the Postgres database. Nothing else runs here.
- **Render** runs `server/` (the Fastify API) as a web service, talking to
  the Supabase database over `DATABASE_URL`.
- **Vercel** runs `web/` (the Next.js frontend) as a static/serverless
  site, talking to the Render API over `NEXT_PUBLIC_API_URL`.
- **GitHub** holds the code. Render and Vercel both deploy by watching a
  GitHub repo — push to `master`, they rebuild automatically.

Order matters a bit: GitHub first (Render/Vercel both need a repo to point
at), then Supabase (Render needs its connection string before it can boot),
then Render, then Vercel, then one last loop back to Render to tell it
Vercel's real URL.

## Step 1 — Push this repo to GitHub

Two ways to do this. Either gets the same result — the only difference is
who runs the `git push`.

**Option A — give me a token and I push it (faster).** This session's own
GitHub access only reaches repositories already connected to it, and none
is, but `github.com` itself is reachable from here, so a repo-scoped token
works around that cleanly:

1. On GitHub, create a new, empty repository (no README/.gitignore — this
   repo already has both). Call it `mafia-world` or whatever you like.
2. github.com → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token. Scope it to just that one
   repository, permission "Contents: Read and write," and a short
   expiry (a week is plenty — this is a one-time push).
3. Paste the token here, in chat, along with the repo's URL. I'll add it
   as a remote and push everything — all 15 phases of commit history —
   right away, then tell you to go delete/let the token expire.

**Option B — push it yourself.** From your own machine (or Codespaces, or
anywhere with git and your own GitHub login):

1. Create a new, empty repository on GitHub, same as above.
2. Get a copy of this repo with its full commit history — not one of the
   zips I've been sending after each phase, which are `git archive`
   snapshots and don't include the `.git` history. Ask me and I'll get you
   the real thing (a bundle file or equivalent) if you don't already have
   one.
3. `git remote add origin <the URL GitHub gives you>`
4. `git push -u origin master`

From here on, Render and Vercel will both watch this GitHub repo directly.

## Step 2 — Supabase (Postgres)

1. Sign up at supabase.com and create a new project. Pick any region close
   to where most players will be; it's not changeable later without
   migrating.
2. Supabase will ask you to set a database password — save it somewhere,
   you'll need it in the connection string.
3. Once the project's done provisioning, find its connection string
   (Project Settings → Database → Connection string, "URI" format). It
   looks like `postgres://postgres:[password]@[project-ref].supabase.co:5432/postgres`
   — fill in the password you set. This whole string is `DATABASE_URL`.
4. Run the migrations against it once, from a machine with Node installed
   (your own, since this sandbox's own `npm install` is blocked by its
   network policy — see `GAME_DESIGN.md` "Open questions" #6):
   ```
   git clone <your repo>
   cd mafia-world/server
   npm install
   echo 'DATABASE_URL=<the connection string from step 3>' > .env
   echo 'JWT_SECRET=<any random 32+ char string>' >> .env
   echo 'TICK_SECRET=<any other random 32+ char string>' >> .env
   npm run migrate
   ```
   You should see all 15 migrations print `apply` and end with "Migrations
   complete." `npm run migrate` is safe to re-run any time — it skips
   whatever's already applied (see the comment at the top of
   `server/scripts/migrate.ts`), so this is also exactly what you'll run
   after a future phase adds a 16th migration.
5. **Know this going in:** Supabase's free tier pauses a project after a
   stretch of no activity (commonly cited as 7 days — confirm the current
   figure on their own pricing page, it's the kind of number they tune).
   A paused project needs one manual "restore"/"resume" click in the
   Supabase dashboard before the game will work again — it's not a bug on
   your end if the site suddenly can't reach the database after a quiet
   week.

## Step 3 — Render (backend)

1. Sign up at render.com and connect your GitHub account, authorizing it
   to see the repo from Step 1.
2. New → Web Service → pick this repo.
3. Settings that matter (names vary slightly by when you're reading this,
   but these concepts will all be on the creation form):
   - **Root directory:** `server` — this is a monorepo with `server/` and
     `web/` side by side, and this is what tells Render which half to
     build.
   - **Runtime:** Node.
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Instance type:** Free, for testing.
4. Environment variables (Render's dashboard has a section for these —
   add each as a separate key/value, never commit them to the repo):
   - `DATABASE_URL` — the Supabase connection string from Step 2.
   - `JWT_SECRET` — same value you put in your local `.env` in Step 2 (or
     a fresh one — just make sure it's the one you intend to keep; changing
     it later logs every player out, since it invalidates every existing
     token).
   - `TICK_SECRET` — same idea as `JWT_SECRET`.
   - `NODE_ENV` — `production`.
   - `CORS_ORIGIN` — leave this as `http://localhost:3000` for now; you'll
     come back and set the real value in Step 5, once Vercel hands you a
     real URL. (It now accepts a comma-separated list — see
     `server/.env.example` — specifically so you can list both Vercel's
     own domain and a custom domain at once, once you have one.)
   - **Don't set `PORT`.** Render assigns it and injects it automatically;
     the server already reads it from the environment
     (`server/src/config.ts`) rather than assuming 4000, and setting it
     yourself would fight with Render's own assignment.
5. Deploy. Once it's up, Render gives you a URL like
   `https://mafia-world-api.onrender.com`. Visit `<that URL>/health` — you
   should get back `{"ok":true,"data":{"status":"up",...}}`. That's the
   `/health` route in `server/src/index.ts`, built for exactly this check.
6. **Know this going in:** Render's free web services spin down after a
   quiet period and take a few seconds to wake back up on the next
   request — so the first request after any lull will feel slow, not
   broken. Confirm the current exact behavior on Render's own pricing
   page; it's changed more than once.

## Step 4 — Vercel (frontend)

1. Sign up at vercel.com and connect the same GitHub account.
2. New Project → pick the repo.
3. **Root directory:** `web` — same monorepo reasoning as Render. Vercel
   should auto-detect Next.js once you point it at that folder.
4. Environment variable:
   - `NEXT_PUBLIC_API_URL` — the Render URL from Step 3 (no trailing
     slash), e.g. `https://mafia-world-api.onrender.com`.
5. Deploy. Vercel gives you a URL like `https://mafia-world.vercel.app`.

## Step 5 — Close the loop

Go back to Render, edit the `CORS_ORIGIN` environment variable to the real
Vercel URL from Step 4 (e.g. `https://mafia-world.vercel.app`), and let it
redeploy. Until this step, the frontend can load but every API call will
fail a CORS check — the backend is still only trusting
`http://localhost:3000`.

## Step 6 — Smoke test

Open the Vercel URL and actually play a little: register an account, run
a crime, check the dashboard. If something fails, the browser's network
tab (or Render's own logs tab) will usually show which of the three
services is the one not talking to the others — most first-deploy issues
are one of: `NEXT_PUBLIC_API_URL` pointing at the wrong place,
`CORS_ORIGIN` not yet updated (Step 5), or the migrations not having been
run yet (Step 2.4) so the database has no tables.

## Optional, later: a custom domain

Not part of this phase's brief-mandated scope, and not required for any
of the above to work — `mafia-world.vercel.app` is a complete, working
production URL on its own. If and when you decide the game's worth paying
for a `.com`:

- Buy the domain from any registrar (Namecheap, Google Domains' successor,
  whichever).
- Point it at Vercel: add it under the Vercel project's "Domains" setting,
  then add the DNS records Vercel shows you at your registrar. Vercel's
  own domains docs walk through this and are worth reading fresh at the
  time, since the exact DNS record types they recommend have shifted
  before.
- Add the new domain to Render's `CORS_ORIGIN` alongside the `.vercel.app`
  one (comma-separated, per Step 3) rather than replacing it — keeping
  both means the Vercel-assigned URL keeps working as a fallback.

## What I did vs. what's left to you

I made the repo itself deployment-ready and verified everything I could
verify from inside this sandbox:

- Checked the backend already binds to `0.0.0.0` and reads its port from
  `env.PORT` rather than assuming one (`server/src/index.ts`) — required
  for Render, already true going back to Phase 1.
- Checked the database layer already negotiates SSL automatically for a
  `supabase.co` host (`server/src/db.ts`) — already true going back to
  whichever earlier phase added it.
- Found and fixed a real gap: `CORS_ORIGIN` only ever supported one
  origin, which would have forced a choice between the Vercel domain and
  a future custom domain. `server/src/config.ts` now splits it on commas
  into `CORS_ORIGINS`, verified with an executed test of the parsing logic
  (trims whitespace, drops empty entries, falls back cleanly to a single
  origin) — not just read through by eye.
- Added an explicit `engines.node` to both `package.json` files (pinned to
  `>=20.0.0`, matching what Next.js 14 actually requires) so Render and
  Vercel both build with a Node version this code has actually been
  checked against, rather than whatever each platform defaults to.
- Confirmed `server/scripts/migrate.ts` is already idempotent and safe to
  run against a fresh Supabase database (it tracks applied migrations in
  its own `schema_migrations` table, which is also how I've been
  confirming migration counts throughout this project).
- Re-ran this project's full verification suite (every backend file
  touched this phase through `node --experimental-strip-types --check`)
  after these changes, same as every phase before this one.
- Tested outbound network access from this sandbox directly, rather than
  assuming: `registry.npmjs.org` still fails outright at DNS resolution
  (confirming "Open questions" #6 is still accurate), `github.com` and
  `api.github.com` are both fully reachable, and `supabase.com`,
  `render.com`, and `vercel.com` are all refused at the network level with
  an explicit "organization policy" response. That last part is why
  Step 1 above now offers a token-based option — GitHub being open is a
  real opening; the other three being closed is a real wall, confirmed,
  not a guess, and not something any token changes.

What's left is everything that happens on a dashboard I have no account
on: creating the GitHub repo (or handing me a scoped token so I create
and push to it instead — Step 1's Option A), signing up for Supabase,
Render, and Vercel, and typing in the environment variables each one
needs. None of that is a design decision — there's nothing to decide,
it's just account creation and following the steps above — which is why
this is being handed to you as a runbook rather than a question.
