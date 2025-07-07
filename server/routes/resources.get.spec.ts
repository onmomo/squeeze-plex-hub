import { describe, it, expect, vi, type Mock } from 'vitest'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import resourcesHandler from './resources.get'
import { sendNoContent } from 'h3'
import usePlayerInfo from '~/server/composables/usePlayerInfo'

vi.mock('xml2js', () => ({
  Builder: class {
    buildObject(obj: any) {
      return '<xml>mocked</xml>'
    }
  }
}))
vi.mock('../composables/useLogger', () => ({
  default: () => ({
    debug: (msg: string) => console.log(msg),
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.log(msg),
    error: (msg: string) => console.log(msg)
  })
}))
vi.mock('~/server/composables/usePlayerInfo', () => ({
  default: vi.fn()
}))
vi.mock('~/server/lib/squeezePlexHub', () => ({
  plexOptions: {
    platform: 'MockPlatform',
    platformVersion: '1.0',
    product: 'MockProduct',
    version: '1.0',
    protocol: 'MockProtocol',
    protocolVersion: '1',
    model: 'MockModel',
    device: 'MockDevice',
    protocolCapabilities: 'MockCapabilities',
    deviceClass: 'MockClass'
  }
}))


vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    sendNoContent: vi.fn()
  }
})

const mockPlayerInfo: IPlayerInfo = {
  playerid: 'abc123',
  name: 'Test Player'
} as IPlayerInfo

function createEventMock() {
  return {
    __is_event__: true,
    node: {
      req: {
        headers: {}
      },
      res: {
        headers: {},
        setHeader: vi.fn()
      } 
    },
    response: vi.fn(),
    context: {},
    _handled: false,

    respondWith: vi.fn()
  } as any
}

describe('resources.get', () => {
  it('returns 400 if X-Plex-Target-Client-Identifier header is missing', async () => {
    const event = createEventMock()
    event.node.req.headers = {}

    await resourcesHandler(event)
    expect(event.respondWith).toHaveBeenCalledWith(expect.objectContaining({ status: 400 } as Response))    
  })

  it('returns 404 if usePlayerInfo throws', async () => {
    const event = createEventMock()
    event.node.req.headers = { 'x-plex-target-client-identifier': 'abc123' }
    ;(usePlayerInfo as Mock).mockRejectedValue(new Error('not found'))
    await resourcesHandler(event)    
    expect(sendNoContent).toHaveBeenCalledWith(event, 404)
  })

  it('returns XML if player found', async () => {
    const event = createEventMock()
    event.node.req.headers = { 'x-plex-target-client-identifier': 'abc123' };   
    ;(usePlayerInfo as Mock).mockResolvedValue({ playerInfo: mockPlayerInfo })
    await resourcesHandler(event)
  
    expect(event.respondWith).toHaveBeenCalledWith(expect.objectContaining({ status: 200 } as Response))
    expect(event.node.res.setHeader).toHaveBeenCalledWith('content-type', 'text/xml')
  })
})
