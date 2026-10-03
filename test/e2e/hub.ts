import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener, type EventHandler } from 'h3'
import { createStorage, type Storage } from 'unstorage'
import { runPlayQueueRefresher, type PlayQueueRefresherPayload } from '../../server/tasks/playQueueRefresher'
import { runSqueezePlayersScanner } from '../../server/tasks/squeezePlayersScanner'

/**
 * Runs Squeeze Plex Hub's real route handlers on a real HTTP server, with the Nitro runtime pieces they rely on
 * (`useStorage`, `runTask`) backed by in-memory storage. Nitro plugins (mDNS, GDM, timeline publisher) are not started.
 */
export interface Hub {
  url: string
  storage: Storage
  close(): Promise<void>
}

export async function startHub(routes: Record<string, EventHandler>): Promise<Hub> {
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
