# agent.md — AI Agent Guide for Squeeze Plex Hub

This is the single source of truth for AI assistants working on this repository. `CLAUDE.md` references this file.

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
├── app/                          # Vue 3 frontend (Nuxt app dir, @nuxt/ui 4 + Tailwind 4)
│   ├── app.vue / app.config.ts   # <UApp> root, brand colors (primary = plex amber, secondary = squeeze teal)
│   ├── assets/css/main.css       # Theme tokens, self-hosted fonts (no Google Fonts, hub runs offline)
│   ├── components/
│   │   ├── PlayerDashboard.vue   # Header, status display, scanning/error states, server list
│   │   ├── ServerSection.vue     # One LMS ("rack unit") with player bay + collapsible "Hidden players" section
│   │   └── PlayerCard.vue        # One player ("channel module") with In Plexamp latching key + options menu
│   ├── composables/
│   │   └── usePlayerDashboard.ts # Polls /api/players, groups into sections, optimistic hide/show
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
│   │   ├── hubConfig.ts          # Persisted user settings (config/settings.json)
│   │   ├── plexTargets.ts        # Which devices are announced to Plex (GDM + /resources)
│   │   ├── demoMode.ts / demoData.ts # NUXT_DEMO=true: fake LMS + players, discovery disabled
│   │   ├── squeezePlexHub.ts     # Port resolution, Plex config constants
│   │   ├── squeezePlayer.ts      # ExtendedSqueezePlayer class
│   │   ├── plexApi.ts            # Plex server API communication
│   │   └── plexPlayerTimeline.ts # Timeline state management & interfaces
│   ├── middleware/
│   │   └── catchAll.ts           # Request logger middleware
│   ├── plugins/                  # Nitro startup plugins (run on server start)
│   │   ├── 00.demoMode.ts        # Seeds demo data when NUXT_DEMO=true
│   │   ├── gdmAnnouncer.ts       # UDP multicast listener (port 32412)
│   │   ├── lmsScanner.ts         # LMS mDNS discovery & monitoring
│   │   └── timelinePublisher.ts  # Publishes player timeline every 1000ms
│   ├── routes/                   # H3 route handlers
│   │   ├── api/
│   │   │   ├── players.get.ts    # GET /api/players
│   │   │   └── players/[playerId]/settings.patch.ts # PATCH player settings (hide from Plex)
│   │   └── player/
│   │       ├── playback/         # Playback control endpoints
│   │       └── timeline/         # Timeline poll/subscribe endpoints
│   └── tasks/                    # Nitro scheduled tasks
│       ├── gdmDiscovery.ts       # Plex server GDM discovery (every minute)
│       ├── squeezePlayersScanner.ts # Squeeze player scan (every minute)
│       └── playQueueRefresher.ts # Refreshes queue on track end
├── config/                       # Runtime user settings (gitignored, Docker volume /app/config)
├── public/                       # Static assets (logos, favicons, README GIFs in docs/)
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
| `yarn dev:demo` | Start development server with fake LMS servers/players (no discovery); add `NUXT_DEMO_LMS=localhost:9000` + a Lyrion container for real player images |
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
yarn test:e2e           # e2e tests against a real LMS in Docker (needs a running Docker daemon)
```

### E2E Tests (hub → LMS)

`test/e2e/*.e2e.spec.ts` (config: `vitest.e2e.config.ts`, not part of `yarn test`) verify playback against a real
Lyrion Music Server with a real headless squeezelite player, started with [testcontainers](https://node.testcontainers.org/):

- `lmsStack.ts` — LMS (`lmscommunity/lyrionmusicserver`) + squeezelite (`giof71/squeezelite`, ALSA `null` output) on a Docker
  network. No discovery: squeezelite connects to LMS by alias and the test registers LMS in storage the way `lmsScanner` would.
- `fakePlexServer.ts` — stands in for PMS: play queues (`POST /playQueues` honours `key`, `GET /playQueues/:id`) and silent WAV
  tracks streamed in real-time (with `Range` support for seeking). Tests change play queues like a Plex client does on PMS
  (`addToPlayQueue`, `moveInPlayQueue`, `removeFromPlayQueue`). Play queues start with the album (tracks 1–6), tracks 7–10 can be added. It records requests, so
  tests can assert which tracks LMS actually streamed.
- `hub.ts` — mounts the real player route handlers (playback + `timeline/poll`) on an h3 server with in-memory `useStorage` and a
  `runTask` shim. Nitro plugins (mDNS, GDM, timeline publisher) do not run.
- `harness.ts` — `useE2eStack()` starts the stack per spec file, resets the player before each test and provides helpers
  (`playAlbumFrom`, `hubRequest`, `lmsStatus`, `lmsPlaylistParts`, `waitFor*`). Assert LMS state via JSON-RPC `status`, never sleep.
  A track only really plays once LMS reports no `waitingToPlay`: while buffering, `time` is stale and `pause` is ignored.

LMS resolves hostnames with its own DNS client that ignores `/etc/hosts`, so a socat relay joins the network as `plex` and
forwards to the fake Plex server on the test host. Reproduce LMS-facing bugs here before fixing them.

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

### User Settings (config/)

- Runtime discovery state lives in `useStorage('DISCOVERY')`; user choices that must survive restarts live in
  `config/settings.json`, read and written only through `server/lib/hubConfig.ts` (cached, serialized atomic writes).
- Schema is versioned and keyed per player: `{ "version": 1, "players": { "<playerId>": { "hidden": true } } }`.
  Do not store player names or other LMS data here, LMS owns them.
  Stereo pairs live in the sibling key `pairs`, keyed by the left player id: `{ "<leftId>": { "name", "leftId", "rightId" } }`
  (the pair name is a hub concept, LMS has none). Add new settings as optional fields or sibling keys, never break existing files.
- Demo mode writes to `config/settings.demo.json` instead.

### Logging

- Use `useLogger('ServiceName')` to create a logger per module.
- Log levels: `error`, `warn`, `info`, `debug`.
- Controlled via `NITRO_LOG_LEVEL` environment variable.
- Never log Plex tokens or credentials.

### Storage Keys (Nitro DISCOVERY)

| Key Pattern | Value Type | Purpose |
|-------------|-----------|---------|
| `servers/{serverId}` | `ServerInfo` | LMS server metadata |
| `plexServers/{resourceIdentifier}` | `PlexServerResponse` | Reachable Plex Media Servers found via GDM (diagnostic only, not read at runtime) |
| `players/{serverId}` | `IPlayerInfo[]` | Players per LMS server |
| `subscribers/{playerId}/{clientId}` | `RemoteSubscriber` | Active Plex timeline subscribers |
| `playerQueue/{playerId}` | `PlayerPlayQueue` | Current play queue |
| `playerQueueUpdating/{playerId}` | `boolean` | Lock flag for queue refresh |

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
| GET | `/api/players` | List all discovered players + server info + `settings.hidden` (hidden players included) + `pair` if the player is part of a stereo pair |
| POST | `/api/pairs` | Body `{ "name", "leftId", "rightId" }`: syncs the players, sets left/right output, persists the pair (400 / 404 / 409 / 500 / 502) |
| DELETE | `/api/pairs/{leftId}` | Dissolves the pair: unsync both players, stereo output again (404 / 500) |
| PATCH | `/api/players/{playerId}/settings` | Body `{ "hidden": boolean }`, persists to `config/settings.json` (400 / 404 / 500) |
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
    └─ UDP broadcast (port 32414) → every Plex server answers → verify reachability
            └─ store each under plexServers/{resourceIdentifier}, prune the ones that no longer answer
```

### Plex Targets (what Plex clients see)

`server/lib/plexTargets.ts` decides what is announced: `resolvePlexTargets()` returns one `PlexTarget` per **visible**
player (`{ id, name, kind: 'player', serverId, memberIds }`). Both the GDM announcer and `/resources` go through it, so a
hidden player is neither announced nor described. Playback routes still accept hidden players (a running session may finish).

A **stereo pair** is one target (`kind: 'stereoPair'`) under the id of its left player; the right player is not announced.
Creating a pair (`server/lib/stereoPair.ts`) only issues LMS commands: the right player is synced to the left one and the
players get the pref `outputChannels` 1 (left) / 2 (right), 0 = stereo, and `syncVolume` 1 so a volume change on one reaches the other (0 again when dissolved). LMS applies the channel only while the player is
synced, and playback commands to the left player apply to the whole sync group (verified in `test/e2e/stereoPair.e2e.spec.ts`).
The scanner (every minute) records which players have the `outputChannels` pref (`playerCapabilities/{id}`; LMS only has it for
the Squeezebox 2 family, `hasOutputChannels`), only those can be paired (`canPair` in `/api/players`, checked live by
`POST /api/pairs`). It also calls `reconcileStereoPairs()`: an intact pair is left alone, a lost sync group or output channel is
restored, a pair with a disconnected member is reported `offline` (`pairStatus/{leftId}`, shown on the card). Which member is
the sync master does not matter, LMS applies playback commands of either member to the group (e2e covered).
Creating and dissolving a pair run under `withPairLock` so the scanner does not "repair" them meanwhile. Members that were
unreachable when a pair was dissolved are kept in `pendingResets` (settings) and reset to stereo/unsynced by the scanner once
connected (LMS keeps syncs and prefs per player on the server, so with a real LMS an offline member is usually reset right away,
see the e2e test). The hub never touches audio. The dashboard renders a pair as a `DashboardItem` of kind `'pair'` (one card for the left player).
Do not announce players directly from storage.

### Multiple Plex Media Servers

Several PMS instances on the same network are supported and no server is ever "chosen":

- The hub never picks a PMS itself. Every `createPlayQueue` / `playMedia` request carries the server it belongs to
  (`protocol`, `address`, `port`, `machineIdentifier`, `token` query parameters), which is stored per player in
  `playerQueue/{playerId}.plexServer` and reused for the play queue, timelines and stream URLs.
- `gdmDiscovery` therefore only maintains a diagnostic list of reachable servers under `plexServers/{resourceIdentifier}`.
  Nothing reads it at runtime — it exists to document GDM discovery and as a basis for future direct Plex API usage.
- The discovery socket must be closed exactly once per run (all Plex servers answer the same broadcast); a second
  `close()` throws `ERR_SOCKET_DGRAM_NOT_RUNNING` and crashes the process.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NITRO_PORT` / `PORT` | `3000` | HTTP server port |
| `NITRO_LOG_LEVEL` | `info` | Log level (error/warn/info/debug) |
| `APP_VERSION` | from `package.json` | Application version reported to Plex |
| `NUXT_DEMO` | `false` | Demo mode: fake LMS servers/players, mDNS/GDM/player scan disabled |
| `NUXT_DEMO_LMS` | – | Demo mode only: `host[:port]` of a Lyrion the dashboard loads real player images from (e.g. a local `lmscommunity/lyrionmusicserver` container). The hub never connects to it |

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

# Run (host networking required for UDP multicast + mDNS), volume persists user settings
docker run --network host -v "$PWD/config:/app/config" squeeze-plex-hub
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
8. `server/lib/plexTargets.ts` / `server/lib/hubConfig.ts` — what is announced to Plex, persisted settings
9. `app/composables/usePlayerDashboard.ts` + `app/components/` — frontend UI

---

## What NOT To Do

- Do not add a database or ORM — Nitro storage is intentional.
- Do not change the UDP port 32412 — it is required by the Plex GDM protocol.
- Do not use CommonJS (`require`) — the project is ESM-only.
- Do not skip `yarn lint:fix && yarn format` before committing.
- Do not log Plex tokens or user credentials.
- Do not add complexity for hypothetical future features — keep it minimal.
- Do not commit Lyrion player images, they are loaded from LMS at runtime (`NUXT_DEMO_LMS` for the demo).
- Do not add environment variables or configuration for Plex or LMS connection details — discovery is fully automatic via UDP broadcast and mDNS, and no such config should exist.
