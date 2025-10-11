import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import usePlayerInfo from './usePlayerInfo'
import usePlayers from './usePlayers'

vi.mock('./usePlayers', () => ({
  default: vi.fn()
}))

const mockPlayerInfo: IPlayerInfo = {
  playerid: 'abc123',
  name: 'Test Player',
  model: 'Test Model',
  modelname: 'Test Model Name',
  firmware: '1.0',
  ip: '1.0.0.127'
}

const mockServerInfo: ServerInfo = {
  ip: '127.0.0.1',
  jsonPort: '9090',
  name: 'Test Server',
  ver: '1.0',
  uuid: '3b49e508-de58-4e06-81a2-cf3615359213',
  cliPort: '9091'
} as ServerInfo

const playerInfoWithServerId = {
  playerInfo: mockPlayerInfo,
  serverId: mockServerInfo.uuid
}

const mockPlayerInfo2: IPlayerInfo = {
  playerid: 'def456',
  name: 'Second Player',
  model: 'Second Model',
  modelname: 'Second Model Name',
  firmware: '2.0',
  ip: '1.0.0.128'
}

const playerInfoWithServerId2 = {
  playerInfo: mockPlayerInfo2,
  serverId: mockServerInfo.uuid
}

const getItemMock = vi.fn()
const useStorageMock = vi.fn().mockReturnValue({
  getItem: getItemMock
})

vi.stubGlobal('useStorage', useStorageMock)

describe('usePlayerInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns playerInfo, serverInfo, and serverStub for a valid player', async () => {
    ;(usePlayers as Mock).mockResolvedValue([playerInfoWithServerId, playerInfoWithServerId2])
    getItemMock.mockResolvedValue(mockServerInfo)

    const result = await usePlayerInfo('abc123')
    expect(result.playerInfo).toEqual(mockPlayerInfo)
    expect(result.serverInfo).toEqual(mockServerInfo)
    expect(result.serverStub).toBeDefined()
  })

  it('throws if player is not found', async () => {
    ;(usePlayers as Mock).mockResolvedValue([playerInfoWithServerId2])
    await expect(usePlayerInfo('abc123')).rejects.toThrow("Player not found in storage for targetClientIdentifier 'abc123'")
  })
})
