import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc-x'
import type { ServerInfo } from 'lms-discovery'
import squeezePlayersScannerTask, { runSqueezePlayersScanner } from './squeezePlayersScanner'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import { reconcileStereoPairs, supportsStereoPair } from '../lib/stereoPair'

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

vi.mock('../lib/stereoPair', () => ({
  reconcileStereoPairs: vi.fn(),
  playerCapabilitiesKey: (id: string) => `playerCapabilities/${id}`,
  supportsStereoPair: vi.fn().mockResolvedValue(true)
}))

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
    ;(SqueezeServerStub as any).mockImplementation(function () {
      return {}
    })
    ;(SqueezeServer as any).mockImplementation(function () {
      return { getPlayerInfosAsync: vi.fn().mockResolvedValue(fakePlayerInfos) }
    })

    await runSqueezePlayersScanner()

    expect(mockSetItem).toHaveBeenCalledWith('players/uuid-123', fakePlayerInfos)
  })

  it('scans for players when run as task', async () => {
    mockGetKeys.mockResolvedValue([])
    expect(await (squeezePlayersScannerTask as any).run({})).toEqual({ result: 'ok' })
    expect(mockGetKeys).toHaveBeenCalledWith('servers/')
  })

  it('skips scanning in demo mode', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true }))
    expect(await (squeezePlayersScannerTask as any).run({})).toEqual({ result: 'skipped' })
    expect(mockGetKeys).not.toHaveBeenCalled()
    vi.stubGlobal('useRuntimeConfig', () => ({ appVersion: '1.2.3-test' }))
  })

  it('restores stereo pairs after storing the players, even if that fails', async () => {
    const fakeServer = { name: 'Test LMS', ip: '192.168.1.2', uuid: 'uuid-123', jsonPort: '9001' } as ServerInfo
    mockGetKeys.mockResolvedValue(['servers/uuid-123'])
    mockGetItem.mockResolvedValue(fakeServer)
    ;(SqueezeServer as unknown as Mock).mockImplementation(function () {
      return { getPlayerInfosAsync: vi.fn().mockResolvedValue([]) }
    })
    ;(reconcileStereoPairs as Mock).mockRejectedValue(new Error('boom'))

    await expect(runSqueezePlayersScanner()).resolves.toBeUndefined()
    expect(reconcileStereoPairs).toHaveBeenCalledTimes(1)
  })

  it('keeps scanning the other servers and checks the pairs if one LMS fails', async () => {
    const servers: Record<string, unknown> = {
      'servers/u1': { name: 'Down', ip: '10.0.0.1', uuid: 'u1' },
      'servers/u2': { name: 'Up', ip: '10.0.0.2', uuid: 'u2' }
    }
    const players = [{ name: 'P', playerid: 'id1', model: 'm', modelname: 'baby', firmware: '1', ip: '1.2.3.4' }]
    mockGetKeys.mockResolvedValue(Object.keys(servers))
    mockGetItem.mockImplementation(async (key: string) => servers[key] ?? null)
    let call = 0
    ;(SqueezeServer as unknown as Mock).mockImplementation(function () {
      return { getPlayerInfosAsync: vi.fn(async () => (call++ === 0 ? Promise.reject(new Error('down')) : players)) }
    })
    ;(SqueezeServerStub as unknown as Mock).mockImplementation(function () {
      return {}
    })
    ;(reconcileStereoPairs as Mock).mockResolvedValue(undefined)

    await runSqueezePlayersScanner()
    expect(mockSetItem).toHaveBeenCalledWith('players/u2', players)
    expect(reconcileStereoPairs).toHaveBeenCalledTimes(1)
  })

  it('asks again after a while if a player was not able to pair, but never if it is', async () => {
    const server = { name: 'LMS', ip: '10.0.0.1', uuid: 'u1' }
    const infos = ['a', 'b', 'c', 'd'].map((playerid) => ({
      name: playerid,
      playerid,
      model: 'm',
      modelname: 'baby',
      firmware: '1',
      ip: '1'
    }))
    const stored: Record<string, unknown> = {
      'playerCapabilities/a': { outputChannels: true, checkedAt: 0 },
      'playerCapabilities/b': { outputChannels: false, checkedAt: Date.now() },
      'playerCapabilities/c': { outputChannels: false, checkedAt: Date.now() - 11 * 60 * 1000 }
    }
    mockGetKeys.mockResolvedValue(['servers/u1'])
    mockGetItem.mockImplementation(async (key: string) => (key === 'servers/u1' ? server : (stored[key] ?? null)))
    ;(SqueezeServer as unknown as Mock).mockImplementation(function () {
      return { getPlayerInfosAsync: vi.fn().mockResolvedValue(infos) }
    })
    ;(SqueezeServerStub as unknown as Mock).mockImplementation(function () {
      return {}
    })
    ;(supportsStereoPair as Mock).mockClear()

    await runSqueezePlayersScanner()
    expect((supportsStereoPair as Mock).mock.calls.map((call) => call[1]).sort()).toEqual(['c', 'd'])
    expect(mockSetItem).toHaveBeenCalledWith('playerCapabilities/c', { outputChannels: true, checkedAt: expect.any(Number) })
  })
})
