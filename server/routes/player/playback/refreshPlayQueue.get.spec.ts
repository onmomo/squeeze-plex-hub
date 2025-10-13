import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './refreshPlayQueue.get'

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

const playerStatusMock = { playlist_cur_index: 1, playlist_tracks: 3 }
const mockPlayer = {
  status: vi.fn().mockResolvedValue(playerStatusMock),
  deleteTrackFromPlaylist: vi.fn().mockResolvedValue(undefined),
  addToPlaylist: vi.fn().mockResolvedValue(undefined)
}
vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({ player: mockPlayer }))
}))

const setItemMock = vi.fn()
const getItemMock = vi.fn()
function useStorage() {
  return {
    setItem: setItemMock,
    getItem: getItemMock
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
  getPlayQueue: vi.fn().mockResolvedValue({
    MediaContainer: {
      $: { playQueueSelectedItemOffset: '0' },
      Track: [
        { $: { title: 'Track 1' }, Media: [{ Part: [{ $: { key: '1' } }] }] },
        { $: { title: 'Track 2' }, Media: [{ Part: [{ $: { key: '2' } }] }] }
      ]
    }
  }),
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
    mockPlayer.status.mockResolvedValue(playerStatusMock)
    mockPlayer.deleteTrackFromPlaylist.mockResolvedValue(undefined)
    mockPlayer.addToPlaylist.mockResolvedValue(undefined)
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
    getItemMock.mockResolvedValue(undefined)
    await handler(event)
    expect(getItemMock).toHaveBeenCalled()
    expect(mockPlayer.deleteTrackFromPlaylist).not.toHaveBeenCalled()
    expect(mockPlayer.addToPlaylist).not.toHaveBeenCalled()
    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.setResponseHeaders).not.toHaveBeenCalled()
  })

  it('refreshes play queue and updates playlist', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValue({
      playerId: playerInfoMock.playerid,
      playQueue: {},
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    await handler(event)
    expect(mockPlayer.deleteTrackFromPlaylist).toHaveBeenCalled()
    // skip the first track which is currently playing (playQueueSelectedItemOffset)
    expect(mockPlayer.addToPlaylist).toHaveBeenCalledOnce()
    expect(mockPlayer.addToPlaylist).toHaveBeenCalledWith('http://10.10.1.1/track1', 'metadata-string')
    expect(setItemMock).toHaveBeenCalledWith('playerQueue/123', expect.anything())
    expect(h3.setResponseHeaders).toHaveBeenCalledWith(event, expect.anything())
    expect(h3.sendNoContent).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalledWith(expect.any(Response))
  })

  it('returns 404 when player status fails', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValue({
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
  })

  it('returns 404 when an error is thrown', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      return mockHeaders[name]
    })
    getItemMock.mockResolvedValue({
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
  })
})
