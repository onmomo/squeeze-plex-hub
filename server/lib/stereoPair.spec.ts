import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import usePlayerInfo from '../composables/usePlayerInfo'
import { getStereoPairs } from './hubConfig'
import { dissolveStereoPair, formStereoPair, reconcileStereoPair, reconcileStereoPairs, supportsStereoPair } from './stereoPair'

vi.mock('../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../composables/useSqueezePlayer', () => ({ default: vi.fn() }))
vi.mock('../composables/usePlayerInfo', () => ({ default: vi.fn() }))
vi.mock('./hubConfig', () => ({ getStereoPairs: vi.fn() }))

const calls: string[] = []
const fakePlayer = (id: string) => ({
  unsync: vi.fn(async () => calls.push(`${id}.unsync`)),
  syncTo: vi.fn(async (other: string) => calls.push(`${id}.syncTo(${other})`)),
  setOutputChannels: vi.fn(async (channels: string) => calls.push(`${id}.channels(${channels})`))
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
    expect(calls).toEqual(['aa.unsync', 'bb.unsync', 'bb.syncTo(aa)', 'aa.channels(left)', 'bb.channels(right)'])
  })

  it('resets both players when dissolving, even if one is unreachable', async () => {
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => {
      if (id === 'aa') throw new Error('offline')
      return { player: players[id] }
    })
    await dissolveStereoPair('aa', 'bb')
    expect(calls).toEqual(['bb.unsync', 'bb.channels(stereo)'])
  })
})

describe('reconcileStereoPair', () => {
  const pair = { name: 'Kitchen', leftId: 'aa', rightId: 'bb' }
  let channels: Record<string, string>
  let connected: Record<string, boolean>
  let syncMembers: string | undefined
  const requestAsync = vi.fn()

  const player = (id: string) => ({
    ...fakePlayer(id),
    isConnected: vi.fn(async () => connected[id]),
    getOutputChannels: vi.fn(async () => channels[id])
  })

  beforeEach(() => {
    calls.length = 0
    channels = { aa: 'left', bb: 'right' }
    connected = { aa: true, bb: true }
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
    expect(calls).toEqual(['aa.unsync', 'bb.unsync', 'bb.syncTo(aa)', 'aa.channels(left)', 'bb.channels(right)'])
  })

  it('treats a sync group of other players as not synced', async () => {
    syncMembers = 'aa,cc'
    expect(await reconcileStereoPair(pair)).toBe('repaired')
  })

  it('only resets the output if the pair is synced but the channels are off', async () => {
    channels = { aa: 'stereo', bb: 'right' }
    expect(await reconcileStereoPair(pair)).toBe('repaired')
    expect(calls).toEqual(['aa.channels(left)', 'bb.channels(right)'])
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
    vi.stubGlobal('useStorage', () => ({ setItem }))
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
    ;(usePlayerInfo as Mock).mockRejectedValue(new Error('Player not found in storage'))

    await reconcileStereoPairs()
    expect(setItem).toHaveBeenCalledWith('pairStatus/aa', { state: 'offline', checkedAt: expect.any(Number) })
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
