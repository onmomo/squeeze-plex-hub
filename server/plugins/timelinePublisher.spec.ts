import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import axios from 'axios'
import type { ServerInfo } from 'lms-discovery'
import { type PlayerPlayQueue, type TimelineContainer } from '../lib/plexPlayerTimeline'
import { runPublishTimeline } from './timelinePublisher'

vi.mock('axios', () => {
  const actual = vi.importActual('axios')
  const mock = {
    ...actual,
    post: vi.fn(async () => ({
      data: {}
    }))
  }
  return {
    ...mock,
    default: mock
  }
})
vi.mock('xml2js', () => {
  function MockBuilder() {}
  MockBuilder.prototype.buildObject = vi.fn().mockReturnValue('<xml></xml>')
  return { Builder: MockBuilder }
})
vi.mock('../composables/useLogger', () => ({
  default: () => ({
    debug: (msg: string) => console.log(msg),
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.log(msg),
    error: (msg: string) => console.log(msg)
  })
}))
vi.mock('../lib/plexPlayerTimeline', () => {
  const actual = vi.importActual('../lib/plexPlayerTimeline')
  return {
    ...actual,
    timelineResponse: vi.fn(
      async () =>
        ({
          MediaContainer: {
            $: { commandID: '123' },
            Timeline: [
              {
                $: {
                  itemType: 'track',
                  state: 'playing',
                  time: '1000',
                  key: '/library/metadata/1',
                  type: 'track',
                  ratingKey: '1',
                  playQueueID: 'pqid',
                  playQueueVersion: '1',
                  duration: '2000',
                  playQueueItemID: 'pqiid',
                  containerKey: '/playQueues/1',
                  volume: '50',
                  controllable: '1'
                }
              }
            ]
          }
        }) as TimelineContainer
    )
  }
})
vi.mock('../lib/plexApi', () => ({
  responseHeaders: vi.fn(() => {
    const map = new Map()
    return {
      append: (k: string, v: string) => map.set(k, v),
      entries: () => map.entries()
    }
  })
}))
vi.mock('lms-squeeze-rpc-x', () => ({
  SqueezeServerStub: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../lib/squeezePlayer', () => {
  class ExtendedSqueezePlayer {
    status = vi.fn().mockResolvedValue({
      playerId: 'abc123',
      mode: 'play',
      time: 10,
      playlist_cur_index: 0,
      playlist_tracks: 5,
      duration: 100,
      volume: 50
    })
    addToPlaylist = vi.fn()
    clearPlaylist = vi.fn()
    selectTrackInPlaylist = vi.fn()
    play = vi.fn()
    stop = vi.fn()
    pause = vi.fn()
    skipNext = vi.fn()
    skipPrevious = vi.fn()
    seekTo = vi.fn()
  }
  return {
    default: ExtendedSqueezePlayer,
    ExtendedSqueezePlayer
  }
})

const mockGetKeys = vi.fn()
const mockGetItem = vi.fn()
const mockSetItem = vi.fn()
const mockRemoveItem = vi.fn()
vi.stubGlobal('useStorage', () => ({
  getKeys: mockGetKeys,
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem
}))

vi.mock('#scheduler', () => {
  // We'll keep a reference to the scheduled function for awaiting in tests
  let scheduledFn: (() => Promise<void>) | null = null
  return {
    useScheduler: () => ({
      run: (fn: () => Promise<void>) => {
        scheduledFn = fn
        return {
          everySeconds: (_: number) => {
            // Immediately invoke for test and return the promise
            return fn()
          }
        }
      }
    }),
    // Expose for test usage
    __scheduledFn: () => scheduledFn
  }
})

describe('publishTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes timeline to all valid subscribers', async () => {
    mockGetKeys.mockResolvedValueOnce(['players:server1', 'players:server2']).mockResolvedValueOnce(['subscriber1', 'subscriber2'])
    mockGetItem
      .mockResolvedValueOnce([
        {
          playerid: 'abc123',
          name: 'Test Player',
          model: 'A-Model',
          modelname: 'Test Model Name',
          firmware: '1.0',
          ip: '1.0.0.127'
        }
      ])
      .mockResolvedValueOnce(undefined) // No players for server2
      .mockResolvedValueOnce({
        clientIdentifier: 'client1',
        deviceName: 'Test Device',
        subscribedAt: new Date().toISOString()
      })
      .mockResolvedValueOnce({
        clientIdentifier: 'client2',
        deviceName: 'Test Device',
        subscribedAt: new Date(0).toISOString() // stale subscriber
      })
      .mockResolvedValueOnce({
        cliPort: '9090',
        ip: '99.99.99.99',
        jsonPort: '9000',
        name: 'Test Server',
        ver: '1.0'
      } as ServerInfo)
      .mockResolvedValueOnce({
        plexServer: {
          server: {
            localAddress: '127.0.0.99',
            port: 32401
          },
          token: 'token123'
        }
      } as PlayerPlayQueue)

    runPublishTimeline()

    const schedulerModule = await import('#scheduler')
    const scheduledFn = (schedulerModule as any).__scheduledFn()
    if (scheduledFn) {
      // Wait for the scheduled run() function to complete
      await scheduledFn()
    }

    expect(mockGetKeys).toHaveBeenCalledWith('players/')
    expect(mockGetKeys).toHaveBeenCalledWith('subscribers/abc123')

    expect(mockGetItem).toHaveBeenCalledWith('players:server1')
    expect(mockGetItem).toHaveBeenCalledWith('players:server2')
    expect(mockGetItem).toHaveBeenCalledWith('subscriber1')
    expect(mockGetItem).toHaveBeenCalledWith('servers/server1')
    expect(mockGetItem).toHaveBeenCalledWith('playerQueue/abc123')

    expect(mockRemoveItem).toHaveBeenCalledWith('subscriber2') // Old subscriber removed
    expect(mockRemoveItem).not.toHaveBeenCalledWith('subscriber1')
    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('http://127.0.0.99:32401/:/timeline'),
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Plex-Token': 'token123'
        })
      })
    )
  })
})
