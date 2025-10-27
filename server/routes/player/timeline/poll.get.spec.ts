import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import pollHandler from './poll.get'
import type { H3Event } from 'h3'
import { timelineResponse, type PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'

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
  default: vi.fn()
}))
vi.mock('../../../lib/squeezePlayer')
vi.mock('../../../lib/plexPlayerTimeline')
vi.mock('../../../lib/plexApi', () => ({
  responseHeaders: vi.fn(() => ({ 'Content-Type': 'text/xml' }))
}))

const mockPlayer = {
  selectTrackInPlaylist: vi.fn(),
  status: vi.fn()
}

vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: mockPlayer
  }))
}))

const mockRunTask = vi.fn()
vi.stubGlobal('runTask', mockRunTask)

function createEvent({
  query = {},
  headers = {},
  respondWith = vi.fn()
}: {
  query?: Record<string, string>
  headers?: Record<string, string>
  respondWith?: (res: Response) => any
} = {}): H3Event {
  // Lowercase all header keys
  const lowerCaseHeaders: Record<string, string> = {}
  for (const key in headers) {
    lowerCaseHeaders[key.toLowerCase()] = headers[key]
  }

  return {
    __is_event__: true,
    node: {
      req: {
        headers: lowerCaseHeaders
      } as any
    } as any,
    path: '/timeline/poll?' + new URLSearchParams(query).toString(),
    context: {},
    _handled: false,
    respondWith
  } as H3Event
}

const mockPlayerInfo = {
  playerid: 'abc123',
  name: 'Test Player'
}
const mockServerStub = {}

const mockTimelineXml = { Timeline: { state: 'ok' } }

const mockPlayerQueue: PlayerPlayQueue = {
  playerId: 'abc123',
  playQueue: {
    MediaContainer: {} as any
  },
  plexServer: {
    server: {} as any,
    token: ''
  }
}

const mockSetItem = vi.fn().mockResolvedValue(mockPlayerQueue)
const mockGetItem = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('useStorage', () => ({
  setItem: mockSetItem,
  getItem: mockGetItem
}))

describe('timeline.poll handler', () => {
  beforeEach(() => {
    ;(usePlayerInfo as Mock).mockResolvedValue({
      playerInfo: mockPlayerInfo,
      serverStub: mockServerStub
    })
    ;(useSqueezePlayer as Mock).mockResolvedValue({
      player: mockPlayer
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  it('returns 400 if required headers or query are missing', async () => {
    const respondWith = vi.fn()
    const event = createEvent({
      headers: {},
      query: {},
      respondWith
    })
    await pollHandler(event)
    expect(respondWith).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400
      })
    )
  })

  it('returns 404 if player status is not available', async () => {
    mockPlayer.status.mockResolvedValueOnce(undefined as any)
    const respondWith = vi.fn()
    const event = createEvent({
      headers: {
        'X-Plex-Target-Client-Identifier': 'abc123',
        'X-Plex-Client-Identifier': 'client1',
        'X-Plex-Device-Name': 'dev1'
      },
      query: { commandID: 'cmd1' },
      respondWith
    })
    await pollHandler(event as any)
    expect(respondWith).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404
      })
    )
  })

  it('responds with timeline xml for non wait poll without loaded player playQueue', async () => {
    // Simulate playQueue currently updating for player
    mockGetItem.mockResolvedValueOnce(true)
    const respondWith = vi.fn()
    const event = createEvent({
      headers: {
        'X-Plex-Target-Client-Identifier': 'abc123',
        'X-Plex-Client-Identifier': 'client1',
        'X-Plex-Device-Name': 'dev1'
      },
      query: { commandID: 'cmd1' },
      respondWith
    })

    ;(timelineResponse as Mock).mockResolvedValue(mockTimelineXml)

    mockPlayer.status.mockResolvedValue({
      playerId: 'abc123',
      mode: 'play',
      time: 50,
      playlist_cur_index: 3,
      playlist_tracks: 5,
      duration: 100,
      volume: 50,
      remoteMeta: { url: 'http://pms.local/track3url.flac' }
    })

    await pollHandler(event)
    expect(timelineResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientIdentifier: 'client1',
        deviceName: 'dev1',
        commandId: 'cmd1',
        poll: true,
        targetClientIdentifier: 'abc123',
        subscribedAt: expect.any(Date)
      }),
      undefined,
      false,
      true
    )
    expect(timelineResponse).toHaveBeenCalledTimes(1)
    expect(respondWith).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200
      })
    )
  })

  it('responds with timeline xml for non wait poll with player playQueue refreshed', async () => {
    mockGetItem.mockResolvedValueOnce(false)
    // Simulate that getItem returns a valid playQueue (already loaded)
    mockGetItem.mockResolvedValueOnce(mockPlayerQueue)
    const respondWith = vi.fn()
    const event = createEvent({
      headers: {
        'X-Plex-Target-Client-Identifier': 'abc123',
        'X-Plex-Client-Identifier': 'client1',
        'X-Plex-Device-Name': 'dev1'
      },
      query: { commandID: 'cmd1' },
      respondWith
    })
    mockPlayer.status.mockResolvedValueOnce({
      playerId: 'abc123',
      mode: 'stop',
      time: 100,
      playlist_cur_index: 4,
      playlist_tracks: 5,
      duration: 100,
      volume: 50,
      remoteMeta: { url: 'http://pms.local/track3url.flac' }
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
    ;(timelineResponse as Mock).mockResolvedValue(mockTimelineXml)

    await pollHandler(event)
    expect(mockGetItem).toHaveBeenCalledWith('playerQueueUpdating/abc123')
    expect(mockRunTask).toHaveBeenCalledWith('playQueueRefresher', { payload: { playerIdentifier: 'abc123' } })
    expect(mockPlayer.selectTrackInPlaylist).toHaveBeenCalledWith(3)
    expect(timelineResponse).toHaveBeenCalledWith(
      {
        playerId: 'abc123',
        mode: 'stop',
        time: 100,
        playlist_cur_index: 4,
        playlist_tracks: 5,
        duration: 100,
        volume: 50,
        remoteMeta: { url: 'http://pms.local/track3url.flac' }
      },
      expect.objectContaining({
        clientIdentifier: 'client1',
        deviceName: 'dev1',
        commandId: 'cmd1',
        poll: true,
        targetClientIdentifier: 'abc123',
        subscribedAt: expect.any(Date)
      }),
      expect.anything(),
      false,
      false
    )
    expect(timelineResponse).toHaveBeenCalledTimes(1)
    expect(respondWith).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200
      })
    )
  })
})
