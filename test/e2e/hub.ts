import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener, type EventHandler } from 'h3'
import { createStorage, type Storage } from 'unstorage'
import { runPlayQueueRefresher, type PlayQueueRefresherPayload } from '../../server/tasks/playQueueRefresher'
import { runSqueezePlayersScanner } from '../../server/tasks/squeezePlayersScanner'
import createPlayQueue from '../../server/routes/player/playback/createPlayQueue.get'
import pause from '../../server/routes/player/playback/pause.get'
import play from '../../server/routes/player/playback/play.get'
import playMedia from '../../server/routes/player/playback/playMedia.get'
import refreshPlayQueue from '../../server/routes/player/playback/refreshPlayQueue.get'
import seekTo from '../../server/routes/player/playback/seekTo.get'
import setParameters from '../../server/routes/player/playback/setParameters.get'
import skipNext from '../../server/routes/player/playback/skipNext.get'
import skipPrevious from '../../server/routes/player/playback/skipPrevious.get'
import skipTo from '../../server/routes/player/playback/skipTo.get'
import stop from '../../server/routes/player/playback/stop.get'
import poll from '../../server/routes/player/timeline/poll.get'

/** The routes a Plex client (Plexamp) sends to the player, mounted like Nitro does from `server/routes` */
const routes: Record<string, EventHandler> = {
  '/player/playback/createPlayQueue': createPlayQueue,
  '/player/playback/pause': pause,
  '/player/playback/play': play,
  '/player/playback/playMedia': playMedia,
  '/player/playback/refreshPlayQueue': refreshPlayQueue,
  '/player/playback/seekTo': seekTo,
  '/player/playback/setParameters': setParameters,
  '/player/playback/skipNext': skipNext,
  '/player/playback/skipPrevious': skipPrevious,
  '/player/playback/skipTo': skipTo,
  '/player/playback/stop': stop,
  '/player/timeline/poll': poll
}

/**
 * Runs Squeeze Plex Hub's real route handlers on a real HTTP server, with the Nitro runtime pieces they rely on
 * (`useStorage`, `runTask`) backed by in-memory storage. Nitro plugins (mDNS, GDM, timeline publisher) are not started.
 */
export interface Hub {
  url: string
  storage: Storage
  close(): Promise<void>
}

export async function startHub(): Promise<Hub> {
  const storage = createStorage()
  ;(globalThis as any).useStorage = () => storage
  ;(globalThis as any).runTask = async (name: string, { payload }: { payload?: unknown } = {}) => {
    switch (name) {
      case 'playQueueRefresher':
        return { result: await runPlayQueueRefresher(payload as PlayQueueRefresherPayload) }
      case 'squeezePlayersScanner':
        await runSqueezePlayersScanner()
        return { result: 'ok' }
      default:
        throw new Error(`Unknown task '${name}'`)
    }
  }

  const router = createRouter()
  for (const [path, handler] of Object.entries(routes)) {
    router.get(path, handler)
  }
  const app = createApp()
  app.use(router)

  const server = http.createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    storage,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** Registers an LMS like the mDNS scanner does on discovery and lets the hub scan its players */
export async function registerLms(storage: Storage, host: string, port: number) {
  await storage.setItem('servers/e2e-lms', { uuid: 'e2e-lms', name: 'E2E LMS', ip: host, jsonPort: String(port) })
  await runSqueezePlayersScanner()
}
