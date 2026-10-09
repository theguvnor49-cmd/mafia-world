# Mafia World — Game Design Document

Living design doc. This is the source of truth for game mechanics — if a new
feature would conflict with something written here, that gets flagged and
discussed before changing it. Update this file as each phase is built.

**Status:** Phases 1–9 complete. See `TODO.md` for what's built vs. designed-only.

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

`GET /api/v1/ranks` (new in Phase 4) exposes this whole table publicly so
the bullet calculator's frontend can offer a target-rank dropdown without
hardcoding the numbers twice.

## 10. Guns (implemented — `guns` table, `GET/POST /api/v1/mafia/weapons/guns...`)

| Gun | Bullet multiplier | Price (placeholder) |
|-----|--------------------|----------------------|
| Pocket Pistol | 1.10x | $2,000 |
| 9mm | 1.00x | $6,000 |
| SMG | 0.88x | $18,000 |
| Assault Rifle | 0.78x | $45,000 |
| Sniper Rifle | 0.70x | $100,000 |

Lower multiplier = fewer bullets needed to kill. `users.equipped_gun` is now
a real foreign key into `guns(name)` (it was free text since Phase 1,
specifically so this could happen without touching the column). **Prices
aren't in the brief** — the table above is an MVP placeholder, roughly
scaled so better guns cost more; trivially changed with an `UPDATE`.

No gun currently has a rank requirement (the brief says each gun *may*
optionally have one, but gives no actual values) — all 5 are purchasable
from Rookie onward. Buying a gun immediately equips it; there's no
locker/inventory, so previously-owned guns aren't kept around to switch
back to for free. Doesn't require being ALIVE — it's a pure cash
transaction, unlike crimes.

## 11. Armour (implemented — `armour` table, `GET/POST /api/v1/mafia/weapons/armour...`)

| Armour | Bonus bullets | Multiplier | Price (placeholder) |
|--------|---------------|------------|----------------------|
| Light Vest | +40 | 1.10x | $4,000 |
| Kevlar Kit | +90 | 1.20x | $15,000 |
| Heavy Plates | +160 | 1.35x | $45,000 |

Armour belongs to the defender and increases the bullets needed to kill
them. Same FK/price/buy-equips-immediately notes as guns, above. Later:
durability, damage reduction, repair, armour classes.

## 12. Bullet calculator (implemented — `mafia/bulletCalculator.ts`, `GET /api/v1/mafia/weapons/calculator`)

```
gunApplied = targetRankBaseBullets × gunMultiplier
withArmor  = gunApplied + armourBonusBullets
final      = withArmor × armourMultiplier
result     = max(25, round(final))
```

`25` is from the brief directly, not a placeholder. `calculateBulletsToKill`
is pure and catalog-agnostic — it takes plain numbers, not a player/gun/
armour row — specifically so Phase 5's real kill resolution can call the
exact same function instead of a second implementation that could drift
from this one. The server calculates the real number; the Phase 4
calculator endpoint is informational only and doesn't look up any real
player — it answers "what if," for a hypothetical gun/armour/rank
combination, never "what would it take to kill `<username>`." Combat
itself (and any calculator grounded in a real target) is never
client-authoritative and isn't built until Phase 5.

## 13. Hunt / search (implemented — `hunts` table, `POST/GET /api/v1/mafia/search/...`)

A player can't attack instantly — they search first. Search takes 4 hours,
server-timestamp-based (`started_at`/`completes_at`, never `setTimeout`).
One active hunt per hunter at a time, enforced by a **unique partial
index** (`006_pvp.sql`), not just an app-level check — two concurrent
"start a search" calls from the same hunter can't both land.

On completion the target's state *at that moment* is revealed — but there's
no scheduler to snapshot it exactly at the 4-hour mark (section 30: never a
running process), so `hunts.target_state` stays NULL until the first read
after `completes_at` has passed (`GET .../search/status`, or the kill
attempt itself if that happens first), at which point it's captured once
and frozen forever, the same lazy-evaluation pattern as heat decay. The
attacker must reach that state, and the target must *still* be there when
the kill is attempted — if the target moves, the hunt fails and is consumed
(must be redone).

**Travel doesn't exist yet** (section 8/original brief section 9 calls it
an "eventually" feature, architecture just has to allow it cleanly) — so
today, almost every player is still sitting in their registration-default
state, which makes the location-matching checks below practically a no-op
for most games. Not a bug: the checks are real and ready for when travel
ships.

## 14. Kill resolution (implemented — `POST /api/v1/mafia/kill`)

Requires, in order: attacker alive → target exists and is alive → search
completed → attacker in the discovered state → target still in that state
→ attacker has a gun equipped → bullets required calculated server-side
(via `mafia/bulletCalculator.ts` — the exact same function the Phase 4
calculator uses) → attacker has enough bullets → bullets deducted
atomically → target set DEAD 24h → witnesses generated → combat event
logged (`kills` table) → search consumed. All inside one DB transaction.

Both players' rows are locked with `SELECT ... FOR UPDATE`, **in
sorted-id order** rather than attacker-then-target — if two players attack
each other at the same moment, locking in a consistent order is what
prevents them from deadlocking each other (brief section 54's "lock
attacker / lock target" doesn't mention this, but it's necessary once you
have two arbitrary rows being locked from two different directions).

A kill increments both `bullets_fired` and `bullets_spent` by the same
amount — there's no "missed shots" mechanic yet to tell them apart.

## 15. Death & revive (implemented — `POST /api/v1/mafia/revive`)

Death lasts 24 hours (`dead_until = now() + 24h`). Revive costs **50
premium points** (from the brief directly) and brings the player back
immediately, skipping both death *and* the hospital recovery stage below
(`dead_until` set to `NULL`, `hospital_until` never touched since it was
never set). Real-money purchases are out of scope for now; for testing,
points are simply granted/admin-controlled. Dashboard shows a banner with
a link to `/mafia/revive` while dead.

As of Phase 9, the *free* path out of death is different: if nobody pays
to revive early, the 24-hour timer no longer falls straight through to
ALIVE — it now lands in a shorter HOSPITAL recovery window first (see
section 22). Premium-point revive is unaffected by this and still means
"skip everything, right now."

## 16. Witness system (implemented — `witness_statements` table, `GET /api/v1/mafia/witness/me`, `POST .../sell`, `POST .../:id/buy`)

On a kill, up to `PVP.MAX_WITNESSES` (3) random *online* players witness
it — selected via `mafia/pvp/witnesses.ts`'s `pickWitnesses()`, a pure,
unit-tested sampling function. "Online" means `last_seen` within
`PVP.ONLINE_WINDOW_SECONDS` (5 minutes, MVP placeholder — the brief never
defines it numerically); `requireAuth` now bumps `last_seen` on every
authenticated request (debounced to once a minute) so that threshold means
something, instead of only updating at login as before Phase 5.

**Deliberate, safety-motivated deviation from the brief's literal single
`witness/sell` endpoint**, flagged here because it's a real design choice,
not just a numeric placeholder: a witness calling `sell` only *lists*
their statement at an asking price — it never charges a specific named
buyer directly. Actually moving cash requires a second endpoint
(`POST .../witness/:id/buy`) that the **buyer** calls themselves. Reasoning:
the brief gives no consent/escrow mechanism for the seller's action, and
letting one player's unilateral action debit another named player's
balance — with that target chosen from data as simple as a username —
would be a real currency-fairness hole (brief section 28's "never trust...
prevent forged/fake" principle), not just an MVP shortcut. The brief's own
"[SELL INFORMATION]" UI moment and "players should eventually be able to
negotiate prices" read naturally as the actual trade being arranged
out-of-band (chat, Discord, in person) with this API just settling it —
which this two-step design still supports. There's deliberately no
marketplace/browse-listings endpoint either — the brief says "witnesses
should NOT necessarily expose the information publicly," so a buyer has to
already know the statement's ID (told to them directly by the witness).
Double-sale is prevented by locking the statement row before checking
`sold` (brief section 53's explicit test scenario).

## 17. Crimes (implemented — `POST /api/v1/mafia/crime/gta`)

Grand Theft Auto, exactly as specified: 10 minute cooldown, success chance
`0.78 − heat×0.004 + rank×0.01` clamped 20–90%, success $18,000–$75,000 +
rank bonus / 20–60 XP + rank bonus / +6–14 heat, failure 6–18 XP / +10–22
heat / 60–120s jail. Rank-bonus multipliers ($2,000/XP 2 per rank level)
aren't specified in the brief — MVP placeholders, in `mafia/config.ts`.

**Tested finding, not a bug:** with realistic inputs (heat 0–100, rank
0–9) the formula's ceiling is 0.78 + 9×0.01 = **0.87**, never the full 0.90
cap — see `getGtaSuccessChance` and its test. The 90% clamp is a safety
backstop, not currently reachable through rank/heat alone. Worth knowing
before tuning rather than assuming 90% is achievable today.

Fully transactional: the route locks the player's row (`SELECT ... FOR
UPDATE`) for the duration, checks status (must be ALIVE) and cooldown,
resolves the attempt via a pure function (`mafia/crimes/gta.ts`, unit
tested — see below), then atomically updates cash/XP/heat/cooldown/jail
and the relevant statistics counters and inserts one row into the new
`crimes` log table — all in one DB transaction, so two concurrent attempts
by the same player can't both land. `GET /api/v1/mafia/crime/gta/status`
exposes cooldown + status + effective heat for the frontend countdown.

**Simplification:** `jail_seconds_served` is credited with the *full*
sentence at the moment of sentencing, not accrued over the time actually
served. Now that Phase 6 bust-outs exist and can shorten a sentence, this
stays as-is deliberately — a successful bust clears `jail_until` without
reducing `jail_seconds_served`, so the statistic means "time sentenced,"
not "time actually spent behind bars." The brief doesn't specify either
way; this was the simpler of the two readings and avoids a second write to
the same counter from a different route file.

## 18. Heat (implemented — `mafia/heat.ts`)

0–100, decays continuously from a timestamp (`heat_updated_at`) rather
than via any running process — `computeEffectiveHeat()` is a pure
function of elapsed real time, matching the "never build around
setInterval" rule (section 30). Decay rate (~1 point per 3 minutes) is an
MVP placeholder, not specified in the brief.

## 19. Vehicles & melting (implemented — `vehicles`/`user_vehicles` tables, `GET /api/v1/mafia/cars`, `POST .../cars/:id/sell|melt`)

15 vehicles, 3 per rarity tier (Common/Uncommon/Rare/Epic/Legendary),
seeded in `008_vehicles.sql` with the brief's own fields: rarity, value,
theft difficulty, bullet-melting value, resale value. `theft_difficulty`
(1-100) doubles as the inverse weight for which vehicle drops — a Common
car (low difficulty) comes up far more often than a Legendary one (high
difficulty). Ownership is per-instance (`user_vehicles`, one row per owned
car), not a count, since cars are later disposed of individually.

On a **successful** GTA (brief: "a successful GTA can randomly produce a
vehicle" — tied to success only, never a failure consolation prize),
`routes/crimes.ts` rolls a separate, independent chance
(`CARS.DROP_CHANCE_ON_SUCCESS`, 20%, MVP placeholder — the brief never
gives a rate) inside the same transaction as the rest of the crime's
rewards. If it hits, `mafia/vehicles/drop.ts`'s `pickVehicleDrop()` — pure,
weighted-random, mirroring `pickWitnesses()`'s style — chooses which of the
15 vehicles, a `user_vehicles` row is inserted, `cars_stolen` increments,
and the existing `crimes` log row records which vehicle (a new nullable
`vehicle_dropped` column on that table, since a drop is an attribute of
the crime event, not a separate kind of event).

`GET /api/v1/mafia/cars` is the public catalog (mirrors `weapons/guns`);
`GET .../cars/mine` lists what you own; `POST .../cars/:id/sell` pays
`resale_value` in cash and removes the car; `POST .../cars/:id/melt` grants
`bullet_melt_value` bullets, increments `cars_melted`, and removes the car.
Neither requires being ALIVE — same reasoning as gun/armour purchases
(Phase 4): pure inventory/cash transactions, not criminal activity. Both
lock only the acting user's own two rows (the owned-car row, scoped by
`WHERE id = $1 AND user_id = $2`, and the user's own row) — no cross-player
locking needed here, unlike kill/bust, since nobody else's row is ever
touched; the ownership-scoping predicate was specifically dry-run tested
to confirm a different user's query can't see or lock someone else's car.

**Balancing the resource loop ("bullets cannot become infinite too
easily"):** the actual scarcity comes from composing three things that
already exist rather than a special-cased limiter — GTA's own 10-minute
cooldown bounds how often a drop can even be rolled for, the 20%
drop-on-success chance means most successes grant no car at all, and
melting *consumes* the specific owned car instance (no re-melting the same
car, no infinite loop on one drop). Bullet income from melting is bounded
by the same cooldown that already bounds cash/XP income from crime — not a
faster parallel printing press.

**MVP simplifications flagged:**
- `resale_value` is a flat 60% markdown of `value` for every vehicle — the
  brief lists both fields but gives no ratio between them; selling stolen
  goods to a fence for less than full value is the more realistic reading.
- "Cars can eventually be... Used" (brief section 21) has no concrete
  mechanic anywhere in the brief beyond ownership itself — left
  unimplemented, same "eventually" treatment as armour's undefined
  durability/repair (section 11).
- No dedicated sell/melt history log, unlike busts (the brief never says
  "all sales/melts should be logged" the way it explicitly does for
  busts) — the `cars_stolen`/`cars_melted` running counters (existed since
  Phase 2) are what persists once a specific car's row is gone.

## 20. Police / jail / bust-outs (implemented — `busts` table, `POST /api/v1/mafia/jail/bust`)

Jail itself (`jail_until`, 60–120s on a failed GTA, `jail_seconds_served` /
`times_arrested` tracked) was actually already built in Phase 3 as part of
crime failure — `deriveStatus()` has returned `JAIL` from day one and
`jail_seconds_served`/`times_arrested`/`successful_busts`/`failed_busts`
have existed as columns since Phase 2's statistics migration. What Phase 6
adds is the bust-out *action* itself.

`POST /api/v1/mafia/jail/bust` takes `{ targetUsername }` (the prisoner) and
checks, in order: prisoner exists, buster isn't busting themselves, buster
is ALIVE, prisoner is actually in `JAIL` status right now, and both share a
state. Both rows are locked in the same sorted-id order as the kill
transaction (`pvp.ts`) — not because a bust can realistically deadlock
against anything (a jailed prisoner can't act, and self-busts are
rejected before locking), but to keep every multi-row transaction in this
codebase following one pattern.

`mafia/jail/bust.ts` is the pure logic, mirroring `crimes/gta.ts`:

- `getBustSuccessChance(priorSuccessfulBusts, priorFailedBusts)` — 25% base,
  +2% per the *buster's own* prior successful bust, −1% per their prior
  failed bust, clamped 15–80%. Every number here is straight from the
  brief — no MVP placeholder needed, unlike GTA's rank bonuses.
- `getBustReward(priorSuccessfulBusts)` — $25,000 + $4,000 per the buster's
  prior successful bust. Paid only on success.
- `resolveBust(...)` combines both with a single injectable `roll` for
  deterministic testing.

On success: prisoner's `jail_until` is cleared (freed immediately, however
much time was left — the brief doesn't say to pro-rate or partially reduce
it), buster's `cash`/`cash_earned` increase by the reward and
`successful_busts` increments. On failure: only the buster's `failed_busts`
increments, no cash moves either direction, and the prisoner stays jailed.
Every attempt — success or failure — is logged to a new `busts` table
(buster, prisoner, success, cash_reward, state, timestamp), per the brief's
"All busts should be logged."

Frontend: `/mafia/bust` — enter a username, attempt a bust, see the result
in a local activity log (no odds preview, matching how `/mafia/crimes`
doesn't preview GTA's success chance either). Shows the buster's own
successful/failed bust counts and times-arrested so their changing odds are
visible over time. The dashboard gained a jail banner — "🚔 IN JAIL — Time
remaining: mm:ss" with a live client-side countdown — matching the brief's
own section 24 mockup; it's purely cosmetic display, re-synced from
`/api/v1/me`'s real `jailUntil` timestamp whenever it ticks to zero, the
same not-authoritative-timer pattern already used for GTA's cooldown and
hunt's search countdown. The public profile page and `/api/v1/me` both
already returned `successfulBusts`/`failedBusts`/`jailSecondsServed` since
Phase 2/5; `timesArrested` was missing from the *public* profile response
specifically (brief section 26 lists it alongside the other three as
profile-displayable) — added in this phase.

## 21. Co-op crimes (implemented)

Every 4 hours, up to 6 players team up on a single, much bigger job than
any solo crime pays — the brief's own worked example: a "CO-OP HEIST" for
$250,000 + bonus Mafia XP. `GET /api/v1/mafia/coop/status` (auth) shows
the currently running job — its state, time remaining, reward, and roster
— and `POST /api/v1/mafia/coop/join` (auth, optional `role`) joins you
into it. Roles are the brief's own example list (Driver, Gunman, Hacker,
Lookout, Muscle, Boss) and are flavor-only: picking one has no mechanical
effect beyond "at most one of each role per job," enforced by a database
`UNIQUE` constraint, not application logic.

There's no running scheduler process (same constraint as heat decay and
hunt reveal, sections 14/20) — a co-op job's *creation* and its
*resolution* are both lazy, happening the first time anyone reads co-op
status, tries to join, or `/internal/tick` is called, after the relevant
deadline has passed. A one-row `scheduler_state` singleton table tracks
when the next job is due; every creation check locks that row with
`SELECT ... FOR UPDATE` so two concurrent requests racing to notice a job
is due can't both create one — the same row-locking principle used for
per-player currency everywhere else in this codebase, just applied to a
single global row instead of a per-player one. Resolution uses a similar
trick: a conditional `UPDATE coop_jobs SET resolved_at = now() WHERE
resolved_at IS NULL` acts as an atomic claim, so if two requests both
notice the same job is overdue, only one of them actually pays anybody.

When a job closes, every participant still on the roster is paid the
job's full `reward_cash` ($250,000) / `reward_xp` (300) — no success or
failure roll, no split pool (see "Open questions" #16). Joining requires
being ALIVE and physically in the job's state — a real check, though
close to a no-op today since travel doesn't exist yet (same caveat as
PvP's and jail's own state-matching). The join endpoint also enforces,
via database `UNIQUE` constraints rather than just application code, that
nobody joins the same job twice and nobody doubles up on a role.

**Simplifications worth flagging** (also "Open questions" #16-17): one
global job at a time rather than one per state; a flat full reward per
participant rather than a shared/split pool; no success/failure roll; no
minimum player count (a lone participant still gets paid in full); no
leave-job endpoint; and the one-time "you got paid!" notice on the status
endpoint can be missed if your read isn't the specific one that happens
to trigger resolution — though the payout itself is always correct and
already reflected in your cash/XP regardless of whether you saw the
notice.

## 22. Hospital (implemented)

**The one real design decision this phase needed, flagged prominently
because it isn't a numeric placeholder like the others below:** the
brief names hospital as one of the game's statuses and describes its
recovery UX ("recovery percentage shown, small recovery activities...
rather than a forced wait screen") but never actually says what *sends* a
player there. `hospital_until` has existed on `users` since
`001_users.sql`, flagged there as "set by future combat/events" — this
phase had to decide what that means. Two readings were considered: (a)
combat causes it directly — e.g. an attack that doesn't have enough
bullets to kill wounds instead of being rejected outright — or (b) it's
the free path's *second stage* after death. (a) would mean changing
Phase 5's already-shipped, already-verified kill transaction's
`NOT_ENOUGH_BULLETS` rejection into a new probabilistic branch, which is
real surgery on code that's been working and tested since Phase 5 for no
stated requirement. (b) is purely additive. **(b) is what's built:**
dying and *not* paying to revive early no longer falls straight through
to ALIVE after 24 hours — it now lands in a shorter HOSPITAL window
first. Revisit if real play reveals the brief meant (a) instead.

Mechanically: `GET /api/v1/mafia/hospital/status` (auth) returns whether
you're currently hospitalized, the countdown, and a 0-100 recovery
percentage (computed straight from *remaining* time against the fixed
`HOSPITAL.RECOVERY_HOURS` config constant — `100 - secondsRemaining /
totalSeconds * 100` — so it needs no extra "when did this start" column
and stays correct no matter how many times treatment below has already
shortened the stay). Three active recovery activities, all requiring
HOSPITAL status:

- **`POST .../hospital/treat`** — "medical treatment." Spends **cash**
  (not premium points — a deliberate contrast with revive, so the two
  currencies keep distinct jobs: premium points skip the big timer
  entirely, cash only shortens the smaller one) to knock a fixed amount
  off the remaining time, clamped so it can never go earlier than *now*
  (a near-finished stay just finishes, it doesn't somehow owe you time
  back). Repeatable for as long as it's affordable.
- **`POST .../hospital/gamble`** — "limited gambling." An honest 50/50
  double-or-nothing coin flip on a player-chosen bet, capped per bet
  (`HOSPITAL.GAMBLE_MIN_BET`/`MAX_BET`) — the brief's own gambling
  safety principle from section 23 ("never unlimited-money") applied
  here even though that section is about the later, full Gambling phase.
  No house edge, no streak mechanics — the simplest thing that's
  honestly "gambling." This finally gives the `cash_lost` statistic (see
  section 26) something to actually record: a lost bet is cash that left
  the balance with nothing received in return, which is exactly what
  that counter was always meant to mean, as opposed to a voluntary
  purchase (gun, armour, car) where something of value comes back.
- **`POST .../hospital/job`** — "small jobs." A scaled-down crime usable
  only while hospitalized (normal GTA requires ALIVE) — fixed, small
  cash + XP reward, always succeeds, no heat or jail risk, short
  cooldown (`HOSPITAL.SMALL_JOB_COOLDOWN_SECONDS`). Deliberately has none
  of GTA's stakes; it's filler for hospital downtime, not a heist.

"Rest," the brief's fourth named activity, needed no endpoint — it's
simply doing nothing while the status timer above counts down on its
own, same as every other timer in this game.

**No running scheduler needed here, unlike co-op's pattern** — this
system doesn't create or resolve anything on a schedule, so there's
nothing to lazily settle *except* the transition into hospital itself.
That one transition (`mafia/hospital/settle.ts`'s `settleDeathIntoHospital`)
runs automatically on every authenticated request, from inside
`requireAuth` (`auth.ts` — see section 6) — not from each individual route — so by
the time any protected handler reads a player's own status, their
dead-to-hospital transition has already happened if it was due. The one
place that *also* needs it explicitly is `POST /api/v1/mafia/kill`: an
attacker's own transition is already covered by `requireAuth`, but their
*target* isn't the one making the request, so `routes/pvp.ts` calls the
same settle function directly on the target's locked row before checking
whether they're still attackable — otherwise a target whose death just
expired, who hasn't themselves made an authenticated request yet, could
be read as still fully ALIVE instead of HOSPITAL, and get attacked again
during that gap.

**Simplifications and placeholders worth flagging** (also "Open
questions"): every number here (`RECOVERY_HOURS` 2, `TREATMENT_COST`
$10,000, `TREATMENT_REDUCTION_SECONDS` 30 min, `GAMBLE_MIN_BET`/`MAX_BET`
$500-$5,000, `SMALL_JOB_CASH_REWARD`/`XP_REWARD` $2,000/10,
`SMALL_JOB_COOLDOWN_SECONDS` 5 min) is an MVP placeholder — the brief
gives none of them. A public profile view (`GET /players/:username`,
unauthenticated) can show a stale DEAD status past its real expiry until
that specific player makes their own next authenticated request, since
nothing unauthenticated triggers the settle — the same category of
lazy-evaluation lag already accepted for heat decay and hunt reveal, just
newly visible on a read-only page that happens to also have a write-based
transition behind it. `hospital_activities` logs every treat/gamble/job
action (per-event detail); the running `cash_earned`/`cash_lost`/
`mafia_xp` counters on `users` are what persists in aggregate, same
division of labor as `busts`/`crimes` logging their own systems.

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
as columns on `users`, added ahead of need in `003_player_stats.sql`. As
of Phase 7, every one of them was actually populated by some gameplay
system except `cash_lost` — nothing in the game yet caused a cash loss
with nothing received in return (no player-vs-player robbery exists yet;
kills/busts/crimes don't move cash out of a victim's balance), so it
always read 0. As of Phase 9, a lost hospital gamble (section 22) finally
populates it — the first and so far only system that takes cash away for
nothing, which is exactly the distinction "Open questions" #9 draws
between this counter and ordinary voluntary spending. **Simplification:**
this is denormalized counters, not a full event-log table. Revisit as a
real event log once the activity feed (section 44) needs per-event detail
rather than just totals.

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

## 30. Scheduler / game tick (implemented)

Free-tier backends can sleep, so nothing important relies on in-memory
timers (`setTimeout`) — every timer that matters is a database timestamp
(`dead_until`, `jail_until`, `hospital_until`, `gta_next_at`,
`scheduler_state.next_coop_job_at`, `coop_jobs.closes_at`, hunt
`completes_at`, heat's `heat_updated_at`, etc.), and every system reads
and corrects for elapsed time lazily, on whatever request happens to come
in next — nothing anywhere depends on being "woken up" to behave
correctly.

`POST /internal/tick`, guarded by an `X-Tick-Secret` header checked
against `TICK_SECRET` with a timing-safe comparison
(`crypto.timingSafeEqual`), exists anyway, because the brief explicitly
asks for something an external scheduler can ping to keep a sleeping
free-tier backend's lazy systems fresher than "whenever a player happens
to look." Calling it just runs the same creation/resolution logic
`GET /api/v1/mafia/coop/status` already runs on every read — it's
deliberately **not a correctness dependency**: every lazy-evaluated
system in this game (heat decay, hunt reveal, and now co-op jobs)
self-heals on its own next real read whether or not this endpoint is
ever called. Right now it only has co-op work to do — heat decay needs no
active step, since it's a pure function of elapsed time with nothing to
"catch up." Future phases that add their own due-events (factory
production, for one) will plug into this same endpoint rather than
inventing a second one.

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
7. Cars (implemented) 8. Co-op (implemented) 9. Hospital (implemented) 10. Gambling/Gangs 11. Businesses/factories
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
   `pypi.org` outright — confirmed twice, in two sessions a few weeks apart
   (once an explicit "host not allowed"/"organization policy" denial, once
   outright DNS failure); an internal Anthropic mirror exists but needs
   credentials this session doesn't have. So `npm install` has never been
   run here, and vitest (added in Phase 3) has never actually executed.
   What *has* been verified without it, every phase: every migration
   applied directly via `psql` against a real local Postgres 16 and
   produced exactly the intended schema; every backend `.ts` file passes a
   real syntax check (`node --experimental-strip-types --check`); and for
   Phase 3 specifically, the GTA/heat math in `mafia/crimes/gta.ts` and
   `mafia/heat.ts` was *actually executed* (not just syntax-checked) via a
   manually-detyped standalone copy run with plain `node` — 20 assertions,
   all passing, including the 0.87-ceiling finding above. What's still
   unverified: starting the Fastify server and the Next.js app for real and
   exercising the HTTP endpoints end-to-end, and running the vitest suites
   as vitest (not as a standalone script). Do that first via the README's
   "Running it locally" steps (or once deployed to Render/Vercel) and
   report back anything that breaks.
7. **Gun/armour prices.** Not specified anywhere in the brief (which only
   gives combat multipliers/bonuses) — section 10/11 above has the MVP
   placeholders currently seeded in `005_weapons.sql`. Easy to change with
   an `UPDATE`, no code or deploy involved.
8. **No locker/inventory for guns or armour.** Buying immediately equips;
   there's no record of gear you've previously owned to switch back to for
   free. Matches the single `equipped_gun`/`equipped_armour` columns that
   have existed since Phase 1. An inventory table is a reasonably easy
   addition later if a kept locker is wanted instead of buy-equips-ever.
9. **Purchases don't increment `cash_lost`.** That statistic (brief section
   36) reads as being for involuntary losses (robbed, fined, etc.); a gun/
   armour purchase is voluntary spending, so it's left out. There's no
   `cash_spent` counter yet — easy to add if that distinction matters later.
10. **Witness `sell` is two endpoints, not the brief's literal one** (see
    section 16) — a safety call, not a numeric placeholder: the witness
    lists a price, the buyer pays it themselves. Worth a deliberate look
    before relying on it for anything real, since it's the one place this
    project has knowingly built something other than the most literal
    reading of the brief.
11. **"Online" window (5 minutes) for witness selection.** The brief says
    "random online players" but never defines online numerically — see
    `PVP.ONLINE_WINDOW_SECONDS`. `last_seen` is now refreshed on every
    authenticated request (debounced to 1/minute) specifically so this
    threshold means something; before Phase 5 it only updated at login.
12. **No cost or cooldown on starting a search**, beyond the 4-hour search
    itself. Not specified either way in the brief. Starting one does
    require being ALIVE (brief section 16: "cannot perform normal
    activities while dead").
13. **Travel between states still doesn't exist** (see section 13) — the
    hunt/kill location checks are real but close to a no-op today since
    almost nobody can leave their starting state yet. The brief calls
    travel an "eventually" feature by design, so this isn't a gap so much
    as a dependency worth knowing about before judging how PvP actually
    plays.
14. **No cost or cooldown on a bust *attempt* itself** (section 20) — not
    specified in the brief either way, so a buster can retry immediately
    after a failed attempt with no penalty beyond their own worsening
    odds (failed busts make the *next* attempt's chance slightly lower,
    per the formula, but nothing stops attempting again instantly). Same
    treatment as item 12's search-cost gap — flagged, not silently
    assumed away.
15. **Vehicle drop rate (20%) and resale-as-60%-of-value** (section 19) —
    neither is specified in the brief, which only says a successful GTA
    "can randomly produce" a vehicle and lists value/resale as separate
    fields with no ratio. Both are easy to retune (`CARS` in `config.ts`
    for the drop rate, `008_vehicles.sql`'s seed data for resale) once
    there's real playtesting data on how fast bullets accumulate.
16. **Co-op jobs: one global job rather than one per state; flat full
    reward, no success roll.** Section 27's own summary line is "every 4
    hours, per state, up to 6 players" — this implementation runs ONE job
    globally at a time instead of up to 8 simultaneous per-state jobs,
    because the brief's own worked example describes a single "CO-OP
    HEIST" and running several parallel jobs every cycle is meaningfully
    more complex for no requirement the brief actually states. Revisit if
    "per state" turns out to matter once there's a real playerbase spread
    across states. Separately: unlike every other probabilistic system in
    this game (GTA, busts, kills), there's no failure case here —
    everyone still on the roster when the timer ends is paid the reward
    in full, not a split pool, because the brief's own example gives the
    whole $250,000 + XP figure with no mention of either a roll or a
    split. There's also no minimum player count (a lone participant still
    gets paid) and no leave-job endpoint — neither is called for anywhere
    in the brief. `REWARD_XP` (300) has no brief-given number at all ("+
    Mafia XP" with no amount) — an MVP placeholder, same treatment as
    GTA's rank-bonus figures.
17. **Co-op scheduling: catch-up is capped at one job, and the "you got
    paid" notice can be missed.** Job creation and resolution are both
    lazy (same pattern as heat decay and hunt reveal) — nothing happens
    until someone reads co-op status, joins, or `/internal/tick` is
    called. Rather than anchoring the next job's due time to the old
    schedule plus 4 hours (which could burst-create a run of back-to-back
    jobs if the game goes completely unread for a long stretch), each
    creation resets the timer to *that creation's own timestamp* plus 4
    hours — so a long idle period produces exactly one catch-up job, not
    a flood. Separately, the one-time `justCompleted` payout notice on
    `GET /coop/status` only fires for whichever specific API call happens
    to be the one that resolves a given job; if nobody checks status in
    that exact window (someone else's read, or `/internal/tick`, resolves
    it first), that player simply never sees the "you got paid!" banner —
    but the cash/XP always land correctly regardless, every time. A real
    event/notification feed (section 44) would close this gap properly;
    out of scope for this MVP.
18. **What actually sends a player to the hospital** (section 22) — the
    single biggest judgment call in Phase 9, and worth a second look
    before relying on it: the brief never says, so this landed on
    "hospital is the free path's second stage after death" rather than
    "combat can wound instead of kill." The full reasoning, and the
    alternative that was deliberately *not* built (to avoid touching
    Phase 5's already-shipped kill transaction), is in section 22 itself.
19. **Every hospital number is an MVP placeholder** (section 22) —
    `RECOVERY_HOURS`, `TREATMENT_COST`/`TREATMENT_REDUCTION_SECONDS`,
    `GAMBLE_MIN_BET`/`MAX_BET`, `SMALL_JOB_CASH_REWARD`/`XP_REWARD`/
    `COOLDOWN_SECONDS` — the brief names the four recovery activities but
    gives no numbers for any of them. All live in `HOSPITAL` in
    `config.ts`, easy to retune. Separately: an unauthenticated public
    profile view can show a stale DEAD status past its real expiry until
    that player's own next authenticated request settles it (nothing
    unauthenticated triggers the write) — the same lazy-evaluation
    tradeoff already accepted elsewhere, just newly visible here because
    this is the first status transition that needs a write rather than
    being purely derived on read.

None of these block Phase 1; they're flagged here so they get a real
decision (not just an assumption baked in silently) before the phases that
depend on them.
