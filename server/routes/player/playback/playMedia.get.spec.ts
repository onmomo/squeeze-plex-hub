import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './playMedia.get'

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
    playerInfo: { playerid: '123', name: 'Living Room' }
  }))
}))

const mockPlayer = {
  clearPlaylist: vi.fn(),
  addToPlaylist: vi.fn(),
  selectTrackInPlaylist: vi.fn()
}

vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: mockPlayer
  }))
}))

const setItemMock = vi.fn()

function useStorage() {
  const mockStorage = {
    setItem: setItemMock
  }

  return mockStorage
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
      $: { playQueueSelectedItemOffset: '4' },
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
    getQuery: vi.fn().mockImplementation((_event) => ({
      key: 'someKey',
      containerKey: 'someContainerKey',
      token: 'someToken',
      type: 'track',
      protocol: 'http',
      address: '127.0.0.1',
      port: '32400',
      machineIdentifier: 'machine-123',
      commandID: '99',
      offset: 3000 // milliseconds
    })),
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    setResponseHeaders: vi.fn(),
    eventHandler
  }
})

describe('playback.playMedia route', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('returns 400 when required headers are missing', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        // 'X-Plex-Target-Client-Identifier': 'player-1',
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

  it('plays track successfully', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1'
      }
      return headers[name]
    })

    await handler(event)

    expect(mockPlayer.clearPlaylist).toHaveBeenCalledTimes(1)
    expect(mockPlayer.addToPlaylist).toHaveBeenCalledWith('http://10.10.1.1/track1', 'metadata-string')
    expect(mockPlayer.selectTrackInPlaylist).toHaveBeenCalledWith('4')
    expect(setItemMock).toHaveBeenCalledWith('playerQueue/123', expect.anything())

    expect(h3.setResponseHeaders).toHaveBeenCalledWith(event, expect.anything())
    expect(h3.sendNoContent).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalled()
  })

  it('returns 404 when player playback fails', async () => {
    mockPlayer.addToPlaylist.mockRejectedValueOnce(new Error('failure'))
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1'
      }
      return headers[name]
    })

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(503)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })
})
