import dgram from 'dgram'
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

import { runGdmAnnouncer } from './gdmAnnouncer'

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  })
}))

const mockGetKeys = vi.fn()
const mockGetItem = vi.fn()
function useStorage() {
  return {
    getKeys: mockGetKeys,
    getItem: mockGetItem
  }
}
vi.stubGlobal('useStorage', useStorage)

describe('gdmAnnouncer', () => {
  let server: any
  let messageHandler: any
  let listeningHandler: any
  let errorHandler: any

  beforeEach(() => {
    // Mock dgram.createSocket
    server = {
      on: vi.fn((event, cb) => {
        if (event === 'message') messageHandler = cb
        if (event === 'listening') listeningHandler = cb
        if (event === 'error') errorHandler = cb
      }),
      addMembership: vi.fn(),
      setMulticastTTL: vi.fn(),
      setTTL: vi.fn(),
      send: vi.fn(),
      bind: vi.fn(),
      close: vi.fn()
    }
    vi.spyOn(dgram, 'createSocket').mockReturnValue(server as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should bind to the correct port and set up listeners', () => {
    runGdmAnnouncer()
    expect(dgram.createSocket).toHaveBeenCalledWith({ type: 'udp4', reuseAddr: true })
    expect(server.on).toHaveBeenCalledWith('listening', expect.any(Function))
    expect(server.on).toHaveBeenCalledWith('message', expect.any(Function))
    expect(server.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(server.bind).toHaveBeenCalledWith(32412)
  })

  it('should handle listening event and set multicast options', () => {
    runGdmAnnouncer()
    listeningHandler()
    expect(server.addMembership).toHaveBeenCalledWith('239.255.255.250')
    expect(server.setMulticastTTL).toHaveBeenCalledWith(5)
    expect(server.setTTL).toHaveBeenCalledWith(64)
  })

  it('should respond to M-SEARCH discovery requests with player info', async () => {
    const player: IPlayerInfo = { name: 'Player1', playerid: 'abc123' } as any
    mockGetKeys.mockResolvedValue(['players/server1'])
    mockGetItem.mockResolvedValue([player])

    runGdmAnnouncer()
    const msg = Buffer.from('M-SEARCH * HTTP/1.1')
    await messageHandler(msg, { address: '1.2.3.4', port: 12345 })

    expect(mockGetKeys).toHaveBeenCalledWith('players/')
    expect(mockGetItem).toHaveBeenCalledWith('players/server1')
    expect(server.send).toHaveBeenCalledWith(expect.stringContaining('HTTP/1.1 200 OK'), 0, expect.any(Number), 12345, '1.2.3.4')
  })

  it('should not respond if no players found', async () => {
    mockGetKeys.mockResolvedValue([])
    runGdmAnnouncer()
    const msg = Buffer.from('M-SEARCH * HTTP/1.1')
    await messageHandler(msg, { address: '1.2.3.4', port: 12345 })
    expect(server.send).not.toHaveBeenCalled()
  })

  it('should exit application when port is blocked', () => {
    // Mock process.exit to prevent test from actually exiting
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`process.exit called with code ${code}`)
    })

    // Mock bind to throw error
    server.bind = vi.fn(() => {
      throw new Error('EADDRINUSE')
    })

    // Expect the function to throw due to process.exit
    expect(() => runGdmAnnouncer()).toThrow('process.exit called with code 1')

    // Verify process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })

  it('should handle errors gracefully', () => {
    runGdmAnnouncer()
    errorHandler(new Error('test error'))
    expect(server.close).toHaveBeenCalled()
  })
})
