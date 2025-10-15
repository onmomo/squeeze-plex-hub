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
          Track: [{ $: { title: 'Old Track', key: 'old' } }]
        }
      },
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    ;(getPlayQueue as Mock).mockResolvedValue({
      MediaContainer: {
        $: { playQueueID: 'pqid', size: '2' },
        Track: [{ $: { title: 'Old Track', key: 'old' } }, { $: { title: 'New Track', key: 'new' } }]
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
          Track: [{ $: { title: 'Old Track', key: 'old' } }]
        }
      },
      plexServer: { server: { protocol: 'http', localAddress: '127.0.0.1', port: 32400 } }
    })
    ;(getPlayQueue as Mock).mockResolvedValue({
      MediaContainer: {
        $: { playQueueID: 'pqid', size: '1' },
        Track: [{ $: { title: 'Old Track', key: 'old' } }]
      }
    })
    await runPlayQueueRefresher()
    expect(mockAddToPlaylist).not.toHaveBeenCalled()
    expect(storageMock.setItem).not.toHaveBeenCalled()
  })

  it('handles errors gracefully', async () => {
    storageMock.getKeys.mockRejectedValue(new Error('fail'))
    await expect(runPlayQueueRefresher()).resolves.toBeUndefined()
  })
})
