import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './subscribe.get'

vi.mock('../../../composables/useLogger', () => ({
  default: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('h3', () => {
  const eventHandler = (fn: any) => fn
  return {
    getQuery: vi.fn(),
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    eventHandler
  }
})

const mockSetItem = vi.fn()
const mockGetItem = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('useStorage', () => ({
  setItem: mockSetItem,
  getItem: mockGetItem
}))

describe('GET /server/routes/player/timeline/subscribe.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetItem.mockReset()
  })

  it('returns 400 when required parameters are missing', async () => {
    const headers: Record<string, string> = {
      'X-Plex-Target-Client-Identifier': 'target-1',
      'X-Plex-Client-Identifier': 'client-1',
      'X-Plex-Device-Name': 'Device Name'
    }

    ;(h3.getRequestHeader as Mock).mockImplementation((_event, name: string) => headers[name] ?? undefined)
    // Missing commandID
    ;(h3.getQuery as Mock).mockReturnValue({
      type: 'subscribe',
      port: '32400',
      protocol: 'http'
    })

    const event: any = {
      node: { req: { headers } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp = (event.respondWith as Mock).mock.calls[0][0] as Response
    expect(resp.status).toBe(400)

    expect(mockSetItem).not.toHaveBeenCalled()
    expect(h3.sendNoContent as Mock).not.toHaveBeenCalled()
  })

  it('stores subscription and responds 200 when parameters are valid', async () => {
    const headers: Record<string, string> = {
      'X-Plex-Target-Client-Identifier': 'player-123',
      'X-Plex-Client-Identifier': 'client-456',
      'X-Plex-Device-Name': 'Living Room'
    }

    ;(h3.getRequestHeader as Mock).mockImplementation((_event, name: string) => headers[name] ?? undefined)
    ;(h3.getQuery as Mock).mockReturnValue({
      type: 'subscribe',
      commandID: 'cmd-001',
      wait: '1',
      includeMetadata: '1',
      port: '32400',
      protocol: 'http'
    })

    const event: any = {
      node: { req: { headers } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(mockSetItem).toHaveBeenCalledTimes(1)
    const [key, value] = (mockSetItem as Mock).mock.calls[0]
    expect(key).toBe('subscribers/player-123/client-456')
    expect(value).toMatchObject({
      clientIdentifier: 'client-456',
      deviceName: 'Living Room',
      commandId: 'cmd-001',
      poll: false,
      targetClientIdentifier: 'player-123'
    })
    expect(value.subscribedAt).toBeInstanceOf(Date)

    expect(h3.sendNoContent as Mock).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalled()
  })

  it('returns 400 when port or protocol is missing', async () => {
    const headers: Record<string, string> = {
      'X-Plex-Target-Client-Identifier': 'player-abc',
      'X-Plex-Client-Identifier': 'client-def',
      'X-Plex-Device-Name': 'Bedroom'
    }

    ;(h3.getRequestHeader as Mock).mockImplementation((_event, name: string) => headers[name] ?? undefined)
    // Missing protocol
    ;(h3.getQuery as Mock).mockReturnValue({
      type: 'subscribe',
      commandID: 'cmd-xyz',
      port: '32400'
    })

    const event: any = {
      node: { req: { headers } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp = (event.respondWith as Mock).mock.calls[0][0] as Response
    expect(resp.status).toBe(400)

    expect(mockSetItem).not.toHaveBeenCalled()
    expect(h3.sendNoContent as Mock).not.toHaveBeenCalled()
  })
})
