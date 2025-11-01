import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './createPlayQueue.get'
import axios from 'axios'

vi.mock('axios', () => {
  const axiosPostMock = vi.fn().mockResolvedValue({
    data: `<MediaContainer playQueueID="99999" playQueueSelectedItemOffset="4"><Track title="Track 1"/><Track title="Track 2"/></MediaContainer>`
  })
  return {
    default: {
      post: axiosPostMock
    }
  }
})

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
  selectTrackInPlaylist: vi.fn(),
  play: vi.fn()
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
  getPlexApi: vi.fn().mockReturnValue('http://10.10.1.1/playQueues'),
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
    getQuery: vi.fn().mockImplementation(() => ({
      source: 'plex',
      shuffle: '0',
      uri: '/library/metadata/123',
      key: '/library/metadata/123',
      token: 'token-abc',
      includeExternalMedia: '0',
      type: 'audio',
      protocol: 'http',
      address: '10.10.1.1',
      port: '32400',
      machineIdentifier: 'machine-xyz',
      commandID: 'cmd-123'
    })),
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    setResponseHeaders: vi.fn(),
    eventHandler
  }
})

describe('playback.createPlayQueue route', () => {
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

  it('creates play queue successfully', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })

    await handler(event)

    expect(setItemMock).toHaveBeenCalledWith('playerQueue/123', expect.anything())
    expect(mockPlayer.clearPlaylist).toHaveBeenCalled()
    expect(axios.post).toHaveBeenCalledWith(
      'http://10.10.1.1/playQueues?includeLoudnessRamps=1&includeFields=thumbBlurHash&type=audio&shuffle=0&includeExternalMedia=0&repeat=0&uri=%2Flibrary%2Fmetadata%2F123',
      '',
      {
        headers: {
          Accept: 'application/xml',
          'X-Plex-Client-Identifier': 'client-1',
          'X-Plex-Token': 'token-abc'
        }
      }
    )

    // Assert that addToPlaylist is called for each track in the playQueue
    expect(mockPlayer.addToPlaylist).toHaveBeenCalledTimes(2)
    // Assert that selectTrackInPlaylist is called with the correct offset
    expect(mockPlayer.selectTrackInPlaylist).toHaveBeenCalledWith(4)

    expect(h3.setResponseHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        'x-plex-player-id': '123',
        'x-plex-player-name': 'Living Room'
      })
    )
    expect(h3.sendNoContent).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalled()
  })

  it('handle plex returning play queue with 0 tracks', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })
    ;(axios.post as Mock).mockResolvedValue({
      data: `<MediaContainer playQueueID="99999" playQueueSelectedItemOffset="4"></MediaContainer>`
    })

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })

  it('handle plex returning unexpected play queue format', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })
    ;(axios.post as Mock).mockResolvedValue({
      data: `<MediaContainers ID="11"></MediaContainers>`
    })

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })

  it('returns 404 when player createPlayQueue fails', async () => {
    mockPlayer.clearPlaylist.mockRejectedValueOnce(new Error('failure'))
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
