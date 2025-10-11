import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as h3 from 'h3'
import handler from './seekTo.get'

vi.mock('../../../composables/useLogger', () => {
  const wrap = (level: string) =>
    vi.fn((...args: any[]) => {
      console.log(`[logger:${level}]`, ...args)
    })

  return {
    default: vi.fn().mockImplementation(() => ({
      info: wrap('info'),
      warn: wrap('warn'),
      error: wrap('error'),
      debug: wrap('debug')
    }))
  }
})

vi.mock('../../../composables/usePlayerInfo', () => ({
  default: vi.fn(async () => ({
    playerInfo: { playerid: '123', name: 'Living Room' }    
  }))
}))

const mockPlayer = {
  seekTo: vi.fn()
}

vi.mock('../../../composables/useSqueezePlayer', () => ({
  default: vi.fn().mockImplementation(() => ({
    player: mockPlayer
  }))
}))

vi.mock('../../../lib/plexApi', () => ({
  responseHeaders: vi.fn().mockImplementation((playerid: string, name: string) => {
    const h = new Headers()
    h.set('X-Plex-Player-Id', playerid)
    h.set('X-Plex-Player-Name', name)
    return h
  })
}))

const event: any = {
      node: { req: { headers: {} } },
      respondWith: vi.fn()
    }

vi.mock('h3', async (orig) => {
  const actual = await (orig() as any)
  const eventHandler = (fn: any) => fn
  return {
    ...actual,
    getQuery: vi.fn().mockImplementation((_event) => ({
      type: 'track',
      commandID: '99',
      offset: 3000 // milliseconds
    })),
    getRequestHeader: vi.fn(),
    sendNoContent: vi.fn(),
    setResponseHeaders: vi.fn(),
    eventHandler
  }
})

describe('playback.seekTo route', () => {
  beforeEach(async () => {
    vi.clearAllMocks()    
  })  

  it('returns 400 when required headers are missing', async () => {        
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',        
      }
      return headers[name]
    })

    await handler(event)

    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(400)
    expect(h3.setResponseHeaders).not.toHaveBeenCalled()
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })

  it('seeks track successfully', async () => {
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',        
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })

    await handler(event)

    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1)
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(3) // offset is in seconds
    expect(h3.setResponseHeaders).toHaveBeenCalledWith(event,expect.objectContaining({
    'x-plex-player-id': '123',
    'x-plex-player-name': 'Living Room'
  }))
    expect(h3.sendNoContent).toHaveBeenCalledWith(event, 200)    
    expect(event.respondWith).not.toHaveBeenCalled()
  })

  it('returns 404 when player seek fails', async () => {
    mockPlayer.seekTo.mockRejectedValueOnce(new Error('failure'))
    ;(h3.getRequestHeader as Mock).mockImplementation((_e, name: string) => {
      const headers: Record<string, string> = {
        'X-Plex-Target-Client-Identifier': 'player-1',
        'X-Plex-Client-Identifier': 'client-1',
        'X-Plex-Device-Name': 'Device'
      }
      return headers[name]
    })

    await handler(event)
    
    expect(event.respondWith).toHaveBeenCalledTimes(1)
    const resp: Response = event.respondWith.mock.calls[0][0]
    expect(resp.status).toBe(404)
    expect(h3.sendNoContent).not.toHaveBeenCalled()
  })
})
