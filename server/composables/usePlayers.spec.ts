import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import type { PlayerInfoWithServerId } from './usePlayers'
import usePlayers from './usePlayers'

function useStorage() {
  return { 
    getItem: vi.fn(() =>  Promise.resolve([mockPlayerInfo, mockPlayerInfo2])),
    getKeys: vi.fn(() => Promise.resolve([`players:${mockServerInfo.uuid}`])), // returned keys are namespaces by ':' 
  }
}
vi.stubGlobal('useStorage', useStorage)

const mockPlayerInfo: IPlayerInfo = {
  playerid: 'abc123',
  name: 'Test Player',  
  model: 'Test Model',
  modelname: 'Test Model Name',
  firmware: '1.0',
  ip: '1.0.0.127',
}

const mockServerInfo: ServerInfo = {
  ip: '127.0.0.1',
  jsonPort: '9090',
  name: 'Test Server',
  ver: '1.0',
  uuid: '3b49e508-de58-4e06-81a2-cf3615359213',
  cliPort: '9091'
} as ServerInfo

const playerInfoWithServerId: PlayerInfoWithServerId = {
  playerInfo: mockPlayerInfo,
  serverId: mockServerInfo.uuid
}

const mockPlayerInfo2: IPlayerInfo = {
  playerid: 'def456',
  name: 'Second Player',
  model: 'Second Model',
  modelname: 'Second Model Name',
  firmware: '2.0',
  ip: '1.0.0.128',
}

const playerInfoWithServerId2: PlayerInfoWithServerId = {
  playerInfo: mockPlayerInfo2,
  serverId: mockServerInfo.uuid
}

describe('usePlayers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns players', async () => {    
    const result = await usePlayers()
    expect(result).toHaveLength(2)
    expect(result).toEqual([playerInfoWithServerId, playerInfoWithServerId2])
  })

})