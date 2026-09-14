# mafia/

This folder is where game-system logic lives, kept separate from HTTP route
handlers (`src/routes/`) so business rules stay testable and reusable.

Empty for now — Phase 1 is authentication and the player record only. As
later phases land, expect modules like:

- `ranks.ts` — the 10-rank table and XP → rank derivation (Phase 2)
- `crimes/gta.ts` — Grand Theft Auto crime logic (Phase 3)
- `combat/` — bullet calculator, search/hunt, kill resolution (Phases 4–5)
- `jail.ts` — bust-out mechanics (Phase 6)
- `cars.ts` — vehicle catalog, theft, melting (Phase 7)

See `GAME_DESIGN.md` at the repo root for the full design spec these will implement.
