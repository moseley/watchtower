# Watchtower

An "everything app" that starts as a **personal watcher / alerting platform**.

One engine, one primitive:

> **Watch a source → match my criteria → push me a notification.**

Each domain (weather, recalls, flights, listings…) is a **pluggable source
adapter** on that same engine — not a separate app. That's the path to
"everything": one engine, many adapters.

**First adapter: personal-threshold weather alerts** — the alerts your phone
*won't* send ("frost tonight, cover the plants", "rain in 40 min", "clear
Saturday"), not the government severe-weather pushes phones already do.

## Stack

| Layer | Choice |
| --- | --- |
| Monorepo | Turborepo + pnpm |
| Web + API/backend | Next.js 16 (App Router) — `apps/web` |
| Mobile (iOS + Android) | Expo SDK 57 / React Native — `apps/mobile` |
| Database | Postgres on Neon + Prisma _(Phase 1)_ |
| Engine scheduling | Vercel Cron → poll/match API route _(Phase 1)_ |
| Push | Expo Push Notifications _(Phase 1)_ |
| Weather data | NWS + Open-Meteo, behind one adapter _(Phase 1)_ |
| Shared code | `packages/{types, core, db, config}` |

**Auth:** Phase 1 uses the device push token as identity (no login screen). The
`owner` entity is modelled from the start so real, token-based accounts slot in
cleanly in Phase 2 — keeping us out of a cookie-only corner for mobile.

## Layout

```
watchtower/
├─ apps/
│  ├─ web/        Next.js — website frontend + API/backend
│  └─ mobile/     Expo — iOS + Android frontend
├─ packages/
│  ├─ types/      shared TS types + Zod schemas
│  ├─ core/       the source-agnostic watcher engine
│  ├─ db/         Prisma data layer (Phase 1)
│  └─ config/     shared tsconfig base (@watchtower/tsconfig)
├─ turbo.json
└─ pnpm-workspace.yaml
```

## Develop

```bash
pnpm install          # from the repo root
pnpm dev              # runs all apps via turbo
pnpm dev:web          # web only (port 3005)
pnpm dev:mobile       # Expo dev server
pnpm typecheck        # typecheck every package
```

> Mobile requires Expo Go on a physical device, or an iOS/Android emulator, to
> actually run.

### Monorepo notes

- `.npmrc` sets `node-linker=hoisted` — a flat `node_modules` so Expo's Metro
  bundler resolves dependencies without pnpm symlink issues.
- Metro is configured (`apps/mobile/metro.config.js`) to watch the repo root and
  resolve the hoisted root `node_modules`.
- Next transpiles the workspace packages (`transpilePackages` in
  `next.config.ts`); Turbopack's `root` is pinned to the repo root.

## Roadmap

- **Phase 0 — Foundation** ✅ monorepo scaffolded; web + mobile launch; shared
  packages wired; typecheck + expo-doctor green.
- **Phase 1 — The proof:** one weather watch → cron poll → real push lands on a
  phone. Prisma schema (`owner`, `watch`, `notification`), weather adapter,
  create/list-watch API, Expo push registration.
- **Phase 2:** web frontend, real accounts (token auth), then the recalls adapter.

_v1's only job is to prove the engine works end-to-end. Weather is the test rig,
not the destination._
