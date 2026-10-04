import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import usePlayerInfo from '../composables/usePlayerInfo'
import { getPendingResets, getStereoPairs, removePendingReset } from './hubConfig'
import {
  applyPendingResets,
  dissolveStereoPair,
  formStereoPair,
  reconcileStereoPair,
  reconcileStereoPairs,
  supportsStereoPair,
  withPairLock
} from './stereoPair'

vi.mock('../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../composables/useSqueezePlayer', () => ({ default: vi.fn() }))
vi.mock('../composables/usePlayerInfo', () => ({ default: vi.fn() }))
vi.mock('./hubConfig', () => ({ getStereoPairs: vi.fn(), getPendingResets: vi.fn(), removePendingReset: vi.fn() }))

const calls: string[] = []
const fakePlayer = (id: string) => ({
  unsync: vi.fn(async () => calls.push(`${id}.unsync`)),
  syncTo: vi.fn(async (other: string) => calls.push(`${id}.syncTo(${other})`)),
  setOutputChannels: vi.fn(async (channels: string) => calls.push(`${id}.channels(${channels})`)),
  setSyncVolume: vi.fn(async (on: boolean) => calls.push(`${id}.syncVolume(${on})`)),
  status: vi.fn(async () => ({ volume: 40 })),
  setVolume: vi.fn(async (volume: number) => calls.push(`${id}.volume(${volume})`))
})

describe('stereoPair', () => {
  let players: Record<string, ReturnType<typeof fakePlayer>>

  beforeEach(() => {
    calls.length = 0
    players = { aa: fakePlayer('aa'), bb: fakePlayer('bb') }
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => ({ player: players[id] }))
  })

  it('syncs the right player to the left one and sets the output channels', async () => {
    await formStereoPair('aa', 'bb')
    expect(calls).toEqual([
      'aa.unsync',
      'bb.unsync',
      'bb.syncTo(aa)',
      'aa.channels(left)',
      'bb.channels(right)',
      'aa.syncVolume(true)',
      'bb.syncVolume(true)',
      'aa.volume(40)'
    ])
  })

  it('resets both players when dissolving, even if one is unreachable', async () => {
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => {
      if (id === 'aa') throw new Error('offline')
      return { player: players[id] }
    })
    expect(await dissolveStereoPair('aa', 'bb')).toEqual(['aa'])
    expect(calls).toEqual(['bb.unsync', 'bb.channels(stereo)', 'bb.syncVolume(false)'])
  })

  it('does not leave half a pair behind if LMS rejects a command', async () => {
    players.bb!.syncTo.mockRejectedValue(new Error('rejected'))
    await expect(formStereoPair('aa', 'bb')).rejects.toThrow('rejected')
    expect(calls).toEqual([
      'aa.unsync',
      'bb.unsync',
      'aa.unsync',
      'aa.channels(stereo)',
      'aa.syncVolume(false)',
      'bb.unsync',
      'bb.channels(stereo)',
      'bb.syncVolume(false)'
    ])
  })
})

describe('reconcileStereoPair', () => {
  const pair = { name: 'Kitchen', leftId: 'aa', rightId: 'bb' }
  let channels: Record<string, string>
  let connected: Record<string, boolean>
  let syncVolume: Record<string, boolean>
  let syncMembers: string | undefined
  const requestAsync = vi.fn()

  const player = (id: string) => ({
    ...fakePlayer(id),
    isConnected: vi.fn(async () => connected[id]),
    getOutputChannels: vi.fn(async () => channels[id]),
    getSyncVolume: vi.fn(async () => syncVolume[id])
  })

  beforeEach(() => {
    calls.length = 0
    channels = { aa: 'left', bb: 'right' }
    connected = { aa: true, bb: true }
    syncVolume = { aa: true, bb: true }
    syncMembers = 'aa,bb'
    const players = { aa: player('aa'), bb: player('bb') } as Record<string, any>
    requestAsync.mockImplementation(async () => ({ syncgroups_loop: syncMembers ? [{ sync_members: syncMembers }] : [] }))
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => ({ player: players[id] }))
    ;(usePlayerInfo as Mock).mockResolvedValue({ serverStub: { requestAsync } })
  })

  it('leaves an intact pair alone', async () => {
    expect(await reconcileStereoPair(pair)).toBe('ok')
    expect(calls).toEqual([])
  })

  it('re-syncs a pair that is no longer synced', async () => {
    syncMembers = undefined
    expect(await reconcileStereoPair(pair)).toBe('repaired')
    expect(calls).toEqual([
      'aa.unsync',
      'bb.unsync',
      'bb.syncTo(aa)',
      'aa.channels(left)',
      'bb.channels(right)',
      'aa.syncVolume(true)',
      'bb.syncVolume(true)',
      'aa.volume(40)'
    ])
  })

  it('treats a sync group of other players as not synced', async () => {
    syncMembers = 'aa,cc'
    expect(await reconcileStereoPair(pair)).toBe('repaired')
  })

  it('only resets the output if the pair is synced but the channels are off', async () => {
    channels = { aa: 'stereo', bb: 'right' }
    expect(await reconcileStereoPair(pair)).toBe('repaired')
    expect(calls).toEqual(['aa.channels(left)', 'bb.channels(right)', 'aa.syncVolume(true)', 'bb.syncVolume(true)'])
  })

  it('restores linked volumes if they were switched off', async () => {
    syncVolume = { aa: true, bb: false }
    expect(await reconcileStereoPair(pair)).toBe('repaired')
    expect(calls).toContain('bb.syncVolume(true)')
  })

  it('does nothing while a member is not connected', async () => {
    connected.bb = false
    syncMembers = undefined
    expect(await reconcileStereoPair(pair)).toBe('offline')
    expect(calls).toEqual([])
  })

  it('reports offline for players the hub does not know and error if LMS fails', async () => {
    ;(usePlayerInfo as Mock).mockRejectedValueOnce(new Error("Player not found in storage for targetClientIdentifier 'aa'"))
    expect(await reconcileStereoPair(pair)).toBe('offline')
    requestAsync.mockRejectedValueOnce(new Error('LMS down'))
    expect(await reconcileStereoPair(pair)).toBe('error')
  })
})

describe('reconcileStereoPairs', () => {
  it('stores the state of every pair for the dashboard', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('useStorage', () => ({ setItem, getItem: vi.fn().mockResolvedValue(null) }))
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
    ;(getPendingResets as Mock).mockResolvedValue([])
    ;(usePlayerInfo as Mock).mockRejectedValue(new Error('Player not found in storage'))

    await reconcileStereoPairs()
    expect(setItem).toHaveBeenCalledWith('pairStatus/aa', { state: 'offline', checkedAt: expect.any(Number), offlineChecks: 1 })
  })
})

describe('reconcileStereoPairs offline debounce', () => {
  it('reports a pair offline only after repeated checks found a member disconnected', async () => {
    const stored: Record<string, any> = { 'pairStatus/aa': { state: 'ok', checkedAt: 1 } }
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => stored[key] ?? null,
      setItem: async (key: string, value: unknown) => {
        stored[key] = value
      }
    }))
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
    ;(getPendingResets as Mock).mockResolvedValue([])
    ;(usePlayerInfo as Mock).mockRejectedValue(new Error('Player not found in storage'))

    await reconcileStereoPairs()
    await reconcileStereoPairs()
    expect(stored['pairStatus/aa']).toMatchObject({ state: 'ok', offlineChecks: 2 })
    await reconcileStereoPairs()
    expect(stored['pairStatus/aa']).toMatchObject({ state: 'offline', offlineChecks: 3 })

    // Back online: reset immediately
    ;(usePlayerInfo as Mock).mockResolvedValue({
      serverStub: { requestAsync: async () => ({ syncgroups_loop: [{ sync_members: 'aa,bb' }] }) }
    })
    ;(useSqueezePlayer as Mock).mockImplementation(async () => ({
      player: { isConnected: async () => true, getOutputChannels: async () => 'left' }
    }))
    await reconcileStereoPairs()
    expect(stored['pairStatus/aa']).toMatchObject({ state: 'error', offlineChecks: 0 })
  })
})

describe('supportsStereoPair', () => {
  it.each([
    [{ _p2: '0' }, true],
    [{ _p2: '3' }, true],
    [{}, false],
    [{ _p2: '' }, false]
  ])('reads the pref %j as %s', async (response, expected) => {
    expect(await supportsStereoPair({ requestAsync: async () => response } as any, 'aa')).toBe(expected)
  })
})

describe('pair locks and pending resets', () => {
  beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
  })

  it('does not reconcile a pair while it is being changed', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('useStorage', () => ({ setItem, getItem: vi.fn().mockResolvedValue(null) }))
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
    ;(getPendingResets as Mock).mockResolvedValue([])
    ;(usePlayerInfo as Mock).mockRejectedValue(new Error('Player not found in storage'))

    await withPairLock('aa', () => reconcileStereoPairs())
    expect(setItem).not.toHaveBeenCalled()
    await reconcileStereoPairs()
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('resets players of a dissolved pair once they are connected again', async () => {
    const players: Record<string, any> = {
      aa: { ...fakePlayer('aa'), isConnected: vi.fn(async () => false) },
      bb: { ...fakePlayer('bb'), isConnected: vi.fn(async () => true) }
    }
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => ({ player: players[id] }))
    ;(getStereoPairs as Mock).mockResolvedValue([])
    ;(getPendingResets as Mock).mockResolvedValue(['aa', 'bb'])

    await applyPendingResets()
    expect(calls).toEqual(['bb.unsync', 'bb.channels(stereo)', 'bb.syncVolume(false)'])
    expect(removePendingReset).toHaveBeenCalledTimes(1)
    expect(removePendingReset).toHaveBeenCalledWith('bb')
  })

  it('drops a pending reset of a player that is part of a pair again', async () => {
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
    ;(getPendingResets as Mock).mockResolvedValue(['bb'])
    await applyPendingResets()
    expect(removePendingReset).toHaveBeenCalledWith('bb')
    expect(calls).toEqual([])
  })
})
