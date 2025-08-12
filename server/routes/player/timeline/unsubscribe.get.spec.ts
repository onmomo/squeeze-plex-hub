import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './unsubscribe.get'

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
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    eventHandler
  }
})

const mockRemoveItem = vi.fn()
vi.stubGlobal('useStorage', () => ({
  removeItem: mockRemoveItem
}))

describe('GET /server/routes/player/timeline/subscribe.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()    
  })

  it('returns 400 when required headers are missing', async () => {
    const headers: Record<string, string> = {
    }

    ;(h3.getRequestHeader as Mock).mockImplementation((_event, name: string) => headers[name] ?? undefined)


    const event: any = {
      node: { req: { headers } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    expect(event.respondWith).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400
      })
    )

    expect(mockRemoveItem).not.toHaveBeenCalled()
    expect(h3.sendNoContent as Mock).not.toHaveBeenCalled()
  })

  it('unsubscribes and responds 200 when parameters are valid', async () => {
    const headers: Record<string, string> = {
      'X-Plex-Target-Client-Identifier': 'player-123',
      'X-Plex-Client-Identifier': 'client-456'
    }

    ;(h3.getRequestHeader as Mock).mockImplementation((_event, name: string) => headers[name] ?? undefined)

    const event: any = {
      node: { req: { headers } },
      respondWith: vi.fn()
    }

    await handler(event)

    expect(mockRemoveItem).toHaveBeenCalledTimes(1)
    expect(h3.sendNoContent as Mock).toHaveBeenCalledWith(event, 200)
    expect(event.respondWith).not.toHaveBeenCalled()
  })
  
})
