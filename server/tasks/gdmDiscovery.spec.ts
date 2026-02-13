import { describe, it, expect } from 'vitest'
import { parseServerResponse } from './gdmDiscovery'

describe('parseServerResponse', () => {
  const validResponse = [
    'HTTP/1.0 200 OK',
    'Content-Type: plex/media-server',
    'Host: ztea2cf712e03fs2b5401s50acfe3a4m.plex.direct',
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
      host: 'ztea2cf712e03fs2b5401s50acfe3a4m.plex.direct',
      name: 'My Plex Server',
      port: 32400,
      resourceIdentifier: 'abcd1234',
      updatedAt: 1710000000,
      version: '1.32.0.0',
      localAddress: '192.168.1.10',
      secureAddress: '192-168-1-10.ztea2cf712e03fs2b5401s50acfe3a4m.plex.direct',
      secureProtocol: 'https'
    })
  })

  it('returns undefined for incomplete response', () => {
    const incomplete = 'HTTP/1.0 200 OK\nContent-Type: plex/media-server\n'
    expect(parseServerResponse(incomplete, '192.168.1.10')).toBeUndefined()
  })

  it('returns null for missing required fields', () => {
    const missing = ['HTTP/1.0 200 OK', 'Content-Type: plex/media-server', 'Host: ztea2cf712e03fs2b5401s50acfe3a4m.plex.direct', 'Port: 32400', ''].join('\n')
    expect(parseServerResponse(missing, '192.168.1.10')).toBeUndefined()
  })
})
