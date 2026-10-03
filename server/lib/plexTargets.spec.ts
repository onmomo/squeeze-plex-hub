import { describe, expect, it, vi, type Mock } from 'vitest'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import usePlayers from '../composables/usePlayers'
import { isPlayerHidden } from './hubConfig'
import { findPlexTarget, resolvePlexTargets } from './plexTargets'

vi.mock('../composables/usePlayers', () => ({ default: vi.fn() }))
vi.mock('./hubConfig', () => ({ isPlayerHidden: vi.fn() }))

const kitchen = { playerid: 'aa', name: 'Kitchen' } as IPlayerInfo
const chromecast = { playerid: 'bb', name: 'Chromecast' } as IPlayerInfo

describe('plexTargets', () => {
  it('announces every visible player as its own target', async () => {
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 's1', playerInfo: kitchen },
      { serverId: 's1', playerInfo: chromecast }
    ])
    ;(isPlayerHidden as Mock).mockImplementation(async (id: string) => id === chromecast.playerid)

    expect(await resolvePlexTargets()).toEqual([{ id: 'aa', name: 'Kitchen', kind: 'player', serverId: 's1', memberIds: ['aa'] }])
    expect(await findPlexTarget('aa')).toMatchObject({ name: 'Kitchen' })
    expect(await findPlexTarget('bb')).toBeUndefined()
  })
})
