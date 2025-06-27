// @vitest-environment nuxt
import dgram from 'dgram'
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

//import type { NitroAppPlugin } from 'nitropack/types'

//const defineNitroPluginMock = vi.fn((fn) => fn)
//vi.stubGlobal('defineNitroPlugin', defineNitroPluginMock)



// Mock dependencies

// Create a mock NitroAppPlugin
        //const plugin: NitroAppPlugin = vi.fn() as unknown as NitroAppPlugin
//import { defineNitroPlugin } from 'nitropack/runtime/internal/plugin'
        //const result = defineNitroPlugin(plugin)

//vi.mock('nitropack/runtime/internal/plugin', () => ({
//    defineNitroPlugin: vi.fn((fn) => fn as NitroAppPlugin)
//}));

// Add type declaration for defineNitroPlugin on globalThis


const mockGetKeys = vi.fn()
const mockGetItem = vi.fn()
const useStorageMock = vi.fn().mockReturnValue({
  getKeys: mockGetKeys,
  getItem: mockGetItem
})

vi.stubGlobal('useStorage', useStorageMock)

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('~/server/lib/squeezePlexHub', () => ({
  plexOptions: {
    deviceClass: 'test-class',
    port: 1234,
    product: 'TestProduct',
    version: '1.0.0',
    protocol: 'test-protocol',
    protocolVersion: '1',
    protocolCapabilities: 'cap1,cap2'
  }
}))

import { runGdmAnnouncer } from './gdmAnnouncer'

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
    mockGetKeys.mockReset()
    mockGetItem.mockReset()
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

  it('should handle errors gracefully', () => {
    runGdmAnnouncer()
    errorHandler(new Error('test error'))
    expect(server.close).toHaveBeenCalled()
  })
})
