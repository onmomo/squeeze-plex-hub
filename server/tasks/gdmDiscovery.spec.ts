import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import axios from 'axios'
import { parseServerResponse, verifyPlexServerConnectivity } from './gdmDiscovery'

vi.mock('axios')

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

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
      const missing = ['HTTP/1.0 200 OK', 'Content-Type: plex/media-server', 'Host: ztea2cf712e03f2b540150acfe3a4b.plex.direct', 'Port: 32400', ''].join('\n')
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
      ;(axios.isAxiosError as Mock).mockReturnValue(true)

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
      ;(axios.isAxiosError as Mock).mockReturnValue(true)

      await expect(
        verifyPlexServerConnectivity('https://192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct:32400/identity')
      ).rejects.toEqual(dnsError)

      expect(axios.get).toHaveBeenCalledWith(
        'https://192-168-1-10.ztea2cf712e03f2b540150acfe3a4b.plex.direct:32400/identity',
        {
          timeout: 3000
        }
      )
    })

    it('should handle unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error')
      ;(axios.get as Mock).mockRejectedValue(unexpectedError)
      ;(axios.isAxiosError as Mock).mockReturnValue(false)

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
})
