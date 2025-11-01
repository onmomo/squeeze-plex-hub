import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './refreshPlayQueue.get'
import { getPlayQueue } from '../../../lib/plexApi'

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

const playerInfoMock = { playerid: '123', name: 'Living Room' }
vi.mock('../../../composables/usePlayerInfo', () => ({
  default: vi.fn(async () => ({ playerInfo: playerInfoMock }))
}))

const mockPlayer = {
  status: vi.fn(),
  deleteTrackFromPlaylist: vi.fn().mockResolvedValue(undefined),
  addToPlaylist: vi.fn().mockResolvedValue(undefined)
}
vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({ player: mockPlayer }))
}))

const setItemMock = vi.fn()
const getItemMock = vi.fn()
const removeItemMock = vi.fn()
function useStorage() {
  return {
    setItem: setItemMock,
    getItem: getItemMock,
    removeItem: removeItemMock
  }
}
vi.stubGlobal('useStorage', useStorage)

vi.mock('../../../lib/plexApi', () => ({
  responseHeaders: vi.fn().mockImplementation((playerid: string, name: string) => {
    const h = new Headers()
    h.set('X-Plex-Player-Id', playerid)
    h.set('X-Plex-Player-Name', name)
    return h
  }),
  getPlayQueue: vi.fn(),
  getPlexApiTrack: vi.fn().mockReturnValue('http://10.10.1.1/track1'),
  metadata: vi.fn().mockReturnValue('metadata-string')
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
    getQuery: vi.fn().mockImplementation((_event) => ({ playQueueID: 'pqid' })),
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    setResponseHeaders: vi.fn(),
    eventHandler
  }
})

const mockHeaders: Record<string, string> = {
  'X-Plex-Target-Client-Identifier': 'player-1',
  'X-Plex-Client-Identifier': 'client-1',
  'X-Plex-Device-Name': 'device-1'
}

describe('playback.refreshPlayQueue route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getItemMock.mockReset()
    setItemMock.mockReset()
    // mockPlayer.status.mockResolvedValue(playerStatusMock)
    // mockPlayer.deleteTrackFromPlaylist.mockResolvedValue(undefined)
    // mockPlayer.addToPlaylist.mockResolvedValue(undefined)
  })

  it('returns 400 when required headers or playQueueID are missing', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, _name: string) => undefined)
    await handler(event)
    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(400)
    expect(h3.setResponseHeaders).not.toHaveBeenCalled()
  })

  it('returns 404 if playerQueue is not found for player', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValueOnce(undefined)
    getItemMock.mockResolvedValueOnce(undefined)
    await handler(event)
    expect(getItemMock).toHaveBeenCalled()
    expect(mockPlayer.deleteTrackFromPlaylist).not.toHaveBeenCalled()
    expect(mockPlayer.addToPlaylist).not.toHaveBeenCalled()
    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.setResponseHeaders).not.toHaveBeenCalled()
    expect(removeItemMock).toHaveBeenCalled()
  })

  it('refreshes play queue and updates playlist', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValueOnce(undefined)
    // existing playerQueue before refresh
    getItemMock.mockResolvedValueOnce({
      playerId: playerInfoMock.playerid,
      playQueue: {
        MediaContainer: {
          Track: [
            {
              $: { playQueueItemID: 'pq-1', title: 'Track 1' },
              Media: [{ Part: [{ $: { key: 'track1url.flac' } }] }]
            },
            {
              $: { playQueueItemID: 'pq-2', title: 'Track 2' },
              Media: [{ Part: [{ $: { key: 'track2url.flac' } }] }]
            },
            {
              $: { playQueueItemID: 'pq-3', title: 'Track 3' },
              Media: [{ Part: [{ $: { key: 'track3url.flac' } }] }]
            },
            {
              $: { playQueueItemID: 'pq-4', title: 'Track 4' },
              Media: [{ Part: [{ $: { key: 'track4url.flac' } }] }]
            }
          ]
        }
      },
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    // new play queue after refresh, missing first two tracks with two others queued
    ;(getPlayQueue as Mock).mockResolvedValueOnce({
      MediaContainer: {
        Track: [
          {
            $: { playQueueItemID: 'pq-3', title: 'Track 3' },
            Media: [{ Part: [{ $: { key: 'track3url.flac' } }] }]
          },
          {
            $: { playQueueItemID: 'pq-4', title: 'Track 4' },
            Media: [{ Part: [{ $: { key: 'track4url.flac' } }] }]
          },
          {
            $: { playQueueItemID: 'pq-5', title: 'Track 5' },
            Media: [{ Part: [{ $: { key: 'track5url.flac' } }] }]
          },
          {
            $: { playQueueItemID: 'pq-6', title: 'Track 6' },
            Media: [{ Part: [{ $: { key: 'track6url.flac' } }] }]
          }
        ]
      }
    })

    mockPlayer.status.mockResolvedValueOnce(
      {
        playlist_cur_index: 2,
        playlist_tracks: 4,
        remoteMeta: {
          id: 'id-3',
          title: 'Track 3',
          url: 'track3url.flac'
        }
      } // must reflect the loaded playQueue
    )
    await handler(event)
    // delete the first two tracks
    //expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalledTimes(2)
    expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalledWith(0)
    expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalledWith(1)
    expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalledWith(3)
    //expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalledWith(4)
    //expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalledWith(5)
    // add all the tracks after the current, now updated index which is 0 after we deleted the first two tracks to reflect refreshed queue
    expect(mockPlayer.addToPlaylist).toHaveBeenCalledTimes(3)
    expect(mockPlayer.addToPlaylist).toHaveBeenCalledWith('http://10.10.1.1/track1', 'metadata-string') // statically mocked input
    expect(setItemMock).toHaveBeenCalledWith('playerQueue/123', expect.anything())
    expect(h3.setResponseHeaders).toHaveBeenCalledWith(event, expect.anything())
    expect(h3.sendNoContent).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalledWith(expect.any(Response))
    expect(removeItemMock).toHaveBeenCalled()
  })

  it('returns 404 when player status fails', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValueOnce(undefined)
    getItemMock.mockResolvedValueOnce({
      playerId: playerInfoMock.playerid,
      playQueue: {},
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    mockPlayer.status.mockResolvedValue(undefined)
    await handler(event)
    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
    expect(removeItemMock).toHaveBeenCalled()
  })

  it('returns 404 when an error is thrown', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValueOnce(undefined)
    getItemMock.mockResolvedValueOnce({
      playerId: playerInfoMock.playerid,
      playQueue: {},
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    mockPlayer.addToPlaylist.mockRejectedValueOnce(new Error('fail'))
    await handler(event)
    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
    expect(removeItemMock).toHaveBeenCalled()
  })
})
