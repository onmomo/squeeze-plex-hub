import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import usePlayerInfo from '~/server/composables/usePlayerInfo'
import handler from './skipTo.get'

vi.mock('~/server/composables/useLogger', () => ({
  default: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('~/server/composables/usePlayerInfo', () => ({
  default: vi.fn()
}))

const selectTrackInPlaylist = vi.fn()
vi.mock('~/server/lib/squeezePlayer', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      selectTrackInPlaylist
    }))
  }
})

vi.mock('~/server/lib/plexApi', () => ({
  responseHeaders: vi.fn(() => new Headers({ 'X-Test': '1' }))
}))

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

const mockGetItem = vi.fn()
vi.stubGlobal('useStorage', () => ({
  getItem: mockGetItem
}))


describe('GET /server/routes/player/playback/skipTo.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetItem.mockReset()
    selectTrackInPlaylist.mockReset()
  })

  it('returns 400 when required headers are missing', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      if (name === 'X-Plex-Client-Identifier') return 'client-1'
      // Omit X-Plex-Target-Client-Identifier and/or X-Plex-Device-Name
      return undefined
    })
    ;(h3.getQuery as Mock).mockReturnValue({
      key: '/library/metadata/1',
      commandID: 'cmd-1',
      playQueueItemID: 'pq-1'
    })
    ;(usePlayerInfo as Mock).mockResolvedValue({
      playerInfo: { playerid: 'player-1', name: 'Player One' },
      serverStub: {}
    })

    const event: any = {
      node: { req: { headers: {} } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp = (event.respondWith as Mock).mock.calls[0][0] as Response
    expect(resp.status).toBe(400)
    expect(selectTrackInPlaylist).not.toHaveBeenCalled()
    expect(h3.sendNoContent as Mock).not.toHaveBeenCalled()
  })

  it('returns nothing (no response) when playerQueue is missing', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })
    ;(h3.getQuery as Mock).mockReturnValue({
      key: '/library/metadata/1',
      commandID: 'cmd-1',
      playQueueItemID: 'pq-1'
    })
    ;(usePlayerInfo as Mock).mockResolvedValue({
      playerInfo: { playerid: 'player-1', name: 'Player One' },
      serverStub: {}
    })
    mockGetItem.mockResolvedValue(undefined)

    const event: any = {
      node: { req: { headers: {} } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(mockGetItem).toHaveBeenCalledWith('playerQueue/player-1')
    expect(selectTrackInPlaylist).not.toHaveBeenCalled()
    expect(h3.sendNoContent as Mock).not.toHaveBeenCalled()
    expect(event.respondWith).not.toHaveBeenCalled()
  })

  it('returns 404 when playQueueItemID not found in playerQueue', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })
    ;(h3.getQuery as Mock).mockReturnValue({
      key: '/library/metadata/1',
      commandID: 'cmd-1',
      playQueueItemID: 'missing-id'
    })
    ;(usePlayerInfo as Mock).mockResolvedValue({
      playerInfo: { playerid: 'player-1', name: 'Player One' },
      serverStub: {}
    })
    mockGetItem.mockResolvedValue({
      playQueue: {
        MediaContainer: {
          Track: [
            { $: { playQueueItemID: 'pq-1' } },
            { $: { playQueueItemID: 'pq-2' } }
          ]
        }
      }
    })

    const event: any = {
      node: { req: { headers: {} } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp = (event.respondWith as Mock).mock.calls[0][0] as Response
    expect(resp.status).toBe(404)
    expect(selectTrackInPlaylist).not.toHaveBeenCalled()
    expect(h3.sendNoContent as Mock).not.toHaveBeenCalled()
  })

  it('skips to track and returns 200 when valid', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })
    ;(h3.getQuery as Mock).mockReturnValue({
      key: '/library/metadata/1',
      commandID: 'cmd-99',
      playQueueItemID: 'pq-2'
    })
    ;(usePlayerInfo as Mock).mockResolvedValue({
      playerInfo: { playerid: 'player-1', name: 'Player One' },
      serverStub: {}
    })
    mockGetItem.mockResolvedValue({
      playQueue: {
        MediaContainer: {
          Track: [
            { $: { playQueueItemID: 'pq-1' } },
            { $: { playQueueItemID: 'pq-2' } },
            { $: { playQueueItemID: 'pq-3' } }
          ]
        }
      }
    })
    selectTrackInPlaylist.mockResolvedValue(undefined)

    const event: any = {
      node: { req: { headers: {} } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(selectTrackInPlaylist).toHaveBeenCalledWith('1')
    expect(h3.setResponseHeaders as Mock).toHaveBeenCalledTimes(1)
    expect(h3.sendNoContent as Mock).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalled()
  })
})