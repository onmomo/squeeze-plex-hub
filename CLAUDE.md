# CLAUDE.md — Squeeze Plex Hub

This file provides guidance for AI assistants (Claude Code and others) working on the `squeeze-plex-hub` repository.

---

## Project Overview

**Squeeze Plex Hub** is a full-stack Nuxt 4 application that acts as a protocol bridge between the Plex/Plexamp ecosystem and Squeezebox/LMS (Logitech Media Server) players. It:

1. Discovers LMS servers on the local network via mDNS.
2. Discovers Squeeze players connected to those servers.
3. Announces those players to Plex clients via GDM (Group Discovery Multicast) on UDP port 32412.
4. Translates Plex playback control commands into LMS/Squeeze RPC calls.
5. Publishes timeline state updates back to Plex clients.

**Version:** See `package.json` (`version` field)
**License:** MIT
**Author:** onmomo

---

## Stack

| Layer | Technology |
|-------|-----------|
| Meta-framework | Nuxt 4 (`nuxt` ^4.0.0) |
| Backend runtime | Nitro (H3 event handlers) |
| Frontend | Vue 3 Composition API |
| UI library | @nuxt/ui 4.1.0 |
| Language | TypeScript 5 (strict) |
| Package manager | Yarn 4.4.0 |
| Node version | v22 (see `.nvmrc`) |
| Testing | Vitest 3 + @nuxt/test-utils + happy-dom |
| Logging | Winston |
| XML | xml2js |
| LMS discovery | lms-discovery (mDNS) |
| LMS RPC | lms-squeeze-rpc-x |

---

## Directory Structure

```
squeeze-plex-hub/
├── app/                          # Vue 3 frontend (Nuxt app dir)
│   ├── components/
│   │   └── DiscoveredDevices.vue # Displays discovered LMS servers + players
│   └── pages/
│       └── index.vue             # Single-page entry point
├── server/                       # Nitro backend
│   ├── composables/              # Reusable server-side helpers
│   │   ├── useLogger.ts          # Winston logger factory
│   │   ├── usePlayerInfo.ts      # Retrieves player/server from DISCOVERY storage
│   │   ├── usePlayers.ts         # Fetches all players from storage
│   │   ├── useSqueezePlayer.ts   # Creates ExtendedSqueezePlayer instances
│   │   └── useXmlBuilder.ts      # Builds Plex-protocol XML responses
│   ├── lib/                      # Core business logic
│   │   ├── squeezePlexHub.ts     # Port resolution, Plex config constants
│   │   ├── squeezePlayer.ts      # ExtendedSqueezePlayer class
│   │   ├── plexApi.ts            # Plex server API communication
│   │   └── plexPlayerTimeline.ts # Timeline state management & interfaces
│   ├── middleware/
│   │   └── catchAll.ts           # Request logger middleware
│   ├── plugins/                  # Nitro startup plugins (run on server start)
│   │   ├── gdmAnnouncer.ts       # UDP multicast listener (port 32412)
│   │   ├── lmsScanner.ts         # LMS mDNS discovery & monitoring
│   │   └── timelinePublisher.ts  # Publishes player timeline every 1000ms
│   ├── routes/                   # H3 route handlers
│   │   ├── api/
│   │   │   └── players.get.ts    # GET /api/players
│   │   └── player/
│   │       ├── playback/         # Playback control endpoints
│   │       └── timeline/         # Timeline poll/subscribe endpoints
│   └── tasks/                    # Nitro scheduled tasks
│       ├── gdmDiscovery.ts       # Plex server GDM discovery (every minute)
│       ├── squeezePlayersScanner.ts # Squeeze player scan (every minute)
│       └── playQueueRefresher.ts # Refreshes queue on track end
├── public/                       # Static assets (logos, favicons)
├── .github/workflows/            # CI/CD (lint, build, test, Docker publish)
├── nuxt.config.ts                # Nuxt + Nitro configuration
├── vitest.config.ts              # Test runner configuration
├── eslint.config.mjs             # ESLint rules (Nuxt/TS/Vue)
├── .prettierrc                   # Prettier formatting rules
├── Dockerfile                    # Multi-stage Docker build
└── package.json                  # Scripts, deps, version
```

---

## Development Workflow

### Setup

```bash
# Install dependencies
yarn install

# Start dev server (binds 0.0.0.0 for Plex/LMS discovery)
yarn dev
```

### Common Commands

| Command | Purpose |
|---------|---------|
| `yarn dev` | Start development server |
| `yarn build` | Production build |
| `yarn start` | Run production build |
| `yarn lint` | Run ESLint checks |
| `yarn lint:fix` | Auto-fix ESLint issues |
| `yarn format` | Run Prettier formatting |
| `yarn test` | Run all tests (unit + integration) |
| `yarn test:coverage` | Run tests with coverage report |

### Running Tests

Tests are split into two Vitest projects:

- **unit** — `*.spec.ts` files (not `*.nuxt.spec.ts`), runs in Node environment
- **nuxt** — `*.nuxt.spec.ts` files, runs in Nuxt environment via `@nuxt/test-utils`

Test files are colocated with the source they test (e.g., `server/lib/squeezePlayer.spec.ts`).

```bash
yarn test               # run all tests
yarn test:coverage      # with LCOV coverage output
```

### Linting & Formatting

- ESLint extends `@nuxt/eslint-config` with TypeScript and Vue rules.
- Prettier: 140 char width, single quotes, no semicolons, no trailing commas.
- Always run `yarn lint:fix && yarn format` before committing.

---

## Code Conventions

### TypeScript

- Strict mode is enabled. Do not use `any` unless absolutely necessary and justified.
- `@typescript-eslint/no-explicit-any` is disabled in ESLint but avoid it anyway.
- Interfaces preferred over type aliases for object shapes.
- ESM modules only (`"type": "module"` in package.json).

### Vue / Nuxt Frontend

- Use Vue 3 Composition API (`<script setup lang="ts">`).
- `useFetch` / `$fetch` preferred over raw axios in the frontend.
- Scoped `<style>` blocks only. No global styles except in layouts.

### Nitro Backend (server/)

- All route files follow Nitro file-based routing: `[method].ts` suffix (e.g., `play.get.ts`).
- Use `defineEventHandler` for all route handlers.
- Use `getHeader(event, 'X-Plex-...')` to extract Plex protocol headers.
- Return early with `createError({ statusCode: 404 })` when player not found.
- Use `useStorage('DISCOVERY')` for all runtime state (no database).

### Composables (server/composables/)

- Prefix with `use` (Nitro composable convention).
- Auto-imported within `server/` — no import needed in route files.
- Keep composables focused and single-purpose.

### Logging

- Use `useLogger('ServiceName')` to create a logger per module.
- Log levels: `error`, `warn`, `info`, `debug`.
- Controlled via `NITRO_LOG_LEVEL` environment variable.
- Never log Plex tokens or credentials.

### Storage Keys (Nitro DISCOVERY)

| Key Pattern | Value Type | Purpose |
|-------------|-----------|---------|
| `servers/{serverId}` | `ServerInfo` | LMS server metadata |
| `players/{serverId}` | `IPlayerInfo[]` | Players per LMS server |
| `subscribers/{playerId}/{clientId}` | `RemoteSubscriber` | Active Plex timeline subscribers |
| `playerQueue/{playerId}` | `PlayerPlayQueue` | Current play queue |
| `playerQueueUpdating/{playerId}` | `boolean` | Lock flag for queue refresh |

---

## API Reference

### Plex Protocol Headers

Every Plex client request includes these headers (read them from the event):

| Header | Purpose |
|--------|---------|
| `X-Plex-Target-Client-Identifier` | UUID of the target Squeeze player |
| `X-Plex-Client-Identifier` | UUID of the requesting Plex client |
| `X-Plex-Device-Name` | Human-readable device name |
| `X-Plex-Token` | Auth token for Plex Media Server communication |

### REST Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/players` | List all discovered players + server info |
| GET | `/resources` | Device resource info (Plex registration) |
| GET | `/player/{playerId}/playback/play` | Resume playback |
| GET | `/player/{playerId}/playback/pause` | Pause playback |
| GET | `/player/{playerId}/playback/stop` | Stop playback |
| GET | `/player/{playerId}/playback/playMedia` | Start playing specific media |
| GET | `/player/{playerId}/playback/skipNext` | Skip to next track |
| GET | `/player/{playerId}/playback/skipPrevious` | Skip to previous track |
| GET | `/player/{playerId}/playback/skipTo` | Skip to track by index |
| GET | `/player/{playerId}/playback/seekTo` | Seek to position (ms) |
| GET | `/player/{playerId}/playback/setParameters` | Set volume/repeat/shuffle |
| GET | `/player/{playerId}/playback/createPlayQueue` | Create a new play queue |
| GET | `/player/{playerId}/playback/refreshPlayQueue` | Refresh existing play queue |
| GET | `/player/{playerId}/timeline/poll` | Poll timeline state |
| GET | `/player/{playerId}/timeline/subscribe` | Subscribe to timeline updates |
| GET | `/player/{playerId}/timeline/unsubscribe` | Unsubscribe from timeline |

---

## Architecture Notes

### Request Flow

```
Plex Client
    │
    ├─ UDP M-SEARCH broadcast (port 32412)
    │       └─▶ gdmAnnouncer plugin → unicast response per discovered player
    │
    └─ HTTP playback/timeline request
            └─▶ Nitro route handler
                    ├─ usePlayerInfo() → DISCOVERY storage
                    ├─ useSqueezePlayer() → ExtendedSqueezePlayer
                    └─ RPC call → LMS server → Squeeze player
```

### Timeline Loop

```
timelinePublisher plugin (every 1000ms)
    └─ for each subscriber in DISCOVERY storage
            └─ plexPlayerTimeline.buildTimeline()
                    └─ HTTP POST to Plex client (XML payload)
```

### GDM / Discovery Loop

```
lmsScanner plugin (on startup)
    └─ lms-discovery (mDNS) → on LMS found → squeezePlayersScanner task
            └─ LMS JSON API → player list → store in DISCOVERY

gdmDiscovery task (every minute)
    └─ LMS JSON API → discover Plex servers → store in DISCOVERY
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NITRO_PORT` / `PORT` | `3000` | HTTP server port |
| `NITRO_LOG_LEVEL` | `info` | Log level (error/warn/info/debug) |
| `APP_VERSION` | from `package.json` | Application version reported to Plex |

**There are no environment variables for configuring connections to Plex or LMS.** Both are discovered automatically at runtime:

- **LMS servers** are found via mDNS (multicast DNS) using the `lms-discovery` library.
- **Plex clients** are found via GDM (Group Discovery Multicast) — Plex clients broadcast UDP M-SEARCH packets on port 32412, and the hub responds.

No IP addresses, hostnames, ports, or credentials for Plex or LMS need to be configured. Do not attempt to add such configuration — the zero-config discovery model is intentional.

### Network Layer Requirement

For discovery to work, the host running Squeeze Plex Hub **must have access to the same broadcast/multicast domain** as the Plex clients and LMS servers. This means:

- In Docker: use `--network host` (bridge networking will block UDP multicast and mDNS).
- In Kubernetes or VMs: ensure multicast traffic is not filtered at the network layer.
- On the same physical or VLAN network segment as Plex clients and LMS servers.

---

## Docker

```bash
# Build
docker build -t squeeze-plex-hub .

# Run (host networking required for UDP multicast + mDNS)
docker run --network host squeeze-plex-hub
```

Ports exposed:
- `3000/tcp` — HTTP server
- `32412/udp` — GDM announcer (Plex discovery)

---

## CI/CD

### ci.yml (triggers: push/PR to `develop`)
1. ESLint
2. `yarn build`
3. `yarn test:coverage` + Codecov upload
4. Docker build (amd64, cache via GHA)

### docker-image-publish.yml (triggers: push to `develop`)
1. Bumps version with standard-version (minor bump)
2. Creates and pushes git tag
3. Builds multi-arch Docker image (amd64, arm64)
4. Pushes to Docker Hub as `onmomo/squeeze-plex-hub:latest` + tagged version

---

## Key Files for Understanding the Codebase

Start here when onboarding:

1. `nuxt.config.ts` — overall configuration and scheduled tasks
2. `server/plugins/lmsScanner.ts` — how LMS discovery works
3. `server/plugins/gdmAnnouncer.ts` — how Plex discovers players
4. `server/lib/squeezePlayer.ts` — player control abstraction
5. `server/lib/plexApi.ts` — Plex server communication
6. `server/lib/plexPlayerTimeline.ts` — timeline types and response building
7. `server/routes/player/timeline/poll.get.ts` — main Plex interaction endpoint
8. `app/components/DiscoveredDevices.vue` — frontend UI

---

## What NOT To Do

- Do not add a database or ORM — Nitro storage is intentional.
- Do not change the UDP port 32412 — it is required by the Plex GDM protocol.
- Do not use CommonJS (`require`) — the project is ESM-only.
- Do not skip `yarn lint:fix && yarn format` before committing.
- Do not log Plex tokens or user credentials.
- Do not add complexity for hypothetical future features — keep it minimal.
- Do not add environment variables or configuration for Plex or LMS connection details — discovery is fully automatic via UDP broadcast and mDNS, and no such config should exist.
