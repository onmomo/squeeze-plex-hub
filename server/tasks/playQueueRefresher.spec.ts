import type { Mock } from 'vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPlayQueueRefresher } from './playQueueRefresher'
import { getPlayQueue } from '../lib/plexApi'

vi.mock('../composables/useLogger', () => {
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

// Mock useSqueezePlayer
const mockClearPlaylist = vi.fn()
const mockAddToPlaylist = vi.fn()

vi.mock('../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: { addToPlaylist: mockAddToPlaylist, clearPlaylist: mockClearPlaylist }
  }))
}))

vi.mock('../composables/usePlayerInfo', () => ({
  default: vi.fn(async () => ({
    playerInfo: { playerid: 'player1', name: 'Living Room' }
  }))
}))

// Mock plexApi
vi.mock('../lib/plexApi', () => {
  const getPlayQueue = vi.fn()
  const getPlexApiTrack = vi.fn().mockReturnValue('http://track.url')
  const metadata = vi.fn().mockReturnValue('meta')
  return {
    getPlayQueue,
    getPlexApiTrack,
    metadata
  }
})

// Mock storage
const storageMock = {
  getKeys: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn()
}
vi.stubGlobal('useStorage', () => storageMock)

describe('runPlayQueueRefresher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns undefined if playerIdentifier is missing', async () => {
    const result = await runPlayQueueRefresher({ playerIdentifier: '' })
    expect(result).toBeUndefined()
  })

  it('returns undefined if no playQueue is available', async () => {
    storageMock.getItem.mockResolvedValueOnce(undefined)
    const result = await runPlayQueueRefresher({ playerIdentifier: 'player1' })
    expect(result).toBeUndefined()
  })

  it('refreshes playQueue and returns refreshedPlayerQueue', async () => {
    // Mock the playQueue object returned from storage
    const mockPlayQueue = {
      MediaContainer: {
        $: { playQueueID: 'pq123' }
      }
    }
    storageMock.getItem.mockResolvedValueOnce({
      playerId: 'player1',
      playQueue: mockPlayQueue,
      plexServer: 'server1'
    })

    // Mock getPlayQueue to return a refreshed playQueue
    const refreshedPlayQueue = {
      MediaContainer: {
        $: {
          playQueueID: 'pq123',
          size: 4,
          playQueueSelectedItemID: 'pq-2',
          playQueueSelectedItemOffset: 1
        },
        Track: [
          { $: { playQueueItemID: 'pq-1', title: 'Track 1', key: '/library/metadata/1' } },
          { $: { playQueueItemID: 'pq-2', title: 'Track 2', key: '/library/metadata/2' } },
          { $: { playQueueItemID: 'pq-3', title: 'Track 3', key: '/library/metadata/3' } },
          { $: { playQueueItemID: 'pq-4', title: 'Track 4', key: '/library/metadata/4' } }
        ]
      }
    }
    ;(getPlayQueue as Mock).mockResolvedValueOnce(refreshedPlayQueue)

    const result = await runPlayQueueRefresher({ playerIdentifier: 'player1' })
    expect(mockClearPlaylist).toHaveBeenCalled()
    expect(mockAddToPlaylist).toHaveBeenCalledTimes(4)
    expect(storageMock.getItem).toHaveBeenCalledWith('playerQueue/player1')
    expect(storageMock.setItem).toHaveBeenCalledWith(
      'playerQueue/player1',
      expect.objectContaining({
        playerId: 'player1',
        playQueue: refreshedPlayQueue,
        plexServer: 'server1'
      })
    )
    expect(result).toEqual({
      playerId: 'player1',
      playQueue: refreshedPlayQueue,
      plexServer: 'server1'
    })
  })

  it('logs error and returns undefined on exception', async () => {
    storageMock.getItem.mockRejectedValueOnce(new Error('fail'))
    const result = await runPlayQueueRefresher({ playerIdentifier: 'player1' })
    expect(result).toBeUndefined()
  })
})
