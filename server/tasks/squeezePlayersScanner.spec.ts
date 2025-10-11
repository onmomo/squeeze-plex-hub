import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc-x'
import type { ServerInfo } from 'lms-discovery'
import { runSqueezePlayersScanner } from './squeezePlayersScanner'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

// Mocks
vi.mock('../composables/useLogger', () => ({
  default: () => ({
    debug: (msg: string) => console.log(msg),
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.log(msg),
    error: (msg: string) => console.log(msg)
  })
}))

const mockSetItem = vi.fn()
const mockGetItem = vi.fn()
const mockGetKeys = vi.fn()
vi.stubGlobal('useStorage', () => ({
  setItem: mockSetItem,
  getKeys: mockGetKeys,
  getItem: mockGetItem
}))

const mockScheduler = {
  run: vi.fn(function () {
    return mockScheduler
  }),
  everySeconds: vi.fn()
}

// Mock composables
vi.mock('lms-squeeze-rpc-x', async () => {
  const actual = await vi.importActual<any>('lms-squeeze-rpc-x')
  return {
    ...actual,
    SqueezeServerStub: vi.fn(),
    SqueezeServer: vi.fn()
  }
})

describe('squeezePlayersScanner plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should scan servers and store player infos', async () => {
    const fakeServer: ServerInfo = {
      name: 'Test LMS',
      ip: '192.168.1.2',
      uuid: 'uuid-123',
      jsonPort: '9001',
      ver: undefined,
      cliPort: undefined
    }
    const fakePlayerInfos: IPlayerInfo[] = [
      {
        name: 'Player 1',
        playerid: 'id1',
        model: 'modelA',
        modelname: 'baby',
        firmware: 'v32',
        ip: '1.2.3.4'
      },
      {
        name: 'Player 2',
        playerid: 'id2',
        model: 'modelB',
        modelname: 'baby',
        firmware: 'v31',
        ip: '1.2.3.4'
      }
    ]
    mockGetKeys.mockResolvedValueOnce(['servers/uuid-123'])
    mockGetItem.mockResolvedValueOnce(fakeServer)
    ;(SqueezeServerStub as any).mockImplementation(() => ({}))
    ;(SqueezeServer as any).mockImplementation(() => ({
      getPlayerInfosAsync: vi.fn().mockResolvedValue(fakePlayerInfos)
    }))

    await runSqueezePlayersScanner()

    expect(mockSetItem).toHaveBeenCalledWith('players/uuid-123', fakePlayerInfos)
  })
})