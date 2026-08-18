import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { EventEmitter } from 'node:events'
import axios from 'axios'
import { parseServerResponse, runGdmDiscovery, verifyPlexServerConnectivity } from './gdmDiscovery'

vi.mock('axios')

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

/**
 * Minimal dgram socket stub that reproduces the node behaviour we care about:
 * closing an already closed socket throws ERR_SOCKET_DGRAM_NOT_RUNNING.
 */
class FakeSocket extends EventEmitter {
  closed = false
  bind = vi.fn((callback?: () => void) => callback?.())
  setBroadcast = vi.fn()
  send = vi.fn(
    (_msg: Buffer, _offset: number, _length: number, _port: number, _address: string, callback?: (error: Error | null) => void) =>
      callback?.(null)
  )

  close = vi.fn(() => {
    if (this.closed) {
      const error: NodeJS.ErrnoException = new Error('Not running')
      error.code = 'ERR_SOCKET_DGRAM_NOT_RUNNING'
      throw error
    }
    this.closed = true
    this.emit('close')
  })
}

let fakeSocket: FakeSocket

vi.mock('dgram', () => ({
  default: {
    createSocket: vi.fn(() => fakeSocket)
  }
}))

const storageMock = {
  getKeys: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
}
vi.stubGlobal('useStorage', () => storageMock)

const serverResponse = (name: string, resourceIdentifier: string, port = 32400) =>
  [
    'HTTP/1.0 200 OK',
    'Content-Type: plex/media-server',
    'Host: ztea2cf712e03f2b540150acfe3a4b.plex.direct',
    `Name: ${name}`,
    `Port: ${port}`,
    `Resource-Identifier: ${resourceIdentifier}`,
    'Updated-At: 1710000000',
    'Version: 1.32.0.0',
    ''
  ].join('\n')

const respond = (response: string, address: string) => fakeSocket.emit('message', Buffer.from(response), { address })

describe('gdmDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseServerResponse', () => {
    const validResponse = [
      'HTTP/1.0 200 OK',
      'Content-Type: plex/media-server',
      'Host: ztea2cf712e03f2b540150acfe3a4b.plex.direct',
      'Name: My Plex Server',
      'Port: 32400',
      'Resource-Identifier: abcd1234',
      'Updated-At: 1710000000',
      'Version: 1.32.0.0',
      ''
    ].join('\n')

    it('parses a valid Plex server response', () => {
      const result = parseServerResponse(validResponse, '192.168.1.10')
      expect(result).toEqual({
        protocol: 'http',
        contentType: 'plex/media-server',
        host: 'ztea2cf712e03f2b540150acfe3a4b.plex.direct',
        name: 'My Plex Server',
        port: 32400,
        resourceIdentifier: 'abcd1234',
        updatedAt: 1710000000,
        version: '1.32.0.0',
        localAddress: '192.168.1.10',
        secureAddress: '192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct',
        secureProtocol: 'https'
      })
    })

    it('returns undefined for incomplete response', () => {
      const incomplete = 'HTTP/1.0 200 OK\nContent-Type: plex/media-server\n'
      expect(parseServerResponse(incomplete, '192.168.1.10')).toBeUndefined()
    })

    it('returns null for missing required fields', () => {
      const missing = [
        'HTTP/1.0 200 OK',
        'Content-Type: plex/media-server',
        'Host: ztea2cf712e03f2b540150acfe3a4b.plex.direct',
        'Port: 32400',
        ''
      ].join('\n')
      expect(parseServerResponse(missing, '192.168.1.10')).toBeUndefined()
    })
  })

  describe('verifyPlexServerConnectivity', () => {
    it('should successfully verify connectivity when axios.get succeeds', async () => {
      ;(axios.get as Mock).mockResolvedValue({ data: {} })

      await expect(verifyPlexServerConnectivity('http://192.168.1.10:32400/identity')).resolves.toBeUndefined()

      expect(axios.get).toHaveBeenCalledWith('http://192.168.1.10:32400/identity', {
        timeout: 3000
      })
    })

    it('should throw and log error for axios errors', async () => {
      const axiosError = {
        message: 'Network Error',
        code: 'ECONNREFUSED',
        response: {
          status: 500,
          statusText: 'Internal Server Error'
        },
        isAxiosError: true
      }
      ;(axios.get as Mock).mockRejectedValue(axiosError)
      ;(axios.isAxiosError as unknown as Mock).mockReturnValue(true)

      await expect(verifyPlexServerConnectivity('http://192.168.1.10:32400/identity')).rejects.toEqual(axiosError)

      expect(axios.get).toHaveBeenCalledWith('http://192.168.1.10:32400/identity', {
        timeout: 3000
      })
    })

    it('should handle DNS resolution failures for *.plex.direct URLs', async () => {
      const dnsError = {
        message: 'getaddrinfo ENOTFOUND 192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct',
        code: 'ENOTFOUND',
        isAxiosError: true
      }
      ;(axios.get as Mock).mockRejectedValue(dnsError)
      ;(axios.isAxiosError as unknown as Mock).mockReturnValue(true)

      await expect(
        verifyPlexServerConnectivity('https://192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct:32400/identity')
      ).rejects.toEqual(dnsError)

      expect(axios.get).toHaveBeenCalledWith('https://192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct:32400/identity', {
        timeout: 3000
      })
    })

    it('should handle unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error')
      ;(axios.get as Mock).mockRejectedValue(unexpectedError)
      ;(axios.isAxiosError as unknown as Mock).mockReturnValue(false)

      await expect(verifyPlexServerConnectivity('http://192.168.1.10:32400/identity')).rejects.toThrow('Unexpected error')

      expect(axios.get).toHaveBeenCalledWith('http://192.168.1.10:32400/identity', {
        timeout: 3000
      })
    })

    it('should verify both local and secure URLs', async () => {
      ;(axios.get as Mock).mockResolvedValue({ data: {} })

      const localUrl = 'http://192.168.1.10:32400/identity'
      const secureUrl = 'https://192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct:32400/identity'

      await expect(verifyPlexServerConnectivity(localUrl)).resolves.toBeUndefined()
      await expect(verifyPlexServerConnectivity(secureUrl)).resolves.toBeUndefined()

      expect(axios.get).toHaveBeenCalledWith(localUrl, { timeout: 3000 })
      expect(axios.get).toHaveBeenCalledWith(secureUrl, { timeout: 3000 })
      expect(axios.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('runGdmDiscovery', () => {
    beforeEach(() => {
      fakeSocket = new FakeSocket()
      storageMock.getKeys.mockResolvedValue([])
      storageMock.setItem.mockResolvedValue(undefined)
      storageMock.removeItem.mockResolvedValue(undefined)
      ;(axios.get as Mock).mockResolvedValue({ data: {} })
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const completeDiscovery = async (discovery: Promise<void>) => {
      await vi.advanceTimersByTimeAsync(10000)
      await discovery
    }

    it('stores every reachable Plex server that answers the broadcast', async () => {
      const discovery = runGdmDiscovery()

      respond(serverResponse('Server A', 'aaa111'), '192.168.1.10')
      respond(serverResponse('Server B', 'bbb222'), '192.168.1.11')

      await completeDiscovery(discovery)

      expect(storageMock.setItem).toHaveBeenCalledTimes(2)
      expect(storageMock.setItem).toHaveBeenCalledWith(
        'plexServers/aaa111',
        expect.objectContaining({ name: 'Server A', localAddress: '192.168.1.10' })
      )
      expect(storageMock.setItem).toHaveBeenCalledWith(
        'plexServers/bbb222',
        expect.objectContaining({ name: 'Server B', localAddress: '192.168.1.11' })
      )
    })

    it('closes the discovery socket only once when multiple Plex servers respond', async () => {
      const discovery = runGdmDiscovery()

      respond(serverResponse('Server A', 'aaa111'), '192.168.1.10')
      respond(serverResponse('Server B', 'bbb222'), '192.168.1.11')

      await completeDiscovery(discovery)

      expect(fakeSocket.close).toHaveBeenCalledTimes(1)
    })

    it('does not close the socket a second time after an error', async () => {
      const discovery = runGdmDiscovery()

      fakeSocket.emit('error', new Error('network is unreachable'))

      await completeDiscovery(discovery)

      expect(fakeSocket.close).toHaveBeenCalledTimes(1)
    })

    it('ignores duplicate responses from the same Plex server', async () => {
      const discovery = runGdmDiscovery()

      respond(serverResponse('Server A', 'aaa111'), '192.168.1.10')
      respond(serverResponse('Server A', 'aaa111'), '192.168.1.10')

      await completeDiscovery(discovery)

      expect(storageMock.setItem).toHaveBeenCalledTimes(1)
    })

    it('prunes Plex servers that no longer answer the broadcast', async () => {
      storageMock.getKeys.mockResolvedValue(['plexServers:aaa111', 'plexServers:bbb222'])
      const discovery = runGdmDiscovery()

      respond(serverResponse('Server A', 'aaa111'), '192.168.1.10')

      await completeDiscovery(discovery)

      expect(storageMock.getKeys).toHaveBeenCalledWith('plexServers/')
      expect(storageMock.removeItem).toHaveBeenCalledWith('plexServers:bbb222')
      expect(storageMock.removeItem).not.toHaveBeenCalledWith('plexServers:aaa111')
    })

    it('does not store Plex servers that are unreachable and removes stale entries', async () => {
      ;(axios.get as Mock).mockRejectedValue(new Error('unreachable'))
      storageMock.getKeys.mockResolvedValue(['plexServers:aaa111'])
      const discovery = runGdmDiscovery()

      respond(serverResponse('Server A', 'aaa111'), '192.168.1.10')

      await completeDiscovery(discovery)

      expect(storageMock.setItem).not.toHaveBeenCalled()
      expect(storageMock.removeItem).toHaveBeenCalledWith('plexServers:aaa111')
    })
  })
})
