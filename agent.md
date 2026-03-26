# agent.md — AI Agent Guide for Squeeze Plex Hub

This file is targeted at AI agents (non-Claude) working autonomously on this repository. See `CLAUDE.md` for a more detailed human/Claude-focused guide.

---

## What This Project Does

Squeeze Plex Hub bridges **Plex/Plexamp** and **Squeezebox/LMS** players:
- Discovers LMS servers and Squeeze players on the local network
- Announces players to Plex clients via GDM UDP multicast
- Translates Plex HTTP commands to LMS RPC calls
- Publishes timeline state back to Plex clients

---

## Tech Stack (Quick Reference)

- **Nuxt 4** + **Nitro** (H3) for full-stack TypeScript
- **Vue 3** Composition API frontend
- **Yarn 4.4.0** package manager, **Node v22**
- **Vitest 3** for tests
- **ESLint + Prettier** for code quality
- No database — uses Nitro in-memory `DISCOVERY` storage

---

## Essential Commands

```bash
yarn install          # install dependencies
yarn dev              # start dev server
yarn build            # production build
yarn lint:fix         # fix lint errors
yarn format           # run prettier
yarn test             # run all tests
yarn test:coverage    # tests + coverage report
```

---

## Project Layout

```
app/                  # Vue 3 frontend
  components/         # DiscoveredDevices.vue (main UI)
  pages/index.vue     # single page entry

server/               # Nitro backend
  composables/        # auto-imported helpers (useLogger, usePlayerInfo, …)
  lib/                # core logic (squeezePlayer, plexApi, plexPlayerTimeline)
  middleware/         # request logger
  plugins/            # startup hooks (gdmAnnouncer, lmsScanner, timelinePublisher)
  routes/             # H3 handlers — file-based routing
    api/players.get.ts
    player/{playerId}/playback/*.get.ts
    player/{playerId}/timeline/*.get.ts
  tasks/              # scheduled tasks (gdmDiscovery, squeezePlayersScanner, playQueueRefresher)
```

---

## Development Rules

### Code Style

- **TypeScript strict mode** — no `any`, use proper interfaces
- **ESM only** — no `require()`
- **Single quotes, no semicolons, 140 char line width** (Prettier)
- Vue components use `<script setup lang="ts">`
- Nitro routes use `defineEventHandler` with `.get.ts` suffix

### Backend Conventions

- Read Plex headers with `getHeader(event, 'X-Plex-...')`
- Return 404 early: `throw createError({ statusCode: 404, message: '...' })`
- All state stored in `useStorage('DISCOVERY')` — no external DB
- Composables are auto-imported in `server/` — no explicit imports needed

### Storage Key Patterns

| Key | Value |
|-----|-------|
| `servers/{serverId}` | LMS server info |
| `players/{serverId}` | Array of player info |
| `subscribers/{playerId}/{clientId}` | Remote subscriber |
| `playerQueue/{playerId}` | Play queue |
| `playerQueueUpdating/{playerId}` | Boolean lock |

### Logging

```ts
const logger = useLogger('MyService')
logger.info('message', { meta: 'data' })
logger.error('failure', { error })
```

Level controlled by `NITRO_LOG_LEVEL` env var. Never log tokens.

---

## Testing

- Test files colocated with source: `foo.ts` → `foo.spec.ts`
- Nuxt integration tests: `foo.nuxt.spec.ts`
- Test setup helpers in `setup-nitro-test-env.ts` (mocks `useRuntimeConfig`, `defineNitroPlugin`, `defineTask`)
- Run `yarn test` before submitting any change

---

## Git Workflow

- Active branch for AI changes: `claude/add-ai-documentation-Jt5cK`
- CI runs on push/PR to `develop` (lint → build → test → Docker build)
- Commit messages should be descriptive and reference what changed and why
- Always run `yarn lint:fix && yarn format` before committing

---

## Key Interfaces (TypeScript)

### Player Info
```ts
interface IPlayerInfo {
  id: string          // MAC-based UUID
  name: string
  model: string
  ip: string
  serverId: string
}
```

### Plex Request Context
```ts
// Extracted from event headers in route handlers:
const targetClientId = getHeader(event, 'X-Plex-Target-Client-Identifier')
const clientId       = getHeader(event, 'X-Plex-Client-Identifier')
const plexToken      = getHeader(event, 'X-Plex-Token')
```

### Timeline State
```ts
// plexPlayerTimeline.ts exports:
interface PlexPlayerTimeline { ... }
interface PlexPlayQueue { ... }
interface PlexTrack { ... }
```

---

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `NITRO_PORT` / `PORT` | `3000` | HTTP port |
| `NITRO_LOG_LEVEL` | `info` | error / warn / info / debug |
| `APP_VERSION` | from package.json | Reported to Plex clients |

---

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3000 | TCP | HTTP API + frontend |
| 32412 | UDP | Plex GDM device discovery |

Host networking is required in Docker for UDP multicast and mDNS to work.

---

## Common Pitfalls

1. **Do not change UDP port 32412** — hardcoded by Plex GDM protocol.
2. **Do not introduce a database** — Nitro storage is intentional and sufficient.
3. **Do not use CommonJS** — ESM only, `"type": "module"` is set.
4. **Tests must pass** before merging — run `yarn test`.
5. **Plex tokens are secrets** — never log or expose them.
6. **Lint before commit** — `yarn lint:fix && yarn format`.
