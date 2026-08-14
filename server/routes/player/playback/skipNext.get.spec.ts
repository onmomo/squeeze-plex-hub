import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './skipNext.get'

vi.mock('../../../composables/useLogger', () => {
  const wrap = (level: string) =>
    vi.fn((...args: any[]) => {
      console.log(`[logger:${level}]`, ...args)
    })

  return {
    default: vi.fn().mockImplementation(() => ({
      info: wrap('info'),
      warn: wrap('warn'),
      error: wrap('error'),
      debug: wrap('debug')
    }))
  }
})

vi.mock('../../../composables/usePlayerInfo', () => ({
  default: vi.fn(async () => ({
    playerInfo: { playerid: 'player-1', name: 'Living Room' }
  }))
}))

const mockPlayer = {
  skipNext: vi.fn(),
  selectTrackInPlaylist: vi.fn(),
  status: vi.fn().mockResolvedValue({
    playlist_cur_index: 2
  })
}

vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: mockPlayer
  }))
}))

vi.mock('../../../lib/plexApi', () => ({
  responseHeaders: vi.fn().mockImplementation((playerid: string, name: string) => {
    const h = new Headers()
    h.set('X-Plex-Player-Id', playerid)
    h.set('X-Plex-Player-Name', name)
    return h
  })
}))

const event: any = {
  node: { req: { headers: {} } },
  respondWith: vi.fn()
}

vi.mock('h3', async (orig) => {
  const actual = await (orig() as any)
  const eventHandler = (fn: any) => fn
  return {
    ...actual,
    getQuery: vi.fn(),
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    setResponseHeaders: vi.fn(),
    eventHandler
  }
})

const mockRunTask = vi.fn()
vi.stubGlobal('runTask', mockRunTask)

describe('playback.skipNext route', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('returns 400 when required headers are missing', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1'
        // 'X-Plex-Device-Name': 'Device' // intentionally omit x-plex-device-name to trigger 400
      }
      return headers[name]
    })

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(400)
    expect(h3.setResponseHeaders).not.toHaveBeenCalled()
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })

  it('skips track successfully if playing last track of playlist', async () => {
    // Simulate required headers
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })

    // Simulate current track is last in playlist (index 2, next is 3)
    mockPlayer.status.mockResolvedValueOnce({
      playlist_cur_index: 2,
      playlist_tracks: 3,
      remoteMeta: { url: 'http://pms.local/track4url.flac' }
    })

    mockRunTask.mockResolvedValue({
      result: {
        playQueue: {
          MediaContainer: {
            Track: [
              {
                $: { playQueueItemID: 'pq-1' },
                Media: [{ Part: [{ $: { key: 'track1url.flac' } }] }]
              },
              {
                $: { playQueueItemID: 'pq-2' },
                Media: [{ Part: [{ $: { key: 'track2url.flac' } }] }]
              },
              {
                $: { playQueueItemID: 'pq-3' },
                Media: [{ Part: [{ $: { key: 'track3url.flac' } }] }]
              },
              {
                $: { playQueueItemID: 'pq-4' },
                Media: [{ Part: [{ $: { key: 'track4url.flac' } }] }]
              }
            ]
          }
        }
      }
    })

    await handler(event)

    expect(mockRunTask).toHaveBeenCalledWith('playQueueRefresher', { payload: { playerIdentifier: 'player-1' } })
    expect(mockPlayer.selectTrackInPlaylist).toHaveBeenCalledWith(3) // pq-4 is at index 3
    expect(h3.setResponseHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        'x-plex-player-id': 'player-1',
        'x-plex-player-name': 'Living Room'
      })
    )
    expect(h3.sendNoContent).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalled()
  })

  it('returns 404 when player skipNext fails', async () => {
    mockPlayer.skipNext.mockRejectedValueOnce(new Error('failure'))
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })
})
