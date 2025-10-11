import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import pollHandler from './poll.get'
import type { H3Event } from 'h3'
import { timelineResponse, type PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'

vi.mock('../../../composables/useLogger', () => ({
  default: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('../../../composables/usePlayerInfo', () => ({
  default: vi.fn()
}))
vi.mock('../../../lib/squeezePlayer')
vi.mock('../../../lib/plexPlayerTimeline')
vi.mock('../../../lib/plexApi', () => ({
  responseHeaders: vi.fn(() => ({ 'Content-Type': 'text/xml' }))
}))

const mockStatus = vi.fn().mockResolvedValue({
  playerId: 'abc123',
  mode: 'play',
  time: 10,
  playlist_cur_index: 0,
  playlist_tracks: 5,
  duration: 100,
  volume: 50
})
const mockPlayer = {
  status: vi.fn(() => mockStatus)
}

vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: mockPlayer
  }))
}))

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

  it('responds with timeline xml for normal poll', async () => {
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

    await pollHandler(event)
    expect(timelineResponse).toHaveBeenCalledWith(
      mockStatus,
      expect.objectContaining({
        clientIdentifier: 'client1',
        deviceName: 'dev1',
        commandId: 'cmd1',
        poll: true,
        targetClientIdentifier: 'abc123'
        // omit subscribedAt so it's ignored in the match
      }),
      undefined,
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
