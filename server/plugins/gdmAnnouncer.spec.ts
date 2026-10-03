import dgram from 'dgram'
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'
import type { Mock } from 'vitest'
import { resolvePlexTargets, type PlexTarget } from '../lib/plexTargets'

import { runGdmAnnouncer } from './gdmAnnouncer'

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('../lib/plexTargets', () => ({
  resolvePlexTargets: vi.fn()
}))

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
    const target: PlexTarget = { id: 'abc123', name: 'Player1', kind: 'player', serverId: 'server1', memberIds: ['abc123'] }
    ;(resolvePlexTargets as Mock).mockResolvedValue([target])

    runGdmAnnouncer()
    const msg = Buffer.from('M-SEARCH * HTTP/1.1')
    await messageHandler(msg, { address: '1.2.3.4', port: 12345 })

    expect(server.send).toHaveBeenCalledTimes(1)
    const [message, , , port, address] = server.send.mock.calls[0]
    expect(message).toContain('HTTP/1.1 200 OK')
    expect(message).toContain('Name: Player1\r\n')
    expect(message).toContain('Resource-Identifier: abc123\r\n')
    expect(port).toBe(12345)
    expect(address).toBe('1.2.3.4')
  })

  it('should announce one message per target', async () => {
    ;(resolvePlexTargets as Mock).mockResolvedValue([
      { id: 'a', name: 'A', kind: 'player', serverId: 's', memberIds: ['a'] },
      { id: 'b', name: 'B', kind: 'player', serverId: 's', memberIds: ['b'] }
    ])

    runGdmAnnouncer()
    await messageHandler(Buffer.from('M-SEARCH * HTTP/1.1'), { address: '1.2.3.4', port: 12345 })

    expect(server.send).toHaveBeenCalledTimes(2)
  })

  it('should not respond if no players found', async () => {
    ;(resolvePlexTargets as Mock).mockResolvedValue([])
    runGdmAnnouncer()
    const msg = Buffer.from('M-SEARCH * HTTP/1.1')
    await messageHandler(msg, { address: '1.2.3.4', port: 12345 })
    expect(server.send).not.toHaveBeenCalled()
  })

  it('should not respond if no LMS is known yet', async () => {
    ;(resolvePlexTargets as Mock).mockRejectedValue(new Error('No LMS found in storage, skipping'))
    runGdmAnnouncer()
    await messageHandler(Buffer.from('M-SEARCH * HTTP/1.1'), { address: '1.2.3.4', port: 12345 })
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
