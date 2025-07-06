import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
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
  run: vi.fn(function (fn) {
    return mockScheduler
  }),
  everySeconds: vi.fn()
}

// Mock composables
vi.mock('#scheduler', () => ({
  useScheduler: () => mockScheduler
}))

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

  it('should schedule the scanner to run every 10 seconds, skip for no results', async () => {
    mockGetKeys.mockResolvedValueOnce(undefined)

    runSqueezePlayersScanner()
    // Manually invoke the callback passed to run()
    await executeRunCallback()
    expect(mockScheduler.run).toHaveBeenCalled()
    expect(mockScheduler.everySeconds).toHaveBeenCalledWith(10)
    expect(mockSetItem).not.toHaveBeenCalled()
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

    runSqueezePlayersScanner()

    // Manually invoke the callback passed to run()
    await executeRunCallback()

    expect(mockSetItem).toHaveBeenCalledWith('players/uuid-123', fakePlayerInfos)
  })
})

/**
 * Executes the run callback of the mock scheduler.
 * This is necessary because the scheduler's run method is mocked and does not automatically execute the callback
 */
async function executeRunCallback() {
  // Manually invoke the callback passed to run() and await its completion
  const runCallback = (mockScheduler.run as Mock).mock.calls[0][0]
  if (runCallback) {
    await runCallback()
  }
}
