import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import usePlayers from '../composables/usePlayers'
import { getStereoPairs, isPlayerHidden } from './hubConfig'
import { findPlexTarget, resolvePlexTargets } from './plexTargets'

vi.mock('../composables/usePlayers', () => ({ default: vi.fn() }))
vi.mock('./hubConfig', () => ({ isPlayerHidden: vi.fn(), getStereoPairs: vi.fn() }))

const kitchen = { playerid: 'aa', name: 'Kitchen' } as IPlayerInfo
const office = { playerid: 'bb', name: 'Office' } as IPlayerInfo

describe('plexTargets', () => {
  beforeEach(() => {
    ;(getStereoPairs as Mock).mockResolvedValue([])
  })

  it('announces every visible player as its own target', async () => {
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 's1', playerInfo: kitchen },
      { serverId: 's1', playerInfo: office }
    ])
    ;(isPlayerHidden as Mock).mockImplementation(async (id: string) => id === office.playerid)

    expect(await resolvePlexTargets()).toEqual([{ id: 'aa', name: 'Kitchen', kind: 'player', serverId: 's1', memberIds: ['aa'] }])
    expect(await findPlexTarget('aa')).toMatchObject({ name: 'Kitchen' })
    expect(await findPlexTarget('bb')).toBeUndefined()
  })

  it('announces a stereo pair as one target under its left player and leaves out the right player', async () => {
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 's1', playerInfo: kitchen },
      { serverId: 's1', playerInfo: office },
      { serverId: 's1', playerInfo: { playerid: 'cc', name: 'Office 2' } }
    ])
    ;(isPlayerHidden as Mock).mockResolvedValue(false)
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Living Room', leftId: 'aa', rightId: 'bb' }])

    expect(await resolvePlexTargets()).toEqual([
      { id: 'aa', name: 'Living Room', kind: 'stereoPair', serverId: 's1', memberIds: ['aa', 'bb'] },
      { id: 'cc', name: 'Office 2', kind: 'player', serverId: 's1', memberIds: ['cc'] }
    ])
    expect(await findPlexTarget('bb')).toBeUndefined()
  })

  it('hides a stereo pair when its left player is hidden', async () => {
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 's1', playerInfo: kitchen },
      { serverId: 's1', playerInfo: office }
    ])
    ;(isPlayerHidden as Mock).mockImplementation(async (id: string) => id === kitchen.playerid)
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Living Room', leftId: 'aa', rightId: 'bb' }])

    expect(await resolvePlexTargets()).toEqual([])
  })

  it('keeps announcing the right player while its pair has no known left player', async () => {
    ;(usePlayers as Mock).mockResolvedValue([{ serverId: 's1', playerInfo: office }])
    ;(isPlayerHidden as Mock).mockResolvedValue(false)
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Living Room', leftId: 'aa', rightId: 'bb' }])

    expect(await resolvePlexTargets()).toEqual([{ id: 'bb', name: 'Office', kind: 'player', serverId: 's1', memberIds: ['bb'] }])
  })
})
