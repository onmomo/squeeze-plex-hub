import type { Mock } from 'vitest';
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
const mockAddToPlaylist = vi.fn()

vi.mock('../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: { addToPlaylist: mockAddToPlaylist }
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
    storageMock.getKeys.mockReset()
    storageMock.getItem.mockReset()
    storageMock.setItem.mockReset()
    mockAddToPlaylist.mockReset()
    ;(getPlayQueue as Mock).mockReset()
  })

  it('skips if no players found', async () => {
    storageMock.getKeys.mockResolvedValue([])
    await runPlayQueueRefresher()
    expect(storageMock.getKeys).toHaveBeenCalledWith('players/')
    expect(storageMock.getItem).not.toHaveBeenCalled()
    expect(mockAddToPlaylist).not.toHaveBeenCalled()
  })

  it('skips if no playerQueue found', async () => {
    storageMock.getKeys.mockResolvedValue(['players/server1'])
    storageMock.getItem.mockResolvedValueOnce([{ playerid: 'p1', name: 'Player 1' }])
    storageMock.getItem.mockResolvedValueOnce(undefined) // playerQueue
    await runPlayQueueRefresher()
    expect(storageMock.getItem).toHaveBeenCalledWith('players/server1')
    expect(mockAddToPlaylist).not.toHaveBeenCalled()
  })

  it('adds new tracks if playQueue size increased', async () => {
    storageMock.getKeys.mockResolvedValue(['players/server1'])
    storageMock.getItem.mockResolvedValueOnce([{ playerid: 'p1', name: 'Player 1' }])
    storageMock.getItem.mockResolvedValueOnce({
      playerid: 'p1',
      playQueue: {
        MediaContainer: {
          $: { playQueueID: 'pqid', size: '1' },
          Track: [{ $: { title: 'Old Track', key: 'old', playQueueItemID: '100' } }]
        }
      },
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    ;(getPlayQueue as Mock).mockResolvedValue({
      MediaContainer: {
        $: { playQueueID: 'pqid', size: '2' },
        Track: [
          { $: { title: 'Old Track', key: 'old', playQueueItemID: '100' } },
          { $: { title: 'New Track', key: 'new', playQueueItemID: '101' } }
        ]
      }
    })
    await runPlayQueueRefresher()
    expect(mockAddToPlaylist).toHaveBeenCalledWith('http://track.url', 'meta')
    expect(storageMock.setItem).toHaveBeenCalledWith('playerQueue/p1', expect.anything())
  })

  it('skips if playQueue size unchanged', async () => {
    storageMock.getKeys.mockResolvedValue(['players/server1'])
    storageMock.getItem.mockResolvedValueOnce([{ playerid: 'p1', name: 'Player 1' }])
    storageMock.getItem.mockResolvedValueOnce({
      playerid: 'p1',
      playQueue: {
        MediaContainer: {
          $: { playQueueID: 'pqid', size: '1' },
          Track: [{ $: { title: 'Old Track', key: 'old', playQueueItemID: '100' } }]
        }
      },
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    ;(getPlayQueue as Mock).mockResolvedValue({
      MediaContainer: {
        $: { playQueueID: 'pqid', size: '1' },
        Track: [{ $: { title: 'Old Track', key: 'old', playQueueItemID: '100' } }]
      }
    })
    await runPlayQueueRefresher()
    expect(mockAddToPlaylist).not.toHaveBeenCalled()
    expect(storageMock.setItem).not.toHaveBeenCalled()
  })

  it('handles PMS trimming: adds new tracks when old tracks are removed and new ones added', async () => {
    storageMock.getKeys.mockResolvedValue(['players/server1'])
    storageMock.getItem.mockResolvedValueOnce([{ playerid: 'p1', name: 'Player 1' }])
    // Initial queue has 3 tracks (IDs: 100, 101, 102)
    storageMock.getItem.mockResolvedValueOnce({
      playerid: 'p1',
      playQueue: {
        MediaContainer: {
          $: { playQueueID: 'pqid', size: '3' },
          Track: [
            { $: { title: 'Track 1', key: 'track1', playQueueItemID: '100' } },
            { $: { title: 'Track 2', key: 'track2', playQueueItemID: '101' } },
            { $: { title: 'Track 3', key: 'track3', playQueueItemID: '102' } }
          ]
        }
      },
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    // PMS trimmed the queue: removed track 100, kept 101 and 102, added 103 and 104
    ;(getPlayQueue as Mock).mockResolvedValue({
      MediaContainer: {
        $: { playQueueID: 'pqid', size: '4' },
        Track: [
          { $: { title: 'Track 2', key: 'track2', playQueueItemID: '101' } },
          { $: { title: 'Track 3', key: 'track3', playQueueItemID: '102' } },
          { $: { title: 'Track 4', key: 'track4', playQueueItemID: '103' } },
          { $: { title: 'Track 5', key: 'track5', playQueueItemID: '104' } }
        ]
      }
    })
    await runPlayQueueRefresher()
    // Should add only the 2 new tracks (103 and 104)
    expect(mockAddToPlaylist).toHaveBeenCalledTimes(2)
    expect(storageMock.setItem).toHaveBeenCalledWith('playerQueue/p1', expect.anything())
  })

  it('handles errors gracefully', async () => {
    storageMock.getKeys.mockRejectedValue(new Error('fail'))
    await expect(runPlayQueueRefresher()).resolves.toBeUndefined()
  })
})
