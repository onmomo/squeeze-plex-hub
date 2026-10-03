import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import type { PlayerServerInfo } from './players.get'
import playersGetHandler from './players.get'
import usePlayers from '../../composables/usePlayers'
import usePlayerInfo from '../../composables/usePlayerInfo'
import { findStereoPair, getPlayerSettings } from '../../lib/hubConfig'

vi.mock('../../composables/useLogger', () => ({
  default: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

const mockPlayerInfo: IPlayerInfo = {
  playerid: 'abc123',
  name: 'Test Player',
  model: 'A-Model',
  modelname: 'Test Model Name',
  firmware: '1.0',
  ip: '1.0.0.127'
}

const mockPlayerInfo2: IPlayerInfo = {
  playerid: 'def456',
  name: 'Second Player',
  model: 'B-Model',
  modelname: 'Second Model Name',
  firmware: '2.0',
  ip: '1.0.0.128'
}

const mockServerInfo: ServerInfo = {
  ip: '127.0.0.1',
  jsonPort: '9090',
  name: 'Test Server',
  ver: '1.0',
  uuid: '3b49e508-de58-4e06-81a2-cf3615359213',
  cliPort: '9091'
} as ServerInfo

vi.mock('../../composables/usePlayers', () => ({
  default: vi.fn()
}))

vi.mock('../../composables/usePlayerInfo', () => ({
  default: vi.fn()
}))

vi.mock('../../lib/hubConfig', () => ({
  getPlayerSettings: vi.fn(),
  findStereoPair: vi.fn()
}))

function createEventMock() {
  return {
    __is_event__: true,
    node: {},
    context: {},
    _handled: false,
    respondWith: vi.fn()
  } as any
}

describe('players.get API handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(findStereoPair as Mock).mockResolvedValue(undefined)
    ;(getPlayerSettings as Mock).mockImplementation(async (playerid: string) => ({ hidden: playerid === mockPlayerInfo2.playerid }))
  })

  it('returns sorted playerServerInfo array', async () => {
    ;(usePlayers as Mock).mockResolvedValue([
      { playerInfo: mockPlayerInfo, serverId: mockServerInfo.uuid },
      { playerInfo: mockPlayerInfo2, serverId: mockServerInfo.uuid }
    ])
    ;(usePlayerInfo as Mock).mockImplementation(async (playerid: string) => {
      if (playerid === mockPlayerInfo.playerid) {
        return { playerInfo: mockPlayerInfo, serverInfo: mockServerInfo }
      }
      if (playerid === mockPlayerInfo2.playerid) {
        return { playerInfo: mockPlayerInfo2, serverInfo: mockServerInfo }
      }
    })

    const event = createEventMock()
    const result = await playersGetHandler(event)

    expect(Array.isArray(result)).toBe(true)
    expect(result as PlayerServerInfo[]).toHaveLength(2)
    // Sorted by model
    expect((result as PlayerServerInfo[])[0]!.playerInfo.model).toBe('A-Model')
    expect((result as PlayerServerInfo[])[1]!.playerInfo.model).toBe('B-Model')
    // Hidden players are still listed, with their settings
    expect((result as PlayerServerInfo[])[0]!.settings).toEqual({ hidden: false })
    expect((result as PlayerServerInfo[])[1]!.settings).toEqual({ hidden: true })
  })

  it('reports the stereo pair a player belongs to', async () => {
    ;(usePlayers as Mock).mockResolvedValue([{ playerInfo: mockPlayerInfo, serverId: mockServerInfo.uuid }])
    ;(usePlayerInfo as Mock).mockResolvedValue({ playerInfo: mockPlayerInfo, serverInfo: mockServerInfo })
    ;(findStereoPair as Mock).mockResolvedValue({
      pair: { name: 'Kitchen', leftId: mockPlayerInfo.playerid, rightId: 'other' },
      role: 'left'
    })

    const result = (await playersGetHandler(createEventMock())) as PlayerServerInfo[]
    expect(result[0]!.pair).toEqual({ name: 'Kitchen', role: 'left', partnerId: 'other' })
  })

  it('returns 404 and message if no LMS found, try/catch', async () => {
    ;(usePlayers as Mock).mockRejectedValue(new Error('No LMS'))
    const event = createEventMock()
    await playersGetHandler(event)
    expect(event.respondWith).toHaveBeenCalledWith(expect.objectContaining({ status: 404 } as Response))
  })

  it('returns empty array if no players found', async () => {
    ;(usePlayers as Mock).mockResolvedValue([])
    const event = createEventMock()
    const result = await playersGetHandler(event)
    expect(result).toHaveLength(0)
  })
})
